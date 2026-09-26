import { env } from "../env";
import { prisma } from "./prisma";

export function isPlatformAdmin(user: { email: string; platformAdmin: boolean }): boolean {
  const email = user.email.toLowerCase();
  if (email.endsWith(".demo")) return false;
  return user.platformAdmin || env.platformAdminEmails.includes(email);
}

/** The owner of a shop is whoever created it: its oldest membership. */
export function foundingMembership(tenantId: string) {
  return prisma.membership.findFirst({ where: { tenantId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
}

/** Only the owner and the Bitora platform admins add, change or remove people. */
export async function canManagePeople(tenantId: string, userId: string): Promise<boolean> {
  const [founding, user] = await Promise.all([foundingMembership(tenantId), prisma.user.findUnique({ where: { id: userId }, select: { email: true, platformAdmin: true } })]);
  if (founding?.userId === userId) return true;
  return Boolean(user && isPlatformAdmin(user));
}
