import { brandingSchema, customFieldDefSchema, moduleStatus, moduleToggleSchema, needsSchema, PERMISSIONS, roleSchema, terminologySchema } from "@rapportini/shared";
import { categoryOfTenant } from "../lib/catalog";
import type { FastifyInstance } from "fastify";
import { HttpError, must, parseBody } from "../errors";
import { prisma, tenantDb } from "../lib/prisma";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

export async function settingsRoutes(app: FastifyInstance) {
  const manage = [app.requireTenant, permit("settings.manage")];

  app.get("/settings/permissions", { preHandler: manage }, async () => PERMISSIONS);

  app.post("/roles", { preHandler: manage }, async (request) => {
    const body = parseBody(roleSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).role.create({ data: { tenantId: id, name: body.name, permissions: body.permissions, isSystem: false } });
  });

  app.patch("/roles/:id", { preHandler: manage }, async (request) => {
    const body = parseBody(roleSchema.partial(), request.body);
    const db = tenantDb(tenantId(request));
    const role = await must(db.role.findFirst({ where: { id: idOf(request) } }), "Ruolo");
    if (role.isSystem && body.permissions && (!body.permissions.includes("settings.manage") || !body.permissions.includes("team.manage"))) {
      throw new HttpError(400, "Il titolare deve poter gestire impostazioni e utenti");
    }
    return db.role.update({ where: { id: role.id }, data: { name: role.isSystem ? role.name : body.name, permissions: body.permissions } });
  });

  app.delete("/roles/:id", { preHandler: manage }, async (request) => {
    const db = tenantDb(tenantId(request));
    const role = await must(db.role.findFirst({ where: { id: idOf(request) } }), "Ruolo");
    if (role.isSystem) throw new HttpError(400, "Il ruolo di sistema non si elimina");
    const used = await db.membership.count({ where: { roleId: role.id } });
    if (used) throw new HttpError(409, "Ci sono persone con questo ruolo");
    await db.role.delete({ where: { id: role.id } });
    return { ok: true };
  });

  app.get("/custom-fields", { preHandler: manage }, async (request) => {
    return tenantDb(tenantId(request)).customFieldDef.findMany({ orderBy: [{ entity: "asc" }, { label: "asc" }] });
  });

  app.post("/custom-fields", { preHandler: manage }, async (request) => {
    const body = parseBody(customFieldDefSchema, request.body);
    const id = tenantId(request);
    return tenantDb(id).customFieldDef.create({
      data: { tenantId: id, entity: body.entity, key: body.key, label: body.label, type: body.type, required: body.required ?? false, options: body.options ?? [] },
    });
  });

  app.delete("/custom-fields/:id", { preHandler: manage }, async (request) => {
    const db = tenantDb(tenantId(request));
    await must(db.customFieldDef.findFirst({ where: { id: idOf(request) } }), "Campo");
    await db.customFieldDef.delete({ where: { id: idOf(request) } });
    return { ok: true };
  });

  app.get("/modules", { preHandler: manage }, async (request) => {
    const id = tenantId(request);
    const category = await categoryOfTenant(id);
    const rows = await tenantDb(id).tenantModule.findMany();
    return category.modules.map((module) => {
      const row = rows.find((item) => item.moduleKey === module.key);
      const state = row ? { key: module.key, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt } : undefined;
      return {
        moduleKey: module.key,
        enabled: row?.enabled ?? true,
        label: module.label,
        description: module.description,
        status: moduleStatus(module.free, state),
        priceCents: module.priceCents,
        free: module.free,
      };
    });
  });

  app.patch("/modules", { preHandler: manage }, async (request) => {
    const body = parseBody(moduleToggleSchema, request.body);
    const id = tenantId(request);
    const definition = (await categoryOfTenant(id)).modules.find((module) => module.key === body.moduleKey);
    if (!definition) throw new HttpError(400, "Modulo non disponibile per questa categoria");
    const row = await tenantDb(id).tenantModule.findUnique({ where: { tenantId_moduleKey: { tenantId: id, moduleKey: body.moduleKey } } });
    const state = row ? { key: body.moduleKey, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt } : undefined;
    if (body.enabled && moduleStatus(definition.free, state) === "locked") {
      throw new HttpError(402, "Sblocca il modulo dallo Store per attivarlo");
    }
    return tenantDb(id).tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId: id, moduleKey: body.moduleKey } },
      create: { tenantId: id, moduleKey: body.moduleKey, enabled: body.enabled },
      update: { enabled: body.enabled },
    });
  });

  app.patch("/settings/branding", { preHandler: manage }, async (request) => {
    const body = parseBody(brandingSchema, request.body);
    const id = tenantId(request);
    const tenant = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    const branding = { ...(tenant.branding as object), ...body };
    return prisma.tenant.update({ where: { id }, data: { branding } });
  });

  app.patch("/settings/needs", { preHandler: manage }, async (request) => {
    const { needs } = parseBody(needsSchema, request.body);
    const id = tenantId(request);
    const available = new Set((await categoryOfTenant(id)).needs.map((need) => need.key));
    await prisma.tenant.update({ where: { id }, data: { needs: [...new Set(needs)].filter((key) => available.has(key)) } });
    return { ok: true };
  });

  app.patch("/settings/terminology", { preHandler: manage }, async (request) => {
    const body = parseBody(terminologySchema, request.body);
    const id = tenantId(request);
    const tenant = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    const settings = (tenant.settings ?? {}) as { terminology?: object };
    return prisma.tenant.update({
      where: { id },
      data: { settings: { ...settings, terminology: { ...(settings.terminology ?? {}), ...body } } },
    });
  });
}
