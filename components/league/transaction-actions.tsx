"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { changeTransactionStatus } from "@/lib/actions/transaction-actions";
import { approveWithConditions } from "@/lib/actions/condition-actions";
import { STATUS_LABEL } from "@/components/league/transaction-entry-list";
import type { TransactionStatus } from "@prisma/client";

/*
 * Moving a transaction through its lifecycle.
 *
 * Approving a submission is the one moment somebody with authority is
 * deliberately reading the deal, so it's where the conditional-terms question
 * is asked — and it can't be clicked past. Everything else is a plain
 * transition with an optional comment.
 */
export type ActionEntry = { id: number; label: string; alreadyConditional: boolean };

export function TransactionActions({
  transactionId,
  status,
  allowed,
  entries,
  sniffed,
}: {
  transactionId: number;
  status: TransactionStatus;
  allowed: TransactionStatus[];
  entries: ActionEntry[];
  /** The sentence in the note that reads like a condition, if any. */
  sniffed: string | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [comment, setComment] = useState("");

  const [approving, setApproving] = useState(false);
  // Undecided until answered — no default, so it can't be skipped by clicking.
  const [hasTerms, setHasTerms] = useState<boolean | null>(sniffed ? true : null);
  const [ticked, setTicked] = useState<number[]>([]);
  const [description, setDescription] = useState(sniffed ?? "");
  const [decideBy, setDecideBy] = useState("");

  const move = (next: TransactionStatus) =>
    start(async () => {
      setError(null);
      const res = await changeTransactionStatus(transactionId, next, comment);
      if ("error" in res && res.error) setError(String(res.error));
      else router.refresh();
    });

  const approve = () =>
    start(async () => {
      setError(null);
      const res = await approveWithConditions({
        transactionId,
        conditionalEntryIds: hasTerms ? ticked : [],
        description: hasTerms ? description : null,
        decideBy: hasTerms && decideBy ? decideBy : null,
        comment,
      });
      if (res.ok) { setApproving(false); router.refresh(); }
      else setError(res.error);
    });

  const toggle = (id: number) =>
    setTicked((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Commissioner
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertTitle>Didn&apos;t work</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!approving ? (
          <>
            <div className="flex flex-wrap gap-2">
              {allowed.map((next) =>
                next === "APPROVED" && status === "SUBMITTED" ? (
                  <Button key={next} size="sm" onClick={() => setApproving(true)}>
                    Approve — rosters update
                  </Button>
                ) : (
                  <Button
                    key={next}
                    size="sm"
                    variant={next === "REJECTED" ? "destructive" : "outline"}
                    disabled={pending}
                    onClick={() => move(next)}
                  >
                    {STATUS_LABEL[next]}
                  </Button>
                )
              )}
            </div>
            <FormField id="comment" label="Comment" className="max-w-lg">
              <Input value={comment} onChange={(e) => setComment(e.target.value)} />
            </FormField>
          </>
        ) : (
          <div className="space-y-3">
            {sniffed && (
              <Alert variant="warning">
                <AlertTitle>This note reads like it has a condition</AlertTitle>
                <AlertDescription>&ldquo;{sniffed}&rdquo;</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <p className="text-sm font-medium">
                Does this transaction include conditional terms?
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant={hasTerms === true ? "default" : "outline"}
                  onClick={() => setHasTerms(true)}>Yes</Button>
                <Button size="sm" variant={hasTerms === false ? "default" : "outline"}
                  onClick={() => setHasTerms(false)}>No</Button>
              </div>
            </div>

            {hasTerms && (
              <div className="space-y-3 rounded-md border p-3">
                {entries.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-sm font-medium">Which of these are conditional?</p>
                    {entries.map((e) => (
                      <label key={e.id} className="flex items-center gap-2 text-sm">
                        <Checkbox checked={ticked.includes(e.id)} onChange={() => toggle(e.id)} />
                        {e.label}
                      </label>
                    ))}
                  </div>
                )}
                {/* Two of the league's three conditions were an asset that
                    didn't exist yet, so there was nothing to tick. */}
                <FormField
                  id="cond-desc"
                  label="The term"
                  hint="Include anything owed that isn't listed above."
                >
                  <Input value={description} onChange={(e) => setDescription(e.target.value)} />
                </FormField>
                <FormField id="cond-by" label="Decide by" hint="When someone should know the answer." className="w-56">
                  <Input type="date" value={decideBy} onChange={(e) => setDecideBy(e.target.value)} />
                </FormField>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                loading={pending}
                disabled={pending || hasTerms === null || (hasTerms && !description.trim())}
                onClick={approve}
              >
                Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => setApproving(false)}>
                Cancel
              </Button>
              {hasTerms === null && (
                <span className="text-sm text-muted-foreground">Answer the question to continue.</span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
