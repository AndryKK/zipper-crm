// node scripts/generate-rls-sql.mjs
// Reads RLS config (is_admin() function, ENABLE RLS, policies) from the OLD
// Supabase project and emits equivalent SQL, restricted to tables that also
// exist on the NEW project (a handful of legacy old-DB-only tables were never
// cloned and are skipped with a warning).
//
// Usage: OLD_DATABASE_URL=... NEW_DATABASE_URL=... node scripts/generate-rls-sql.mjs > scripts/rls-new-project.sql

import { PrismaClient } from "../app/generated/prisma/index.js";

const OLD_URL = process.env.OLD_DATABASE_URL;
const NEW_URL = process.env.NEW_DATABASE_URL;
if (!OLD_URL || !NEW_URL) {
  console.error("Missing OLD_DATABASE_URL / NEW_DATABASE_URL env vars");
  process.exit(1);
}

const src = new PrismaClient({ datasourceUrl: OLD_URL });
const dst = new PrismaClient({ datasourceUrl: NEW_URL });

async function main() {
  const newTables = new Set(
    (
      await dst.$queryRawUnsafe(
        `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind='r'`
      )
    ).map((r) => r.relname)
  );

  const fnRows = await src.$queryRawUnsafe(
    `SELECT pg_get_functiondef(p.oid) AS def FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public' AND p.proname = 'is_admin'`
  );

  const tables = await src.$queryRawUnsafe(
    `SELECT c.relname AS tablename, c.relrowsecurity AS rowsecurity
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`
  );

  const policies = await src.$queryRawUnsafe(
    `SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
     FROM pg_policies WHERE schemaname='public' ORDER BY tablename, policyname`
  );

  const lines = [];
  lines.push("-- Generated from the OLD Supabase project's RLS config.");
  lines.push("-- Review before running against the new project.\n");

  if (fnRows.length) {
    lines.push("-- Dependency: policies below call is_admin().");
    lines.push(fnRows[0].def.trim() + ";\n");
  }

  const skippedTables = [];
  for (const t of tables) {
    if (!newTables.has(t.tablename)) {
      skippedTables.push(t.tablename);
      continue;
    }
    if (t.rowsecurity) {
      lines.push(`ALTER TABLE "${t.tablename}" ENABLE ROW LEVEL SECURITY;`);
    }
  }
  lines.push("");

  for (const p of policies) {
    if (!newTables.has(p.tablename)) continue;
    const roles = p.roles.join(", ");
    let sql = `DROP POLICY IF EXISTS "${p.policyname}" ON "${p.tablename}";\n`;
    sql += `CREATE POLICY "${p.policyname}" ON "${p.tablename}"\n`;
    sql += `  AS ${p.permissive} FOR ${p.cmd} TO ${roles}`;
    if (p.qual != null) sql += `\n  USING (${p.qual})`;
    if (p.with_check != null) sql += `\n  WITH CHECK (${p.with_check})`;
    sql += ";\n";
    lines.push(sql);
  }

  if (skippedTables.length) {
    lines.unshift(
      `-- NOTE: these old-project tables don't exist on the new project and were skipped: ${skippedTables.join(", ")}\n`
    );
  }

  console.log(lines.join("\n"));
  await src.$disconnect();
  await dst.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
