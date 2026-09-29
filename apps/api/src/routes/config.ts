import type { FieldType, NavKind, NavPlacement } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { invalidateCatalog, invalidateTenantConfig } from "../lib/catalog";
import { invalidatePlatform } from "../lib/platform";
import { prisma } from "../lib/prisma";
import { presetFromSamples } from "../lib/samples";
import { tenantId } from "../plugins/auth";
import { permit, requirePlatformAdmin } from "../plugins/guards";

const slug = z.string().trim().regex(/^[a-z][a-z0-9_]{1,40}$/);
const fieldTypes = ["TEXT", "LONG_TEXT", "NUMBER", "MONEY", "DATE", "DATETIME", "BOOLEAN", "SELECT", "MULTI_SELECT", "PHOTO", "REFERENCE", "SIGNATURE"] as const;
const placements = ["TAB", "MORE", "SETTINGS", "HOME_ACTIONS"] as const;
const kinds = ["MODULE", "ROUTE", "GROUP", "LINK"] as const;

function scopeOf(categoryId?: string | null, shopId?: string | null) {
  if (shopId) return { tenantId: shopId, categoryId: null as string | null, scopeKey: `tenant:${shopId}` };
  if (categoryId) return { tenantId: null as string | null, categoryId, scopeKey: `category:${categoryId}` };
  return { tenantId: null as string | null, categoryId: null as string | null, scopeKey: "base" };
}

const fieldBody = z.object({
  entityKey: slug,
  key: slug,
  categoryId: z.string().nullable().optional(),
  label: z.string().trim().max(80).nullable().optional(),
  type: z.enum(fieldTypes).nullable().optional(),
  builtIn: z.boolean().optional(),
  required: z.boolean().nullable().optional(),
  visible: z.boolean().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  section: z.string().trim().max(40).nullable().optional(),
  showInList: z.boolean().nullable().optional(),
  refEntityKey: slug.nullable().optional(),
  placeholder: z.string().trim().max(80).nullable().optional(),
  help: z.string().trim().max(200).nullable().optional(),
  options: z.array(z.object({ value: z.string().min(1).max(40), label: z.string().min(1).max(80) })).optional(),
});

const vocabBody = z.object({
  listKey: slug,
  key: slug,
  categoryId: z.string().nullable().optional(),
  label: z.string().trim().min(1).max(80),
  tone: z.string().nullable().optional(),
  minutes: z.number().int().nullable().optional(),
  sortOrder: z.number().int().optional(),
  visible: z.boolean().optional(),
});

const navBody = z.object({
  placement: z.enum(placements),
  key: z.string().trim().min(1).max(40),
  categoryId: z.string().nullable().optional(),
  parentKey: z.string().nullable().optional(),
  kind: z.enum(kinds),
  moduleKey: z.string().nullable().optional(),
  route: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  subtitle: z.string().nullable().optional(),
  permission: z.string().nullable().optional(),
  sortOrder: z.number().int().nullable().optional(),
  visible: z.boolean().nullable().optional(),
});

const termBody = z.object({
  termKey: slug,
  categoryId: z.string().nullable().optional(),
  value: z.string().trim().min(1).max(80),
});

