import { spawnSync } from "node:child_process";
import { env } from "../src/env";

if (!env.databaseUrl) throw new Error("Connessione Postgres mancante");

const result = spawnSync("pnpm", ["exec", "prisma", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

process.exit(result.status ?? 1);
