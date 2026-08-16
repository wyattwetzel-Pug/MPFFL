/**
 * A local sign-in, without a magic link.
 *
 * Prints a line to paste into the browser console so a signed-in page can be
 * looked at while developing. Refuses anything but localhost — a session token
 * printed to a terminal is a real one, and this must never mint one against
 * production.
 *
 *   npx tsx --env-file=.env scripts/dev-session.ts [owner-email]
 */
import { randomBytes, createHash } from "crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error("Refusing to run against anything but a local database.");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function main() {
  const email = process.argv[2];
  const owner = email
    ? await prisma.owner.findFirst({ where: { email } })
    : await prisma.owner.findFirst({ where: { isCommissioner: true }, orderBy: { id: "asc" } });
  if (!owner) throw new Error("No such owner.");

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: { ownerId: owner.id, tokenHash: createHash("sha256").update(token).digest("hex") },
  });

  console.log(`\n  ${owner.name} — commissioner: ${owner.isCommissioner}\n`);
  console.log(`document.cookie = "mpffl_session=${token}; path=/"`);
  console.log();
}

main()
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
