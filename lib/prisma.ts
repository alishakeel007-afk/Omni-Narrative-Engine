import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { readFileSync } from "node:fs";
import { Pool } from "pg";

const globalForPrisma = global as unknown as { prisma: PrismaClient };

function createPrismaClient() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not configured.");

  const url = new URL(databaseUrl);
  const certificatePath = process.env.SUPABASE_DB_CA_PATH;
  const certificateAuthority = certificatePath ? readFileSync(certificatePath, "utf8") : undefined;
  const pool = new Pool({
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

  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

export const prisma =
  globalForPrisma.prisma ||
  createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
