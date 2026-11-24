import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { m as motion } from "framer-motion";
import { reveal, useMotionAllowed } from "../components/Motion";
import { CalendarClock, MoreHorizontal, Reply, Smile } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, post, timeAgo, timeUntil } from "../lib/api";
import { useEvent, useEvents } from "../lib/events";
import type { Approval, Me, Message } from "../lib/types";
import { AgentAvatar } from "../components/Creature";
import { ApprovalCard } from "../components/ApprovalCard";
import { Composer } from "../components/Composer";
import { Markdown } from "../components/Markdown";
import { RichParts, ToolChips } from "../components/Parts";
import { VoiceMode } from "../components/VoiceMode";
import { unlockCallAudio } from "../lib/callAudio";
import { AgentHeader } from "../components/AgentHeader";

function splitChoices(content: string) {
  const lines = content.replace(/\s+$/, "").split("\n");
  const choices: string[] = [];
  while (lines.length && /^\s*>>\s+\S/.test(lines[lines.length - 1]!))
    choices.unshift(
      lines
        .pop()!
        .replace(/^\s*>>\s+/, "")
        .trim(),
    );
  return { body: lines.join("\n").replace(/\s+$/, ""), choices: choices.slice(0, 4) };
}

function stamp(d: Date) {
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function ScheduledChip({ part }: { part: { taskId: number; title: string; nextRunAt: string } }) {
  const { data } = useQuery({
    queryKey: ["upcoming"],
    queryFn: () => api<{ upcoming: { id: number; nextRunAt: string; intervalMinutes: number | null }[] }>("/upcoming"),
  });
  const task = data?.upcoming.find((t) => t.id === part.taskId);
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 py-1.5 text-sm">
      <CalendarClock size={14} className="text-[var(--accent)]" /> {part.title} ·{" "}
      {data && !task ? "No longer scheduled" : timeUntil(task?.nextRunAt ?? part.nextRunAt)}
      {task?.intervalMinutes ? " · repeats" : ""}
    </div>
  );
}

