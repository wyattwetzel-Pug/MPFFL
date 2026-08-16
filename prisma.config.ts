import "dotenv/config";
import { defineConfig } from "prisma/config";

/*
 * Migrations need a *direct* connection. Neon's pooled endpoint routes each
 * query to whichever backend is free, so the advisory lock Prisma takes while
 * migrating is acquired on one connection and looked for on another — it never
 * resolves and the deploy times out.
 *
 * The app itself keeps using the pooled URL (see lib/prisma.ts), which is the
 * right choice for serverless.
 *
 * `prisma generate` also loads this file at install time, before any database
 * exists, so a missing URL must not throw here.
 */
const migrationUrl =
  process.env.DATABASE_URL_UNPOOLED ??
  process.env.POSTGRES_URL_NON_POOLING ??
  process.env.DATABASE_URL ??
  "postgresql://unset";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: migrationUrl,
  },
});
