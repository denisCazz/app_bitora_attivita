import { must } from "../errors";
import { platformInt } from "./platform";
import { prisma } from "./prisma";

function openInvites() {
  return { acceptedAt: null, expiresAt: { gt: new Date() } };
}

export async function loadTeam(tenantId: string, viewerId?: string) {
  const tenant = await must(prisma.tenant.findUnique({ where: { id: tenantId } }), "Negozio");
  const [members, invites] = await Promise.all([
    prisma.membership.findMany({
      where: { tenantId },
      include: { user: { select: { id: true, name: true, email: true } }, role: { select: { id: true, name: true, isSystem: true } } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    prisma.invite.findMany({
      where: { tenantId, ...openInvites() },
      include: { role: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
  ]);
  const ownerId = members[0]?.id ?? null;
  const active = members.filter((member) => member.status === "ACTIVE").length;
  const extra = tenant.extraSeats;
  const [included, priceCents] = await Promise.all([platformInt("included_seats"), platformInt("extra_seat_cents")]);
  return {
    seats: {
      used: active + invites.length,
      included,
      extra,
      capacity: included + extra,
      priceCents,
      monthlyCents: Math.max(0, extra) * priceCents,
    },
    members: members.map((member) => ({
      id: member.id,
      userId: member.userId,
      name: member.user.name,
      email: member.user.email,
      roleId: member.roleId,
      roleName: member.role.name,
      status: member.status,
      owner: member.id === ownerId,
      self: member.userId === viewerId,
    })),
    invites: invites.map((invite) => ({
      id: invite.id,
      email: invite.email,
      roleId: invite.roleId,
      roleName: invite.role.name,
      token: invite.token,
      expiresAt: invite.expiresAt,
    })),
  };
}

/** Keeps the oldest memberships inside the paid capacity and drops invites that no longer fit. */
export async function applyExtraSeats(tenantId: string, extraSeats: number, subscriptionId?: string | null) {
  const included = await platformInt("included_seats");
  await prisma.$transaction(async (tx) => {
    await tx.tenant.update({
      where: { id: tenantId },
      data: {
        extraSeats,
        ...(subscriptionId !== undefined ? { seatsStripeSubscriptionId: subscriptionId } : {}),
      },
    });
    const capacity = included + Math.max(0, extraSeats);
    const active = await tx.membership.findMany({
      where: { tenantId, status: "ACTIVE" },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const overflow = active.slice(capacity);
    if (overflow.length) {
      await tx.membership.updateMany({
        where: { id: { in: overflow.map((member) => member.id) } },
        data: { status: "SUSPENDED" },
      });
    }
    const room = Math.max(0, capacity - (active.length - overflow.length));
    const invites = await tx.invite.findMany({
      where: { tenantId, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const drop = invites.slice(room);
    if (drop.length) {
      await tx.invite.updateMany({
        where: { id: { in: drop.map((invite) => invite.id) } },
        data: { expiresAt: new Date(0) },
      });
    }
  });
}
