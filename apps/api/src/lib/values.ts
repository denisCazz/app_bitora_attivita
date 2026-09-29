import type { Prisma } from "@prisma/client";
import { resolveFields, type FieldLayer } from "@rapportini/shared";
import { HttpError } from "../errors";
import { categoryChain } from "@rapportini/shared";
import { catalogNodes, configRows } from "./catalog";
import { prisma } from "./prisma";

export const ENTITY_KEY: Record<string, string> = {
  CUSTOMER: "customer",
  ASSET: "asset",
  WORK_ORDER: "work_order",
  PRODUCT: "menu_item",
};

type Tx = Prisma.TransactionClient | typeof prisma;

export async function resolvedFieldLayers(categoryId: string, tenantId?: string): Promise<FieldLayer[]> {
  const [rows, nodes, tenantFields] = await Promise.all([
    configRows(),
    catalogNodes(),
    tenantId
      ? prisma.fieldDef.findMany({ where: { tenantId }, include: { options: true, entity: true, refEntity: true } })
      : Promise.resolve([]),
  ]);
  const chain = new Set(categoryChain(nodes, categoryId).map((node) => node.id));
  const tenantLayers: FieldLayer[] = tenantFields.map((field) => ({
    scopeKey: field.scopeKey,
    categoryId: field.categoryId,
    tenantId: field.tenantId,
    entityKey: field.entity.key,
    key: field.key,
    label: field.label,
    type: field.type,
    builtIn: field.builtIn,
    required: field.required,
    visible: field.visible,
    sortOrder: field.sortOrder,
    section: field.section,
    showInList: field.showInList,
    refEntityKey: field.refEntity?.key ?? null,
    placeholder: field.placeholder,
    help: field.help,
    options: field.options.map((option) => ({ value: option.value, label: option.label, sortOrder: option.sortOrder })),
  }));
  return [...rows.fields.filter((field) => !field.categoryId || chain.has(field.categoryId)), ...tenantLayers];
}

export async function fieldsFor(categoryId: string, tenantId: string | undefined, entityKey: string) {
  const nodes = await catalogNodes();
  const chain = categoryChain(nodes, categoryId).map((node) => node.id);
  return resolveFields(await resolvedFieldLayers(categoryId, tenantId), chain).filter((field) => field.entityKey === entityKey && field.visible);
}

export async function assertCustomFields(tenantId: string, entity: string, values: Record<string, string | number | null> | undefined) {
  const entityKey = ENTITY_KEY[entity] ?? entity;
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { categoryId: true } });
  if (!tenant) throw new HttpError(404, "Negozio non trovato");
  const defs = (await fieldsFor(tenant.categoryId, tenantId, entityKey)).filter((field) => !field.builtIn);
  const input = values ?? {};
  for (const def of defs) {
    const value = input[def.key];
    const empty = value === undefined || value === null || value === "";
    if (def.required && empty) throw new HttpError(400, `Campo obbligatorio: ${def.label}`);
    if (empty) continue;
    if ((def.type === "NUMBER" || def.type === "MONEY") && Number.isNaN(Number(value))) throw new HttpError(400, `${def.label} deve essere un numero`);
    if (def.type === "SELECT" && !def.options.some((option) => option.value === String(value))) throw new HttpError(400, `${def.label} non è tra le opzioni`);
  }
  return input;
}

export async function readFieldMap(tenantId: string, entityKey: string, recordIds: readonly string[]) {
  const map = new Map<string, Record<string, string>>();
  if (!recordIds.length) return map;
  const rows = await prisma.fieldValue.findMany({ where: { tenantId, entityKey, recordId: { in: [...recordIds] } } });
  for (const row of rows) {
    const current = map.get(row.recordId) ?? {};
    current[row.fieldKey] = row.textValue;
    map.set(row.recordId, current);
  }
  return map;
}

export async function attachCustomFields<T extends { id: string }>(tenantId: string, entityKey: string, records: T[]) {
  const values = await readFieldMap(tenantId, entityKey, records.map((record) => record.id));
  return records.map((record) => ({ ...record, customFields: values.get(record.id) ?? {} }));
}

export async function writeFieldValues(tenantId: string, entityKey: string, recordId: string, values: Record<string, string | number | null> | undefined, tx: Tx = prisma) {
  if (!values) return;
  await tx.fieldValue.deleteMany({ where: { recordId, entityKey } });
  const data = Object.entries(values)
    .filter(([, value]) => value !== null && value !== undefined && String(value) !== "")
    .map(([fieldKey, value]) => {
      const textValue = String(value);
      const numeric = typeof value === "number" || /^-?\d+(\.\d+)?$/.test(textValue);
      return {
        tenantId,
        entityKey,
        recordId,
        fieldKey,
        textValue,
        numberValue: numeric ? textValue : null,
        boolValue: textValue === "true" ? true : textValue === "false" ? false : null,
      };
    });
  if (data.length) await tx.fieldValue.createMany({ data });
}

export async function deleteFieldValues(recordId: string, tx: Tx = prisma) {
  await tx.fieldValue.deleteMany({ where: { recordId } });
}

export function presentChecklist<T extends { templateItems: Array<{ itemKey: string; label: string; sortOrder: number }> }>(template: T) {
  const { templateItems, ...rest } = template;
  return { ...rest, items: templateItems.map((item) => ({ id: item.itemKey, label: item.label })) };
}

export function presentRun<T extends { runAnswers: Array<{ itemKey: string; label: string; checked: boolean; note: string | null; sortOrder: number }> }>(run: T) {
  const { runAnswers, ...rest } = run;
  return {
    ...rest,
    answers: [...runAnswers]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((answer) => ({ id: answer.itemKey, label: answer.label, checked: answer.checked, note: answer.note ?? undefined })),
  };
}
