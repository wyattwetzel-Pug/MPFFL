import { notFound } from "next/navigation";
import { getSessionOwner } from "@/lib/auth";
import { COLOR_TOKENS, RADII } from "@/lib/design-tokens";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TallyBar } from "@/components/ui/tally-bar";
import { DraftRecoveryBar } from "@/components/ui/draft-recovery";
import { CountdownDemo } from "@/components/ui/countdown-demo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { SettingCard, FormRow } from "@/components/ui/setting-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { PageHeader } from "@/components/ui/page-header";
import { LiveRefresh } from "@/components/league/live-refresh";
import { ConfettiDemo } from "@/components/ui/confetti-demo";
import { StripDivider } from "@/components/league/asset-strip";
import { TextLink, ExternalLink } from "@/components/ui/text-link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DesignationMark, ContractCell, PlayerLink, SalaryCell } from "@/components/league/markers";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  ClipboardList,
  Hourglass,
  MessageSquare,
  Palette,
  Users,
  Calendar,
  Check,
  ChevronRight,
  Download,
  Edit,
  ExternalLink as ExternalLinkIcon,
  Gavel,
  Info,
  Menu,
  Plus,
  Search,
  Trash2,
  Trophy,
  Upload,
  X,
} from "lucide-react";

export const dynamic = "force-dynamic";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="border-b pb-2 text-xl font-bold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function Swatch({ name, className, note }: { name: string; className: string; note: string }) {
  return (
    <div className="flex items-center gap-3 rounded-md border p-2">
      <div className={`size-10 shrink-0 rounded-md border ${className}`} />
      <div className="min-w-0">
        <div className="font-mono text-xs font-semibold">{name}</div>
        <div className="truncate text-xs text-muted-foreground">{note}</div>
      </div>
    </div>
  );
}

