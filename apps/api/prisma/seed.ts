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
await ensureDemo({ email: "nina@clima.demo", name: "Nina Sala", shop: "Sala Clima", category: "hvac", city: "Brescia" });
await ensureDemo({ email: "paolo@idraulica.demo", name: "Paolo Riva", shop: "Riva Idraulica", category: "plumbing", city: "Brescia" });
await ensureDemo({ email: "davide@elettrico.demo", name: "Davide Greco", shop: "Greco Impianti", category: "electrical", city: "Verona" });
await ensureDemo({ email: "sofia@fotovoltaico.demo", name: "Sofia Martini", shop: "Martini Energia", category: "solar", city: "Desenzano" });
await ensureDemo({ email: "enzo@falegname.demo", name: "Enzo Vitali", shop: "Vitali Legno", category: "carpentry", city: "Brescia" });
await ensureDemo({ email: "leo@officina.demo", name: "Leo Gatti", shop: "Officina Gatti", category: "mechanic", city: "Verona" });
await ensureDemo({ email: "rosa@giardini.demo", name: "Rosa Fontana", shop: "Fontana Giardini", category: "garden", city: "Desenzano" });
await ensureDemo({ email: "giulia@bar.demo", name: "Giulia Conti", shop: "Bar Garavella", category: "bar", city: "Desenzano" });
await ensureDemo({ email: "andrea@ristorante.demo", name: "Andrea Villa", shop: "Trattoria Villa", category: "restaurant", city: "Brescia" });
await ensureDemo({ email: "alice@gelato.demo", name: "Alice Serra", shop: "Serra Gelato", category: "gelato", city: "Desenzano" });
await ensureDemo({ email: "chiara@forno.demo", name: "Chiara Lodi", shop: "Forno Lodi", category: "bakery", city: "Brescia" });
await ensureDemo({ email: "sara@unghie.demo", name: "Sara Neri", shop: "Atelier Unghie", category: "nails", city: "Brescia" });
await ensureDemo({ email: "elena@salone.demo", name: "Elena Ricci", shop: "Salone Ricci", category: "hair", city: "Verona" });
await ensureDemo({ email: "laura@spa.demo", name: "Laura Costa", shop: "Costa Spa", category: "spa", city: "Sirmione" });
await ensureDemo({ email: "pietro@barbiere.demo", name: "Pietro Neri", shop: "Barbiere Neri", category: "barber", city: "Brescia" });
await ensureDemo({ email: "mia@palestra.demo", name: "Mia Colombo", shop: "Sala Colombo", category: "gym", city: "Brescia" });
await ensureDemo({ email: "anna@lavanderia.demo", name: "Anna Fabbri", shop: "Lavanderia Fabbri", category: "laundry", city: "Verona" });
await ensureDemo({ email: "viola@fiori.demo", name: "Viola Greco", shop: "Greco Fiori", category: "florist", city: "Desenzano" });
await prisma.$disconnect();
