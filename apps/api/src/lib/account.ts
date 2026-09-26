import { HttpError } from "../errors";
import { prisma } from "./prisma";
import { revokeApple } from "./social";
import { removeUpload } from "./storage";
import { isStripeMissing, stripeClient, stripeMessage } from "./stripe";

export function isDemoEmail(email: string) {
  return email.toLowerCase().endsWith(".demo");
}

/** The founding membership of a shop is its owner (same rule as the team screen). */
export async function ownedTenants(userId: string) {
  const memberships = await prisma.membership.findMany({ where: { userId }, select: { tenantId: true } });
  const owned: Array<{ id: string; name: string; stripeCustomerId: string | null; otherMembers: number }> = [];
  for (const { tenantId } of memberships) {
    const founding = await prisma.membership.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      include: { tenant: { select: { id: true, name: true, stripeCustomerId: true } } },
    });
    if (founding?.userId !== userId) continue;
    const otherMembers = await prisma.membership.count({ where: { tenantId, userId: { not: userId } } });
    owned.push({ ...founding.tenant, otherMembers });
  }
  return owned;
}

const TENANT_TABLES = [
  "location",
  "role",
  "customFieldDef",
  "tenantModule",
  "customer",
  "asset",
  "workOrder",
  "checklistTemplate",
  "checklistRun",
  "attachment",
  "schedule",
  "sparePart",
  "stockLocation",
  "stockMovement",
  "diningTable",
  "menuItem",
  "modifier",
  "menuItemModifier",
  "order",
  "orderLine",
  "ingredient",
  "supplier",
  "purchaseOrder",
  "purchaseOrderLine",
  "ledgerEntry",
  "workOrderPayment",
  "shift",
  "notification",
] as const;

type TenantScoped = { findMany(args: { where: { tenantId: string } }): Promise<unknown[]> };

/** Everything we hold about the user (GDPR art. 15 and 20), plus the full data of the shops they own. */
export async function exportAccount(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      memberships: { include: { tenant: { select: { name: true } }, role: { select: { name: true } } } },
      pushTokens: { select: { platform: true, createdAt: true } },
      refreshTokens: { select: { createdAt: true, expiresAt: true } },
      shifts: true,
      assignedOrders: { select: { id: true, tenantId: true, title: true, status: true, scheduledAt: true } },
    },
  });
  if (!user) throw new HttpError(404, "Utente non trovato");
  const { passwordHash: _secret, appleRefreshToken: _appleSecret, refreshTokens, pushTokens, ...profile } = user;

  const shops = [];
  for (const tenant of await ownedTenants(userId)) {
    const record = await prisma.tenant.findUnique({
      where: { id: tenant.id },
      select: { id: true, name: true, needs: true, settings: true, branding: true, extraSeats: true, createdAt: true, category: { select: { key: true, label: true } } },
    });
    const members = await prisma.membership.findMany({
      where: { tenantId: tenant.id },
      select: { status: true, createdAt: true, role: { select: { name: true } }, user: { select: { name: true, email: true } } },
    });
    const invites = await prisma.invite.findMany({
      where: { tenantId: tenant.id },
      select: { email: true, expiresAt: true, acceptedAt: true, createdAt: true, role: { select: { name: true } } },
    });
    const tables: Record<string, unknown[]> = {};
    for (const table of TENANT_TABLES) {
      tables[table] = await (prisma[table] as unknown as TenantScoped).findMany({ where: { tenantId: tenant.id } });
    }
    shops.push({ ...record, members, invites, data: tables });
  }

  return {
    exportedAt: new Date().toISOString(),
    format: "Bitora export v1",
    account: {
      ...profile,
      sessions: refreshTokens,
      devices: pushTokens,
      memberships: user.memberships.map((item) => ({ tenant: item.tenant.name, role: item.role.name, status: item.status, since: item.createdAt })),
    },
    ownedShops: shops,
  };
}

/**
 * Erases the user and every shop they own, with all of its data and files.
 * Paid subscriptions are cancelled first so nothing is billed after deletion.
 */
export async function deleteAccount(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, "Utente non trovato");
  if (isDemoEmail(user.email)) throw new HttpError(403, "Gli account demo non si possono eliminare. Crea un account per provare l'eliminazione.");

  const owned = await ownedTenants(userId);
  const tenantIds = owned.map((tenant) => tenant.id);

  const customers = owned.map((tenant) => tenant.stripeCustomerId).filter((id): id is string => Boolean(id));
  if (customers.length) {
    const stripe = stripeClient();
    if (!stripe) throw new HttpError(503, "Pagamenti non raggiungibili: riprova tra poco per non lasciare abbonamenti attivi");
    for (const customer of customers) {
      try {
        await stripe.customers.del(customer);
      } catch (error) {
        if (!isStripeMissing(error)) throw new HttpError(502, stripeMessage(error));
      }
    }
  }

  const files = await prisma.attachment.findMany({ where: { tenantId: { in: tenantIds } }, select: { url: true } });

  await prisma.$transaction(async (tx) => {
    const inOwned = { tenantId: { in: tenantIds } };
    await tx.shift.deleteMany({ where: { OR: [{ userId }, inOwned] } });
    await tx.notification.deleteMany({ where: { OR: [{ userId }, inOwned] } });
    await tx.invite.deleteMany({ where: { OR: [{ email: user.email }, inOwned] } });
    await tx.membership.deleteMany({ where: inOwned });
    await tx.stockMovement.deleteMany({ where: inOwned });
    await tx.purchaseOrder.deleteMany({ where: inOwned });
    await tx.checklistRun.deleteMany({ where: inOwned });
    await tx.tenant.deleteMany({ where: { id: { in: tenantIds } } });
    await tx.user.updateMany({ where: { activeTenantId: { in: tenantIds } }, data: { activeTenantId: null } });
    await tx.user.delete({ where: { id: userId } });
  });

  await Promise.allSettled([...files.map((file) => removeUpload(file.url)), user.appleRefreshToken ? revokeApple(user.appleRefreshToken) : null]);
  return { deletedTenants: owned.map((tenant) => tenant.name) };
}
