import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/*
 * One setting: what it is, what state it's in, what governs it, and the fields
 * that change it.
 *
 * Settings pages kept hand-rolling this arrangement — title, status, an
 * explanatory line, then controls — and each one drifted. The league calendar,
 * team editing and the conditions review all want exactly this shape.
 */
function SettingCard({
  title,
  status,
  description,
  footer,
  children,
  className,
}: {
  /** ReactNode so a card can head itself with a link, not just text. */
  title: React.ReactNode;
  /** Current state of the setting, e.g. set vs falling back. */
  status?: { label: string; variant?: React.ComponentProps<typeof Badge>["variant"] };
  /** The rule or reason behind the setting — not instructions for the field. */
  description?: string;
  footer?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <Card className={className}>
      <CardContent className="space-y-3 p-4">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold">{title}</h3>
            {status && <Badge variant={status.variant}>{status.label}</Badge>}
          </div>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </div>
        {children}
        {footer && <div className="text-xs text-muted-foreground">{footer}</div>}
      </CardContent>
    </Card>
  );
}

/*
 * A row of fields that belong together.
 *
 * Wraps rather than squeezing, so a narrow screen stacks the fields instead of
 * shrinking each one past usefulness.
 */
function FormRow({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-start gap-3", className)}>{children}</div>;
}

export { SettingCard, FormRow };
