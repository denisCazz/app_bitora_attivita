# Bitora

App iOS e Android per la manutenzione, che cambia in base al mestiere del negozio.

Tre categorie iniziali:

- **Tecnici stufe**: impianti, pulizie annuali, controllo fumi, ricambi, furgone, rapportino PDF.
- **Bar e ristoranti**: sala, comande per bar e cucina, menu con varianti, conto diviso, magazzino e ricette, fornitori, turni, checklist HACCP.
- **Centri benessere**: agenda, schede cliente e trattamenti per unghie, parrucchieri e spa. Listino, turni, prodotti e igiene sono moduli extra.

Ogni negozio configura ruoli, permessi, campi, checklist, moduli, colore e parole usate nell'interfaccia. All'avvio l'app legge `GET /me/manifest` e costruisce da lì menu e schermate.

## Avvio

```bash
pnpm install
pnpm db:setup
pnpm dev:api
pnpm dev:mobile
```

Il database è PostgreSQL remoto. In `apps/api/.env` compila `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` e `DB_NAME`. `db:setup` avvia Redis con Docker, applica le migrazioni sul server indicato e crea i negozi demo.

| Email | Password | Negozio |
| --- | --- | --- |
| marco@stufe.demo | demo1234 | Ferri Stufe |
| giulia@bar.demo | demo1234 | Bar Garavella |
| sara@unghie.demo | demo1234 | Atelier Unghie |

L'API ascolta su `http://localhost:3001`. Sul telefono imposta `EXPO_PUBLIC_API_URL` con l'IP del computer.

## Struttura

- `apps/mobile` — Expo Router
- `apps/api` — Fastify, Prisma, Postgres
- `packages/shared` — permessi, moduli, schemi Zod, manifest
- `packages/ui` — token, tema chiaro/scuro, componenti

## Build store

Da `apps/mobile`, con un account Expo:

```bash
npx eas build --profile preview --platform all
```

I profili sono in `apps/mobile/eas.json` (`development`, `preview`, `production`).

La cassa fiscale e i pagamenti elettronici non sono in questa versione.
