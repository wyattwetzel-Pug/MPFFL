/*
 * Token registry — drives the /styleguide swatches. Adding a token to
 * globals.css means adding it here, which keeps the styleguide honest.
 */

export const COLOR_TOKENS = [
  { name: "background", className: "bg-background", note: "Page background" },
  { name: "foreground", className: "bg-foreground", note: "Default text" },
  { name: "card", className: "bg-card", note: "Card / panel surfaces" },
  { name: "primary", className: "bg-primary", note: "Primary actions, links" },
  { name: "secondary", className: "bg-secondary", note: "Secondary surfaces & buttons" },
  { name: "muted", className: "bg-muted", note: "Subdued surfaces (table headers)" },
  { name: "muted-foreground", className: "bg-muted-foreground", note: "Subdued text" },
  { name: "accent", className: "bg-accent", note: "Hover states" },
  { name: "destructive", className: "bg-destructive", note: "Errors, deletes" },
  { name: "success", className: "bg-success", note: "Confirmations, apply actions" },
  { name: "warning", className: "bg-warning", note: "Caution actions (cuts)" },
  { name: "attention", className: "bg-attention", note: "v1 orange — hot nav items" },
  { name: "border", className: "bg-border", note: "Borders & dividers" },
  { name: "ring", className: "bg-ring", note: "Focus rings" },
  { name: "ir", className: "bg-ir", note: "Injured Reserve marker" },
  { name: "ps", className: "bg-ps", note: "Practice Squad marker" },
  { name: "b2b", className: "bg-b2b", note: "Back-to-back contract marker" },
] as const;

export const RADII = [
  { name: "sm", className: "rounded-sm" },
  { name: "md", className: "rounded-md" },
  { name: "lg", className: "rounded-lg" },
  { name: "full", className: "rounded-full" },
] as const;
