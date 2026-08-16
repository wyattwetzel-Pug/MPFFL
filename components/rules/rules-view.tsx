"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TallyBar } from "@/components/ui/tally-bar";
import { teamCode } from "@/lib/team-codes";
import { castRuleVote, addRuleComment, deleteRuleComment } from "@/lib/actions/rules-actions";

/*
 * §22 — the ballot, live and fully public. Everything derives per render;
 * the vote buttons are a courtesy over server-enforced rules (lock, one
 * vote per team). A second co-owner sees the standing vote and who cast it
 * — the "talk it over" happens in text messages, but the power to change
 * is real.
 */

export type ProposalView = {
  id: number;
  title: string;
  body: string;
  proposedByLabel: string;
  iconUrl: string | null;
  proposedAt: string;
  outcome: "PASSED" | "FAILED" | "WITHDRAWN" | null;
  votes: { teamId: number; teamName: string; choice: "AYE" | "NAY" | "ABSTAIN"; castByName: string }[];
  comments: {
    id: number;
    parentId: number | null;
    teamName: string;
    authorName: string;
    authorOwnerId: number;
    body: string | null; // null = removed
    at: string;
  }[];
};

type Viewer = { ownerId: number; ownerName: string; teamId: number | null; isCommissioner: boolean } | null;

const CHOICES = ["AYE", "NAY", "ABSTAIN"] as const;
const CHOICE_STYLE: Record<string, string> = {
  AYE: "bg-success",
  NAY: "bg-destructive",
  ABSTAIN: "bg-muted-foreground/50",
};
const OUTCOME_VARIANT: Record<string, "default" | "destructive" | "secondary"> = {
  PASSED: "default",
  FAILED: "destructive",
  WITHDRAWN: "secondary",
};

function CommentBox({
  proposalId, parentId, placeholder, onDone,
}: {
  proposalId: number; parentId: number | null; placeholder: string; onDone: () => void;
}) {
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-1.5">
      <Textarea
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={placeholder}
        className="text-sm"
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          disabled={pending || !body.trim()}
          loading={pending}
          onClick={() =>
            start(async () => {
              const res = await addRuleComment(proposalId, body, parentId);
              if (res.ok) { setBody(""); setError(null); onDone(); }
              else setError(res.error);
            })
          }
        >
          Post
        </Button>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>
    </div>
  );
}

