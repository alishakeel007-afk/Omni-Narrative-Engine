import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import pg from "pg";

dotenv.config({ path: ".env.local", override: true, quiet: true });

const value = process.env.DATABASE_URL;
if (!value) throw new Error("DATABASE_URL is not configured.");

const certificatePath = process.env.SUPABASE_DB_CA_PATH;
if (!certificatePath) throw new Error("SUPABASE_DB_CA_PATH is not configured.");

let certificateAuthority;
try {
  certificateAuthority = readFileSync(certificatePath, "utf8");
  new X509Certificate(certificateAuthority);
} catch {
  throw new Error("SUPABASE_DB_CA_PATH does not point to a readable PEM certificate.");
}

const url = new URL(value);
const client = new pg.Client({
  host: url.hostname,
  port: Number(url.port),
  database: url.pathname.slice(1),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  connectionTimeoutMillis: 10_000,
  ssl: {
    ca: certificateAuthority,
    rejectUnauthorized: true,
    servername: url.hostname,
  },
});

try {
  console.log("Supabase CA certificate loaded; connecting with TLS verification enabled.");
  await client.connect();
  const result = await client.query("SELECT 1 AS ok");
  if (result.rows[0]?.ok !== 1) throw new Error("SELECT 1 returned an unexpected result.");
  console.log("node-postgres TLS verification and SELECT 1 passed.");
} finally {
  await client.end().catch(() => undefined);
}
