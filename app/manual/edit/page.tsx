import { prisma } from "@/lib/prisma";
import { requireCommissioner } from "@/lib/auth";
import { PageHeader } from "@/components/ui/page-header";
import { ManualEditor } from "@/components/manual/manual-editor";

export const dynamic = "force-dynamic";

export default async function ManualEditPage() {
  await requireCommissioner();

  const current = await prisma.manualVersion.findFirst({
    orderBy: { version: "desc" },
    select: { doc: true, title: true, version: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader title="Edit manual" />
      <ManualEditor
        initialDoc={current?.doc ?? null}
        initialTitle={current?.title ?? "MPFFL League Manual"}
        currentVersion={current?.version ?? null}
      />
    </div>
  );
}
