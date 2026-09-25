import { hashPassword } from "../src/lib/auth";
import { createTenantForUser } from "../src/lib/bootstrap";
import { prisma } from "../src/lib/prisma";

async function ensureDemo(input: { email: string; name: string; shop: string; category: string; city: string }) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    if (existing.platformAdmin) await prisma.user.update({ where: { id: existing.id }, data: { platformAdmin: false } });
    console.log(`Già presente ${input.email}`);
    return;
  }
  const category = await prisma.category.findUnique({ where: { key: input.category } });
  if (!category) throw new Error(`Categoria ${input.category} mancante: esegui prima le migrazioni`);
  const user = await prisma.user.create({
    data: { email: input.email, name: input.name, passwordHash: await hashPassword("demo1234"), platformAdmin: false },
  });
  await createTenantForUser(user.id, { name: input.shop, categoryId: category.id, city: input.city, withSample: true });
  console.log(`Creato ${input.email} / demo1234 · ${input.shop}`);
}

await ensureDemo({ email: "marco@stufe.demo", name: "Marco Ferri", shop: "Ferri Stufe", category: "stoves", city: "Brescia" });
await ensureDemo({ email: "luca@caldaie.demo", name: "Luca Bianchi", shop: "Bianchi Caldaie", category: "boilers", city: "Verona" });
await ensureDemo({ email: "giulia@bar.demo", name: "Giulia Conti", shop: "Bar Garavella", category: "bar", city: "Desenzano" });
await prisma.$disconnect();
