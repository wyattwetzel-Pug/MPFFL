"use client";

import type { CsvPreview } from "@/lib/player-import";
import { useState, useTransition } from "react";
import {
  previewPlayerCsv,
  commitPlayerCsv,
} from "@/lib/actions/player-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const CURRENT_SEASON = new Date().getFullYear();

export function CsvUpload() {
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [rookieYear, setRookieYear] = useState(String(CURRENT_SEASON));
  const [pending, startTransition] = useTransition();

  function runPreview(formData: FormData) {
    setResult(null);
    startTransition(async () => {
      setPreview(await previewPlayerCsv(formData));
    });
  }

  function commit() {
    if (!preview) return;
    startTransition(async () => {
      const res = await commitPlayerCsv(JSON.stringify(preview.rows), rookieYear);
      setResult(
        `Done: ${res.updated} updated, ${res.repositioned} position change(s), ${res.added} added.`
      );
      setPreview(null);
    });
  }

  const changeCount = preview
    ? preview.updates.length + preview.positionChanges.length + preview.adds.length
    : 0;

  return (
    <div className="max-w-3xl space-y-6">
      <form action={runPreview} className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Upload a CSV with columns <code>Player</code>, <code>Position</code>,{" "}
          <code>NFL Team</code> (a <code>Bye</code> column is ignored, and{" "}
          <code>Status</code> is optional). Matching is by{" "}
          <strong className="text-foreground">name + position</strong>,
          case-insensitive. Players already in the database but missing from the CSV are
          always left alone. Nothing is written until you confirm the preview.
        </p>

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="csv-file">CSV file</Label>
            <input
              id="csv-file"
              type="file"
              name="file"
              accept=".csv,text/csv"
              required
              className="text-sm"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="rookie-year">Rookie year for new players</Label>
            <Input
              id="rookie-year"
              name="rookieYear"
              type="number"
              min={1980}
              max={2100}
              value={rookieYear}
              onChange={(e) => setRookieYear(e.target.value)}
              className="w-32"
            />
          </div>
        </div>

        <Button type="submit" loading={pending}>
          Preview changes (dry run)
        </Button>
      </form>

      {result && (
        <Alert variant="success">
          <AlertDescription>{result}</AlertDescription>
        </Alert>
      )}

      {preview && (
        <div className="space-y-4">
          {preview.errors.length > 0 && (
            <Alert variant="warning">
              <AlertTitle>
                {preview.errors.length} row(s) need attention — these are skipped
              </AlertTitle>
              <AlertDescription>
                <ul className="max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5">
                  {preview.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <div className="grid gap-3 text-sm sm:grid-cols-5">
            {[
              [preview.updates.length, "to update"],
              [preview.positionChanges.length, "position changes"],
              [preview.adds.length, "to add"],
              [preview.unchanged, "unchanged"],
              [preview.notInCsv, "left as-is"],
            ].map(([n, label]) => (
              <Card key={label as string}>
                <CardContent className="p-3">
                  <div className="text-2xl font-bold">{n}</div>
                  <div className="text-muted-foreground">{label}</div>
                </CardContent>
              </Card>
            ))}
          </div>

          {preview.positionChanges.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  Position changes (existing records updated, not duplicated)
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <ul className="space-y-1">
                  {preview.positionChanges.map((p) => (
                    <li key={p.id}>
                      <span className="font-medium">{p.name}</span>: {p.from} → {p.to}
                      {p.teamChange && (
                        <span className="text-muted-foreground"> ({p.teamChange})</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {preview.updates.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Updates</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {preview.updates.map((u) => (
                    <li key={u.id}>
                      <span className="font-medium">
                        {u.name} ({u.position})
                      </span>
                      : {u.changes.join(", ")}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {preview.adds.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">
                  New players — rookie year {preview.rookieYear ?? "(none)"}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <ul className="max-h-72 space-y-1 overflow-y-auto">
                  {preview.adds.map((a, i) => (
                    <li key={i}>
                      {a.name} ({a.position}, {a.nflTeam})
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {changeCount > 0 && (
            <Button variant="success" loading={pending} onClick={commit}>
              Apply {changeCount} change(s)
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
