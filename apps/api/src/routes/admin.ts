import { categoryModuleSchema, categoryRoleSchema, categorySchema, isModuleKey, moduleDefSchema, moduleTermOf, needSchema, type ResolvedCategory } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { applyCategoryConfig } from "../lib/category-config";
import { catalogNodes, invalidateCatalog, moduleDefinitions, needDefinitions, resolvedCategory } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { ensureModulePrice } from "../lib/stripe";
import { isPlatformAdmin } from "../lib/team";
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
              fieldDefs: { where: { builtIn: false }, include: { options: { orderBy: { sortOrder: "asc" } }, entity: true }, orderBy: { label: "asc" } },
              termValues: true,
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
    platformAdmin: isPlatformAdmin(user),
    createdAt: user.createdAt.toISOString(),
    shops: user.memberships.map((membership) => {
      const tenant = membership.tenant;
      const category = categories.get(tenant.categoryId);
      return {
        id: tenant.id,
        name: tenant.name,
        roleName: membership.role.name,
        category: { label: category?.label ?? "Categoria", path: category?.path.map((node) => node.label) ?? [] },
        needs: tenant.needs.map((key) => ({ key, label: category?.needs.find((need) => need.key === key)?.label ?? key })),
        branding: { accent: tenant.accent, logoUrl: tenant.logoUrl },
        terminology: Object.fromEntries(tenant.termValues.map((row) => [row.termKey, row.value])),
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
        fields: tenant.fieldDefs.map((field) => ({
          id: field.id,
          entity: field.entity.key,
          key: field.key,
          label: field.label,
          type: field.type,
          required: field.required ?? false,
          options: field.options.map((option) => option.value),
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
      permissions: (await prisma.permissionDef.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] })).map((row) => row.key),
    };
  });

  app.get("/admin/categories/:id/preview", { preHandler: admin }, async (request) => resolvedCategory(param(request, "id")));

  app.post("/admin/categories", { preHandler: admin }, async (request) => {
    const body = parseBody(categorySchema, request.body);
    await assertParent(null, body.parentId);
    const { terminology, presets, ...rest } = body;
    const created = await prisma.category.create({
      data: {
        key: rest.key,
        parentId: rest.parentId ?? null,
        label: rest.label,
        description: rest.description ?? "",
        icon: rest.icon ?? "apps-outline",
        accent: rest.accent ?? null,
        image: rest.image ?? null,
        sortOrder: rest.sortOrder ?? 0,
        active: rest.active ?? true,
      },
    });
    if (terminology || presets) await applyCategoryConfig(created.id, { terminology, presets });
    invalidateCatalog();
    return created;
  });

  app.patch("/admin/categories/:id", { preHandler: admin }, async (request) => {
    const body = parseBody(categorySchema.partial(), request.body);
    const id = param(request, "id");
    const current = await must(prisma.category.findUnique({ where: { id } }), "Categoria");
    await assertParent(id, body.parentId === undefined ? current.parentId : body.parentId);
    const { terminology, presets, ...rest } = body;
    const updated = await prisma.category.update({ where: { id }, data: rest });
    if (terminology || presets) await applyCategoryConfig(id, { terminology, presets });
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
      pitch: body.pitch === undefined ? undefined : body.pitch?.trim() ? body.pitch.trim() : null,
      details: body.details === undefined ? undefined : body.details?.trim() ? body.details.trim() : null,
      features: body.features,
    };
    const term = moduleTermOf(body.moduleKey);
    const scopeKey = `category:${categoryId}`;
    const row = await prisma.$transaction(async (tx) => {
      const previous = await tx.categoryModule.findUnique({ where: { categoryId_moduleKey: { categoryId, moduleKey: body.moduleKey } } });
      const saved = await tx.categoryModule.upsert({
        where: { categoryId_moduleKey: { categoryId, moduleKey: body.moduleKey } },
        create: { categoryId, moduleKey: body.moduleKey, ...data },
        update: data,
      });
      if (term && data.label) {
        await tx.termValue.upsert({
          where: { termKey_scopeKey: { termKey: term, scopeKey } },
          create: { termKey: term, categoryId, scopeKey, value: data.label },
          update: { value: data.label },
        });
      } else if (term && previous?.label) {
        await tx.termValue.deleteMany({ where: { termKey: term, scopeKey, value: previous.label } });
      }
      return saved;
    });
    invalidateCatalog();
    return row;
  });

  app.delete("/admin/categories/:id/modules/:key", { preHandler: admin }, async (request) => {
    const categoryId = param(request, "id");
    const moduleKey = param(request, "key");
    const term = moduleTermOf(moduleKey);
    const previous = term ? await prisma.categoryModule.findUnique({ where: { categoryId_moduleKey: { categoryId, moduleKey } } }) : null;
    if (term && previous?.label) await prisma.termValue.deleteMany({ where: { termKey: term, scopeKey: `category:${categoryId}`, value: previous.label } });
    await prisma.categoryModule.deleteMany({ where: { categoryId, moduleKey } });
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
