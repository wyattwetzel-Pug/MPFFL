/*
 * A proportional tally bar: segments sized by count against a fixed total,
 * the unfilled remainder standing for votes not yet cast. Born for rule
 * votes; generic on purpose (styleguide: Feedback → TallyBar).
 */
export type TallySegment = { label: string; count: number; className: string };

export function TallyBar({
  segments,
  total,
  className,
}: {
  segments: TallySegment[];
  total: number;
  className?: string;
}) {
  const cast = segments.reduce((n, s) => n + s.count, 0);
  return (
    <div className={className}>
      <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.count > 0 ? (
            <div
              key={s.label}
              className={s.className}
              style={{ width: `${(s.count / Math.max(total, 1)) * 100}%` }}
              title={`${s.label}: ${s.count}`}
            />
          ) : null
        )}
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 text-[11px] text-muted-foreground">
        {segments.map((s) => (
          <span key={s.label}>
            <span className={`mr-1 inline-block size-2 rounded-full ${s.className}`} />
            {s.label} {s.count}
          </span>
        ))}
        <span className="ml-auto tabular-nums">{cast}/{total} teams</span>
      </div>
    </div>
  );
}
