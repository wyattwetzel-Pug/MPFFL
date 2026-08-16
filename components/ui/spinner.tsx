import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

function Spinner({
  className,
  label = "Loading…",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { label?: string }) {
  return (
    <span role="status" className={cn("inline-flex items-center gap-2", className)} {...props}>
      <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />
      <span className="sr-only">{label}</span>
    </span>
  );
}

export { Spinner };