function MessageActions({ m }: { m: Message }) {
  const [picker, setPicker] = useState(false);
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const current = (m.parts ?? []).find((p: any) => p.type === "reaction")?.emoji;
  const react = (emoji: string) => (setPicker(false), void post(`/messages/${m.id}/react`, { emoji: current === emoji ? "" : emoji }));
  const btn = "flex h-7 w-7 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]";
  return (
    <div className="absolute -right-24 bottom-1 hidden items-center gap-0.5 group-hover:flex" data-testid="msg-actions">
      <div className="relative">
        <button className={btn} onClick={() => setPicker(!picker)} aria-label="React">
          <Smile size={15} />
        </button>
        {picker && (
          <div
            className="absolute bottom-8 left-0 z-20 flex gap-1 rounded-full border border-[var(--line)] bg-[#202020] px-2 py-1 shadow-xl"
            onMouseLeave={() => setPicker(false)}
          >
            {["👍", "❤️", "😂", "🎉", "🙏"].map((e) => (
              <button key={e} onClick={() => react(e)} className="rounded-full px-1 text-lg hover:scale-125">
                {e}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        className={btn}
        onClick={() => window.dispatchEvent(new CustomEvent("amuse:quote", { detail: m.content.replace(/^>>.*$/gm, "").trim() }))}
        aria-label="Reply"
      >
        <Reply size={15} />
      </button>
      <div className="relative">
        <button className={btn} onClick={() => setMenu(!menu)} aria-label="More">
          <MoreHorizontal size={15} />
        </button>
        {menu && (
          <div
            className="absolute bottom-8 right-0 z-20 w-32 rounded-xl border border-[var(--line)] bg-[#202020] p-1 text-sm shadow-xl"
            onMouseLeave={() => setMenu(false)}
          >
            <button
              onClick={async () => (
                await navigator.clipboard?.writeText(m.content.replace(/^>>.*$/gm, "").trim()),
                setCopied(true),
                setTimeout(() => (setCopied(false), setMenu(false)), 900)
              )}
              className="w-full rounded-lg px-3 py-1.5 text-left hover:bg-[var(--hover)]"
            >
              {copied ? "Copied" : "Copy text"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  const animate = useMotionAllowed();
  return (
    <div
      role="status"
      aria-label="Agent is typing"
      className="inline-flex w-fit gap-1 self-start rounded-[18px] bg-[var(--bubble)] px-3.5 py-3"
      data-testid="typing"
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          aria-hidden
          key={i}
          className="size-1.5 rounded-full bg-ink"
          animate={animate ? { opacity: [0.35, 1, 0.35], y: [0, -2, 0] } : { opacity: 1, y: 0 }}
          transition={animate ? { duration: 0.85, delay: i * 0.12, repeat: Infinity, ease: "easeInOut" } : { duration: 0 }}
        />
      ))}
    </div>
  );
}

export function ChatView({ me, chatId, title }: { me: Me; chatId: number; title?: string }) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<Message[]>([]);
  const [running, setRunning] = useState(false);
  const [voice, setVoice] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const latestRun = useRef(0);
  const historyEnd = useRef<number | null>(null);
  const { status } = useEvents();

  const { data: approvals } = useQuery({ queryKey: ["approvals"], queryFn: () => api<{ approvals: Approval[] }>("/approvals"), refetchInterval: 15000 });
  const pending = (approvals?.approvals ?? []).filter((a) => a.chatId === chatId || a.chatId == null || chatId === me.mainChatId);

  const load = useCallback(async () => {
    const r = await api<{ messages: Message[]; running: boolean }>(`/chats/${chatId}/messages`);
    historyEnd.current ??= r.messages.reduce((last, message) => Math.max(last, message.id), 0);
    setMessages(r.messages);
    setRunning(r.running);
    setLoaded(true);
  }, [chatId]);

  useEffect(() => {
    setLoaded(false);
    stick.current = true;
    void load();
  }, [load]);

  useEvent(
    (e) => {
      if (e.type === "message" && e.chatId === chatId) {
        setMessages((ms) => {
          const i = ms.findIndex((m) => m.id === e.message.id);
          if (i >= 0) {
            const next = ms.slice();
            next[i] = { ...ms[i], ...e.message, content: e.message.reset ? e.message.content : e.message.content || ms[i]!.content };
            return next;
          }
          return [...ms, e.message];
        });
      }
      if (e.type === "delta" && e.chatId === chatId) {
        setRunning(true);
        setMessages((ms) => ms.map((m) => (m.id === e.messageId ? { ...m, content: m.content + e.text } : m)));
      }
      if (e.type === "run" && e.run.chatId === chatId) {
        // Ignore late "finished" events from an older run once a newer one has started.
        if (e.run.id < latestRun.current) return;
        latestRun.current = e.run.id;
        setRunning(e.run.status === "running" || e.run.status === "waiting_approval");
      }
      if (e.type === "message_done" && e.chatId === chatId) {
        void load();
      }
    },
    [chatId, load],
  );

  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages, pending.length, running]);

  const send = async (text: string) => {
    stick.current = true;
    const optimistic: Message = {
      id: -Date.now(),
      chatId,
      role: "user",
      content: text,
      parts: [],
      runId: null,
      proactive: false,
      createdAt: new Date().toISOString(),
    };
    setMessages((ms) => [...ms, optimistic]);
    const r = await post(`/chats/${chatId}/messages`, { content: text });
    setMessages((ms) => ms.map((m) => (m.id === optimistic.id ? r.message : m)));
    if (!r.steered && r.started !== false) setRunning(true);
    qc.invalidateQueries({ queryKey: ["chats"] });
  };

  const visible = messages.filter((m) => m.role !== "tool");
  const lastAssistant = [...visible].reverse().find((m) => m.role === "assistant");
  const name = me.agent.name ?? "Amuse";

  return (
    <div className="flex h-full flex-col">
      <AgentHeader me={me} title={title} onCall={() => (unlockCallAudio(), setVoice(true))} />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 overflow-y-auto"
        data-testid="chat-scroll"
      >
        <div className="chat-frame flex flex-col gap-2.5 pt-8 pb-6">
          {loaded && visible.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <AgentAvatar avatarUrl={me.agent.avatarUrl} size={88} />
              <div className="text-lg font-semibold">{title ? "A fresh side chat" : `Hi, I'm ${name}`}</div>
              <div className="max-w-sm text-sm text-[var(--muted)]">
                {title
                  ? "Separate context for a bigger project. I still remember everything about you."
                  : "Tell me what's on your plate. I can research, browse, plan, make things, and keep working after you close the app."}
              </div>
            </div>
          )}
          {visible.map((m, i) => {
            const prev = visible[i - 1];
            const showStamp = !prev || new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() > 30 * 60 * 1000;
            const stampEl = showStamp ? <div className="self-center py-2 text-[11px] text-[var(--muted)]">{stamp(new Date(m.createdAt))}</div> : null;
            if (m.role === "event")
              return (
                <div key={m.id} className="contents">
                  {stampEl}
                  <div className="self-center rounded-full bg-[var(--card)] px-3 py-1 text-xs text-[var(--muted)]">{m.content.split(". Use surrogate")[0]}</div>
                </div>
              );
            if (m.role === "user")
              return (
                <div key={m.id} className="contents">
                  {stampEl}
                  <motion.div
                    initial={m.id < 0 ? reveal.initial : false}
                    animate={reveal.animate}
                    className="max-w-[80%] self-end whitespace-pre-wrap rounded-[20px] bg-[var(--accent)] px-3.5 py-2 text-[14.5px] leading-snug text-white"
                    data-testid="msg-user"
                  >
                    {m.content}
                  </motion.div>
                </div>
              );
            const isLive = running && m.id === lastAssistant?.id;
            const empty = !m.content && !(m.parts ?? []).some((p: any) => !["tool", "tool_history", "context_checkpoint"].includes(p.type));
            if (empty && !isLive) return null;
            const { body, choices } = splitChoices(m.content || "");
            return (
              <div key={m.id} className="contents">
                {stampEl}
                <motion.div
                  initial={historyEnd.current !== null && m.id > historyEnd.current ? reveal.initial : false}
                  animate={reveal.animate}
                  className="flex w-full max-w-[85%] flex-col self-start md:max-w-[78%]"
                  data-testid="msg-assistant"
                >
                  {m.proactive && !(m.parts ?? []).some((p: any) => p.type === "tip_image") && (
                    <div className="mb-1 text-[11px] font-medium text-[#7fb0ff]">
                      {name} checked in · {timeAgo(m.createdAt)}
                    </div>
                  )}
                  <ToolChips parts={m.parts ?? []} running={isLive} />
                  {body ? (
                    <div className="group relative rounded-[18px] bg-[var(--bubble)] px-3.5 py-2.5 text-[14.5px]">
                      {!isLive && m.id > 0 && <MessageActions m={m} />}
                      <Markdown>{body}</Markdown>
                      {choices.length > 0 && (
                        <div className="mt-3 flex flex-col gap-2" data-testid="reply-choices">
                          {choices.map((ch) => (
                            <button
                              key={ch}
                              onClick={() => send(ch)}
                              className="rounded-lg border border-dashed border-[#4a4a4a] px-3 py-2 text-left text-[13px] hover:border-[#6a6a6a] hover:bg-[var(--hover)] disabled:opacity-60"
                              data-testid="reply-choice"
                            >
                              {ch}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : isLive ? (
                    <TypingIndicator />
                  ) : null}
                  {(m.parts ?? []).some((p: any) => p.type === "reaction") && (
                    <div className="-mt-2 ml-2 w-fit rounded-full border border-[var(--line)] bg-[#202020] px-1.5 text-sm" data-testid="msg-reaction">
                      {(m.parts ?? []).find((p: any) => p.type === "reaction").emoji}
                    </div>
                  )}
                  {(m.parts ?? [])
                    .filter((p) => p.type === "scheduled")
                    .map((p) => (
                      <ScheduledChip key={p.taskId} part={p} />
                    ))}
                  <RichParts
                    parts={(m.parts ?? []).filter((p: any) => !["reaction", "scheduled", "tool_history", "context_checkpoint"].includes(p.type))}
                    chatId={chatId}
                  />
                </motion.div>
              </div>
            );
          })}
          {pending.map((a) => (
            <div key={a.id} className="max-w-lg">
              <ApprovalCard approval={a} />
            </div>
          ))}
          {running && !lastAssistant?.content && lastAssistant?.id !== visible[visible.length - 1]?.id && <TypingIndicator />}
        </div>
      </div>
      <Composer onSend={send} running={running} onStop={() => post(`/chats/${chatId}/stop`)} onVoice={() => (unlockCallAudio(), setVoice(true))} />
      <VoiceMode
        open={voice}
        onClose={() => setVoice(false)}
        chatId={chatId}
        avatarUrl={me.agent.avatarUrl}
        name={name}
        voice={me.settings?.voice ?? "alloy"}
      />
    </div>
  );
}
