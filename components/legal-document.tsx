import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";

/*
 * Legal pages.
 *
 * The text is the deal — it doesn't get paraphrased, tightened, or "improved."
 * Only the presentation is rebuilt: numbered sections a reader can cite, and a
 * table rendered as a table rather than flattened into a list the way v1 did.
 */

export type Block =
  | { kind: "p"; text: React.ReactNode }
  | { kind: "ul"; items: React.ReactNode[] }
  | { kind: "table"; head: string[]; rows: React.ReactNode[][] }
  | { kind: "note"; text: React.ReactNode };

export type LegalSection = { heading: string; blocks: Block[] };

export function B({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-foreground">{children}</strong>;
}

export function L({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-primary underline-offset-4 hover:underline">
      {children}
    </Link>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.kind === "p") return <p key={i}>{b.text}</p>;
        if (b.kind === "note")
          return (
            <p key={i} className="text-xs text-muted-foreground">
              {b.text}
            </p>
          );
        if (b.kind === "ul")
          return (
            <ul key={i} className="list-disc space-y-1.5 pl-5">
              {b.items.map((it, j) => (
                <li key={j}>{it}</li>
              ))}
            </ul>
          );
        return (
          <div key={i} className="overflow-x-auto">
            <table className="w-full min-w-[32rem] border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  {b.head.map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-semibold">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {b.rows.map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className="px-3 py-2 align-top">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </>
  );
}

export function LegalDocument({
  title,
  effective,
  updated,
  sections,
}: {
  title: string;
  effective: string;
  updated?: string;
  sections: LegalSection[];
}) {
  return (
    <div className="max-w-3xl space-y-6 pb-12">
      <div>
        <PageHeader title={title} />
        <p className="mt-2 text-sm text-muted-foreground">
          Effective {effective}
          {updated && ` · Last updated ${updated}`}
        </p>
      </div>

      {sections.map((s, i) => (
        <section key={s.heading} className="space-y-3 border-t pt-6 text-sm leading-relaxed">
          {/* Numbered so a section can be cited in an argument, which is the
              only reason anyone opens one of these. */}
          <h2 className="text-lg font-bold tracking-tight">
            <span className="mr-2 text-muted-foreground">{i + 1}.</span>
            {s.heading}
          </h2>
          <Blocks blocks={s.blocks} />
        </section>
      ))}
    </div>
  );
}
