import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { FileText, Image as ImageIcon, Music, Search as SearchIcon, Target } from "lucide-react";
import { api, timeAgo } from "../lib/api";
import { useArtifactViewer } from "../components/ArtifactViewer";
import { Card, Empty, Input, Page, Segmented } from "../components/ui";
import { Markdown } from "../components/Markdown";

const KIND_ICON: Record<string, React.ReactNode> = {
  image: <ImageIcon size={16} />,
  audio: <Music size={16} />,
  pdf: <FileText size={16} />,
  html: <span>🧩</span>,
  markdown: <FileText size={16} />,
};

export function SearchPage() {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const { open } = useArtifactViewer();
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);
  const { data, isFetching } = useQuery({
    queryKey: ["search", debounced],
    queryFn: () => api(`/search?q=${encodeURIComponent(debounced)}`),
    enabled: debounced.length > 1,
  });
  const results = data?.results ?? [];
  return (
    <Page width="reading" title="Search" subtitle="Chats, things I made, files, goals and spaces.">
      <div className="relative mb-5">
        <SearchIcon aria-hidden size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-muted" />
        <Input
          autoFocus
          aria-label="Search everything"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search everything…"
          className="h-12 pl-11"
          data-testid="search-input"
        />
      </div>
      {q.length < 2 && <p className="text-sm text-muted">Enter at least two characters to search.</p>}
      {debounced.length > 1 && !isFetching && results.length === 0 && <Empty icon="🔎" title="No matches" />}
      <div className="grid gap-2" data-testid="search-results">
        {results.map((r: any, i: number) => {
          if (r.type === "message")
            return (
              <Link key={i} href={r.chatKind === "main" ? "/" : `/chats/${r.chatId}`}>
                <Card className="cursor-pointer p-3 hover:bg-[var(--hover)]">
                  <div className="text-xs text-[var(--muted)]">
                    {r.title} · {r.role === "user" ? "You" : "Agent"} · {timeAgo(r.at)}
                  </div>
                  <div className="mt-1 text-sm">{r.snippet}</div>
                </Card>
              </Link>
            );
          if (r.type === "artifact")
            return (
              <Card key={i} onClick={() => open(r.id)} className="flex cursor-pointer items-center gap-3 p-3 hover:bg-[var(--hover)]">
                {KIND_ICON[r.kind]} <span className="text-sm font-medium">{r.title}</span>
                <span className="ml-auto text-xs text-[var(--muted)]">{r.kind}</span>
              </Card>
            );
          if (r.type === "goal")
            return (
              <Link key={i} href="/goals">
                <Card className="flex cursor-pointer items-center gap-3 p-3 hover:bg-[var(--hover)]">
                  <Target size={16} /> <span className="text-sm">{r.title}</span>
                </Card>
              </Link>
            );
          if (r.type === "space")
            return (
              <Link key={i} href={`/spaces/${r.id}`}>
                <Card className="flex cursor-pointer items-center gap-3 p-3 hover:bg-[var(--hover)]">
                  {r.emoji} <span className="text-sm">{r.title}</span>
                </Card>
              </Link>
            );
          return (
            <Card key={i} className="p-3">
              <div className="font-mono text-xs">{r.path}</div>
              <div className="mt-1 text-sm text-[var(--muted)]">{r.snippet}</div>
            </Card>
          );
        })}
      </div>
    </Page>
  );
}

export function FeedPage() {
  const { data } = useQuery({ queryKey: ["feed"], queryFn: () => api("/feed"), refetchInterval: 30000 });
  const { open } = useArtifactViewer();
  const items = data?.items ?? [];
  return (
    <Page width="reading" title="Feed" subtitle="Check-ins, background work, things I made and goal progress.">
      <div className="space-y-3" data-testid="feed-list">
        {items.length === 0 && (
          <Empty icon="📰" title="Your feed is quiet" body="As I work in the background, check in, and make things for you, they show up here." />
        )}
        {items.map((it: any) => (
          <Card key={it.id} className="p-4" onClick={it.artifactId ? () => open(it.artifactId) : undefined}>
            <div className="mb-1 text-xs text-[var(--muted)]">
              {it.type === "checkin"
                ? "💬 Check-in"
                : it.type === "made"
                  ? `✨ Made ${it.kind === "html" ? "a page" : it.kind === "pdf" ? "a PDF" : it.kind === "image" ? "an image" : it.kind === "audio" ? "a podcast" : "a document"}`
                  : it.type === "background"
                    ? "⚙️ Background task finished"
                    : "🎯 Goal"}{" "}
              · {timeAgo(it.at)}
            </div>
            {it.type === "checkin" ? (
              <Markdown>{it.text}</Markdown>
            ) : (
              <div className="text-sm font-medium">
                {it.text}
                {it.type === "goal" ? ` · ${it.done}/${it.total} steps` : ""}
              </div>
            )}
            {it.type === "made" && it.kind === "image" && (
              <img src={`/api/artifacts/${it.artifactId}/raw`} alt="" className="mt-2 max-h-60 cursor-pointer rounded-xl" />
            )}
          </Card>
        ))}
      </div>
    </Page>
  );
}

export function LibraryPage() {
  const [kind, setKind] = useState("all");
  const { data } = useQuery({ queryKey: ["library", kind], queryFn: () => api(`/library${kind === "all" ? "" : `?kind=${kind}`}`) });
  const { open } = useArtifactViewer();
  const items = data?.items ?? [];
  return (
    <Page width="collection" title="Library" subtitle="Everything I've made for you.">
      <div className="mb-5 overflow-x-auto">
        <Segmented
          value={kind}
          onChange={setKind}
          options={[
            { value: "all", label: "All" },
            { value: "html", label: "Pages" },
            { value: "pdf", label: "PDFs" },
            { value: "markdown", label: "Docs" },
            { value: "image", label: "Images" },
            { value: "audio", label: "Audio" },
          ]}
        />
      </div>
      {items.length === 0 && <Empty icon="📚" title="Nothing here yet" body="Documents, pages, images and podcasts I make show up here." />}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" data-testid="library-grid">
        {items.map((a: any) => (
          <Card key={a.id} onClick={() => open(a.id)} className="cursor-pointer overflow-hidden hover:bg-[var(--hover)]">
            {a.kind === "image" ? (
              <img src={`/api/artifacts/${a.id}/raw`} alt="" className="h-36 w-full object-cover" />
            ) : (
              <div className="flex h-36 items-center justify-center bg-[var(--accent-soft)] text-4xl">
                {a.kind === "pdf" ? "📄" : a.kind === "audio" ? "🎧" : a.kind === "html" ? "🧩" : "📝"}
              </div>
            )}
            <div className="p-3">
              <div className="truncate text-sm font-medium">{a.title}</div>
              <div className="text-xs text-[var(--muted)]">{timeAgo(a.createdAt)}</div>
            </div>
          </Card>
        ))}
      </div>
    </Page>
  );
}
