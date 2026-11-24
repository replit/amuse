import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Trash2, Wand2 } from "lucide-react";
import { api, del, patch, post, timeAgo } from "../lib/api";
import type { Space } from "../lib/types";
import { useIframeBridge } from "../components/ArtifactViewer";
import { Button, Card, Empty, Input, Page, Segmented, Textarea } from "../components/ui";

const EXAMPLES = [
  "A holiday gift tracker with budgets per person",
  "A daily word game",
  "A trip planner for my next vacation",
  "A reading list with progress",
  "A music tracker for new releases from artists I love",
  "A client hub for my freelance projects",
];

export function SpacesPage() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const search = useSearch();
  const [idea, setIdea] = useState("");
  const [showNew, setShowNew] = useState(search.includes("new=1"));
  useEffect(() => setShowNew(search.includes("new=1")), [search]);
  const { data } = useQuery({ queryKey: ["spaces"], queryFn: () => api<{ spaces: Space[] }>("/spaces") });
  const spaces = data?.spaces ?? [];
  const create = async () => {
    if (!idea.trim()) return;
    await post("/spaces", { idea });
    setIdea("");
    qc.invalidateQueries({ queryKey: ["spaces"] });
    nav("/");
  };
  return (
    <Page
      width="collection"
      title="Spaces"
      subtitle="Your own mini-apps inside Amuse. Describe one and I'll build it."
      action={
        <Button onClick={() => setShowNew(true)} data-testid="new-space">
          New space
        </Button>
      }
    >
      {showNew && (
        <Card className="mb-6 p-5">
          <div className="mb-2 font-semibold">What should your space do?</div>
          <Textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={3} placeholder="Describe your idea…" data-testid="space-idea" />
          <div className="mt-3 flex flex-wrap gap-2">
            {EXAMPLES.map((e) => (
              <button
                key={e}
                onClick={() => setIdea(e)}
                className="rounded-full border border-[var(--line)] px-3 py-1 text-xs text-[var(--muted)] hover:bg-[var(--hover)]"
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={create} disabled={!idea.trim()} data-testid="build-space">
              <Wand2 size={14} /> Build it
            </Button>
            <Button variant="ghost" onClick={() => setShowNew(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}
      {spaces.length === 0 && !showNew && (
        <Empty
          icon="✨"
          title="No spaces yet"
          body="A space is a custom view built around your routines: a gift tracker, a school dashboard, a trip planner."
        />
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {spaces.map((s) => (
          <Link key={s.id} href={`/spaces/${s.id}`}>
            <Card className="h-full cursor-pointer p-5 hover:bg-[var(--hover)]">
              <div className="text-3xl">{s.emoji}</div>
              <div className="mt-2 font-semibold">{s.title}</div>
              <div className="text-sm text-[var(--muted)]">{s.description}</div>
              <div className="mt-3 text-[11px] text-[var(--muted)]">
                {s.placement === "hidden" ? "Hidden" : s.placement === "tab" ? "In main tabs" : "In sidebar"} · updated {timeAgo(s.updatedAt)}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}

export function SpaceView({ id }: { id: number }) {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [editing, setEditing] = useState(false);
  const [req, setReq] = useState("");
  const [key, setKey] = useState(0);
  const { data } = useQuery({ queryKey: ["space", id], queryFn: () => api(`/spaces/${id}`) });
  const { data: list } = useQuery({ queryKey: ["spaces"], queryFn: () => api<{ spaces: Space[] }>("/spaces") });
  const meta = list?.spaces.find((s) => s.id === id);
  const frame = useRef<HTMLIFrameElement>(null);
  const ask = useCallback(
    async (text: string) => {
      // A space is generated code, so it can only suggest a message; you decide whether it's sent.
      if (!confirm(`This space wants to send ${meta?.title ? `"${meta.title}"'s` : "a"} request to your agent:\n\n${text}\n\nSend it?`)) return;
      const me = await api("/me");
      await post(`/chats/${me.mainChatId}/messages`, { content: text });
    },
    [meta?.title],
  );
  useIframeBridge(frame, { kind: "space", id }, ask);
  useEffect(() => setKey((k) => k + 1), [meta?.updatedAt]);
  const s = data?.space;
  if (!s) return <div className="p-8 text-[var(--muted)]">Loading…</div>;
  const days = s.schedule?.days as number[] | undefined;
  const sched = !days || !days.length ? "always" : days.length === 5 ? "weekdays" : "weekends";
  const update = async (body: any) => {
    await patch(`/spaces/${id}`, body);
    qc.invalidateQueries({ queryKey: ["space", id] });
    qc.invalidateQueries({ queryKey: ["spaces"] });
  };
  return (
    <div className="flex h-full flex-col">
      <div className="glass flex flex-wrap items-center gap-2 border-b border-edge px-(--page-gutter) py-3">
        <div className="mr-auto flex min-w-0 items-center gap-2">
          <span className="text-xl">{s.emoji}</span>
          <h1 className="truncate font-semibold">{s.title}</h1>
        </div>
        <Segmented
          value={s.placement}
          onChange={(v) => update({ placement: v })}
          options={[
            { value: "sidebar", label: "Sidebar" },
            { value: "tab", label: "Tab" },
            { value: "hidden", label: "Hidden" },
          ]}
        />
        <select
          value={sched}
          onChange={(e) => update({ schedule: e.target.value === "always" ? null : { days: e.target.value === "weekdays" ? [1, 2, 3, 4, 5] : [0, 6] } })}
          className="h-8 rounded-full border border-[var(--line)] bg-[var(--card)] px-2 text-sm"
          aria-label="When to show"
        >
          <option value="always">Show always</option>
          <option value="weekdays">Weekdays only</option>
          <option value="weekends">Weekends only</option>
        </select>
        <Button size="sm" variant="soft" onClick={() => setEditing(!editing)} data-testid="edit-space">
          <Wand2 size={14} /> Change it
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setKey((k) => k + 1)} aria-label="Reload">
          <RefreshCw size={14} />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (confirm("Delete this space?")) {
              await del(`/spaces/${id}`);
              qc.invalidateQueries({ queryKey: ["spaces"] });
              nav("/spaces");
            }
          }}
          aria-label="Delete"
        >
          <Trash2 size={14} />
        </Button>
      </div>
      {editing && (
        <div className="flex gap-2 border-b border-[var(--line)] p-3">
          <Input value={req} onChange={(e) => setReq(e.target.value)} placeholder="Add a budget column, make it dark, track birthdays too…" />
          <Button
            onClick={async () => {
              await post(`/spaces/${id}/edit`, { request: req });
              setReq("");
              setEditing(false);
              nav("/");
            }}
            disabled={!req.trim()}
          >
            Ask
          </Button>
        </div>
      )}
      {data?.refresh && (
        <div className="border-b border-[var(--line)] bg-[var(--hover)] px-4 py-1 text-xs text-[var(--muted)]">
          Keeps itself up to date{s.lastRefreshedAt ? ` · last refreshed ${timeAgo(s.lastRefreshedAt)}` : ""}
        </div>
      )}
      <iframe
        ref={frame}
        key={key}
        title={s.title}
        src={`/api/spaces/${id}/raw`}
        sandbox="allow-scripts allow-forms"
        className="w-full flex-1 bg-white"
        data-testid="space-frame"
      />
    </div>
  );
}

export function SpaceLoading() {
  return <Loader2 className="animate-spin" />;
}