export function RulesView({
  seasonYear, proposals, teamsTotal, locksAt, locked, viewer,
}: {
  seasonYear: number;
  proposals: ProposalView[];
  teamsTotal: number;
  locksAt: string | null;
  locked: boolean;
  viewer: Viewer;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [voteError, setVoteError] = useState<string | null>(null);

  const canAct = viewer != null && viewer.teamId != null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {locksAt == null
          ? "Voting deadline not yet scheduled."
          : locked
            ? `Voting locked ${new Date(locksAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT.`
            : `Voting locks ${new Date(locksAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })} PT.`}
        {" "}One vote per team.
        {!viewer && " Sign in to vote and comment."}
      </p>
      {proposals.length === 0 && (
        <p className="text-sm text-muted-foreground">No proposals on the {seasonYear} ballot yet.</p>
      )}

      {proposals.map((p, idx) => {
        const myVote = viewer?.teamId != null ? p.votes.find((v) => v.teamId === viewer.teamId) : undefined;
        const topComments = p.comments.filter((c) => c.parentId == null);
        return (
          <Card key={p.id} id={`proposal-${p.id}`}>
            <CardContent className="space-y-4 p-4">
              <div className="flex items-start gap-3">
                {p.iconUrl && (
                  <Image src={p.iconUrl} alt="" width={40} height={40} unoptimized className="mt-0.5 size-10 rounded" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-bold">
                      {idx + 1}. {p.title}
                    </h2>
                    {p.outcome && <Badge variant={OUTCOME_VARIANT[p.outcome]}>{p.outcome.toLowerCase()}</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    proposed by {p.proposedByLabel} ·{" "}
                    {new Date(p.proposedAt).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium" })}
                  </p>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-sm">{p.body}</p>

              <div>
                <TallyBar
                  total={teamsTotal}
                  segments={CHOICES.map((c) => ({
                    label: c.toLowerCase(),
                    count: p.votes.filter((v) => v.choice === c).length,
                    className: CHOICE_STYLE[c],
                  }))}
                />
                {p.votes.length > 0 && (
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
                    {CHOICES.filter((c) => p.votes.some((v) => v.choice === c)).map((c) => (
                      <span key={c} className="mr-3">
                        <b className="uppercase">{c.toLowerCase()}</b>:{" "}
                        {p.votes.filter((v) => v.choice === c).map((v) => teamCode(v.teamName)).join(", ")}
                      </span>
                    ))}
                  </p>
                )}
              </div>

              {canAct && !locked && (
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {CHOICES.map((c) => (
                      <Button
                        key={c}
                        size="sm"
                        variant={myVote?.choice === c ? "default" : "outline"}
                        disabled={pending}
                        onClick={() =>
                          start(async () => {
                            const res = await castRuleVote(p.id, c);
                            setVoteError(res.ok ? null : res.error);
                            router.refresh();
                          })
                        }
                      >
                        {c.toLowerCase()}
                      </Button>
                    ))}
                  </div>
                  {myVote && (
                    <p className="text-[11px] text-muted-foreground">
                      Your team&apos;s vote: <b className="uppercase">{myVote.choice.toLowerCase()}</b>, cast by {myVote.castByName}.
                      {myVote.castByName !== viewer!.ownerName &&
                        " Talk it over with your co-owner before changing it — but you can."}
                    </p>
                  )}
                  {voteError && <p className="text-[11px] text-destructive">{voteError}</p>}
                </div>
              )}
              {canAct && locked && myVote && (
                <p className="text-[11px] text-muted-foreground">
                  Your team voted <b className="uppercase">{myVote.choice.toLowerCase()}</b> (cast by {myVote.castByName}).
                </p>
              )}

              <div className="space-y-3 border-t pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Discussion · {p.comments.length}
                </p>
                {topComments.map((c) => (
                  <div key={c.id} className="space-y-2">
                    <CommentRow comment={c} viewer={viewer} onChanged={() => router.refresh()} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} canReply={canAct} />
                    {p.comments.filter((r) => r.parentId === c.id).map((r) => (
                      <div key={r.id} className="ml-6 border-l pl-3">
                        <CommentRow comment={r} viewer={viewer} onChanged={() => router.refresh()} onReply={() => setReplyTo(replyTo === c.id ? null : c.id)} canReply={canAct} />
                      </div>
                    ))}
                    {replyTo === c.id && canAct && (
                      <div className="ml-6">
                        <CommentBox proposalId={p.id} parentId={c.id} placeholder="Reply…" onDone={() => { setReplyTo(null); router.refresh(); }} />
                      </div>
                    )}
                  </div>
                ))}
                {canAct ? (
                  <CommentBox proposalId={p.id} parentId={null} placeholder="Add to the discussion…" onDone={() => router.refresh()} />
                ) : (
                  !viewer && <p className="text-xs text-muted-foreground">Sign in to join the discussion.</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function CommentRow({
  comment, viewer, onChanged, onReply, canReply,
}: {
  comment: ProposalView["comments"][number];
  viewer: Viewer;
  onChanged: () => void;
  onReply: () => void;
  canReply: boolean;
}) {
  const [pending, start] = useTransition();
  const mine = viewer != null && comment.authorOwnerId === viewer.ownerId;
  return (
    <div className="text-sm">
      <p className="text-xs text-muted-foreground">
        <b className="text-foreground">{comment.authorName}</b> ({teamCode(comment.teamName)}) ·{" "}
        {new Date(comment.at).toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "medium", timeStyle: "short" })}
      </p>
      {comment.body == null ? (
        <p className="italic text-muted-foreground/60">[removed]</p>
      ) : (
        <p className="whitespace-pre-wrap">{comment.body}</p>
      )}
      <p className="mt-0.5 flex gap-3 text-[11px] text-muted-foreground">
        {canReply && comment.parentId == null && (
          <button type="button" className="hover:text-foreground" onClick={onReply}>reply</button>
        )}
        {(mine || viewer?.isCommissioner) && comment.body != null && (
          <button
            type="button"
            disabled={pending}
            className="hover:text-destructive"
            onClick={() => start(async () => { await deleteRuleComment(comment.id); onChanged(); })}
          >
            remove
          </button>
        )}
      </p>
    </div>
  );
}
