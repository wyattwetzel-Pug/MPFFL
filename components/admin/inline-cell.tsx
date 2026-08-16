"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Cells that save themselves.
 *
 * Text and number fields commit on blur or Enter; selects and checkboxes
 * commit immediately. Nothing is sent when the value hasn't actually changed,
 * and a failed save snaps the cell back to the last known-good value so the
 * screen never disagrees with the database.
 *
 * Escape abandons an in-progress edit.
 */

export type SaveResult = { error?: string; success?: boolean } | undefined;
type Save = (value: unknown) => Promise<SaveResult>;

type Status = "idle" | "saving" | "saved" | "error";

function useCommit(initial: unknown, save: Save, onStatus?: (s: Status) => void) {
  const [committed, setCommitted] = useState(initial);
  const [status, setStatus] = useState<Status>("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A server revalidation can bring a newer value than the one we hold.
  useEffect(() => setCommitted(initial), [initial]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  async function commit(next: unknown): Promise<boolean> {
    if (next === committed) return true;
    setStatus("saving");
    onStatus?.("saving");
    const result = await save(next);
    if (result && "error" in result && result.error) {
      setStatus("error");
      onStatus?.("error");
      return false;
    }
    setCommitted(next);
    setStatus("saved");
    onStatus?.("saved");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setStatus("idle"), 1200);
    return true;
  }

  return { committed, status, commit };
}

const fieldClass =
  "w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm transition-colors hover:border-input focus:border-ring focus:bg-background focus:outline-none";

const statusRing: Record<Status, string> = {
  idle: "",
  saving: "opacity-60",
  saved: "border-success/60",
  error: "border-destructive bg-destructive/10",
};

export function TextCell({
  value,
  save,
  type = "text",
  placeholder,
  align = "left",
  className,
  ariaLabel,
}: {
  value: string | number | null;
  save: Save;
  type?: "text" | "number";
  placeholder?: string;
  align?: "left" | "center";
  className?: string;
  ariaLabel: string;
}) {
  const { committed, status, commit } = useCommit(value ?? "", save);
  const [draft, setDraft] = useState(String(value ?? ""));

  useEffect(() => setDraft(String(committed ?? "")), [committed]);

  return (
    <input
      type={type}
      value={draft}
      aria-label={ariaLabel}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={async () => {
        const ok = await commit(draft === "" ? "" : draft);
        if (!ok) setDraft(String(committed ?? ""));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(String(committed ?? ""));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        fieldClass,
        statusRing[status],
        align === "center" && "text-center",
        type === "number" && "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none",
        className
      )}
    />
  );
}

export function SelectCell({
  value,
  save,
  options,
  ariaLabel,
}: {
  value: string;
  save: Save;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  const { committed, status, commit } = useCommit(value, save);

  return (
    <select
      value={String(committed)}
      aria-label={ariaLabel}
      onChange={(e) => commit(e.target.value)}
      className={cn(fieldClass, statusRing[status], "cursor-pointer text-center")}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function CheckCell({
  value,
  save,
  ariaLabel,
}: {
  value: boolean;
  save: Save;
  ariaLabel: string;
}) {
  const { committed, status, commit } = useCommit(value, save);

  return (
    <input
      type="checkbox"
      checked={Boolean(committed)}
      aria-label={ariaLabel}
      onChange={(e) => commit(e.target.checked)}
      className={cn(
        "size-4 cursor-pointer rounded-sm border border-input accent-primary",
        status === "saving" && "opacity-60",
        status === "error" && "outline outline-destructive"
      )}
    />
  );
}
