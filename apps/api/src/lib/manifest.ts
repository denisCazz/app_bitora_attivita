import type { CustomFieldDef } from "@prisma/client";
import { buildManifest, isModuleKey, type CustomFieldDTO, type ModuleKey } from "@rapportini/shared";
import { HttpError } from "../errors";
import { resolvedCategory } from "./catalog";
import { prisma } from "./prisma";

function asOptions(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function toField(field: CustomFieldDef): CustomFieldDTO {
  return {
    id: field.id,
    entity: field.entity,
    key: field.key,
    label: field.label,
    type: field.type,
    required: field.required,
    options: asOptions(field.options),
  };
}

export async function manifestFor(userId: string, tenantId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  const membership = await prisma.membership.findUnique({
    where: { userId_tenantId: { userId, tenantId } },
    include: { role: true, tenant: true },
  });
  if (!user || !membership || membership.status !== "ACTIVE") throw new HttpError(404, "Negozio non trovato");

  const [memberships, modules, fields, category] = await Promise.all([
    prisma.membership.findMany({
      where: { userId, status: "ACTIVE" },
      include: { tenant: true, role: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.tenantModule.findMany({ where: { tenantId } }),
    prisma.customFieldDef.findMany({ where: { tenantId }, orderBy: { label: "asc" } }),
    resolvedCategory(membership.tenant.categoryId),
  ]);

  const settings = (membership.tenant.settings ?? {}) as { terminology?: Record<string, string> };
  const branding = (membership.tenant.branding ?? {}) as { accent?: string; logoUrl?: string | null };

  return buildManifest({
    user: { id: user.id, name: user.name, email: user.email, platformAdmin: user.platformAdmin && !user.email.endsWith(".demo") },
    tenant: { id: membership.tenant.id, name: membership.tenant.name, branding, terminology: settings.terminology },
    category,
    memberships: memberships.map((item) => ({
      tenantId: item.tenantId,
      tenantName: item.tenant.name,
      vertical: item.tenant.vertical,
      roleName: item.role.name,
    })),
    role: { id: membership.role.id, name: membership.role.name, permissions: membership.role.permissions },
    moduleStates: modules
      .filter((module) => isModuleKey(module.moduleKey))
      .map((module) => ({
        key: module.moduleKey as ModuleKey,
        enabled: module.enabled,
        licensed: module.licensed,
        trialEndsAt: module.trialEndsAt,
      })),
    customFields: fields.map(toField),
  });
}
