import { moduleStatus, type ModuleKey } from "@rapportini/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { HttpError, must, parseBody } from "../errors";
import { categoryOfTenant } from "../lib/catalog";
import { prisma } from "../lib/prisma";
import { assertCustomFields, deleteFieldValues, readFieldMap, writeFieldValues } from "../lib/values";
import { tenantId } from "../plugins/auth";
import { valuesSchema } from "./record-body";

const querySchema = z.object({
  q: z.string().optional(),
  field: z.string().optional(),
  value: z.string().optional(),
  sort: z.string().optional(),
  dir: z.enum(["asc", "desc"]).optional(),
});

async function customModule(request: FastifyRequest, key: string, write: boolean) {
  const id = tenantId(request);
  const entity = await prisma.entityDef.findUnique({ where: { key }, include: { modules: true } });
  if (!entity || entity.native) throw new HttpError(404, "Entità non trovata");
  const module = entity.modules.find((item) => item.kind === "CUSTOM") ?? entity.modules[0];
  if (!module) throw new HttpError(404, "Modulo non trovato");
  const required = write ? module.writePermission : module.readPermission;
  if (required && !(request.auth?.permissions ?? []).includes(required)) throw new HttpError(403, "Permesso negato");
  const [category, row] = await Promise.all([
    categoryOfTenant(id),
    prisma.tenantModule.findUnique({ where: { tenantId_moduleKey: { tenantId: id, moduleKey: module.key } } }),
  ]);
  const definition = category.modules.find((item) => item.key === module.key);
  if (!definition) throw new HttpError(404, "Modulo non attivo");
  const status = moduleStatus(definition.free, row ? { key: module.key as ModuleKey, enabled: row.enabled, licensed: row.licensed, trialEndsAt: row.trialEndsAt, licenseExpiresAt: row.licenseExpiresAt } : undefined);
  if (status === "locked") throw new HttpError(402, "Modulo non incluso nel tuo piano");
  if (status === "off") throw new HttpError(404, "Modulo non attivo");
  return { tenantId: id, entity, module };
}

export async function recordRoutes(app: FastifyInstance) {
  app.get("/entities/:key/records", { preHandler: app.requireTenant }, async (request) => {
    const key = (request.params as { key: string }).key;
    const { tenantId: id, entity } = await customModule(request, key, false);
    const query = parseBody(querySchema, request.query ?? {});
    const valueFilter = query.field && query.value
      ? await prisma.fieldValue.findMany({
          where: { tenantId: id, entityKey: key, fieldKey: query.field, textValue: query.value },
          select: { recordId: true },
        })
      : null;
    const rows = await prisma.entityRecord.findMany({
      where: {
        tenantId: id,
        entityId: key,
        ...(query.q ? { title: { contains: query.q, mode: "insensitive" } } : {}),
        ...(valueFilter ? { id: { in: valueFilter.map((row) => row.recordId) } } : {}),
      },
      orderBy: query.sort && query.sort !== entity.titleFieldKey ? { updatedAt: query.dir ?? "desc" } : { title: query.sort === entity.titleFieldKey ? (query.dir ?? "asc") : "asc" },
      take: 100,
    });
    if (query.sort && query.sort !== entity.titleFieldKey && rows.length) {
      const numbers = await prisma.fieldValue.findMany({
        where: { tenantId: id, entityKey: key, fieldKey: query.sort, recordId: { in: rows.map((row) => row.id) } },
      });
      const rank = new Map(numbers.map((row) => [row.recordId, row.numberValue?.toNumber() ?? row.textValue]));
      rows.sort((a, b) => {
        const left = rank.get(a.id) ?? "";
        const right = rank.get(b.id) ?? "";
        const cmp = left < right ? -1 : left > right ? 1 : 0;
        return query.dir === "desc" ? -cmp : cmp;
      });
    }
    const values = await readFieldMap(id, key, rows.map((row) => row.id));
    return rows.map((row) => ({ ...row, fields: values.get(row.id) ?? {} }));
  });

  app.post("/entities/:key/records", { preHandler: app.requireTenant }, async (request) => {
    const key = (request.params as { key: string }).key;
    const { tenantId: id, entity } = await customModule(request, key, true);
    const body = parseBody(valuesSchema, request.body);
    const fields = await assertCustomFields(id, key, body.fields);
    const title = String(fields[entity.titleFieldKey] ?? body.title ?? "").slice(0, 160);
    const created = await prisma.entityRecord.create({ data: { tenantId: id, entityId: key, title, createdById: request.auth?.userId ?? null } });
    await writeFieldValues(id, key, created.id, fields);
    return { ...created, fields };
  });

  app.get("/entities/:key/records/:id", { preHandler: app.requireTenant }, async (request) => {
    const { key, id: recordId } = request.params as { key: string; id: string };
    const { tenantId: id } = await customModule(request, key, false);
    const record = await must(prisma.entityRecord.findFirst({ where: { id: recordId, tenantId: id, entityId: key } }), "Record");
    const values = await readFieldMap(id, key, [record.id]);
    return { ...record, fields: values.get(record.id) ?? {} };
  });

  app.patch("/entities/:key/records/:id", { preHandler: app.requireTenant }, async (request) => {
    const { key, id: recordId } = request.params as { key: string; id: string };
    const { tenantId: id, entity } = await customModule(request, key, true);
    const current = await must(prisma.entityRecord.findFirst({ where: { id: recordId, tenantId: id, entityId: key } }), "Record");
    const body = parseBody(valuesSchema.partial(), request.body);
    const fields = body.fields ? await assertCustomFields(id, key, body.fields) : undefined;
    const title = fields && fields[entity.titleFieldKey] != null ? String(fields[entity.titleFieldKey]).slice(0, 160) : body.title;
    const updated = await prisma.entityRecord.update({ where: { id: current.id }, data: { title: title ?? undefined } });
    if (fields) await writeFieldValues(id, key, current.id, fields);
    return { ...updated, fields: fields ?? (await readFieldMap(id, key, [current.id])).get(current.id) ?? {} };
  });

  app.delete("/entities/:key/records/:id", { preHandler: app.requireTenant }, async (request) => {
    const { key, id: recordId } = request.params as { key: string; id: string };
    const { tenantId: id } = await customModule(request, key, true);
    const current = await must(prisma.entityRecord.findFirst({ where: { id: recordId, tenantId: id, entityId: key } }), "Record");
    await deleteFieldValues(current.id);
    await prisma.entityRecord.delete({ where: { id: current.id } });
    return { ok: true };
  });
}
