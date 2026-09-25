# Bitora

App iOS e Android per la manutenzione, che cambia in base al mestiere del negozio.

Due categorie iniziali:

- **Tecnici stufe**: impianti, pulizie annuali, controllo fumi, ricambi, furgone, rapportino PDF.
- **Bar e ristoranti**: sala, comande per bar e cucina, menu con varianti, conto diviso, magazzino e ricette, fornitori, turni, checklist HACCP.

Ogni negozio configura ruoli, permessi, campi, checklist, moduli, colore e parole usate nell'interfaccia. All'avvio l'app legge `GET /me/manifest` e costruisce da lì menu e schermate.

## Avvio

```bash
pnpm install
pnpm db:setup
pnpm dev:api
pnpm dev:mobile
```

`db:setup` avvia Postgres (porta 5433, per non scontrarsi con un Postgres locale) e Redis con Docker, applica le migrazioni e crea due negozi demo.

| Email | Password | Negozio |
| --- | --- | --- |
| marco@stufe.demo | demo1234 | Ferri Stufe |
| giulia@bar.demo | demo1234 | Bar Garavella |

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
