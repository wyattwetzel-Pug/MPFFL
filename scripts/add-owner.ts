/**
 * Add an owner to a team.
 *
 * A stopgap until the commissioner tool exists. Kept because it is also the
 * safest way to do it: it prints the team's roster of owners before and after,
 * refuses to move somebody who already belongs to another team, and never
 * invents consent.
 *
 * The new owner arrives with **no consents at all**. That is deliberate and not
 * an oversight — consent has to come from the person giving it, so they get the
 * banner on first sign-in and grant it themselves. Until then the site will not
 * text them, which is correct.
 *
 * Dry run by default.
 *
 *   npx tsx --env-file=.env.neon scripts/add-owner.ts \
 *     --team="Example Team" --name="Sam Example" \
 *     --email=psims80@hotmail.com --phone="+352 621 798 646" --apply
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalisePhone, formatPhone } from "../lib/phone.ts";

const args = process.argv.slice(2);
const arg = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
const apply = args.includes("--apply");

const rawTeam = arg("team");
const rawName = arg("name");
const rawEmail = arg("email")?.toLowerCase().trim();
const phoneRaw = arg("phone") ?? "";
if (!rawTeam || !rawName || !rawEmail) {
  throw new Error("usage: add-owner.ts --team=… --name=… --email=… [--phone=…] [--apply]");
}
// Narrowed once here: TypeScript won't carry the guard above into the closures
// below, and `!` at each use is how a real null slips through unnoticed.
const teamName: string = rawTeam;
const name: string = rawName;
const email: string = rawEmail;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function show(teamId: number, when: string) {
  const rows = await prisma.teamOwner.findMany({
    where: { teamId },
    select: {
      owner: {
        select: { id: true, name: true, email: true, phone: true, smsConsentAt: true, privacyConsentAt: true },
      },
    },
  });
  console.log(`  ${when}:`);
  for (const r of rows) {
    const o = r.owner;
    console.log(
      `      #${o.id} ${o.name.padEnd(18)} ${o.email.padEnd(28)} ${formatPhone(o.phone).padEnd(18)}` +
        ` consent: ${o.privacyConsentAt ? "policies ✓" : "policies —"} ${o.smsConsentAt ? "sms ✓" : "sms —"}`
    );
  }
}

async function main() {
  const host = (process.env.DATABASE_URL ?? "").split("@")[1]?.split("/")[0];
  console.log(`\nAdd owner — against ${host}\n`);

  const parsed = normalisePhone(phoneRaw);
  if (!parsed.ok) throw new Error(parsed.error);

  // Business key, never id — local and Neon number these rows differently.
  const team = await prisma.team.findFirst({ where: { name: teamName } });
  if (!team) throw new Error(`No team named "${teamName}".`);

  await show(team.id, "Before");

  const existing = await prisma.owner.findUnique({
    where: { email },
    select: { id: true, name: true, teamOwner: { select: { teamId: true } } },
  });
  if (existing) {
    if (existing.teamOwner && existing.teamOwner.teamId !== team.id) {
      throw new Error(
        `${existing.name} already owns another team. Moving an owner is a different decision — do it deliberately, not as a side effect of adding one.`
      );
    }
    if (existing.teamOwner) {
      console.log(`\n  ${existing.name} is already an owner of ${team.name} — nothing to do.\n`);
      return;
    }
  }

  console.log(`\n  Would add: ${name}  ${email}  ${parsed.phone ?? "(no number)"}`);
  console.log(`  To:        ${team.name}`);
  console.log(`  Consents:  none — they grant their own on first sign-in\n`);

  if (!apply) {
    console.log("  Dry run. Re-run with --apply.\n");
    return;
  }

  await prisma.$transaction(async (tx) => {
    const owner =
      existing ??
      (await tx.owner.create({
        data: { name, email, phone: parsed.phone, isCommissioner: false, active: true },
        select: { id: true, name: true },
      }));
    await tx.teamOwner.create({ data: { teamId: team.id, ownerId: owner.id } });
  });

  await show(team.id, "After");
  console.log();
}

main()
  .catch((e) => {
    console.error("FAILED:", (e as Error).message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
