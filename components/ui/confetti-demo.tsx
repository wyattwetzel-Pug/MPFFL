"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Confetti } from "@/components/ui/confetti";

/** Styleguide only — the real trigger is a successful pick. */
export function ConfettiDemo() {
  const [fire, setFire] = useState(0);
  return (
    <>
      <Confetti fire={fire} />
      <Button variant="outline" size="sm" onClick={() => setFire((n) => n + 1)}>
        Throw confetti
      </Button>
    </>
  );
}
