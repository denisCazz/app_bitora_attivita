import { demoTestModule } from "@rapportini/shared";
import { categoryOfTenant } from "./catalog";
import { prisma } from "./prisma";

/**
 * Demo shops get every paid module for free except the cheapest one,
 * which stays locked so the real purchase flow (App Store / Google Play sandbox, Stripe test) can be tried.
 */
export async function prepareDemoTenant(tenantId: string) {
  const category = await categoryOfTenant(tenantId);
  const test = demoTestModule(category.modules);
  const rows = await prisma.tenantModule.findMany({ where: { tenantId } });

  for (const module of category.modules) {
    if (module.free || module.priceCents <= 0 || module.key === test?.key) continue;
    const row = rows.find((item) => item.moduleKey === module.key);
    if (row?.licensed && (!row.licenseExpiresAt || row.licenseExpiresAt > new Date())) continue;
    await prisma.tenantModule.upsert({
      where: { tenantId_moduleKey: { tenantId, moduleKey: module.key } },
      create: { tenantId, moduleKey: module.key, enabled: true, licensed: true, billingSource: "DEMO" },
      update: { enabled: true, licensed: true, billingSource: "DEMO", licenseExpiresAt: null },
    });
  }

  const testRow = test ? rows.find((item) => item.moduleKey === test.key) : undefined;
  if (testRow && (testRow.billingSource === "DEMO" || (!testRow.licensed && testRow.trialEndsAt))) {
    await prisma.tenantModule.update({
      where: { id: testRow.id },
      data: { licensed: testRow.billingSource === "DEMO" ? false : testRow.licensed, billingSource: testRow.billingSource === "DEMO" ? null : testRow.billingSource, trialEndsAt: null },
    });
  }
}
