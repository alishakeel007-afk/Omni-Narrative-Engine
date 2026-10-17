import assert from "node:assert/strict";
import { validateDatabaseUrl } from "./database-url-validation.mjs";

const prefix = "postgresql://postgres.projectref:";
const suffix = "@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";

for (const encodedPassword of ["word%40pass", "word%23pass", "word%25pass"]) {
  assert.doesNotThrow(() => validateDatabaseUrl("DATABASE_URL", `${prefix}${encodedPassword}${suffix}`, "6543"));
}

assert.throws(
  () => validateDatabaseUrl("DATABASE_URL", `${prefix}word@pass${suffix}`, "6543"),
  /unencoded reserved character/,
);

console.log("Database URL validation tests passed.");