export async function configRoutes(app: FastifyInstance) {
  const admin = [app.requireUser, requirePlatformAdmin];
  const manage = [app.requireTenant, permit("settings.manage")];

  app.get("/admin/config", { preHandler: admin }, async (request) => {
    const categoryId = (request.query as { categoryId?: string }).categoryId || null;
    const where = categoryId ? { categoryId } : { categoryId: null, tenantId: null };
    const [entities, modules, fields, vocabLists, vocab, nav, terms, permissions, checklists, samples, platform] = await Promise.all([
      prisma.entityDef.findMany({ orderBy: { label: "asc" } }),
      prisma.moduleDef.findMany({ orderBy: { sortOrder: "asc" }, include: { permissions: true } }),
      prisma.fieldDef.findMany({ where, include: { options: { orderBy: { sortOrder: "asc" } }, entity: true }, orderBy: { sortOrder: "asc" } }),
      prisma.vocabList.findMany({ orderBy: { label: "asc" } }),
      prisma.vocabItem.findMany({ where, orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }] }),
      prisma.navEntry.findMany({ where, orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] }),
      prisma.termValue.findMany({ where, orderBy: { termKey: "asc" } }),
      prisma.permissionDef.findMany({ orderBy: [{ sortOrder: "asc" }, { key: "asc" }] }),
      categoryId ? prisma.checklistPreset.findMany({ where: { categoryId }, include: { items: { orderBy: { sortOrder: "asc" } } }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
      categoryId ? prisma.sampleRecord.findMany({ where: { categoryId }, include: { values: true }, orderBy: { sortOrder: "asc" } }) : Promise.resolve([]),
      prisma.platformSetting.findMany({ orderBy: { key: "asc" } }),
    ]);
    return { entities, modules, fields, vocabLists, vocab, nav, terms, permissions, checklists, sample: presetFromSamples(samples), platform };
  });

  app.put("/admin/fields", { preHandler: admin }, async (request) => saveField(parseBody(fieldBody, request.body)));
  app.delete("/admin/fields/:id", { preHandler: admin }, async (request) => {
    await prisma.fieldDef.deleteMany({ where: { id: (request.params as { id: string }).id, tenantId: null } });
    invalidateCatalog();
    return { ok: true };
  });

  app.put("/admin/vocab", { preHandler: admin }, async (request) => saveVocab(parseBody(vocabBody, request.body)));
  app.delete("/admin/vocab/:id", { preHandler: admin }, async (request) => {
    await prisma.vocabItem.deleteMany({ where: { id: (request.params as { id: string }).id, tenantId: null } });
    invalidateCatalog();
    return { ok: true };
  });

  app.put("/admin/menus", { preHandler: admin }, async (request) => saveNav(parseBody(navBody, request.body)));
  app.delete("/admin/menus/:id", { preHandler: admin }, async (request) => {
    await prisma.navEntry.deleteMany({ where: { id: (request.params as { id: string }).id, tenantId: null } });
    invalidateCatalog();
    return { ok: true };
  });

  app.put("/admin/terms", { preHandler: admin }, async (request) => {
    const body = parseBody(termBody, request.body);
    const scope = scopeOf(body.categoryId);
    const row = await prisma.termValue.upsert({
      where: { termKey_scopeKey: { termKey: body.termKey, scopeKey: scope.scopeKey } },
      create: { termKey: body.termKey, ...scope, value: body.value },
      update: { value: body.value },
    });
    invalidateCatalog();
    return row;
  });
  app.delete("/admin/terms/:id", { preHandler: admin }, async (request) => {
    await prisma.termValue.deleteMany({ where: { id: (request.params as { id: string }).id, tenantId: null } });
    invalidateCatalog();
    return { ok: true };
  });

  app.patch("/admin/permissions/:key", { preHandler: admin }, async (request) => {
    const body = parseBody(z.object({ label: z.string().trim().min(2).max(80).optional(), description: z.string().trim().max(200).optional(), section: z.string().trim().max(40).optional() }), request.body);
    const updated = await prisma.permissionDef.update({ where: { key: (request.params as { key: string }).key }, data: body });
    return updated;
  });

  app.post("/admin/modules", { preHandler: admin }, async (request) => {
    const body = parseBody(
      z.object({
        key: slug,
        label: z.string().trim().min(2).max(60),
        labelPlural: z.string().trim().min(2).max(60).optional(),
        description: z.string().trim().max(200).optional(),
        icon: z.string().trim().max(60).optional(),
      }),
      request.body,
    );
    if (await prisma.moduleDef.findUnique({ where: { key: body.key } })) throw new HttpError(409, "Modulo già presente");
    const entityKey = body.key;
    await prisma.entityDef.upsert({
      where: { key: entityKey },
      create: { key: entityKey, label: body.label, labelPlural: body.labelPlural ?? body.label, icon: body.icon ?? "apps-outline", native: false, titleFieldKey: "name" },
      update: {},
    });
    await prisma.fieldDef.create({
      data: { entityId: entityKey, scopeKey: "base", key: "name", label: "Nome", type: "TEXT", builtIn: false, required: true, visible: true, showInList: true, sortOrder: 0 },
    }).catch(() => undefined);
    const created = await prisma.moduleDef.create({
      data: {
        key: body.key,
        label: body.label,
        description: body.description ?? "",
        icon: body.icon ?? "apps-outline",
        kind: "CUSTOM",
        route: `/x/${body.key}`,
        readPermission: `${body.key}.read`,
        writePermission: `${body.key}.write`,
        entityId: entityKey,
        priceCents: 0,
        active: true,
      },
    });
    await prisma.permissionDef.createMany({
      data: [
        { key: `${body.key}.read`, moduleKey: body.key, section: body.label, label: `Vede ${body.label}`, sortOrder: 0 },
        { key: `${body.key}.write`, moduleKey: body.key, section: body.label, label: `Modifica ${body.label}`, sortOrder: 1 },
      ],
    });
    await prisma.navEntry.upsert({
      where: { placement_key_scopeKey: { placement: "MORE", key: body.key, scopeKey: "base" } },
      create: { placement: "MORE", scopeKey: "base", key: body.key, kind: "MODULE", moduleKey: body.key, label: body.label, icon: body.icon ?? "apps-outline", permission: `${body.key}.read`, sortOrder: 500, visible: true },
      update: { label: body.label, visible: true },
    });
    invalidateCatalog();
    return created;
  });

  app.put("/admin/entities/:key", { preHandler: admin }, async (request) => {
    const key = (request.params as { key: string }).key;
    const body = parseBody(z.object({ label: z.string().min(2).max(60).optional(), labelPlural: z.string().min(2).max(60).optional(), icon: z.string().max(60).optional(), titleFieldKey: slug.optional() }), request.body);
    const updated = await prisma.entityDef.update({ where: { key }, data: body });
    invalidateCatalog();
    return updated;
  });

  app.put("/admin/checklists", { preHandler: admin }, async (request) => {
    const body = parseBody(
      z.object({
        categoryId: z.string().min(1),
        name: z.string().trim().min(2).max(80),
        kind: z.string().trim().min(2).max(40),
        items: z.array(z.object({ id: z.string().min(1).max(40), label: z.string().min(1).max(200) })).min(1),
      }),
      request.body,
    );
    await must(prisma.category.findUnique({ where: { id: body.categoryId } }), "Categoria");
    const row = await prisma.checklistPreset.upsert({
      where: { categoryId_name: { categoryId: body.categoryId, name: body.name } },
      create: { categoryId: body.categoryId, name: body.name, kind: body.kind, items: { create: body.items.map((item, index) => ({ itemKey: item.id, label: item.label, sortOrder: index })) } },
      update: { kind: body.kind },
      include: { items: true },
    });
    await prisma.checklistPresetItem.deleteMany({ where: { presetId: row.id } });
    await prisma.checklistPresetItem.createMany({ data: body.items.map((item, index) => ({ presetId: row.id, itemKey: item.id, label: item.label, sortOrder: index })) });
    invalidateCatalog();
    return prisma.checklistPreset.findUnique({ where: { id: row.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  });

  app.delete("/admin/checklists/:id", { preHandler: admin }, async (request) => {
    await prisma.checklistPreset.deleteMany({ where: { id: (request.params as { id: string }).id } });
    invalidateCatalog();
    return { ok: true };
  });

  app.put("/admin/platform", { preHandler: admin }, async (request) => {
    const body = parseBody(z.object({ key: z.string().min(2).max(40), intValue: z.number().int().nullable().optional(), textValue: z.string().max(80).nullable().optional() }), request.body);
    const row = await prisma.platformSetting.upsert({
      where: { key: body.key },
      create: { key: body.key, intValue: body.intValue ?? null, textValue: body.textValue ?? null },
      update: { intValue: body.intValue, textValue: body.textValue },
    });
    invalidatePlatform();
    return row;
  });

  app.get("/settings/config", { preHandler: manage }, async (request) => {
    const id = tenantId(request);
    const where = { tenantId: id };
    const [fields, vocab, nav, terms] = await Promise.all([
      prisma.fieldDef.findMany({ where, include: { options: { orderBy: { sortOrder: "asc" } } } }),
      prisma.vocabItem.findMany({ where, orderBy: [{ listKey: "asc" }, { sortOrder: "asc" }] }),
      prisma.navEntry.findMany({ where, orderBy: [{ placement: "asc" }, { sortOrder: "asc" }] }),
      prisma.termValue.findMany({ where }),
    ]);
    return { fields, vocab, nav, terms };
  });

  app.put("/settings/vocab", { preHandler: manage }, async (request) => saveVocab(parseBody(vocabBody.omit({ categoryId: true }), request.body), tenantId(request)));
  app.delete("/settings/vocab/:id", { preHandler: manage }, async (request) => dropOwned("vocab", (request.params as { id: string }).id, tenantId(request)));
  app.put("/settings/menu", { preHandler: manage }, async (request) => saveNav(parseBody(navBody.omit({ categoryId: true }), request.body), tenantId(request)));
  app.delete("/settings/menu/:id", { preHandler: manage }, async (request) => dropOwned("nav", (request.params as { id: string }).id, tenantId(request)));
  app.put("/settings/fields", { preHandler: manage }, async (request) => saveField(parseBody(fieldBody.omit({ categoryId: true }), request.body), tenantId(request)));
  app.delete("/settings/fields/:id", { preHandler: manage }, async (request) => dropOwned("field", (request.params as { id: string }).id, tenantId(request)));
}

async function saveField(body: z.infer<typeof fieldBody>, shopId?: string) {
  const scope = scopeOf(body.categoryId, shopId);
  await must(prisma.entityDef.findUnique({ where: { key: body.entityKey } }), "Entità");
  const row = await prisma.fieldDef.upsert({
    where: { entityId_key_scopeKey: { entityId: body.entityKey, key: body.key, scopeKey: scope.scopeKey } },
    create: {
      entityId: body.entityKey,
      ...scope,
      key: body.key,
      label: body.label ?? null,
      type: (body.type ?? null) as FieldType | null,
      builtIn: body.builtIn ?? false,
      required: body.required ?? null,
      visible: body.visible ?? null,
      sortOrder: body.sortOrder ?? null,
      section: body.section ?? null,
      showInList: body.showInList ?? null,
      refEntityId: body.refEntityKey ?? null,
      placeholder: body.placeholder ?? null,
      help: body.help ?? null,
    },
    update: {
      label: body.label,
      type: body.builtIn ? undefined : (body.type as FieldType | undefined),
      required: body.required,
      visible: body.visible,
      sortOrder: body.sortOrder,
      section: body.section,
      showInList: body.showInList,
      refEntityId: body.refEntityKey,
      placeholder: body.placeholder,
      help: body.help,
    },
  });
  if (body.options) {
    await prisma.fieldOption.deleteMany({ where: { fieldId: row.id } });
    if (body.options.length) await prisma.fieldOption.createMany({ data: body.options.map((option, index) => ({ fieldId: row.id, value: option.value, label: option.label, sortOrder: index })) });
  }
  invalidateCatalog();
  if (shopId) invalidateTenantConfig(shopId);
  return prisma.fieldDef.findUnique({ where: { id: row.id }, include: { options: { orderBy: { sortOrder: "asc" } } } });
}

async function saveVocab(body: z.infer<typeof vocabBody>, shopId?: string) {
  const scope = scopeOf(body.categoryId, shopId);
  await must(prisma.vocabList.findUnique({ where: { key: body.listKey } }), "Vocabolario");
  const row = await prisma.vocabItem.upsert({
    where: { listKey_key_scopeKey: { listKey: body.listKey, key: body.key, scopeKey: scope.scopeKey } },
    create: { listKey: body.listKey, key: body.key, ...scope, label: body.label, tone: body.tone ?? null, minutes: body.minutes ?? null, sortOrder: body.sortOrder ?? 0, visible: body.visible ?? true },
    update: { label: body.label, tone: body.tone, minutes: body.minutes, sortOrder: body.sortOrder, visible: body.visible },
  });
  invalidateCatalog();
  if (shopId) invalidateTenantConfig(shopId);
  return row;
}

async function saveNav(body: z.infer<typeof navBody>, shopId?: string) {
  const scope = scopeOf(body.categoryId, shopId);
  const row = await prisma.navEntry.upsert({
    where: { placement_key_scopeKey: { placement: body.placement as NavPlacement, key: body.key, scopeKey: scope.scopeKey } },
    create: {
      placement: body.placement as NavPlacement,
      key: body.key,
      ...scope,
      parentKey: body.parentKey ?? null,
      kind: body.kind as NavKind,
      moduleKey: body.moduleKey ?? null,
      route: body.route ?? null,
      label: body.label ?? null,
      icon: body.icon ?? null,
      subtitle: body.subtitle ?? null,
      permission: body.permission ?? null,
      sortOrder: body.sortOrder ?? null,
      visible: body.visible ?? null,
    },
    update: {
      parentKey: body.parentKey,
      kind: body.kind as NavKind,
      moduleKey: body.moduleKey,
      route: body.route,
      label: body.label,
      icon: body.icon,
      subtitle: body.subtitle,
      permission: body.permission,
      sortOrder: body.sortOrder,
      visible: body.visible,
    },
  });
  invalidateCatalog();
  if (shopId) invalidateTenantConfig(shopId);
  return row;
}

async function dropOwned(kind: "vocab" | "nav" | "field", id: string, shopId: string) {
  if (kind === "vocab") await prisma.vocabItem.deleteMany({ where: { id, tenantId: shopId } });
  if (kind === "nav") await prisma.navEntry.deleteMany({ where: { id, tenantId: shopId } });
  if (kind === "field") await prisma.fieldDef.deleteMany({ where: { id, tenantId: shopId } });
  invalidateTenantConfig(shopId);
  return { ok: true };
}
