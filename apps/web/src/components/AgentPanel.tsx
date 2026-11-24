import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClock,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  Eye,
  Heart,
  LayoutGrid,
  ListChecks,
  Pencil,
  Shield,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { api, del, patch, timeUntil } from "../lib/api";
import { useEvents } from "../lib/events";
import type { Me } from "../lib/types";
import { ApprovalCard } from "./ApprovalCard";
import { AgentAvatar, AvatarPicker } from "./Creature";
import { AnimatePresence, m } from "framer-motion";
import { reveal } from "./Motion";
import { FilesBrowser } from "./FilesBrowser";
import { Button, cx, Empty, Input } from "./ui";

type Tab = "activity" | "approvals" | "identity";
interface PanelCtx {
  open: boolean;
  setOpen: (v: boolean) => void;
  tab: Tab;
  setTab: (t: Tab) => void;
}
const Ctx = createContext<PanelCtx>({ open: false, setOpen: () => {}, tab: "activity", setTab: () => {} });
export const usePanel = () => useContext(Ctx);

export function PanelProvider({ children }: { children: ReactNode }) {
  const [open, setOpenState] = useState(() => {
    const saved = localStorage.getItem("amuse.panel");
    return saved ? saved === "1" : window.innerWidth >= 1200;
  });
  const [tab, setTab] = useState<Tab>("activity");
  const setOpen = (v: boolean) => (setOpenState(v), localStorage.setItem("amuse.panel", v ? "1" : "0"));
  return <Ctx.Provider value={{ open, setOpen, tab, setTab }}>{children}</Ctx.Provider>;
}

function every(min: number) {
  if (min >= 1440) return `Every ${Math.round(min / 1440)} day${min >= 2880 ? "s" : ""}`;
  if (min >= 60) return `Every ${Math.round(min / 60)} hour${min >= 120 ? "s" : ""}`;
  return `Every ${min} minutes`;
}
const TASK_ICON: Record<string, ReactNode> = {
  heartbeat: <Heart size={15} className="text-[#ff6b81]" />,
  reminder: <AlarmClock size={15} />,
  monitor: <Eye size={15} />,
  space_refresh: <LayoutGrid size={15} />,
};

function Section({ title, children, defaultOpen = true }: { title: ReactNode; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="px-4 pb-2 pt-3">
      <button aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between py-1 text-[13px] text-[var(--ink)]">
        <span>{title}</span>
        <m.span initial={false} animate={{ rotate: open ? 0 : -90 }}>
          <ChevronDown size={16} className="text-muted" />
        </m.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <m.div
            key="details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-1">{children}</div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Row({
  icon,
  title,
  sub,
  time,
  right,
  testid,
}: {
  icon: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  time?: ReactNode;
  right?: ReactNode;
  testid?: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl py-2" data-testid={testid}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--card)] text-[var(--muted)]">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="line-clamp-2 text-[13px] leading-snug text-[var(--ink)]">{title}</div>
        {sub && <div className="line-clamp-2 text-xs leading-snug text-[var(--muted)]">{sub}</div>}
        {time && <div className="text-[11px] text-[var(--muted)]">{time}</div>}
      </div>
      {right}
    </div>
  );
}

export function UpcomingList() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["upcoming"], queryFn: () => api("/upcoming") });
  const list = data?.upcoming ?? [];
  if (!list.length) return <Empty icon="⏰" title="Nothing scheduled" body='Ask me things like "remind me Friday at 5" or "check this price every morning".' />;
  return (
    <div data-testid="upcoming-list">
      {list.map((t: any) => (
        <Row
          key={t.id}
          icon={TASK_ICON[t.kind] ?? <AlarmClock size={15} />}
          title={t.title}
          sub={
            t.intervalMinutes
              ? `${every(t.intervalMinutes)} · next ${timeUntil(t.nextRunAt)}`
              : `${t.kind === "reminder" ? "Reminder" : "Task"} · ${timeUntil(t.nextRunAt)}`
          }
          right={
            t.kind !== "heartbeat" && (
              <button
                onClick={async () => (await del(`/upcoming/${t.id}`), qc.invalidateQueries({ queryKey: ["upcoming"] }))}
                className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--hover)]"
                aria-label="Cancel"
              >
                <Trash2 size={14} />
              </button>
            )
          }
        />
      ))}
    </div>
  );
}

