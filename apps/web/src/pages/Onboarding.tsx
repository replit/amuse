import { useState } from "react";
import { m } from "framer-motion";
import { reveal } from "../components/Motion";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Wand2 } from "lucide-react";
import { post } from "../lib/api";
import type { Me } from "../lib/types";
import { AgentAvatar, AvatarPicker } from "../components/Creature";
import { Button, Input, cx } from "../components/ui";

const VIBES = ["Warm and encouraging", "Calm and organised", "Witty and playful", "Straight to the point", "Curious and nerdy"];
const HELP = [
  "Staying organised",
  "Health & fitness",
  "Saving money",
  "Shopping & gifts",
  "Travel plans",
  "Work & side projects",
  "Family logistics",
  "Learning something new",
];

export function Onboarding({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState("preset:pip");
  const [sheet, setSheet] = useState<string | null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [look, setLook] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [vibe, setVibe] = useState(VIBES[0]!);
  const [help, setHelp] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [ownerName, setOwnerName] = useState(me.user.name ?? "");

  const generate = async () => {
    setGenBusy(true);
    try {
      const r = await post("/agent/avatar-options", { look: look || "a small round fluffy creature with big eyes" });
      if (r.options) {
        setOptions(r.options);
        setSheet(null);
        setAvatar(r.options[0]);
      } else {
        setSheet(r.sheet);
        setAvatar(`sheet:${r.sheet}#0`);
      }
    } finally {
      setGenBusy(false);
    }
  };

  const hatch = async () => {
    setBusy(true);
    await post("/agent/hatch", {
      name: name.trim(),
      ownerName: ownerName.trim(),
      vibe,
      avatarUrl: avatar,
      emoji: "🪺",
      aboutMe: help.join(", "),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    await qc.invalidateQueries({ queryKey: ["me"] });
  };

  return (
    <div className="workspace-canvas flex min-h-[100dvh] flex-col items-center justify-center px-(--page-gutter) py-8 text-ink">
      <div className="glass w-full max-w-lg rounded-card border border-edge p-5 sm:p-8">
        <div className="mb-8 flex justify-center gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={cx("h-1.5 w-10 rounded-full", i <= step ? "bg-[var(--ink)]" : "bg-[var(--line)]")} />
          ))}
        </div>

        <m.div key={step} {...reveal}>
          {step === 0 && (
            <div className="text-center" data-testid="onb-welcome">
              <m.div
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="mx-auto mb-6 flex h-40 w-40 items-center justify-center rounded-full bg-surface text-7xl shadow-inner"
              >
                🪺
              </m.div>
              <h1 className="font-display text-3xl">{me.user.name ? `Hi ${me.user.name}.` : "Hi there."} Let's hatch your agent.</h1>
              <p className="mt-3 text-[var(--muted)]">
                Your own personal AI that takes real tasks off your plate, remembers what matters to you, and keeps working in the background.
              </p>
              <Button size="lg" className="mt-8" onClick={() => setStep(1)} data-testid="onb-start">
                Let's go <ArrowRight size={16} />
              </Button>
            </div>
          )}

          {step === 1 && (
            <div data-testid="onb-name">
              <h2 className="font-display text-2xl">What should we call your agent?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Pick any name. You can change it later.</p>
              <Input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && name.trim() && setStep(2)}
                placeholder="e.g. Juniper, Biscuit, Atlas"
                className="mt-5 h-12 text-lg"
                maxLength={30}
                data-testid="onb-name-input"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                {["Juniper", "Biscuit", "Atlas", "Pebble", "Nova"].map((n) => (
                  <button key={n} onClick={() => setName(n)} className="rounded-full border border-[var(--line)] px-3 py-1 text-sm hover:bg-[var(--hover)]">
                    {n}
                  </button>
                ))}
              </div>
              <Button size="lg" className="mt-8 w-full" disabled={!name.trim()} onClick={() => setStep(2)} data-testid="onb-next">
                Next
              </Button>
            </div>
          )}

          {step === 2 && (
            <div data-testid="onb-look">
              <h2 className="font-display text-2xl">Give {name} a look</h2>
              <div className="my-6 flex justify-center">
                <m.div key={avatar} initial={{ opacity: 0.6, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                  <AgentAvatar avatarUrl={avatar} size={120} />
                </m.div>
              </div>
              <AvatarPicker value={avatar} onChange={setAvatar} />
              <div className="mt-5 rounded-2xl border border-[var(--line)] bg-[var(--card)] p-3">
                <div className="mb-2 text-sm font-medium">Or design your own</div>
                <div className="flex gap-2">
                  <Input value={look} onChange={(e) => setLook(e.target.value)} placeholder="a sleepy fox in a knitted hat" />
                  <Button variant="soft" onClick={generate} disabled={genBusy} data-testid="onb-generate">
                    {genBusy ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                  </Button>
                </div>
                {options.length > 0 && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {options.map((o, q) => (
                      <button
                        key={q}
                        onClick={() => setAvatar(o)}
                        className={cx(
                          "flex h-14 w-14 items-center justify-center justify-self-center rounded-full ring-offset-2 ring-offset-[var(--bg)]",
                          avatar === o && "ring-2 ring-[var(--ink)]",
                        )}
                      >
                        <AgentAvatar avatarUrl={o} size={56} />
                      </button>
                    ))}
                  </div>
                )}
                {sheet && (
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {[0, 1, 2, 3].map((q) => (
                      <button
                        key={q}
                        onClick={() => setAvatar(`sheet:${sheet}#${q}`)}
                        className={cx(
                          "flex h-14 w-14 items-center justify-center justify-self-center rounded-full ring-offset-2 ring-offset-[var(--bg)]",
                          avatar === `sheet:${sheet}#${q}` && "ring-2 ring-[var(--ink)]",
                        )}
                      >
                        <AgentAvatar avatarUrl={`sheet:${sheet}#${q}`} size={56} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="mt-6 text-sm font-medium">Personality</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {VIBES.map((v) => (
                  <button
                    key={v}
                    onClick={() => setVibe(v)}
                    className={cx(
                      "rounded-full border px-3 py-1.5 text-sm",
                      vibe === v ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)] hover:bg-[var(--hover)]",
                    )}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <Button size="lg" className="mt-8 w-full" onClick={() => setStep(3)} data-testid="onb-next">
                Next
              </Button>
            </div>
          )}

          {step === 3 && (
            <div data-testid="onb-help">
              <h2 className="font-display text-2xl">What should {name} call you?</h2>
              <Input
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
                placeholder="Your first name"
                className="mt-4 h-12 text-lg"
                maxLength={40}
                data-testid="onb-owner-name"
              />
              <h2 className="mt-8 font-display text-2xl">What could {name} help with?</h2>
              <p className="mt-1 text-sm text-[var(--muted)]">Pick a few. This helps with first ideas.</p>
              <div className="mt-5 flex flex-wrap gap-2">
                {HELP.map((h) => (
                  <button
                    key={h}
                    onClick={() => setHelp(help.includes(h) ? help.filter((x) => x !== h) : [...help, h])}
                    className={cx(
                      "rounded-full border px-3 py-1.5 text-sm",
                      help.includes(h) ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--bg)]" : "border-[var(--line)] hover:bg-[var(--hover)]",
                    )}
                  >
                    {h}
                  </button>
                ))}
              </div>
              <Button size="lg" className="mt-10 w-full" onClick={hatch} disabled={busy} data-testid="onb-hatch">
                {busy ? <Loader2 size={16} className="animate-spin" /> : "🐣"} Hatch {name}
              </Button>
            </div>
          )}
        </m.div>
      </div>
    </div>
  );
}
