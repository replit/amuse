import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Menu, MessageCircle, MessagesSquare, Phone, Plus } from "lucide-react";
import { api, post } from "../lib/api";
import { useEvents } from "../lib/events";
import type { Chat, Me } from "../lib/types";
import { AgentAvatar } from "./Creature";
import { statusEmoji, usePanel } from "./AgentPanel";
import { NotificationsSheet } from "./NotificationsSheet";
import { cx } from "./ui";

export function useNewSideChat() {
  const qc = useQueryClient();
  const [, nav] = useLocation();
  return async () => {
    const r = await post("/chats", { title: "New side chat" });
    qc.invalidateQueries({ queryKey: ["chats"] });
    nav(`/chats/${r.chat.id}`);
  };
}

function ChatsMenu({ title }: { title?: string }) {
  const [open, setOpen] = useState(false);
  const [loc] = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["chats"], queryFn: () => api<{ chats: Chat[] }>("/chats") });
  const side = (data?.chats ?? []).filter((c) => c.kind === "side");
  const newSide = useNewSideChat();
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div className="relative z-30 flex min-w-0 items-center gap-2" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex h-8 shrink-0 items-center gap-2 rounded-full bg-[var(--card)] px-3 text-[13px] hover:bg-[var(--hover)]"
        data-testid="open-chats"
        aria-label="Chats"
      >
        <Menu size={15} /> Chats
      </button>
      {title && <div className="truncate text-sm text-[var(--muted)]">{title}</div>}
      {open && (
        <div className="glass absolute top-10 left-0 w-72 rounded-card border border-edge p-2 shadow-2xl">
          <Link
            href="/"
            onClick={() => setOpen(false)}
            className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[var(--hover)]", loc === "/" && "bg-[var(--hover)]")}
          >
            <MessageCircle size={16} /> Main chat
          </Link>
          {side.length > 0 && <div className="px-3 pb-1 pt-3 text-[11px] text-[var(--muted)]">Side chats</div>}
          <div className="max-h-64 overflow-y-auto">
            {side.map((c) => (
              <Link
                key={c.id}
                href={`/chats/${c.id}`}
                onClick={() => setOpen(false)}
                className={cx("flex items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-[var(--hover)]", loc === `/chats/${c.id}` && "bg-[var(--hover)]")}
              >
                <MessagesSquare size={15} className="shrink-0" /> <span className="truncate">{c.title}</span>
              </Link>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-[var(--card)] p-3 text-center">
            <MessagesSquare size={20} className="mx-auto text-[var(--muted)]" />
            <div className="mt-1 text-sm font-medium">Start a side chat</div>
            <div className="mt-0.5 text-xs text-[var(--muted)]">Keep a bigger project in its own thread. I still remember everything about you.</div>
            <button
              onClick={() => (setOpen(false), void newSide())}
              className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-full bg-[var(--hover)] px-3 text-xs hover:bg-[#363636]"
            >
              <Plus size={13} /> New side chat
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AgentHeader({ me, title, onCall }: { me: Me; title?: string; onCall?: () => void }) {
  const { status } = useEvents();
  const { open, setOpen } = usePanel();
  const [notifs, setNotifs] = useState(false);
  const { data } = useQuery({ queryKey: ["notifications"], queryFn: () => api("/notifications") });
  const unread = (data?.notifications ?? []).filter((n: any) => !n.read).length;
  const busy = status !== "Idle";
  const pill = "flex h-8 items-center gap-1.5 rounded-full bg-[var(--card)] px-3 text-[13px] hover:bg-[var(--hover)]";
  return (
    <div className="glass relative z-20 flex h-16 shrink-0 items-center gap-2 border-b border-edge px-4 md:px-6">
      <ChatsMenu title={title} />
      {!open && (
        <button
          data-testid="agent-header"
          onClick={() => setOpen(true)}
          className="absolute left-1/2 top-1.5 z-20 flex -translate-x-1/2 flex-col items-center"
          aria-label={`Open ${me.agent.name}`}
        >
          <AgentAvatar avatarUrl={me.agent.avatarUrl} size={40} busy={busy} />
          <span
            className="-mt-1.5 max-w-[min(12rem,35vw)] truncate rounded-full border border-edge bg-panel px-2 py-px text-[11px]"
            data-testid="agent-status"
            data-busy={busy ? "1" : "0"}
          >
            {busy ? `${statusEmoji(status)} ${status === "Is thinking" ? "Thinking" : status}`.trim() : me.agent.name}
          </span>
        </button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {onCall && (
          <button onClick={onCall} className={pill} aria-label="Call" data-testid="call">
            <Phone size={14} /> <span className="hidden sm:inline">Call</span>
          </button>
        )}
        <button
          onClick={() => setNotifs(true)}
          className="relative flex h-8 w-8 items-center justify-center rounded-full bg-[var(--card)] hover:bg-[var(--hover)]"
          aria-label="Notifications"
        >
          <Bell size={14} />
          {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--accent)]" />}
        </button>
      </div>
      <NotificationsSheet open={notifs} onClose={() => setNotifs(false)} />
    </div>
  );
}
