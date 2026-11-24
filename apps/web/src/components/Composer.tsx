import { useEffect, useRef, useState } from "react";
import { ArrowUp, AudioLines, Mic, Square, Loader2, Plus, MessagesSquare, LayoutGrid, Target } from "lucide-react";
import { useLocation } from "wouter";
import { post } from "../lib/api";
import { capabilities, deviceSpeechSupported, recognizeOnce } from "../lib/speech";
import { cx } from "./ui";

export async function recordToBase64(stream: MediaStream, ms?: number, stopSignal?: { stop?: () => void }) {
  const rec = new MediaRecorder(stream);
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => chunks.push(e.data);
  const done = new Promise<Blob>((r) => (rec.onstop = () => r(new Blob(chunks, { type: rec.mimeType }))));
  rec.start();
  if (stopSignal) stopSignal.stop = () => rec.state !== "inactive" && rec.stop();
  if (ms) setTimeout(() => rec.state !== "inactive" && rec.stop(), ms);
  const blob = await done;
  const buf = await blob.arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return { audio: btoa(bin), mime: blob.type || "audio/webm", blob };
}

export function Composer({
  onSend,
  running,
  onStop,
  onVoice,
  placeholder,
}: {
  onSend: (t: string) => void;
  running: boolean;
  onStop: () => void;
  onVoice?: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [menu, setMenu] = useState(false);
  const [, nav] = useLocation();
  useEffect(() => {
    const h = (e: Event) => {
      const q = String((e as CustomEvent).detail ?? "")
        .replace(/\s+/g, " ")
        .slice(0, 160);
      setText((t) => `> ${q}\n${t}`);
      setTimeout(() => ta.current?.focus(), 0);
    };
    window.addEventListener("amuse:quote", h);
    return () => window.removeEventListener("amuse:quote", h);
  }, []);
  const ta = useRef<HTMLTextAreaElement>(null);
  const stopper = useRef<{ stop?: () => void }>({});
  useEffect(() => {
    if (!ta.current) return;
    ta.current.style.height = "auto";
    ta.current.style.height = Math.min(ta.current.scrollHeight, 180) + "px";
  }, [text]);
  const send = () => {
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText("");
  };
  const dictate = async () => {
    if (recording) return stopper.current.stop?.();
    const { serverSpeech } = await capabilities();
    if (!serverSpeech) {
      if (!deviceSpeechSupported()) return alert("Dictation needs Chrome, Edge or Safari on this server.");
      setRecording(true);
      const base = text;
      const t = await recognizeOnce({ onInterim: (x) => setText((base ? base + " " : "") + x), stop: stopper.current });
      setRecording(false);
      if (t) setText((base ? base + " " : "") + t);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setRecording(true);
      const r = await recordToBase64(stream, 60000, stopper.current);
      stream.getTracks().forEach((t) => t.stop());
      setRecording(false);
      setTranscribing(true);
      const payload = { audio: r.audio, mime: r.mime };
      const { text: t } = await post("/voice/transcribe", payload);
      setText((x) => (x ? x + " " : "") + t);
    } catch (e: any) {
      setRecording(false);
      if (e?.name === "NotAllowedError" || e?.name === "NotFoundError")
        alert("Amuse can't use your microphone. Allow microphone access for this site and try again.");
    } finally {
      setTranscribing(false);
    }
  };
  return (
    <div className="chat-frame pb-3 md:pb-5">
      <div className="glass relative flex items-end gap-1 rounded-3xl border border-edge p-1.5 focus-within:border-highlight">
        <button
          onClick={() => setMenu(!menu)}
          className="mb-0.5 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
          aria-label="More"
          title="More"
        >
          <Plus size={18} />
        </button>
        {menu && (
          <div className="glass absolute bottom-12 left-0 z-30 w-56 rounded-card border border-edge p-1.5 shadow-2xl" onMouseLeave={() => setMenu(false)}>
            {[
              { label: "Make a space", icon: <LayoutGrid size={15} />, go: () => nav("/spaces?new=1") },
              { label: "Set a goal", icon: <Target size={15} />, go: () => nav("/goals") },
              { label: "Start a side chat", icon: <MessagesSquare size={15} />, go: () => setText("Start a side chat about ") },
              ...(onVoice ? [{ label: "Voice mode", icon: <AudioLines size={15} />, go: onVoice }] : []),
            ].map((it) => (
              <button
                key={it.label}
                onClick={() => (setMenu(false), it.go())}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm hover:bg-[var(--hover)]"
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={ta}
          rows={1}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={placeholder ?? (running ? "Add to what I'm doing…" : "Message")}
          className="max-h-44 min-w-0 flex-1 resize-none bg-transparent px-1 py-2 text-sm outline-none placeholder:text-muted"
          data-testid="composer-input"
        />
        <button
          onClick={dictate}
          className={cx("mb-0.5 rounded-full p-2 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]", recording && "bg-[#B4373C] text-white")}
          aria-label={recording ? "Stop dictation" : "Dictate"}
          title="Dictate"
        >
          {transcribing ? <Loader2 size={18} className="animate-spin" /> : <Mic size={18} />}
        </button>
        {text.trim() ? (
          <button
            onClick={send}
            className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            aria-label="Send"
            data-testid="send"
          >
            <ArrowUp size={17} />
          </button>
        ) : running ? (
          <button
            onClick={onStop}
            className="mb-1 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent)] text-white"
            aria-label="Stop"
            data-testid="stop"
          >
            <Square size={12} fill="currentColor" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
