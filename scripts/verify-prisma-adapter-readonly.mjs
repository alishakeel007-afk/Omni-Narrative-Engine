import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

dotenv.config({ path: ".env.local", override: true, quiet: true });

const value = process.env.DATABASE_URL;
if (!value) throw new Error("DATABASE_URL is not configured.");

const url = new URL(value);
const certificatePath = process.env.SUPABASE_DB_CA_PATH;
const certificateAuthority = certificatePath ? readFileSync(certificatePath, "utf8") : undefined;
const pool = new pg.Pool({
  host: url.hostname,
  port: Number(url.port),
  database: url.pathname.slice(1),
  user: decodeURIComponent(url.username),
  password: decodeURIComponent(url.password),
  ssl: {
    ...(certificateAuthority ? { ca: certificateAuthority } : {}),
    rejectUnauthorized: true,
    servername: url.hostname,
  },
});

const { PrismaClient } = await import("@prisma/client");
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

try {
  const result = await prisma.$queryRaw`SELECT 1 AS ok`;
  if (!Array.isArray(result) || result[0]?.ok !== 1) throw new Error("SELECT 1 returned an unexpected result.");
  console.log("PrismaPg adapter TLS verification and SELECT 1 passed.");
} finally {
  await prisma.$disconnect();
  await pool.end();
}
