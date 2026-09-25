import type { Prisma } from "@prisma/client";
import { categoryModuleSchema, categoryRoleSchema, categorySchema, isModuleKey, moduleDefSchema, needSchema, PERMISSIONS, type ResolvedCategory } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { catalogNodes, invalidateCatalog, moduleDefinitions, needDefinitions, resolvedCategory } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { ensureModulePrice } from "../lib/stripe";
import { requirePlatformAdmin } from "../plugins/guards";

function param(request: { params: unknown }, name: string): string {
  return (request.params as Record<string, string>)[name] ?? "";
}

async function assertParent(categoryId: string | null, parentId: string | null | undefined) {
  if (!parentId) return;
  const nodes = await catalogNodes();
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) throw new HttpError(400, "Categoria padre non trovata");
  let cursor: typeof parent | undefined = parent;
  while (cursor) {
    if (cursor.id === categoryId) throw new HttpError(400, "Una categoria non può stare dentro sé stessa");
    cursor = cursor.parentId ? nodes.find((node) => node.id === cursor!.parentId) : undefined;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

async function platformAccounts() {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      memberships: {
        orderBy: { createdAt: "asc" },
        include: {
          role: true,
          tenant: {
            include: {
              modules: { orderBy: { moduleKey: "asc" } },
              customFields: { orderBy: [{ entity: "asc" }, { label: "asc" }] },
              roles: { orderBy: { createdAt: "asc" } },
            },
          },
        },
      },
    },
  });
  const categoryIds = [...new Set(users.flatMap((user) => user.memberships.map((membership) => membership.tenant.categoryId)))];
  const categories = new Map<string, ResolvedCategory>(await Promise.all(categoryIds.map(async (id) => [id, await resolvedCategory(id)] as const)));
  const definitions = await moduleDefinitions();

  return users.map((user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    platformAdmin: user.platformAdmin && !user.email.endsWith(".demo"),
    createdAt: user.createdAt.toISOString(),
    shops: user.memberships.map((membership) => {
      const tenant = membership.tenant;
      const category = categories.get(tenant.categoryId);
      const settings = asRecord(tenant.settings);
      const branding = asRecord(tenant.branding);
      const terminology = asRecord(settings.terminology);
      return {
        id: tenant.id,
        name: tenant.name,
        roleName: membership.role.name,
        category: { label: category?.label ?? "Categoria", path: category?.path.map((node) => node.label) ?? [] },
        needs: tenant.needs.map((key) => ({ key, label: category?.needs.find((need) => need.key === key)?.label ?? key })),
        branding: { accent: text(branding.accent), logoUrl: text(branding.logoUrl) },
        terminology: Object.fromEntries(Object.entries(terminology).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0)),
        modules: tenant.modules.map((row) => {
          const fromCategory = category?.modules.find((module) => module.key === row.moduleKey);
          const fromCatalog = definitions.find((module) => module.key === row.moduleKey);
          return {
            key: row.moduleKey,
            label: fromCategory?.label ?? fromCatalog?.label ?? row.moduleKey,
            enabled: row.enabled,
            licensed: row.licensed,
            free: fromCategory?.free ?? false,
            trialEndsAt: row.trialEndsAt?.toISOString() ?? null,
          };
        }),
        fields: tenant.customFields.map((field) => ({
          id: field.id,
          entity: field.entity,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required,
          options: Array.isArray(field.options) ? field.options.map(String) : [],
        })),
        roles: tenant.roles.map((role) => ({ name: role.name, isSystem: role.isSystem, permissions: role.permissions })),
      };
    }),
  }));
}