export default async function StyleguidePage() {
  // Dev-visible always; production restricts to commissioners.
  if (process.env.NODE_ENV === "production") {
    const owner = await getSessionOwner();
    if (!owner?.isCommissioner) notFound();
  }

  return (
    <div className="space-y-10 pb-16">
      <div>
        <PageHeader title="Styleguide" />
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          The living design system. Every visual pattern on the site comes from the
          components on this page — pages never invent their own styles. New component?
          It gets added here in the same commit.
        </p>
      </div>

      <Section title="Brand">
        <p className="text-sm text-muted-foreground">
          Three variants of the crest, each on a transparent field. White is the
          site default (the green reads too dark on our background); green is the
          favicon and anywhere on light or neutral ground; black is for print and
          light documents.
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { file: "/mpffl-logo-white.png", label: "white", use: "Site header, dark backgrounds", bg: "bg-background" },
            { file: "/mpffl-logo.png", label: "green", use: "Favicon, light backgrounds", bg: "bg-white" },
            { file: "/mpffl-logo-black.png", label: "black", use: "Print, light documents", bg: "bg-white" },
          ].map((v) => (
            <div key={v.label} className="rounded-lg border p-3">
              <div className={`flex items-center justify-center rounded-md py-6 ${v.bg}`}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.file} alt={`MPFFL crest, ${v.label}`} className="h-20 w-20 object-contain" />
              </div>
              <div className="mt-2 font-mono text-xs font-semibold">{v.label}</div>
              <div className="text-xs text-muted-foreground">{v.use}</div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Color tokens">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {COLOR_TOKENS.map((t) => (
            <Swatch key={t.name} {...t} />
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <div className="space-y-3">
          <h1 className="text-3xl font-bold tracking-tight">Page title / h1 — 3xl bold</h1>
          <h2 className="text-xl font-bold tracking-tight">Section heading / h2 — xl bold</h2>
          <h3 className="font-semibold">Subsection / h3 — base semibold</h3>
          <p>Body text — base regular. The quick brown fox jumps over the lazy dog.</p>
          <p className="text-sm text-muted-foreground">
            Muted / secondary text — sm muted-foreground.
          </p>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">
            Table header style — xs uppercase tracked
          </p>
          <p>
            <TextLink href="/styleguide">Internal link</TextLink> ·{" "}
            <ExternalLink href="https://www.fantasypros.com">External link</ExternalLink> ·{" "}
            <PlayerLink name="Christian McCaffrey" />
          </p>
        </div>
      </Section>

      <Section title="Buttons">
        <p className="text-sm text-muted-foreground">
          One Button, eight variants. Green = confirm/apply, amber = caution (cuts),
          red = destructive. The old site&apos;s ad-hoc colored buttons all map to these.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="success">Success</Button>
          <Button variant="warning">Warning</Button>
          <Button variant="link">Link</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm">Small</Button>
          <Button size="lg">Large</Button>
          <Button size="icon" aria-label="Edit">
            <Edit />
          </Button>
          <Button disabled>Disabled</Button>
          <Button loading>Loading</Button>
          <Button variant="outline">
            <Download /> With icon
          </Button>
        </div>
      </Section>

      <Section title="Countdown">
        <CountdownDemo />
        <p className="text-sm text-muted-foreground">
          A digital clock rather than &ldquo;11h 22m left&rdquo;, so it reads as
          <em> running</em> — and <code>tabular-nums</code>, so the badge doesn&apos;t change
          width every second.
        </p>
      </Section>

      <Section title="Draft recovery">
        <p className="text-sm text-muted-foreground">
          Long-form editors back drafts up to the device as you type; this bar
          offers the draft back after any interrupted session.
        </p>
        <DraftRecoveryBar savedAt={1755088800000} onRestore={() => {}} onDiscard={() => {}} />
      </Section>

      <Section title="Tally bar">
        <p className="text-sm text-muted-foreground">
          Proportional votes against a fixed total; the unfilled remainder is
          votes not yet cast. Born for rule votes.
        </p>
        <div className="max-w-md">
          <TallyBar
            total={16}
            segments={[
              { label: "aye", count: 9, className: "bg-success" },
              { label: "nay", count: 3, className: "bg-destructive" },
              { label: "abstain", count: 1, className: "bg-muted-foreground/50" },
            ]}
          />
        </div>
      </Section>

      <Section title="Badges & league marks">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Rejected</Badge>
          <Badge variant="success">Approved</Badge>
          <Badge variant="warning">Pending</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <span>
            # column: <DesignationMark designation="ACTIVE" index={0} /> /{" "}
            <DesignationMark designation="IR" index={0} /> /{" "}
            <DesignationMark designation="PS" index={0} />
          </span>
          <span>
            Contract <ContractCell season={2027} backToBack /> (back-to-back)
          </span>
          <span>
            Salary: <SalaryCell amount={111} />
          </span>
          <span>
            Flagged inactive:{" "}
            <span className="text-[11px] font-semibold uppercase text-muted-foreground">
              inactive
            </span>
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          An inactive player is kept out of every picker — the trade form, the roster editor,
          the draft type-ahead — but stays on any roster they&apos;re on, because the team is
          still paying that salary and it still counts against the cap. Hiding the row would
          make the totals disagree with the rows that add up to them.
        </p>
      </Section>

      <Section title="Cards & containers">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>Card description in muted text.</CardDescription>
            </CardHeader>
            <CardContent className="text-sm">
              Standard container for grouped content. Stat cards on the home page are
              this component.
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex flex-col items-center gap-1 py-6">
              <Trophy className="mb-1 size-6 text-warning" />
              <div className="text-3xl font-bold">16</div>
              <div className="text-sm text-muted-foreground">Stat card pattern</div>
            </CardContent>
          </Card>
        </div>
      </Section>

      <Section title="Settings">
        <p className="text-sm text-muted-foreground">
          A setting is a title, the state it&apos;s in, the rule behind it, and the fields that
          change it. Settings pages kept rebuilding this arrangement and drifting, so it lives
          here. Settings autosave on blur; forms that write to the ledger keep an explicit
          submit, because a half-filed transaction must not be able to exist.
        </p>
        <SettingCard
          title="Trade deadline"
          status={{ label: "not set", variant: "warning" }}
          description="Wednesday before NFL week 12"
          footer="Falls back until someone sets it"
        >
          <FormRow>
            <FormField
              id="sg-date"
              label="Date and time"
              hint="Falls back to Fri, Nov 20, 2026"
              className="w-64"
            >
              <Input type="datetime-local" defaultValue="" />
            </FormField>
            <FormField id="sg-note" label="Note" className="min-w-72 flex-1">
              <Input defaultValue="" />
            </FormField>
          </FormRow>
        </SettingCard>
      </Section>

      <Section title="Forms">
        <div className="grid max-w-xl gap-4">
          <FormField id="sg-name" label="Text input" hint="Optional hint text below the field.">
            <Input placeholder="Player name…" />
          </FormField>
          <FormField id="sg-err" label="Input with error" error="This field is required.">
            <Input placeholder="you@example.com" />
          </FormField>
          <FormField id="sg-select" label="Select">
            <Select defaultValue="QB">
              <option>QB</option>
              <option>RB</option>
              <option>WR</option>
            </Select>
          </FormField>
          <FormField id="sg-textarea" label="Textarea">
            <Textarea placeholder="Notes…" />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox defaultChecked /> Checkbox with label
          </label>
          <div className="flex gap-2">
            <Button>Submit</Button>
            <Button variant="outline">Cancel</Button>
          </div>
        </div>
      </Section>

      <Section title="Alerts & messages">
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Default</AlertTitle>
            <AlertDescription>Neutral information panel.</AlertDescription>
          </Alert>
          <Alert variant="info">
            <AlertTitle>Info</AlertTitle>
            <AlertDescription>Something worth knowing about.</AlertDescription>
          </Alert>
          <Alert variant="success">
            <AlertTitle>Success</AlertTitle>
            <AlertDescription>Roster saved. 3 players updated.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>This team is over the $500 cap.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>Couldn&apos;t save — player is already rostered.</AlertDescription>
          </Alert>
        </div>
      </Section>

      <Section title="Tables">
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10 text-center">#</TableHead>
                <TableHead className="text-center">Pos</TableHead>
                <TableHead>Player</TableHead>
                <TableHead className="text-center">Amount</TableHead>
                <TableHead className="text-center">Contract</TableHead>
                <TableHead className="text-center">NFL</TableHead>
                <TableHead className="text-center">Bye</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="text-center">
                  <DesignationMark designation="ACTIVE" index={0} />
                </TableCell>
                <TableCell className="text-center font-medium">RB</TableCell>
                <TableCell>
                  <PlayerLink name="Christian McCaffrey" />
                </TableCell>
                <TableCell className="text-center">
                  <SalaryCell amount={111} />
                </TableCell>
                <TableCell className="text-center">-</TableCell>
                <TableCell className="text-center">SF</TableCell>
                <TableCell className="text-center text-muted-foreground">11</TableCell>
                <TableCell className="text-muted-foreground">Auction 2025</TableCell>
              </TableRow>
              <TableRow>
                <TableCell className="text-center">
                  <DesignationMark designation="IR" index={1} />
                </TableCell>
                <TableCell className="text-center font-medium">RB</TableCell>
                <TableCell>
                  <PlayerLink name="Jaylen Wright" />
                </TableCell>
                <TableCell className="text-center">
                  <SalaryCell amount={18} />
                </TableCell>
                <TableCell className="text-center">2026</TableCell>
                <TableCell className="text-center">MIA</TableCell>
                <TableCell className="text-center text-muted-foreground">6</TableCell>
                <TableCell />
              </TableRow>
              <TableRow>
                <TableCell className="text-center">
                  <DesignationMark designation="ACTIVE" index={2} />
                </TableCell>
                <TableCell className="text-center font-medium">QB</TableCell>
                <TableCell>
                  <PlayerLink name="Jordan Love" />
                </TableCell>
                <TableCell className="text-center">
                  <SalaryCell amount={60} />
                </TableCell>
                <TableCell className="text-center">
                  <ContractCell season={2027} backToBack />
                </TableCell>
                <TableCell className="text-center">GB</TableCell>
                <TableCell className="text-center text-muted-foreground">11</TableCell>
                <TableCell className="text-muted-foreground">Held Over</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      </Section>

      <Section title="Pagination">
        <p className="text-sm text-muted-foreground">
          Any list that can outgrow one screen gets this — and it always states the
          full total, so a page of results is never mistaken for the whole set.
        </p>
        <Pagination
          page={3}
          pageCount={17}
          total={1655}
          pageSize={100}
          pathname="/styleguide"
          itemLabel="players"
        />
      </Section>

      <Section title="Loading, empty & progress">
        <div className="flex flex-wrap items-center gap-6">
          <Spinner />
          <Button loading variant="outline">
            Saving…
          </Button>
        </div>
        <div className="grid max-w-md gap-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
        <EmptyState
          title="Empty Roster"
          description="No players yet — add one to get started."
          action={<Button size="sm">+ Add Player</Button>}
        />
        <div className="space-y-2">
          <p className="text-sm text-muted-foreground">
            <code className="rounded bg-muted px-1 py-0.5 text-xs">LiveRefresh</code> — for a
            server-rendered page that has to stay current without becoming a live app. Polls on
            an interval, pauses while the tab is hidden, and says how stale it is, so nobody has
            to guess whether the page stopped listening. Sits beside the page title.
          </p>
          <LiveRefresh />
        </div>
      </Section>

      <Section title="Celebration">
        <p className="text-sm text-muted-foreground">
          Reserved for the moment something irreversible and good happens — a rookie pick
          landing, and nothing else so far. v1 threw confetti at every pick and it was too
          much; this is sixty pines in league green and white, thrown outward from a point
          and tumbling end over end, over about three seconds. Two animations per piece —
          the trajectory and the flip — because the flip is most of what sells it. Nothing
          renders at all for anyone who has asked for reduced motion.
        </p>
        <ConfettiDemo />
      </Section>

      <Section title="Summary strips">
        <p className="text-sm text-muted-foreground">
          A row of figures above a list — roster assets, draft totals. Every value carries its
          own label, and groups are separated by{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">StripDivider</code>: an
          unlabelled run of numbers means nothing to someone who isn&apos;t already thinking
          about them.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="whitespace-nowrap">
            Picks made: <span className="font-medium text-foreground/80">7 of 32</span>
          </span>
          <StripDivider />
          <span className="whitespace-nowrap">
            Held over: <span className="font-medium text-foreground/80">5</span>
          </span>
          <span className="whitespace-nowrap">
            Committed: <span className="font-medium text-foreground/80">$182</span>
          </span>
          <StripDivider />
          <span className="whitespace-nowrap">
            Topping at auction: <span className="font-medium text-foreground/80">2</span>
          </span>
        </p>
      </Section>

      <Section title="Icons">
        <p className="text-sm text-muted-foreground">
          Icons come from lucide-react only, default size 16px (size-4), inheriting text
          color. Actions use the working set below; sections use a larger marker (size-5,
          muted) so a page of otherwise identical cards can be read by shape rather than by
          position — position being the thing that changes the moment a card moves.
        </p>
        <div className="flex flex-wrap gap-4 text-muted-foreground">
          {[
            [ClipboardList, "Rosters"],
            [Hourglass, "Conditions"],
            [MessageSquare, "Messages"],
            [CalendarDays, "Calendar"],
            [Users, "People"],
            [Upload, "Import"],
            [BookOpen, "Manual"],
            [Palette, "Design"],
          ].map(([Icon, label]) => {
            const I = Icon as React.ElementType;
            return (
              <span key={label as string} className="flex items-center gap-1.5 text-xs">
                <I className="size-5" /> {label as string}
              </span>
            );
          })}
        </div>
        <p className="text-sm text-muted-foreground">Action icons:</p>
        <div className="flex flex-wrap gap-4 text-muted-foreground">
          {[
            [Search, "Search"],
            [Download, "Download"],
            [Upload, "Upload"],
            [Edit, "Edit"],
            [Trash2, "Delete"],
            [Plus, "Add"],
            [Check, "Confirm"],
            [X, "Close"],
            [ChevronRight, "Expand"],
            [Menu, "Menu"],
            [Info, "Info"],
            [AlertCircle, "Error"],
            [Calendar, "Dates"],
            [Trophy, "Champion"],
            [Gavel, "Auction"],
            [ExternalLinkIcon, "External"],
          ].map(([Icon, label]) => {
            const I = Icon as React.ElementType;
            return (
              <span key={label as string} className="flex items-center gap-1.5 text-xs">
                <I className="size-4" /> {label as string}
              </span>
            );
          })}
        </div>
      </Section>

      <Section title="Charts">
        <EmptyState
          title="No chart components yet"
          description="v1 had no charts; tokens and components get defined here when the first real chart ships."
        />
      </Section>

      <Separator />
      <p className="text-xs text-muted-foreground">
        Rule: pages compose from this page&apos;s components only. If a page needs
        something new, it lands here first — same commit.
      </p>
    </div>
  );
}
