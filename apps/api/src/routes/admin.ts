import type { Prisma } from "@prisma/client";
import { categoryModuleSchema, categoryRoleSchema, categorySchema, isModuleKey, moduleDefSchema, PERMISSIONS } from "@rapportini/shared";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { catalogNodes, invalidateCatalog, moduleDefinitions, resolvedCategory } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { requirePlatformAdmin } from "../plugins/guards";

function param(request: { params: unknown }, name: string): string {
  return (request.params as Record<string, string>)[name] ?? "";
}

async function assertParent(categoryId: string | null, parentId: string | null | undefined, family: string) {
  if (!parentId) return;
  const nodes = await catalogNodes();
  const parent = nodes.find((node) => node.id === parentId);
  if (!parent) throw new HttpError(400, "Categoria padre non trovata");
  if (parent.family !== family) throw new HttpError(400, "La sottocategoria deve avere la stessa famiglia del padre");
  let cursor: typeof parent | undefined = parent;
  while (cursor) {
    if (cursor.id === categoryId) throw new HttpError(400, "Una categoria non può stare dentro sé stessa");
    cursor = cursor.parentId ? nodes.find((node) => node.id === cursor!.parentId) : undefined;
  }
}

export async function adminRoutes(app: FastifyInstance) {
  const admin = [app.requireUser, requirePlatformAdmin];

  app.get("/admin/catalog", { preHandler: admin }, async () => {
    const [categories, modules, tenants] = await Promise.all([
      catalogNodes(),
      moduleDefinitions(),
      prisma.tenant.groupBy({ by: ["categoryId"], _count: { _all: true } }),
    ]);
    return {
      categories: categories.map((category) => ({
        ...category,
        tenantCount: tenants.find((row) => row.categoryId === category.id)?._count._all ?? 0,
      })),
      modules,
      permissions: PERMISSIONS,
    };
  });

  app.get("/admin/categories/:id/preview", { preHandler: admin }, async (request) => resolvedCategory(param(request, "id")));

  app.post("/admin/categories", { preHandler: admin }, async (request) => {
    const body = parseBody(categorySchema, request.body);
    await assertParent(null, body.parentId, body.family);
    const created = await prisma.category.create({
      data: {
        key: body.key,
        parentId: body.parentId ?? null,
        family: body.family,
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
    const current = await must(prisma.category.findUnique({ where: { id }, include: { _count: { select: { tenants: true, children: true } } } }), "Categoria");
    const family = body.family ?? current.family;
    if (body.family && body.family !== current.family && (current._count.tenants || current._count.children)) {
      throw new HttpError(409, "Non puoi cambiare famiglia a una categoria già in uso");
    }
    await assertParent(id, body.parentId === undefined ? current.parentId : body.parentId, family);
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
    return updated;
  });

  app.put("/admin/categories/:id/modules", { preHandler: admin }, async (request) => {
    const body = parseBody(categoryModuleSchema, request.body);
    const categoryId = param(request, "id");
    await must(prisma.category.findUnique({ where: { id: categoryId } }), "Categoria");
    const data = {
      included: body.included ?? true,
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
}
