import { createPortal } from "react-dom";
import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { AnimatePresence, m, type HTMLMotionProps } from "framer-motion";
import { fade, settle, useMotionAllowed } from "./Motion";
import { X } from "lucide-react";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type BtnProps = HTMLMotionProps<"button"> & { variant?: "primary" | "ghost" | "soft" | "danger" | "outline"; size?: "sm" | "md" | "lg" };
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button({ variant = "primary", size = "md", className, ...p }, ref) {
  const v = {
    primary: "bg-ink text-canvas hover:opacity-90",
    ghost: "text-ink hover:bg-hover",
    soft: "glass border border-edge text-ink hover:border-muted",
    outline: "border border-edge text-ink hover:bg-hover",
    danger: "bg-danger text-white hover:opacity-90",
  }[variant];
  const s = { sm: "h-8 px-3 text-sm", md: "h-10 px-4 text-sm", lg: "h-12 px-6 text-base" }[size];
  const animate = useMotionAllowed();
  return (
    <m.button
      ref={ref}
      whileTap={animate && !p.disabled ? { scale: 0.97 } : undefined}
      transition={settle}
      className={cx(
        "inline-flex shrink-0 items-center justify-center gap-2 rounded-full font-medium transition-colors disabled:pointer-events-none disabled:opacity-40 motion-reduce:transition-none",
        v,
        s,
        className,
      )}
      {...p}
    />
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return (
    <input
      ref={ref}
      className={cx("h-10 w-full min-w-0 rounded-control border border-edge bg-surface px-3 text-sm placeholder:text-muted focus:border-highlight", className)}
      {...p}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return (
    <textarea
      ref={ref}
      className={cx("w-full min-w-0 rounded-control border border-edge bg-surface p-3 text-sm placeholder:text-muted focus:border-highlight", className)}
      {...p}
    />
  );
});

export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx("min-w-0 rounded-card border border-edge bg-surface", className)} {...p}>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 rounded-full transition-colors", checked ? "bg-[var(--ink)]" : "bg-[var(--line)]")}
    >
      <m.span
        initial={false}
        animate={{ x: checked ? 20 : 0 }}
        transition={settle}
        className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow"
      />
    </button>
  );
}

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  const indicator = useId();
  const animate = useMotionAllowed();
  return (
    <div className="glass inline-flex rounded-full border border-edge p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx("relative isolate rounded-full px-3 py-1 text-sm", value === o.value ? "text-canvas" : "text-muted hover:text-ink")}
        >
          {value === o.value && (
            <m.span
              layoutId={animate ? indicator : undefined}
              transition={settle}
              aria-hidden
              className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-ink"
            />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
  side = "right",
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  side?: "right" | "bottom";
  wide?: boolean;
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <m.div key="sheet" className="fixed inset-0 z-50 flex" exit={{ pointerEvents: "none" }} onClick={onClose}>
          <m.div {...fade} className="absolute inset-0 bg-black/25 backdrop-blur-[1px]" />
          <m.div
            initial={side === "right" ? { x: 32, opacity: 0 } : { y: 32, opacity: 0 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={side === "right" ? { x: 24, opacity: 0 } : { y: 24, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className={cx(
              "glass relative ml-auto flex h-full flex-col border-l border-edge shadow-2xl",
              side === "right" ? (wide ? "w-full max-w-4xl" : "w-full max-w-md") : "mt-auto h-[85vh] w-full rounded-t-3xl",
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--line)] px-5 py-3">
              <div className="font-semibold">{title}</div>
              <button onClick={onClose} className="rounded-full p-2 hover:bg-[var(--hover)]" aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </m.div>
        </m.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Empty({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <div className="text-4xl">{icon}</div>
      <div className="font-semibold">{title}</div>
      {body && <div className="max-w-sm text-sm text-[var(--muted)]">{body}</div>}
      {action}
    </div>
  );
}

export function Page({
  title,
  subtitle,
  action,
  width,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  width: "reading" | "collection";
  children: ReactNode;
}) {
  return (
    <div className="overflow-y-auto">
      <div className="page-frame pt-8 pb-16 md:pt-12">
        <div className={width === "reading" ? "max-w-reading" : undefined}>
          <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-edge pb-5 md:mb-8 md:pb-6">
            <div className="min-w-0">
              <h1 className="font-display text-3xl tracking-tight text-ink md:text-4xl">{title}</h1>
              {subtitle && <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted">{subtitle}</p>}
            </div>
            {action}
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}
