import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Lightbulb, Menu, MessageCircle, Newspaper, Plus, Search, Settings, SquareCheckBig, LayoutGrid, Target } from "lucide-react";
import { api } from "../lib/api";
import type { Me, Space } from "../lib/types";
import { AgentPanel, usePanel } from "./AgentPanel";
import { useNewSideChat } from "./AgentHeader";
import { cx } from "./ui";
import { AnimatePresence, m } from "framer-motion";
import { fade, reveal, settle, useMotionAllowed } from "./Motion";

function spaceVisibleNow(s: Space) {
  const days = s.schedule?.days;
  if (!days || !days.length) return true;
  return days.includes(new Date().getDay());
}

function RailItem({ href, icon, label, active, testid }: { href: string; icon: ReactNode; label: string; active: boolean; testid?: string }) {
  const animate = useMotionAllowed();
  return (
    <Link
      href={href}
      data-testid={testid}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      title={label}
      className={cx(
        "group relative isolate flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
        active ? "text-highlight" : "text-muted hover:bg-hover hover:text-ink",
      )}
    >
      {active && (
        <m.span
          aria-hidden
          layoutId={animate ? "workspace-rail-selection" : undefined}
          transition={settle}
          className="glass pointer-events-none absolute inset-0 -z-10 rounded-xl ring-1 ring-highlight/35"
        />
      )}
      {icon}
      <span className="pointer-events-none absolute left-12 z-50 hidden whitespace-nowrap rounded-md border border-edge bg-panel px-2 py-1 text-xs text-ink shadow group-hover:block">
        {label}
      </span>
    </Link>
  );
}

