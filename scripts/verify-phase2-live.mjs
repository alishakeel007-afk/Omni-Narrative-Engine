import dotenv from "dotenv";
import { readFileSync } from "node:fs";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { validateDatabaseUrl } from "./database-url-validation.mjs";

// This local verification script must use the same environment file as Next.js.
// Load it before Prisma so Prisma cannot preload a stale .env DATABASE_URL.
dotenv.config({ path: ".env.local", override: true, quiet: true });

const { PrismaClient, StoryMode } = await import("@prisma/client");

function createPrismaClient() {
  const url = new URL(process.env.DATABASE_URL);
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
  return new PrismaClient({ adapter: new PrismaPg(pool) });
}

const prisma = createPrismaClient();
const marker = `phase2-live-${Date.now()}`;
let projectId;

try {
  validateDatabaseUrl("DATABASE_URL", process.env.DATABASE_URL, "6543");
  validateDatabaseUrl("DIRECT_URL", process.env.DIRECT_URL, "5432");
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey || /^(your_|replace_)/.test(geminiKey)) throw new Error("GEMINI_API_KEY is not configured.");

  await prisma.$queryRaw`SELECT 1`;
  const extensions = await prisma.$queryRaw`SELECT extname::text FROM pg_extension WHERE extname = 'vector'`;
  if (!Array.isArray(extensions) || extensions.length === 0) throw new Error("pgvector extension is unavailable.");

  const project = await prisma.storyProject.create({
    data: {
      userId: marker,
      title: "Phase 2 verification",
      mode: StoryMode.GUIDED,
      drafts: { create: { versionNumber: 1, title: "Verification draft", genres: ["Fantasy"], tones: ["Tense"], numberOfScenes: 3, isActive: true } }
    },
    include: { drafts: true }
  });
  projectId = project.id;
  const draftId = project.drafts[0].id;

  await prisma.character.create({ data: { draftId, name: "Lyra", role: "Interpreter", personalityTone: "Brave", traits: ["Observant"] } });
  await prisma.scene.create({ data: { draftId, sceneNumber: 1, title: "Opening", description: "The observatory opens.", location: "Observatory", mood: "Tense" } });
  const owned = await prisma.storyProject.findFirst({ where: { id: projectId, userId: marker } });
  const denied = await prisma.storyProject.findFirst({ where: { id: projectId, userId: `${marker}-other` } });
  if (!owned || denied) throw new Error("Database ownership isolation check failed.");

  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
    body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: Omni ready" }] }], generationConfig: { temperature: 0, maxOutputTokens: 10 } })
  });
  if (!response.ok) throw new Error(`Gemini verification failed with HTTP ${response.status}.`);

  console.log("Live verification passed: PostgreSQL, pgvector, Prisma persistence, ownership query, and Gemini response.");
} finally {
  if (projectId) await prisma.storyProject.delete({ where: { id: projectId } }).catch(() => undefined);
  await prisma.$disconnect();
}
