"use client";

import { useTransition } from "react";
import { restoreManualVersion } from "@/lib/actions/manual-actions";
import { Button } from "@/components/ui/button";

export function RestoreButton({ version }: { version: number }) {
  const [pending, startTransition] = useTransition();

  return (
    <Button
      variant="link"
      size="sm"
      loading={pending}
      onClick={() => {
        if (
          !confirm(
            `Publish version ${version} as the live manual?\n\n` +
              `It's copied forward as a new version — nothing in the history is lost.`
          )
        )
          return;
        startTransition(async () => {
          await restoreManualVersion(version);
        });
      }}
    >
      Restore
    </Button>
  );
}
