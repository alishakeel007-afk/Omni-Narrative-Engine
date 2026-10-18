const fs = require("node:fs");
const path = require("node:path");
require("dotenv").config({ path: ".env.local", quiet: true });
const output = path.resolve(".studio-worker/worker.cjs");
(async () => {
  if (process.argv.includes("--check")) {
    const prisma = new (require("@prisma/client").PrismaClient)();
    try {
      const [pending, activeSlots] = await Promise.all([
        prisma.filmSceneJob.count({
          where: { status: { in: ["queued", "waiting", "running"] } },
        }),
        prisma.filmSceneSlot.count({
          where: { leaseUntil: { gt: new Date() } },
        }),
      ]);
      console.log(
        JSON.stringify({
          pendingJobs: pending,
          activeSlots,
          configuredSlots: await prisma.filmSceneSlot.count(),
        }),
      );
    } finally {
      await prisma.$disconnect();
    }
    return;
  }
  if (
    process.env.NODE_ENV !== "production" ||
    process.argv.includes("--build") ||
    !fs.existsSync(output)
  ) {
    await require("esbuild").build({
      stdin: {
        contents: `import {startSceneWorker} from './lib/studio/scene-worker'; startSceneWorker().catch(()=>{console.error('Scene worker stopped. Check database connectivity and configuration.');process.exitCode=1;});`,
        resolveDir: process.cwd(),
        loader: "ts",
      },
      bundle: true,
      platform: "node",
      target: "node22",
      format: "cjs",
      packages: "external",
      outfile: output,
    });
  }
  if (!process.argv.includes("--build")) require(output);
})().catch(() => {
  console.error(
    "Scene worker could not start. Run the worker build and database setup first.",
  );
  process.exitCode = 1;
});
