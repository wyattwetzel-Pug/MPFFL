"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/*
 * The recovery offer an editor shows when an unsaved draft survives a
 * reload (styleguide: Feedback → DraftRecoveryBar). Restore puts the text
 * back; Discard forgets it. Deliberately loud — this bar existing at all
 * means something interrupted a writing session.
 */
export function DraftRecoveryBar({
  savedAt,
  onRestore,
  onDiscard,
}: {
  savedAt: number;
  onRestore: () => void;
  onDiscard: () => void;
}) {
  const when = new Date(savedAt).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
  return (
    <Alert>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        <span>
          You have an unsaved draft from <b>{when}</b> on this device.
        </span>
        <span className="ml-auto flex gap-2">
          <Button size="sm" onClick={onRestore}>Restore draft</Button>
          <Button size="sm" variant="ghost" onClick={onDiscard}>Discard</Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}
