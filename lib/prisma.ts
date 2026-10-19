import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const url = new URL(databaseUrl);
  const isSupabase = url.hostname.endsWith(".pooler.supabase.com") || url.hostname.endsWith(".supabase.co");
  const certificatePath = process.env.SUPABASE_DB_CA_PATH ||
    (isSupabase ? join(process.cwd(), "certs", "prod-ca-2021.crt") : undefined);
  const certificateAuthority = certificatePath ? readFileSync(certificatePath, "utf8") : undefined;
  const pool = new Pool({
    host: url.hostname,
    port: Number(url.port || 5432),
    database: url.pathname.slice(1),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    connectionTimeoutMillis: 10000,
    query_timeout: 30000,
    max: 5,
    ssl: {
      ...(certificateAuthority ? { ca: certificateAuthority } : {}),
      rejectUnauthorized: true,
      servername: url.hostname,
    },
  });
  // Idle connection errors otherwise surface as unhandled process errors.
  pool.on("error", (error: NodeJS.ErrnoException) => {
    console.error("Database idle connection error:", error.code || "unknown");
  });

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