function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function ActivityList() {
  const { data } = useQuery({ queryKey: ["activity"], queryFn: () => api("/activity") });
  const list = data?.activity ?? [];
  const groups = useMemo(() => {
    const g: { label: string; items: any[] }[] = [];
    for (const a of list) {
      const label = dayLabel(new Date(a.createdAt));
      const last = g[g.length - 1];
      if (last && last.label === label) last.items.push(a);
      else g.push({ label, items: [a] });
    }
    return g;
  }, [list]);
  if (!list.length) return <div className="px-4 py-6 text-center text-sm text-[var(--muted)]">Everything I do for you shows up here.</div>;
  return (
    <div data-testid="activity-list">
      {groups.map((g) => (
        <Section key={g.label} title={g.label}>
          {g.items.map((a: any) => (
            <Row
              key={a.id}
              testid="activity-item"
              icon={a.kind === "approval" ? <Shield size={15} /> : a.kind === "schedule" ? <AlarmClock size={15} /> : <CheckCircle2 size={15} />}
              title={a.skill ?? a.summary}
              sub={a.skill ? a.summary : undefined}
              time={new Date(a.createdAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }).toLowerCase()}
            />
          ))}
        </Section>
      ))}
    </div>
  );
}

function ActivityTab() {
  const { data } = useQuery({ queryKey: ["upcoming"], queryFn: () => api("/upcoming") });
  const [all, setAll] = useState(false);
  const up = data?.upcoming ?? [];
  if (all)
    return (
      <div className="px-4 py-3">
        <button onClick={() => setAll(false)} className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--muted)] hover:text-[var(--ink)]">
          <ChevronLeft size={14} /> Scheduled tasks
        </button>
        <UpcomingList />
      </div>
    );
  return (
    <div>
      <Section title={`${up.length} scheduled task${up.length === 1 ? "" : "s"}`}>
        {up.slice(0, 2).map((t: any) => (
          <Row
            key={t.id}
            icon={TASK_ICON[t.kind] ?? <AlarmClock size={15} />}
            title={t.title}
            sub={t.intervalMinutes ? every(t.intervalMinutes) : timeUntil(t.nextRunAt)}
          />
        ))}
        <button onClick={() => setAll(true)} className="w-full py-2 text-center text-xs text-[var(--ink)] hover:underline" data-testid="see-all-scheduled">
          See all scheduled tasks
        </button>
      </Section>
      <ActivityList />
    </div>
  );
}

