/**
 * Apply one migration with a plain pg client, and record it.
 *
 * `prisma migrate deploy` uses a Rust engine that sometimes cannot reach Neon
 * even when the app and a raw pg client connect fine — P1001 while
 * `select 1` succeeds on the same URL. This does exactly what deploy does:
 * runs the SQL in a transaction, then writes the `_prisma_migrations` row with
 * the checksum Prisma expects, so a later `migrate deploy` sees it as applied
 * rather than trying again.
 *
 * Idempotent: a migration already recorded is left alone.
 *
 *   npx tsx --env-file=.env.neon scripts/apply-migration.ts <migration_dir_name>
 */
import { readFileSync } from "fs";
import { createHash, randomUUID } from "crypto";
import { Client } from "pg";

const name = process.argv[2];
if (!name) throw new Error("usage: apply-migration.ts <migration_dir_name>");

const path = `prisma/migrations/${name}/migration.sql`;
const sql = readFileSync(path, "utf8");
const checksum = createHash("sha256").update(readFileSync(path)).digest("hex");

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function main() {
  await client.connect();
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\n${name}\n  against ${host}\n`);

  const already = await client.query(
    `SELECT finished_at FROM "_prisma_migrations" WHERE migration_name = $1`,
    [name]
  );
  if (already.rowCount && already.rows[0].finished_at) {
    console.log("  already applied — nothing to do");
    return;
  }

  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO "_prisma_migrations"
         (id, checksum, finished_at, migration_name, logs, rolled_back_at, started_at, applied_steps_count)
       VALUES ($1, $2, now(), $3, NULL, NULL, now(), 1)`,
      [randomUUID(), checksum, name]
    );
    await client.query("COMMIT");
    console.log("  applied and recorded");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}

main()
  .catch((e) => {
    console.error("  FAILED:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
