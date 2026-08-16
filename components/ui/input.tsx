import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * 16px on phones, 14px from `sm` up.
 *
 * iOS Safari zooms the page whenever a focused input's text is under 16px, and
 * that zoom is what pushed the draft page sideways — content left the screen
 * mid-pick and had to be pinched back. Sizing the text at 16px prevents the
 * zoom at its cause, which beats disabling pinch-zoom in the viewport tag and
 * taking it away from everyone who actually wants it.
 *
 * `select` and `textarea` follow the same rule for the same reason.
 */
// ComponentProps rather than InputHTMLAttributes: it carries `ref`, which in
// React 19 is an ordinary prop — the auction entry bar needs it to hand focus
// back to the player box after every submit.
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base sm:text-sm transition-colors placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  );
}

export { Input };