function ApprovalsTab() {
  const { data: pending } = useQuery({ queryKey: ["approvals"], queryFn: () => api("/approvals") });
  const { data } = useQuery({ queryKey: ["approvals-history"], queryFn: () => api("/approvals/history") });
  const past = (data?.approvals ?? []).filter((a: any) => a.status !== "pending");
  return (
    <div data-testid="approvals-tab">
      <Section title="Waiting for you">
        {(pending?.approvals ?? []).length === 0 ? (
          <div className="py-2 text-xs text-[var(--muted)]">Nothing needs your OK right now.</div>
        ) : (
          <div className="space-y-2">
            {pending.approvals.map((a: any) => (
              <ApprovalCard key={a.id} approval={a} />
            ))}
          </div>
        )}
      </Section>
      <Section title="History">
        {past.length === 0 && <div className="py-2 text-xs text-[var(--muted)]">No decisions yet.</div>}
        {past.map((a: any) => (
          <Row
            key={a.id}
            icon={a.status === "allowed" ? <CheckCircle2 size={15} className="text-[var(--ok)]" /> : <Shield size={15} />}
            title={a.purpose}
            sub={
              a.grant
                ? ({ once: "Allowed once", task: "Allowed for task", site: "Allowed for site", always: "Always allowed", deny: "Denied" } as any)[a.grant]
                : a.status
            }
            time={new Date(a.createdAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          />
        ))}
        <Link href="/settings/permissions" className="mt-2 inline-block text-xs text-[#7fb0ff] hover:underline">
          Manage permissions
        </Link>
      </Section>
    </div>
  );
}

const TILE: Record<string, { label: string; bg: string }> = {
  "SOUL.md": { label: "SOUL", bg: "linear-gradient(140deg,#e2364f 0%,#a3122a 100%)" },
  "MEMORY.md": { label: "MEMORY", bg: "linear-gradient(140deg,#3b46e0 0%,#6d7dff 60%,#8fa7ff 100%)" },
  "USER.md": { label: "YOU", bg: "linear-gradient(140deg,#11998e 0%,#38ef7d 120%)" },
  "IDENTITY.md": { label: "IDENTITY", bg: "linear-gradient(140deg,#f2994a 0%,#c4572a 100%)" },
  "HEARTBEAT.md": { label: "HEARTBEAT", bg: "linear-gradient(140deg,#ff5f6d 0%,#ffc371 130%)" },
  "AGENTS.md": { label: "HOW I WORK", bg: "linear-gradient(140deg,#7b4397 0%,#b06ab3 100%)" },
  "BOOTSTRAP.md": { label: "FIRST RUN", bg: "linear-gradient(140deg,#485563 0%,#29323c 100%)" },
};

function IdentityTab({ me, editing, setEditing }: { me: Me; editing: boolean; setEditing: (v: boolean) => void }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["files"], queryFn: () => api("/files") });
  const [name, setName] = useState(me.agent.name ?? "");
  const [vibe, setVibe] = useState(me.agent.vibe ?? "");
  const [file, setFile] = useState<string | null>(null);
  useEffect(() => (setName(me.agent.name ?? ""), setVibe(me.agent.vibe ?? "")), [me.agent.name, me.agent.vibe]);
  const save = async (b: any) => (await patch("/agent", b), qc.invalidateQueries({ queryKey: ["me"] }), qc.invalidateQueries({ queryKey: ["files"] }));
  const files = (data?.files ?? []) as any[];
  const core = files.filter((f) => !f.path.includes("/"));
  const order = ["SOUL.md", "MEMORY.md", "USER.md", "HEARTBEAT.md", "IDENTITY.md", "AGENTS.md", "BOOTSTRAP.md"];
  core.sort((a, b) => ((order.indexOf(a.path) + 99) % 99) - ((order.indexOf(b.path) + 99) % 99));
  const others = files.filter((f) => f.path.includes("/"));
  if (file) return <FilesBrowser key={file} initialPath={file} onBack={() => setFile(null)} />;
  return (
    <div className="space-y-3 p-4" data-testid="identity-tab">
      <div className="rounded-2xl bg-[var(--card)] p-3">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold" data-testid="identity-name">
              {me.agent.name}
            </div>
            {me.agent.vibe && <div className="truncate text-xs text-[var(--muted)]">{me.agent.vibe}</div>}
          </div>
        </div>
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="mt-3 flex h-8 w-full items-center justify-center gap-2 rounded-full bg-[var(--hover)] text-sm hover:bg-[#363636]"
          >
            <Pencil size={13} /> Edit
          </button>
        ) : (
          <div className="mt-3 space-y-3">
            <AvatarPicker value={me.agent.avatarUrl} onChange={(avatarUrl) => save({ avatarUrl })} />
            <label className="block text-xs text-[var(--muted)]">
              Name
              <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" data-testid="identity-name-input" />
            </label>
            <label className="block text-xs text-[var(--muted)]">
              Vibe
              <Input value={vibe} onChange={(e) => setVibe(e.target.value)} className="mt-1" />
            </label>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={async () => (await save({ name: name || me.agent.name, vibe }), setEditing(false))}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {core.map((f) => {
          const t = TILE[f.path] ?? { label: f.path.replace(/\.md$/, "").toUpperCase(), bg: "linear-gradient(140deg,#3a3a3a,#222)" };
          return (
            <button
              key={f.path}
              onClick={() => setFile(f.path)}
              data-testid={`file-tile-${f.path}`}
              className="relative aspect-[4/3.4] overflow-hidden rounded-2xl p-3 text-left text-white shadow-lg transition hover:scale-[1.02]"
              style={{ background: t.bg }}
            >
              <div className="text-sm font-bold tracking-wide">{t.label}</div>
              <div className="text-[9px] uppercase tracking-[0.12em] opacity-80">private · yours to edit</div>
              <div className="absolute bottom-3 left-3 font-mono text-[10px] opacity-90">{f.path}</div>
              <Heart size={14} className="absolute bottom-3 right-3 fill-white/80 text-white/80" />
            </button>
          );
        })}
      </div>
      {others.length > 0 && (
        <div className="pt-1">
          <div className="pb-1 text-xs text-[var(--muted)]">Notes, memories & tools</div>
          {others.map((f) => (
            <button
              key={f.path}
              onClick={() => setFile(f.path)}
              className="block w-full truncate rounded-lg px-2 py-1.5 text-left font-mono text-xs text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            >
              {f.path}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

const STATUS_EMOJI: [RegExp, string][] = [
  [/search|research|look/i, "🔎"],
  [/brows/i, "🧭"],
  [/image|draw|illustr/i, "🎨"],
  [/memor|remember/i, "🧠"],
  [/remind|schedul/i, "⏰"],
  [/plan|goal/i, "🗺️"],
  [/build|making|creat|writ/i, "🛠️"],
  [/think|answer/i, "💭"],
];
export function hasLeadingEmoji(s: string) {
  return /^\p{Extended_Pictographic}/u.test(s.trim());
}
export function statusEmoji(s: string) {
  if (hasLeadingEmoji(s)) return "";
  return STATUS_EMOJI.find(([r]) => r.test(s))?.[1] ?? "✨";
}

export function AgentStatusLine({ me, className }: { me: Me; className?: string }) {
  const { status, connected } = useEvents();
  const busy = status !== "Idle";
  return (
    <div
      className={cx("flex items-center justify-center gap-1.5 text-[13px] text-[var(--muted)]", className)}
      data-testid="agent-status"
      data-busy={busy ? "1" : "0"}
    >
      {busy ? (
        <>
          {statusEmoji(status) && <span>{statusEmoji(status)}</span>}
          <span className="truncate">{status === "Is thinking" ? "Thinking" : status}</span>
        </>
      ) : (
        <>
          <span className={cx("h-2 w-2 rounded-full", connected ? "bg-[var(--ok)]" : "bg-[var(--muted)]")} />
          <span>{connected ? "Connected" : "Connecting…"}</span>
        </>
      )}
    </div>
  );
}

export function AgentPanel({ me, overlay = false }: { me: Me; overlay?: boolean }) {
  const { setOpen, tab, setTab } = usePanel();
  const { status } = useEvents();
  const [editing, setEditing] = useState(false);
  const [tabKey, setTabKey] = useState(0);
  const busy = status !== "Idle";
  const tabs: { value: Tab; label: string; icon: ReactNode }[] = [
    { value: "activity", label: "Activity", icon: <ListChecks size={16} /> },
    { value: "approvals", label: "Approvals", icon: <Shield size={16} /> },
    { value: "identity", label: "Identity", icon: <UserRound size={16} /> },
  ];
  return (
    <aside className={cx("glass flex h-full w-[min(22.5rem,100vw)] shrink-0 flex-col border-l border-edge", overlay && "shadow-2xl")} data-testid="agent-panel">
      <div className="flex justify-end px-3 pt-3">
        <button
          onClick={() => setOpen(false)}
          className="rounded-full p-1.5 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          aria-label="Close panel"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex flex-col items-center px-6 pb-4">
        <div className="relative">
          <button
            data-testid="agent-header"
            onClick={() => (setOpen(true), setTab("activity"), setTabKey((k) => k + 1))}
            className="rounded-full"
            aria-label={`${me.agent.name} activity`}
          >
            <AgentAvatar avatarUrl={me.agent.avatarUrl} size={112} busy={busy} />
          </button>
          <button
            onClick={() => (setTab("identity"), setEditing(true))}
            className="absolute bottom-1 right-1 flex h-7 w-7 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--card)] text-[var(--ink)] hover:bg-[var(--hover)]"
            aria-label="Edit agent"
          >
            <Pencil size={13} />
          </button>
        </div>
        <div className="mt-3 text-xl font-semibold">{me.agent.name}</div>
        <AgentStatusLine me={me} className="mt-0.5" />
      </div>
      <div className="px-4">
        <div className="flex rounded-full bg-[var(--card)] p-1">
          {tabs.map((t) => (
            <button
              key={t.value}
              aria-pressed={tab === t.value}
              aria-label={t.label}
              title={t.label}
              onClick={() => (setTab(t.value), setTabKey((k) => k + 1))}
              className={cx(
                "flex flex-1 items-center justify-center rounded-full py-1.5 transition",
                tab === t.value ? "bg-hover text-highlight" : "text-muted hover:text-ink",
              )}
            >
              {t.icon}
            </button>
          ))}
        </div>
      </div>
      <m.div key={tab} {...reveal} className="mt-1 min-h-0 flex-1 overflow-y-auto pb-6">
        {tab === "activity" && <ActivityTab key={tabKey} />}
        {tab === "approvals" && <ApprovalsTab />}
        {tab === "identity" && <IdentityTab key={tabKey} me={me} editing={editing} setEditing={setEditing} />}
      </m.div>
    </aside>
  );
}

export { Sparkles };
