import { useState } from "react";
import { m } from "framer-motion";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, MessageCircle, Trash2 } from "lucide-react";
import { api, del, patch, post, timeAgo } from "../lib/api";
import type { Goal } from "../lib/types";
import { Button, Card, Empty, Input, Page, cx } from "../components/ui";

export function GoalsPage() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  const { data } = useQuery({ queryKey: ["goals"], queryFn: () => api<{ goals: Goal[] }>("/goals") });
  const [text, setText] = useState("");
  const goals = data?.goals ?? [];
  const active = goals.filter((g) => g.status !== "done");
  const done = goals.filter((g) => g.status === "done");
  const refresh = () => qc.invalidateQueries({ queryKey: ["goals"] });
  const add = async () => {
    if (!text.trim()) return;
    await post("/goals", { text });
    setText("");
    nav("/");
  };
  return (
    <Page width="reading" title="Goals" subtitle="What I'm tracking for you, and the plan to get there.">
      <div className="mb-6 flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a goal… e.g. Run a 10k by March"
          data-testid="goal-input"
        />
        <Button onClick={add}>Plan it</Button>
      </div>
      {goals.length === 0 && (
        <Empty icon="🎯" title="No goals yet" body="Tell me something you want to achieve. I'll break it into steps, track progress and nudge you along." />
      )}
      <div className="space-y-4">
        {active.map((g) => {
          const n = g.plan.filter((s) => s.done).length;
          const pct = g.plan.length ? Math.round((n / g.plan.length) * 100) : 0;
          return (
            <Card key={g.id} className="p-5" data-testid="goal-card">
              <div className="flex items-start gap-3">
                <div className="text-2xl">{g.emoji ?? "🎯"}</div>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{g.title}</div>
                  {g.description && <div className="text-sm text-[var(--muted)]">{g.description}</div>}
                  <div className="mt-3 flex items-center gap-3">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--line)]">
                      <m.div className="h-full origin-left rounded-full bg-[var(--accent)]" initial={false} animate={{ scaleX: pct / 100 }} />
                    </div>
                    <div className="text-xs text-[var(--muted)]">
                      {n}/{g.plan.length}
                    </div>
                  </div>
                  {g.progressNote && <div className="mt-2 text-sm italic text-[var(--muted)]">“{g.progressNote}”</div>}
                  <ul className="mt-3 space-y-1">
                    {g.plan.map((s) => (
                      <li key={s.id}>
                        <button
                          onClick={async () => (await patch(`/goals/${g.id}`, { toggleStep: s.id }), refresh())}
                          className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left text-sm hover:bg-[var(--hover)]"
                        >
                          <span
                            className={cx(
                              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                              s.done ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--muted)]",
                            )}
                          >
                            {s.done && <Check size={10} />}
                          </span>
                          <span className={cx(s.done && "text-[var(--muted)] line-through")}>{s.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="soft"
                      onClick={(e) => {
                        (e.currentTarget as HTMLButtonElement).disabled = true;
                        nav("/");
                        void api("/me").then((me: any) =>
                          post(`/chats/${me.mainChatId}/messages`, { content: `Let's talk about my goal "${g.title}". How am I doing and what's next?` }),
                        );
                      }}
                    >
                      <MessageCircle size={14} /> Talk about it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => (await patch(`/goals/${g.id}`, { status: "done" }), refresh())}>
                      Mark done
                    </Button>
                    <Button size="sm" variant="ghost" onClick={async () => (await del(`/goals/${g.id}`), refresh())} aria-label="Delete goal">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--muted)]">Updated {timeAgo(g.updatedAt)}</div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
      {done.length > 0 && (
        <div className="mt-10">
          <div className="mb-2 text-sm font-semibold text-[var(--muted)]">Completed</div>
          {done.map((g) => (
            <div key={g.id} className="py-1 text-sm text-[var(--muted)]">
              ✅ {g.title}
            </div>
          ))}
        </div>
      )}
    </Page>
  );
}