export async function adminRoutes(app: FastifyInstance) {
  const admin = [app.requireUser, requirePlatformAdmin];

  app.get("/admin/users", { preHandler: admin }, async () => {
    const accounts = await platformAccounts();
    return accounts.map((account) => ({
      id: account.id,
      name: account.name,
      email: account.email,
      platformAdmin: account.platformAdmin,
      createdAt: account.createdAt,
      shops: account.shops.map((shop) => ({
        id: shop.id,
        name: shop.name,
        roleName: shop.roleName,
        categoryLabel: shop.category.path.join(" · ") || shop.category.label,
      })),
    }));
  });

  app.get("/admin/users/:id", { preHandler: admin }, async (request) => {
    const account = (await platformAccounts()).find((item) => item.id === param(request, "id"));
    return must(Promise.resolve(account ?? null), "Utente");
  });

  app.get("/admin/catalog", { preHandler: admin }, async () => {
    const [categories, modules, needs, tenants] = await Promise.all([
      catalogNodes(),
      moduleDefinitions(),
      needDefinitions(),
      prisma.tenant.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    ]);
    return {
      categories: categories.map((category) => ({
        ...category,
        tenantCount: tenants.find((row) => row.categoryId === category.id)?._count._all ?? 0,
      })),
      modules,
      needs,
      permissions: PERMISSIONS,
    };
  });

  app.get("/admin/categories/:id/preview", { preHandler: admin }, async (request) => resolvedCategory(param(request, "id")));

  app.post("/admin/categories", { preHandler: admin }, async (request) => {
    const body = parseBody(categorySchema, request.body);
    await assertParent(null, body.parentId);
    const created = await prisma.category.create({
      data: {
        key: body.key,
        parentId: body.parentId ?? null,
        label: body.label,
        description: body.description ?? "",
        icon: body.icon ?? "apps-outline",
        accent: body.accent ?? null,
        image: body.image ?? null,
        terminology: body.terminology ?? {},
        presets: (body.presets ?? {}) as Prisma.InputJsonValue,
        sortOrder: body.sortOrder ?? 0,
        active: body.active ?? true,
      },
    });
    invalidateCatalog();
    return created;
  });

  app.patch("/admin/categories/:id", { preHandler: admin }, async (request) => {
    const body = parseBody(categorySchema.partial(), request.body);
    const id = param(request, "id");
    const current = await must(prisma.category.findUnique({ where: { id } }), "Categoria");
    await assertParent(id, body.parentId === undefined ? current.parentId : body.parentId);
    const updated = await prisma.category.update({
      where: { id },
      data: {
        ...body,
        presets: body.presets === undefined ? undefined : (body.presets as Prisma.InputJsonValue),
        terminology: body.terminology === undefined ? undefined : body.terminology,
      },
    });
    invalidateCatalog();
    return updated;
  });

  app.delete("/admin/categories/:id", { preHandler: admin }, async (request) => {
    const id = param(request, "id");
    const current = await must(prisma.category.findUnique({ where: { id }, include: { _count: { select: { tenants: true, children: true } } } }), "Categoria");
    if (current._count.tenants || current._count.children) throw new HttpError(409, "In uso: disattivala invece di eliminarla");
    await prisma.category.delete({ where: { id } });
    invalidateCatalog();
    return { ok: true };
  });

  app.patch("/admin/modules/:key", { preHandler: admin }, async (request) => {
    const body = parseBody(moduleDefSchema, request.body);
    const key = param(request, "key");
    if (!isModuleKey(key)) throw new HttpError(404, "Modulo sconosciuto");
    const updated = await prisma.moduleDef.update({ where: { key }, data: body });
    invalidateCatalog();
    if (body.priceCents !== undefined || body.label !== undefined || body.description !== undefined) {
      await ensureModulePrice(updated).catch((error: unknown) => request.log.error(error, "Prezzo Stripe non aggiornato"));
    }
    return updated;
  });

  app.put("/admin/categories/:id/modules", { preHandler: admin }, async (request) => {
    const body = parseBody(categoryModuleSchema, request.body);
    const categoryId = param(request, "id");
    await must(prisma.category.findUnique({ where: { id: categoryId } }), "Categoria");
    const data = {
      included: body.included ?? true,
      recommended: body.recommended ?? null,
      free: body.free ?? null,
      tab: body.tab ?? null,
      sortOrder: body.sortOrder ?? null,
      label: body.label?.trim() ? body.label.trim() : null,
      description: body.description === undefined ? undefined : body.description?.trim() ? body.description.trim() : null,
    };
    const row = await prisma.categoryModule.upsert({
      where: { categoryId_moduleKey: { categoryId, moduleKey: body.moduleKey } },
      create: { categoryId, moduleKey: body.moduleKey, ...data },
      update: data,
    });
    invalidateCatalog();
    return row;
  });

  app.delete("/admin/categories/:id/modules/:key", { preHandler: admin }, async (request) => {
    await prisma.categoryModule.deleteMany({ where: { categoryId: param(request, "id"), moduleKey: param(request, "key") } });
    invalidateCatalog();
    return { ok: true };
  });

  app.put("/admin/categories/:id/roles", { preHandler: admin }, async (request) => {
    const roles = parseBody(z.array(categoryRoleSchema).max(12), request.body);
    const categoryId = param(request, "id");
    await must(prisma.category.findUnique({ where: { id: categoryId } }), "Categoria");
    if (roles.length && !roles.some((role) => role.owner)) throw new HttpError(400, "Serve un ruolo titolare");
    await prisma.$transaction([
      prisma.categoryRole.deleteMany({ where: { categoryId } }),
      prisma.categoryRole.createMany({
        data: roles.map((role, index) => ({ categoryId, name: role.name, owner: role.owner ?? false, permissions: role.permissions, sortOrder: role.sortOrder ?? index })),
      }),
    ]);
    invalidateCatalog();
    return prisma.categoryRole.findMany({ where: { categoryId }, orderBy: { sortOrder: "asc" } });
  });

  app.post("/admin/needs", { preHandler: admin }, async (request) => {
    const body = parseBody(needSchema, request.body);
    if (body.categoryId) await must(prisma.category.findUnique({ where: { id: body.categoryId } }), "Categoria");
    const created = await prisma.need.create({
      data: {
        key: body.key,
        categoryId: body.categoryId ?? null,
        label: body.label,
        description: body.description ?? "",
        icon: body.icon ?? "checkmark-circle-outline",
        modules: body.modules,
        sortOrder: body.sortOrder ?? 0,
        active: body.active ?? true,
      },
    });
    invalidateCatalog();
    return created;
  });

  app.patch("/admin/needs/:id", { preHandler: admin }, async (request) => {
    const body = parseBody(needSchema.partial(), request.body);
    const id = param(request, "id");
    await must(prisma.need.findUnique({ where: { id } }), "Esigenza");
    const updated = await prisma.need.update({ where: { id }, data: body });
    invalidateCatalog();
    return updated;
  });

  app.delete("/admin/needs/:id", { preHandler: admin }, async (request) => {
    await prisma.need.deleteMany({ where: { id: param(request, "id") } });
    invalidateCatalog();
    return { ok: true };
  });
}