function useWide() {
  const q = "(min-width: 1280px)";
  const [wide, setWide] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const m = window.matchMedia(q);
    const h = () => setWide(m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return wide;
}

export function AppShell({ me, children }: { me: Me; children: ReactNode }) {
  const [loc] = useLocation();
  const { open, setOpen } = usePanel();
  const newSideChat = useNewSideChat();
  const { data: spacesData } = useQuery({ queryKey: ["spaces"], queryFn: () => api<{ spaces: Space[] }>("/spaces") });
  const spaces = (spacesData?.spaces ?? []).filter(spaceVisibleNow).filter((s) => s.placement !== "hidden");
  const tabSpaces = spaces.filter((s) => s.placement === "tab");
  const isChat = loc === "/" || loc.startsWith("/chats/");
  const wide = useWide();
  const qc = useQueryClient();
  // Load every tab's data up front so switching pages shows content immediately instead of an empty flash.
  useEffect(() => {
    const t = setTimeout(() => {
      for (const [key, url] of [
        [["feed"], "/feed"],
        [["goals"], "/goals"],
        [["ideas"], "/ideas"],
        [["library", "all"], "/library"],
        [["chats"], "/chats"],
        [["settings"], "/settings"],
      ] as const)
        void qc.prefetchQuery({ queryKey: [...key], queryFn: () => api(url) });
    }, 600);
    return () => clearTimeout(t);
  }, [qc]);
  const seg = loc.split("/").filter(Boolean);
  const pageKey = seg[0] === "chats" || seg[0] === "spaces" ? seg.slice(0, 2).join("/") : (seg[0] ?? "");

  return (
    <div className="workspace-canvas flex h-[100dvh] text-ink">
      <nav aria-label="Workspace" className="glass relative z-20 hidden w-16 shrink-0 flex-col items-center gap-1.5 border-r border-edge py-3 md:flex">
        <div className="flex flex-1 flex-col items-center justify-center gap-1.5">
          <RailItem href="/" icon={<MessageCircle size={19} />} label="Chat" active={isChat} testid="nav-chat" />
          <RailItem href="/search" icon={<Search size={19} />} label="Search" active={loc.startsWith("/search")} testid="nav-search" />
          <RailItem href="/feed" icon={<Newspaper size={19} />} label="Feed" active={loc.startsWith("/feed")} testid="nav-feed" />
          <RailItem href="/ideas" icon={<Lightbulb size={19} />} label="Ideas" active={loc.startsWith("/ideas")} testid="nav-ideas" />
          <RailItem href="/goals" icon={<SquareCheckBig size={19} />} label="Goals" active={loc.startsWith("/goals")} testid="nav-goals" />
          <RailItem href="/spaces" icon={<LayoutGrid size={19} />} label="Spaces" active={loc === "/spaces"} testid="nav-spaces" />
          <RailItem href="/library" icon={<Library size={19} />} label="Library" active={loc.startsWith("/library")} testid="nav-library" />
          {spaces.length > 0 && <div className="my-1 h-px w-6 bg-[var(--line)]" />}
          {spaces.slice(0, 6).map((s) => (
            <RailItem
              key={s.id}
              href={`/spaces/${s.id}`}
              icon={<span className="text-[17px] leading-none">{s.emoji ?? "✨"}</span>}
              label={s.title}
              active={loc === `/spaces/${s.id}`}
            />
          ))}
          <button
            onClick={() => void newSideChat()}
            className="mt-1 flex h-10 w-10 items-center justify-center rounded-xl text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--ink)]"
            aria-label="New side chat"
            title="New side chat"
            data-testid="new-side-chat"
          >
            <Plus size={19} className="rounded-[5px] border-[1.5px] border-current p-[1px]" />
          </button>
        </div>
        <RailItem href="/settings" icon={<Menu size={19} />} label="Settings" active={loc.startsWith("/settings")} testid="nav-settings" />
      </nav>

      <main className="relative flex min-w-0 flex-1 flex-col">
        <m.div key={pageKey} {...reveal} className="amuse-page min-h-0 flex-1 [&>*]:h-full">
          {children}
        </m.div>
        <MobileNav loc={loc} isChat={isChat} tabSpaces={tabSpaces} />
      </main>

      <AnimatePresence initial={false}>
        {open && wide && (
          <m.div
            key="docked-panel"
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="shrink-0 overflow-hidden"
          >
            <AgentPanel me={me} />
          </m.div>
        )}
        {open && !wide && (
          <m.div key="overlay-panel" className="fixed inset-0 z-40 flex justify-end" exit={{ pointerEvents: "none" }} onClick={() => setOpen(false)}>
            <m.div {...fade} className="absolute inset-0 bg-black/50" />
            <m.div initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }} className="relative h-full" onClick={(e) => e.stopPropagation()}>
              <AgentPanel me={me} overlay />
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Phone bottom bar. "More" opens a sheet with the pages that don't fit (Feed, Spaces, Library, Settings). */
function MobileNav({ loc, isChat, tabSpaces }: { loc: string; isChat: boolean; tabSpaces: Space[] }) {
  const [more, setMore] = useState(false);
  useEffect(() => setMore(false), [loc]);
  const main = [
    { href: "/", label: "Chat", icon: <MessageCircle size={20} /> },
    { href: "/search", label: "Search", icon: <Search size={20} /> },
    { href: "/goals", label: "Goals", icon: <Target size={20} /> },
    { href: "/ideas", label: "Ideas", icon: <Lightbulb size={20} /> },
    ...tabSpaces.slice(0, 1).map((s) => ({ href: `/spaces/${s.id}`, label: s.title, icon: <span className="text-lg leading-5">{s.emoji}</span> })),
  ];
  const extra = [
    { href: "/feed", label: "Feed", icon: <Newspaper size={18} /> },
    { href: "/spaces", label: "Spaces", icon: <LayoutGrid size={18} /> },
    { href: "/library", label: "Library", icon: <Library size={18} /> },
    { href: "/settings", label: "Settings", icon: <Settings size={18} /> },
  ];
  const active = (href: string) => (href === "/" ? isChat : loc === href || loc.startsWith(href + "/"));
  const moreActive = extra.some((t) => active(t.href));
  return (
    <>
      <AnimatePresence>
        {more && (
          <m.div key="more" className="fixed inset-0 z-30 md:hidden" exit={{ pointerEvents: "none" }} onClick={() => setMore(false)}>
            <m.div {...fade} className="absolute inset-0 bg-black/40" />
            <m.div
              {...reveal}
              exit={{ y: 6, opacity: 0 }}
              className="glass absolute right-2 bottom-[calc(60px+env(safe-area-inset-bottom))] w-48 rounded-card border border-edge p-1.5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
              data-testid="mobile-more-sheet"
            >
              {extra.map((t) => (
                <Link
                  key={t.href}
                  href={t.href}
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm",
                    active(t.href) ? "bg-[var(--hover)] text-[var(--ink)]" : "text-[var(--ink)] hover:bg-[var(--hover)]",
                  )}
                >
                  {t.icon} {t.label}
                </Link>
              ))}
            </m.div>
          </m.div>
        )}
      </AnimatePresence>
      <nav aria-label="Workspace" className="glass relative z-30 flex border-t border-edge pb-[env(safe-area-inset-bottom)] md:hidden">
        {main.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active(t.href) ? "page" : undefined}
            className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active(t.href) ? "text-[var(--ink)]" : "text-[var(--muted)]")}
          >
            {t.icon}
            <span className="max-w-[70px] truncate">{t.label}</span>
          </Link>
        ))}
        <button
          onClick={() => setMore(!more)}
          aria-label="More"
          aria-expanded={more}
          data-testid="mobile-more"
          className={cx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", more || moreActive ? "text-[var(--ink)]" : "text-[var(--muted)]")}
        >
          <Menu size={20} />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
