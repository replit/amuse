import { useEffect, useRef, useState } from "react";
import { m } from "framer-motion";
import { useMotionAllowed } from "./Motion";
import { ExternalLink, Mic, MicOff, PhoneOff, Hand } from "lucide-react";
import { post } from "../lib/api";
import { useEvent } from "../lib/events";
import { AgentAvatar } from "./Creature";
import { recordToBase64 } from "./Composer";
import { capabilities, deviceSpeechSupported, recognizeOnce, speakOnDevice, speakSentences, voiceEngine } from "../lib/speech";
import { callAudio, chime, speakChunks, voiceStats } from "../lib/callAudio";

type Phase = "connecting" | "listening" | "transcribing" | "thinking" | "preparing" | "speaking" | "muted" | "error";

const LABEL: Record<Phase, string> = {
  connecting: "Connecting…",
  listening: "Listening",
  transcribing: "Got it…",
  thinking: "Thinking",
  preparing: "About to speak…",
  speaking: "Speaking",
  muted: "Muted",
  error: "Something's wrong",
};

const inFrame = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

/** Hands-free voice call: listen → transcribe → agent → speak, then listen again. */
export function VoiceMode({
  open,
  onClose,
  chatId,
  avatarUrl,
  name,
  voice,
}: {
  open: boolean;
  onClose: () => void;
  chatId: number;
  avatarUrl?: string | null;
  name: string;
  voice: string;
}) {
  const [phase, setPhase] = useState<Phase>("connecting");
  const animate = useMotionAllowed();
  const [you, setYou] = useState("");
  const [reply, setReply] = useState("");
  const [hint, setHint] = useState("");
  const [level, setLevel] = useState(0);
  const [muted, setMuted] = useState(false);
  const [frameFix, setFrameFix] = useState(false);
  const [status, setStatus] = useState("");
  const pendingMsg = useRef<number | null>(null);
  const active = useRef(false);
  const mutedRef = useRef(false);
  const stopper = useRef<{ stop?: () => void }>({});
  const playback = useRef<{ stopped: boolean; current?: AudioBufferSourceNode }>({ stopped: false });
  const emptyStreak = useRef(0);
  const phaseRef = useRef<Phase>("connecting");
  const engineRef = useRef(voiceEngine());
  const go = (p: Phase) => ((phaseRef.current = p), setPhase(p));

  const fail = (msg: string, fixInTab = false) => {
    active.current = false;
    go("error");
    setHint(msg);
    setFrameFix(fixInTab && inFrame);
  };

  const sendUtterance = async (text: string) => {
    emptyStreak.current = 0;
    setYou(text);
    setReply("");
    setStatus("");
    go("thinking");
    const res = await post(`/chats/${chatId}/messages`, { content: text, voice: true });
    if (res.started === false && !res.steered) {
      pendingMsg.current = null;
      setReply("I've hit today's usage limit, so I'll pause here.");
      await speak("I've hit today's usage limit, so I'll pause here.");
      return;
    }
    pendingMsg.current = res.message.id;
  };

  /** Called when nothing was heard: retry, but stop instead of spinning if it keeps failing instantly. */
  const retry = (startedAt: number, why = "I didn't catch that. Go ahead…") => {
    if (!active.current) return;
    emptyStreak.current = Date.now() - startedAt < 800 ? emptyStreak.current + 1 : 0;
    if (emptyStreak.current >= 3) return fail("I can't hear anything. Check that your microphone is allowed and working, then try again.", true);
    setHint(why);
    setTimeout(() => void listen(), emptyStreak.current ? 600 : 0);
  };

  const listen = async () => {
    if (!active.current) return;
    if (mutedRef.current) return go("muted");
    go("listening");
    chime("listen");
    const startedAt = Date.now();
    const { serverSpeech } = await capabilities();
    if (engineRef.current === "device" || !serverSpeech) {
      if (!deviceSpeechSupported()) return fail("Voice calls need Chrome, Edge or Safari here.");
      setYou("");
      // Mic level meter alongside the browser's recogniser, so the person sees they're being heard.
      let meterStop = () => {};
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
        const c = callAudio();
        const src = c.createMediaStreamSource(stream);
        const an = c.createAnalyser();
        src.connect(an);
        const data = new Uint8Array(an.fftSize);
        const iv = setInterval(() => {
          an.getByteTimeDomainData(data);
          let max = 0;
          for (const x of data) max = Math.max(max, Math.abs(x - 128));
          setLevel(Math.min(1, max / 60));
        }, 80);
        meterStop = () => (clearInterval(iv), src.disconnect(), stream.getTracks().forEach((t) => t.stop()));
      } catch (e: any) {
        if (e?.name === "NotFoundError") return fail("No microphone found. Plug one in and try again.");
        return fail(
          inFrame
            ? "This preview window isn't allowed to use your microphone. Open Amuse in its own tab to call."
            : "Amuse can't use your microphone. Allow microphone access for this site, then try again.",
          true,
        );
      }
      if (!active.current || mutedRef.current) return (meterStop(), mutedRef.current ? go("muted") : undefined);
      setHint("Go ahead, I'm listening.");
      let err = "";
      const text = await recognizeOnce({ onInterim: (t) => t && (setYou(t), setHint("")), stop: stopper.current, onError: (e) => (err = e) });
      meterStop();
      setLevel(0);
      if (!active.current || mutedRef.current) return mutedRef.current ? go("muted") : undefined;
      if (err === "not-allowed" || err === "service-not-allowed")
        return fail("Amuse can't use your microphone. Allow microphone access for this site, then try again.", true);
      if ((err === "network" || err === "audio-capture" || err === "language-not-supported") && serverSpeech) {
        engineRef.current = "natural";
        return void listen();
      }
      if (!text) return retry(startedAt, "I didn't catch that. Talk whenever you're ready.");
      chime("heard");
      return sendUtterance(text);
    }
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    } catch (e: any) {
      if (e?.name === "NotFoundError") return fail("No microphone found. Plug one in and try again.");
      return fail(
        inFrame
          ? "This preview window isn't allowed to use your microphone. Open Amuse in its own tab to call."
          : "Amuse can't use your microphone. Allow microphone access for this site, then try again.",
        true,
      );
    }
    if (!active.current || mutedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return mutedRef.current ? go("muted") : undefined;
    }
    setHint("Go ahead, I'm listening.");
    // Voice activity detection: stop ~1.1s after speech ends, give up after 15s of silence.
    const ctx = callAudio();
    const src = ctx.createMediaStreamSource(stream);
    const an = ctx.createAnalyser();
    src.connect(an);
    const data = new Uint8Array(an.fftSize);
    let lastLoud = Date.now();
    let spoke = false;
    const iv = setInterval(() => {
      an.getByteTimeDomainData(data);
      let max = 0;
      for (const v of data) max = Math.max(max, Math.abs(v - 128));
      setLevel(Math.min(1, max / 60));
      if (max > 8) {
        lastLoud = Date.now();
        if (!spoke) setHint("I'm hearing you…");
        spoke = true;
      }
      if (spoke && Date.now() - lastLoud > 1100) stopper.current.stop?.();
      if (!spoke && Date.now() - startedAt > 15000) stopper.current.stop?.();
    }, 80);
    const r = await recordToBase64(stream, 30000, stopper.current);
    clearInterval(iv);
    setLevel(0);
    src.disconnect();
    stream.getTracks().forEach((t) => t.stop());
    if (!active.current || mutedRef.current) return mutedRef.current ? go("muted") : undefined;
    if (!spoke) return retry(Date.now(), "I didn't hear anything. Talk whenever you're ready.");
    chime("heard");
    go("transcribing");
    setHint("");
    try {
      const payload = { audio: r.audio, mime: r.mime };
      const { text } = await post("/voice/transcribe", payload);
      if (!active.current) return;
      if (!text?.trim()) return retry(Date.now());
      await sendUtterance(text.trim());
    } catch {
      retry(Date.now(), "Sorry, that didn't come through. Try again?");
    }
  };

  const speak = async (say: string) => {
    if (!active.current) return;
    setReply(say);
    setHint("");
    go("preparing");
    ((window as any).__amuseSpoken ??= []).push(say);
    playback.current = { stopped: false };
    const { serverSpeech } = await capabilities();
    let spoken = false;
    if (engineRef.current === "device" && "speechSynthesis" in window) {
      voiceStats().engine = "device";
      await speakSentences(say, { stop: playback.current, onStart: () => active.current && go("speaking"), onLevel: setLevel });
      spoken = true;
    } else if (serverSpeech) {
      try {
        await speakChunks(
          say,
          async (t) => {
            const resp = await fetch("/api/voice/speak", {
              method: "POST",
              credentials: "include",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ text: t, voice }),
            });
            if (!resp.ok) throw new Error("speak failed");
            return resp.arrayBuffer();
          },
          { stop: playback.current, onStart: () => active.current && go("speaking"), onLevel: setLevel },
        );
        spoken = true;
      } catch (e) {
        if (voiceStats().blocked) {
          if (!active.current) return;
          setHint("Your browser blocked sound. Tap anywhere to let me speak.");
        }
      }
    }
    if (!spoken && active.current && !playback.current.stopped) {
      go("speaking");
      await speakOnDevice(say);
    }
    if (active.current && !playback.current.stopped) void listen();
  };

  const interrupt = () => {
    playback.current.stopped = true;
    try {
      playback.current.current?.stop();
    } catch {
      /* already stopped */
    }
    if ("speechSynthesis" in window) speechSynthesis.cancel();
    setLevel(0);
    void listen();
  };

  const toggleMute = () => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) {
      if (phaseRef.current === "listening") stopper.current.stop?.();
      if (phaseRef.current === "listening") go("muted");
    } else if (phaseRef.current === "muted") void listen();
  };

  useEvent(
    async (e) => {
      if (!active.current) return;
      if (e.type === "status" && phaseRef.current === "thinking") return setStatus(String(e.status ?? ""));
      if (e.type !== "message_done" || e.chatId !== chatId || pendingMsg.current == null) return;
      pendingMsg.current = null;
      const r = await fetch(`/api/chats/${chatId}/messages`, { credentials: "include" }).then((x) => x.json());
      const last = [...r.messages].reverse().find((m: any) => m.role === "assistant");
      const say =
        (last?.content ?? "")
          .replace(/^>>.*$/gm, "")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/[#*_`>|]/g, "")
          .replace(/\p{Extended_Pictographic}/gu, "")
          .trim()
          .slice(0, 1200) || "Done.";
      await speak(say);
    },
    [chatId, voice],
  );

  useEffect(() => {
    if (open) {
      active.current = true;
      emptyStreak.current = 0;
      engineRef.current = voiceEngine();
      mutedRef.current = false;
      setMuted(false);
      setYou("");
      setReply("");
      setHint("");
      setFrameFix(false);
      go("connecting");
      if (engineRef.current === "natural") void post("/voice/warm", {}).catch(() => undefined);
      void callAudio()
        .resume()
        .catch(() => undefined);
      void listen();
    }
    return () => {
      if (active.current) chime("end");
      active.current = false;
      stopper.current.stop?.();
      playback.current.stopped = true;
      try {
        playback.current.current?.stop();
      } catch {
        /* already stopped */
      }
      if ("speechSynthesis" in window) speechSynthesis.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;
  const ringScale = 1 + (animate && (phase === "listening" || phase === "speaking") ? level * 0.35 : 0);
  const ringColor = phase === "speaking" || phase === "preparing" ? "#3b82f6" : phase === "error" ? "#ef4444" : phase === "muted" ? "#9ca3af" : "#22c55e";
  const statusLine = /^is /i.test(status) ? `${name} ${status}…` : status;
  const sub = phase === "muted" ? "Your mic is off. Tap the mic to talk." : phase === "thinking" && status ? statusLine : hint;
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="workspace-canvas fixed inset-0 z-50 flex flex-col items-center justify-between overflow-y-auto py-10"
      data-testid="voice-overlay"
      data-phase={phase}
      onClick={() => void callAudio().resume()}
    >
      <div className="text-sm text-[var(--muted)]">Call with {name}</div>

      <div className="flex flex-col items-center gap-6">
        <div className="relative flex h-[260px] w-[260px] items-center justify-center">
          <m.div
            className="absolute inset-6 rounded-full"
            initial={false}
            animate={{ scale: ringScale, opacity: phase === "muted" ? 0.25 : 1 }}
            transition={{ duration: 0.09 }}
            style={{
              boxShadow: `0 0 0 6px ${ringColor}55, 0 0 40px 6px ${ringColor}33`,
            }}
            data-testid="voice-ring"
          />
          <AgentAvatar avatarUrl={avatarUrl} size={180} busy={phase === "thinking" || phase === "transcribing"} />
        </div>
        <div className="flex items-center gap-2 text-sm font-medium uppercase tracking-widest text-[var(--muted)]" data-testid="voice-phase">
          {animate && (phase === "listening" || phase === "speaking") && (
            <span className="flex h-4 items-end gap-[3px]">
              {[0.6, 1, 0.75].map((k, i) => (
                <span key={i} className="w-[3px] rounded-full" style={{ height: `${4 + Math.round(level * 12 * k)}px`, background: ringColor }} />
              ))}
            </span>
          )}
          {LABEL[phase]}
        </div>
        <div className="flex min-h-[110px] max-w-lg flex-col items-center gap-3 px-6 text-center">
          {you && phase !== "speaking" && phase !== "preparing" && (
            <div className="text-base text-[var(--muted)]" data-testid="voice-you">
              You: “{you}”
            </div>
          )}
          {reply && (phase === "speaking" || phase === "preparing") && (
            <div className="text-lg leading-relaxed" data-testid="voice-caption">
              {reply}
            </div>
          )}
          {sub && (
            <div className={`text-sm ${phase === "error" ? "text-red-400" : "text-[var(--muted)]"}`} data-testid="voice-hint">
              {sub}
            </div>
          )}
          {frameFix && (
            <button
              onClick={() => window.open(location.href, "_blank")}
              className="flex items-center gap-2 rounded-full bg-[var(--card)] px-4 py-2 text-sm hover:bg-[var(--hover)]"
            >
              <ExternalLink size={15} /> Open Amuse in a new tab
            </button>
          )}
          {phase === "error" && (
            <button
              onClick={() => {
                active.current = true;
                emptyStreak.current = 0;
                setFrameFix(false);
                void callAudio().resume();
                void listen();
              }}
              className="rounded-full bg-[var(--card)] px-4 py-2 text-sm hover:bg-[var(--hover)]"
            >
              Try again
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-6">
        <button
          onClick={toggleMute}
          className={`flex h-14 w-14 items-center justify-center rounded-full ${muted ? "bg-white text-black" : "bg-[var(--card)] hover:bg-[var(--hover)]"}`}
          aria-label={muted ? "Unmute" : "Mute"}
          data-testid="voice-mute"
        >
          {muted ? <MicOff size={22} /> : <Mic size={22} />}
        </button>
        {(phase === "speaking" || phase === "preparing") && (
          <button
            onClick={interrupt}
            className="flex h-14 items-center gap-2 rounded-full bg-[var(--card)] px-5 text-sm hover:bg-[var(--hover)]"
            aria-label="Interrupt"
            data-testid="voice-interrupt"
          >
            <Hand size={18} /> Interrupt
          </button>
        )}
        <button
          onClick={onClose}
          className="flex h-14 w-14 items-center justify-center rounded-full bg-red-500 text-white hover:bg-red-600"
          aria-label="End voice mode"
          data-testid="voice-end"
        >
          <PhoneOff size={22} />
        </button>
      </div>
    </m.div>
  );
}
