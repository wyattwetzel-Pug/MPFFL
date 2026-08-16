"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useEditor, EditorContent } from "@tiptap/react";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link2,
  Image as ImageIcon,
  Table as TableIcon,
  Undo2,
  Redo2,
} from "lucide-react";
import { MANUAL_EXTENSIONS } from "@/lib/manual/document";
import { saveManual } from "@/lib/actions/manual-actions";
import { readDraft, writeDraft, clearDraft, type DraftEnvelope } from "@/lib/draft-backup";
import { DraftRecoveryBar } from "@/components/ui/draft-recovery";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";

const Tool = ({
  onClick,
  active,
  label,
  icon: Icon,
}: {
  onClick: () => void;
  active?: boolean;
  label: string;
  icon: React.ElementType;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-label={label}
    aria-pressed={active}
    title={label}
    className={cn(
      "rounded p-1.5 transition-colors hover:bg-accent",
      active && "bg-accent text-accent-foreground"
    )}
  >
    <Icon className="size-4" />
  </button>
);

/* Everything the backup preserves — enough to rebuild the whole session. */
type ManualDraft = { title: string; summary: string; doc: unknown };
const DRAFT_KEY = "manual-edit";

export function ManualEditor({
  initialDoc,
  initialTitle,
  currentVersion,
}: {
  initialDoc: unknown;
  initialTitle: string;
  currentVersion: number | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [summary, setSummary] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  /*
   * Draft insurance: every edit backs up to this device (debounced), and a
   * backup that survives a reload is offered back. Born from a real loss —
   * a deploy-skewed save 404'd and the reload ate an edit session.
   */
  const [recovery, setRecovery] = useState<DraftEnvelope<ManualDraft> | null>(() =>
    typeof window === "undefined" ? null : readDraft<ManualDraft>(DRAFT_KEY)
  );
  const backupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backup = (next: Partial<ManualDraft>) => {
    if (backupTimer.current) clearTimeout(backupTimer.current);
    backupTimer.current = setTimeout(() => {
      writeDraft<ManualDraft>(DRAFT_KEY, {
        title,
        summary,
        doc: editor?.getJSON() ?? initialDoc,
        ...next,
      });
    }, 800);
  };

  const editor = useEditor({
    extensions: MANUAL_EXTENSIONS,
    content: (initialDoc as never) ?? "",
    immediatelyRender: false, // avoids an SSR/client markup mismatch
    onUpdate: ({ editor: e }) => backup({ doc: e.getJSON() }),
    editorProps: {
      attributes: {
        class: "manual-prose min-h-[60vh] focus:outline-none",
      },
    },
  });

  function save() {
    if (!editor) return;
    setMessage(null);
    const form = new FormData();
    form.set("title", title);
    form.set("summary", summary);
    form.set("doc", JSON.stringify(editor.getJSON()));

    startTransition(async () => {
      let result: Awaited<ReturnType<typeof saveManual>>;
      try {
        result = await saveManual(form);
      } catch {
        // A failed POST (deploy skew, network) must never cost the text: the
        // backup just wrote it, and the editor still holds it.
        setMessage(
          "Save failed — the site may have just updated. Your text is safe in this editor and backed up on this device: refresh the page and choose Restore draft, then publish again."
        );
        return;
      }
      if (result && "error" in result && result.error) {
        setMessage(`${result.error} Your text stays in the editor and is backed up on this device.`);
        return;
      }
      clearDraft(DRAFT_KEY);
      router.push("/manual");
    });
  }

  if (!editor) return null;

  return (
    <div className="space-y-4">
      {recovery && (
        <DraftRecoveryBar
          savedAt={recovery.savedAt}
          onRestore={() => {
            setTitle(recovery.value.title);
            setSummary(recovery.value.summary);
            editor.commands.setContent(recovery.value.doc as never);
            setRecovery(null);
          }}
          onDiscard={() => {
            clearDraft(DRAFT_KEY);
            setRecovery(null);
          }}
        />
      )}
      {message && (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="manual-title" label="Title">
          <Input value={title} onChange={(e) => { setTitle(e.target.value); backup({ title: e.target.value }); }} />
        </FormField>
        <FormField
          id="manual-summary"
          label="What changed?"
          hint="Shown in the version history — a short note helps the league follow rule changes."
        >
          <Input
            value={summary}
            onChange={(e) => { setSummary(e.target.value); backup({ summary: e.target.value }); }}
            placeholder="e.g. Updated holdover rates for 2026"
          />
        </FormField>
      </div>

      <div className="rounded-lg border">
        <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/50 p-1.5">
          <Tool icon={Bold} label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} />
          <Tool icon={Italic} label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} />
          <Tool icon={UnderlineIcon} label="Underline" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} />
          <div className="mx-1 h-5 w-px bg-border" />
          {([1, 2, 3] as const).map((level) => (
            <Tool
              key={level}
              icon={level === 1 ? Heading1 : level === 2 ? Heading2 : Heading3}
              label={`Heading ${level}`}
              active={editor.isActive("heading", { level })}
              onClick={() => editor.chain().focus().toggleHeading({ level }).run()}
            />
          ))}
          <div className="mx-1 h-5 w-px bg-border" />
          <Tool icon={List} label="Bullet list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} />
          <Tool icon={ListOrdered} label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} />
          <div className="mx-1 h-5 w-px bg-border" />
          <Tool
            icon={Link2}
            label="Link"
            active={editor.isActive("link")}
            onClick={() => {
              const url = prompt("Link URL:", editor.getAttributes("link").href ?? "https://");
              if (url === null) return;
              if (url === "") editor.chain().focus().unsetLink().run();
              else editor.chain().focus().setLink({ href: url, target: "_blank", rel: "noopener noreferrer" }).run();
            }}
          />
          <Tool
            icon={ImageIcon}
            label="Image"
            onClick={() => {
              const src = prompt("Image URL (upload to /public/manual and use /manual/name.png):");
              if (!src) return;
              const alt = prompt("Describe the image (for screen readers):") ?? "";
              editor.chain().focus().setImage({ src, alt }).run();
            }}
          />
          <Tool
            icon={TableIcon}
            label="Insert table"
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          />
          <div className="mx-1 h-5 w-px bg-border" />
          <Tool icon={Undo2} label="Undo" onClick={() => editor.chain().focus().undo().run()} />
          <Tool icon={Redo2} label="Redo" onClick={() => editor.chain().focus().redo().run()} />
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <EditorContent editor={editor} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={save} loading={pending}>
          {currentVersion ? `Publish version ${currentVersion + 1}` : "Publish first version"}
        </Button>
        <Button variant="outline" onClick={() => router.push("/manual")}>
          Cancel
        </Button>
        <p className="text-xs text-muted-foreground">
          Publishing creates a new version. The current one is kept in the history.
        </p>
      </div>
    </div>
  );
}
