import { Check } from "lucide-react";
import { cx } from "./ui";

/**
 * Amuse's built-in companion creatures.
 * avatarUrl formats: "preset:<id>" | "sheet:<dataUrl>#<quadrant 0-3>" | data/http URL.
 */
const PRESETS = ["Pip", "Moss", "Plum", "Sky", "Honey", "Coral"].map((name) => ({ name, id: name.toLowerCase() }));

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "");
export function presetImage(id: string, busy = false) {
  const p = PRESETS.find((x) => x.id === id) ?? PRESETS[0]!;
  return `${BASE}/avatars/${p.id}${busy ? "_busy" : ""}.jpg`;
}

export function AvatarPicker({ value, onChange }: { value: string | null; onChange: (avatarUrl: string) => void }) {
  return (
    <fieldset className="@container min-w-0">
      <legend className="mb-2.5 text-sm font-medium text-ink">Choose a companion</legend>
      <div className="grid grid-cols-3 gap-2.5 @min-[26rem]:grid-cols-6">
        {PRESETS.map(({ id, name }) => {
          const url = `preset:${id}`;
          const selected = (value ?? "preset:pip") === url;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(url)}
              className={cx(
                "group relative min-w-0 overflow-hidden rounded-control border bg-panel text-left motion-safe:transition-colors",
                selected ? "border-highlight ring-1 ring-highlight" : "border-edge hover:border-muted",
              )}
            >
              <img src={presetImage(id)} alt="" draggable={false} width={384} height={384} className="aspect-square w-full object-cover" />
              <span className={cx("block px-2 py-1.5 text-center text-xs font-medium", selected ? "glass text-ink" : "text-muted group-hover:text-ink")}>
                {name}
              </span>
              {selected && (
                <span aria-hidden="true" className="absolute top-1.5 right-1.5 grid size-4.5 place-items-center rounded-full bg-ink text-canvas shadow">
                  <Check size={12} strokeWidth={3} />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** Plush companion portrait; swaps to a "working" pose (headphones + laptop) while busy. */
export function PlushAvatar({ id, size = 64, busy = false, className = "" }: { id: string; size?: number; busy?: boolean; className?: string }) {
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-full bg-[var(--card)] ${className}`} style={{ width: size, height: size }}>
      <img
        src={presetImage(id, false)}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${busy ? "opacity-0" : "opacity-100"}`}
      />
      <img
        src={presetImage(id, true)}
        alt=""
        draggable={false}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ${busy ? "opacity-100" : "opacity-0"}`}
      />
    </div>
  );
}

export function AgentAvatar({
  avatarUrl,
  size = 40,
  busy = false,
  className = "",
}: {
  avatarUrl?: string | null;
  size?: number;
  busy?: boolean;
  className?: string;
}) {
  const url = avatarUrl ?? "preset:pip";
  const ring = "";
  if (url.startsWith("preset:")) return <PlushAvatar id={url.slice(7)} size={size} busy={busy} className={className} />;
  if (url.startsWith("sheet:")) {
    const [src, q] = url.slice(6).split("#");
    const qi = Number(q ?? 0);
    const x = qi % 2 === 0 ? "0%" : "100%";
    const y = qi < 2 ? "0%" : "100%";
    return (
      <div
        className={`rounded-full shrink-0 ${ring} ${className}`}
        style={{ width: size, height: size, backgroundImage: `url(${src})`, backgroundSize: "200% 200%", backgroundPosition: `${x} ${y}` }}
      />
    );
  }
  return <img src={url} alt="" className={`rounded-full object-cover shrink-0 ${ring} ${className}`} style={{ width: size, height: size }} />;
}
