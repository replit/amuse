import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, X } from "lucide-react";
import { api, post } from "../lib/api";
import type { Idea } from "../lib/types";
import { Button, Card, Empty, Page } from "../components/ui";

export function IdeasPage() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const [busy, setBusy] = useState(false);
  const [starting, setStarting] = useState<number | null>(null);
  const { data } = useQuery({ queryKey: ["ideas"], queryFn: () => api<{ ideas: Idea[] }>("/ideas") });
  const ideas = (data?.ideas ?? []).filter((i) => i.status === "new");
  const more = async () => {
    setBusy(true);
    try {
      await post("/ideas/refresh");
      qc.invalidateQueries({ queryKey: ["ideas"] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Page
      width="collection"
      title="Ideas"
      subtitle="Things I could take off your plate, based on what I know about you."
      action={
        <Button variant="soft" onClick={more} disabled={busy} data-testid="more-ideas">
          {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} More ideas
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {ideas.length === 0 && (
          <div className="col-span-full">
            <Empty icon="💡" title="No ideas right now" body="Tap 'More ideas' and I'll suggest things tailored to you." />
          </div>
        )}
        {ideas.map((i) => (
          <Card key={i.id} className="group flex flex-col p-5" data-testid="idea-card">
            <div className="flex items-start justify-between">
              <div className="text-3xl">{i.emoji ?? "💡"}</div>
              <button
                onClick={async () => (await post(`/ideas/${i.id}/dismiss`), qc.invalidateQueries({ queryKey: ["ideas"] }))}
                className="rounded-full p-1 text-[var(--muted)] opacity-0 hover:bg-[var(--hover)] group-hover:opacity-100"
                aria-label="Dismiss"
              >
                <X size={14} />
              </button>
            </div>
            <div className="mt-3 font-semibold">{i.title}</div>
            <div className="mt-1 flex-1 text-sm text-[var(--muted)]">{i.body}</div>
            <div className="mt-4 flex items-center justify-between">
              <span className="rounded-full bg-[var(--hover)] px-2 py-0.5 text-[11px] text-[var(--muted)]">
                {i.source === "onboarding" ? "Tip" : i.category}
              </span>
              <Button
                size="sm"
                disabled={starting != null}
                onClick={async () => {
                  if (!window.confirm(`Run this exact request?\n\n${i.prompt}`)) return;
                  setStarting(i.id);
                  nav("/");
                  try {
                    await post(`/ideas/${i.id}/start`);
                  } finally {
                    setStarting(null);
                    qc.invalidateQueries({ queryKey: ["ideas"] });
                  }
                }}
                data-testid="idea-start"
              >
                {starting === i.id ? <Loader2 size={14} className="animate-spin" /> : null}Do it
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
