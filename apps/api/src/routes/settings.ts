import { brandingSchema, customFieldDefSchema, moduleStatus, moduleToggleSchema, needsSchema, roleSchema, shopTerminologySchema } from "@rapportini/shared";
import { categoryOfTenant, invalidateCatalog } from "../lib/catalog";
import { ENTITY_KEY } from "../lib/values";
import type { FastifyInstance } from "fastify";
import { HttpError, must, parseBody } from "../errors";
import { prisma, tenantDb } from "../lib/prisma";
import { removeUpload, saveUpload } from "../lib/storage";
import { tenantId } from "../plugins/auth";
import { permit } from "../plugins/guards";

const LOGO_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 6 * 1024 * 1024;

function idOf(request: { params: unknown }): string {
  return (request.params as { id: string }).id;
}

export async function settingsRoutes(app: FastifyInstance) {
  const manage = [app.requireTenant, permit("settings.manage")];

  app.get("/settings/permissions", { preHandler: manage }, async () => {
    const rows = await prisma.permissionDef.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] });
    return rows.map((row) => row.key);
  });

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
    const rows = await prisma.fieldDef.findMany({
      where: { tenantId: tenantId(request), builtIn: false },
      include: { options: { orderBy: { sortOrder: "asc" } }, entity: true },
      orderBy: [{ entityId: "asc" }, { label: "asc" }],
    });
    return rows.map(presentShopField);
  });

  app.post("/custom-fields", { preHandler: manage }, async (request) => {
    const body = parseBody(customFieldDefSchema, request.body);
    const id = tenantId(request);
    const entityId = ENTITY_KEY[body.entity] ?? body.entity;
    const created = await prisma.fieldDef.create({
      data: {
        tenantId: id,
        entityId,
        scopeKey: `tenant:${id}`,
        key: body.key,
        label: body.label,
        type: body.type,
        required: body.required ?? false,
        builtIn: false,
        visible: true,
        options: { create: (body.options ?? []).map((option, index) => ({ value: option, label: option, sortOrder: index })) },
      },
      include: { options: true, entity: true },
    });
    invalidateCatalog();
    return presentShopField(created);
  });

  app.delete("/custom-fields/:id", { preHandler: manage }, async (request) => {
    const id = tenantId(request);
    const field = await must(prisma.fieldDef.findFirst({ where: { id: idOf(request), tenantId: id } }), "Campo");
    await prisma.fieldDef.delete({ where: { id: field.id } });
    invalidateCatalog();
    return { ok: true };
  });

  app.get("/modules", { preHandler: manage }, async (request) => {
    const id = tenantId(request);
    const category = await categoryOfTenant(id);
    const rows = await tenantDb(id).tenantModule.findMany();
    return category.modules.map((module) => {
      const row = rows.find((item) => item.moduleKey === module.key);
      const state = row ? { key: module.key, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt, licenseExpiresAt: row.licenseExpiresAt } : undefined;
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
    const state = row ? { key: body.moduleKey, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt, licenseExpiresAt: row.licenseExpiresAt } : undefined;
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
    return prisma.tenant.update({ where: { id }, data: { accent: body.accent ?? tenant.accent } });
  });

  app.post("/settings/logo", { preHandler: manage }, async (request) => {
    const file = await request.file();
    if (!file) throw new HttpError(400, "File mancante");
    const mimeType = file.mimetype === "application/octet-stream" && /\.(jpe?g)$/i.test(file.filename) ? "image/jpeg" : file.mimetype;
    if (!LOGO_TYPES.has(mimeType)) throw new HttpError(400, "Il logo deve essere un'immagine PNG, JPG o WebP");
    const data = await file.toBuffer();
    if (!data.length) throw new HttpError(400, "Il file è vuoto");
    if (data.length > LOGO_MAX_BYTES) throw new HttpError(413, "Il logo è troppo grande: massimo 6 MB");
    const id = tenantId(request);
    const tenant = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    const previous = tenant.logoUrl;
    const logoUrl = await saveUpload(file.filename, mimeType, data);
    await prisma.tenant.update({ where: { id }, data: { logoUrl } });
    if (previous) await removeUpload(previous).catch(() => undefined);
    return { logoUrl };
  });

  app.delete("/settings/logo", { preHandler: manage }, async (request) => {
    const id = tenantId(request);
    const tenant = await must(prisma.tenant.findUnique({ where: { id } }), "Negozio");
    const previous = tenant.logoUrl;
    await prisma.tenant.update({ where: { id }, data: { logoUrl: null } });
    if (previous) await removeUpload(previous).catch(() => undefined);
    return { ok: true };
  });

  app.patch("/settings/needs", { preHandler: manage }, async (request) => {
    const { needs } = parseBody(needsSchema, request.body);
    const id = tenantId(request);
    const available = new Set((await categoryOfTenant(id)).needs.map((need) => need.key));
    await prisma.tenant.update({ where: { id }, data: { needs: [...new Set(needs)].filter((key) => available.has(key)) } });
    return { ok: true };
  });

  app.patch("/settings/terminology", { preHandler: manage }, async (request) => {
    const body = parseBody(shopTerminologySchema, request.body);
    const id = tenantId(request);
    const scopeKey = `tenant:${id}`;
    for (const [termKey, value] of Object.entries(body)) {
      if (!value?.trim()) {
        await prisma.termValue.deleteMany({ where: { termKey, scopeKey } });
        continue;
      }
      await prisma.termValue.upsert({
        where: { termKey_scopeKey: { termKey, scopeKey } },
        create: { tenantId: id, termKey, scopeKey, value },
        update: { value },
      });
    }
    invalidateCatalog();
    return { ok: true };
  });
}

const LEGACY_ENTITY: Record<string, "CUSTOMER" | "ASSET" | "WORK_ORDER" | "PRODUCT"> = {
  customer: "CUSTOMER",
  asset: "ASSET",
  work_order: "WORK_ORDER",
  menu_item: "PRODUCT",
};

function presentShopField(field: { id: string; key: string; label: string | null; type: string | null; required: boolean | null; entity: { key: string }; options: Array<{ value: string }> }) {
  return {
    id: field.id,
    entity: LEGACY_ENTITY[field.entity.key] ?? "ASSET",
    key: field.key,
    label: field.label ?? field.key,
    type: field.type ?? "TEXT",
    required: field.required ?? false,
    options: field.options.map((option) => option.value),
  };
}
