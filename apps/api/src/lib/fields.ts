import type { CustomFieldEntity } from "@prisma/client";
import { HttpError } from "../errors";
import { prisma } from "./prisma";

export async function assertCustomFields(tenantId: string, entity: CustomFieldEntity, values: Record<string, string | number | null> | undefined) {
  const defs = await prisma.customFieldDef.findMany({ where: { tenantId, entity } });
  const input = values ?? {};
  for (const def of defs) {
    const value = input[def.key];
    const empty = value === undefined || value === null || value === "";
    if (def.required && empty) throw new HttpError(400, `Campo obbligatorio: ${def.label}`);
    if (empty) continue;
    if (def.type === "NUMBER" && Number.isNaN(Number(value))) throw new HttpError(400, `${def.label} deve essere un numero`);
    if (def.type === "SELECT") {
      const options = Array.isArray(def.options) ? def.options.map(String) : [];
      if (!options.includes(String(value))) throw new HttpError(400, `${def.label} non è tra le opzioni`);
    }
  }
  return input;
}
