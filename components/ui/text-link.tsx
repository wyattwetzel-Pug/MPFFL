import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const linkClass =
  "text-primary underline-offset-4 hover:underline transition-colors";

/* Internal link */
function TextLink({
  className,
  ...props
}: React.ComponentProps<typeof Link>) {
  return <Link className={cn(linkClass, className)} {...props} />;
}

/* External link (new tab, rel set) */
function ExternalLink({
  className,
  ...props
}: React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      target="_blank"
      rel="noopener noreferrer"
      className={cn(linkClass, className)}
      {...props}
    />
  );
}

export { TextLink, ExternalLink, linkClass };
