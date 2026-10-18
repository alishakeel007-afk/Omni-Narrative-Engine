// Apply tracked Prisma migrations without putting connection secrets in arguments.
require("dotenv").config({ path: ".env.local", quiet: true });
const { spawnSync } = require("node:child_process");
if (!process.env.DIRECT_URL && process.env.DATABASE_URL) {
  const url = new URL(process.env.DATABASE_URL);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "6543") {
    url.port = "5432";
    url.searchParams.delete("pgbouncer");
    process.env.DIRECT_URL = url.toString();
  } else process.env.DIRECT_URL = process.env.DATABASE_URL;
}
const result = spawnSync(
  process.execPath,
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  { stdio: "inherit", env: process.env },
);
process.exitCode = result.status ?? 1;
