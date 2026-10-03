import { categoryOfTenant } from "./catalog";
import { prisma } from "./prisma";

/**
 * Demo shops include every paid module. App Review must be able to open the whole app
 * from the demo account; a real purchase is tried by registering a non-demo shop.
 */
export async function prepareDemoTenant(tenantId: string) {
  const category = await categoryOfTenant(tenantId);
  const rows = await prisma.tenantModule.findMany({ where: { tenantId } });
  const now = new Date();

  for (const module of category.modules) {
    if (module.free || module.priceCents <= 0) continue;
    const row = rows.find((item) => item.moduleKey === module.key);
    const current = Boolean(row?.licensed && (!row.licenseExpiresAt || row.licenseExpiresAt > now));
    if (row && current && row.billingSource && row.billingSource !== "DEMO") continue;
    if (row && current && row.billingSource === "DEMO") continue;
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: module.key } },
      create: { tenantId, moduleKey: module.key, enabled: true, licensed: true, billingSource: "DEMO" },
      update: { enabled: true, licensed: true, billingSource: "DEMO", licenseExpiresAt: null, trialEndsAt: null },
    });
  }
}
