import { useState } from "react";
import { Link, useRoute } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, KeyRound, Loader2, Trash2 } from "lucide-react";
import { api, del, patch, post } from "../lib/api";
import type { Me } from "../lib/types";
import { AgentAvatar, AvatarPicker, portraitName } from "../components/Creature";
import { m } from "framer-motion";
import { reveal } from "../components/Motion";
import { Button, Card, Input, Page, Segmented, Toggle, cx } from "../components/ui";
import { deviceVoiceAvailable, setVoiceEngine, voiceEngine, type VoiceEngine } from "../lib/speech";

function Section({ title, children, desc }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <Card className="mb-5 p-5">
      <div className="font-semibold">{title}</div>
      {desc && <div className="mb-3 text-sm text-[var(--muted)]">{desc}</div>}
      <div className="mt-2">{children}</div>
    </Card>
  );
}

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] py-3 last:border-0">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {desc && <div className="text-xs text-[var(--muted)]">{desc}</div>}
      </div>
      {children}
    </div>
  );
}

function AgentSettings({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [name, setName] = useState(me.agent.name ?? "");
  const [vibe, setVibe] = useState(me.agent.vibe ?? "");
  const save = async (body: any) => (await patch("/agent", body), qc.invalidateQueries({ queryKey: ["me"] }));
  return (
    <>
      <Section title="Your agent">
        <div className="mb-4 flex items-center gap-3">
          <m.div key={me.agent.avatarUrl} initial={{ opacity: 0.6, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
            <AgentAvatar avatarUrl={me.agent.avatarUrl} size={56} />
          </m.div>
          <div>
            <div className="text-xs text-muted">Current look</div>
            <div className="font-medium text-ink">{portraitName(me.agent.avatarUrl)}</div>
          </div>
        </div>
        <div className="mb-5 max-w-lg">
          <AvatarPicker value={me.agent.avatarUrl} onChange={(avatarUrl) => save({ avatarUrl })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Name
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name && save({ name })} className="mt-1" />
          </label>
          <label className="text-sm">
            Vibe
            <Input value={vibe} onChange={(e) => setVibe(e.target.value)} onBlur={() => save({ vibe })} className="mt-1" />
          </label>
        </div>
      </Section>
      <Section title="Proactivity" desc="How often your agent messages you without being asked.">
        <Segmented
          value={me.agent.proactivity as any}
          onChange={(v) => save({ proactivity: v })}
          options={[
            { value: "off", label: "Off" },
            { value: "low", label: "Low" },
            { value: "normal", label: "Normal" },
            { value: "high", label: "High" },
          ]}
        />
      </Section>
    </>
  );
}

function ConnectorsSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["connectors"], queryFn: () => api("/connectors") });
  const [openId, setOpenId] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [access, setAccess] = useState("read");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["connectors"] });
  const connected = data?.connected ?? [];
  return (
    <Section title="Connectors" desc="Connect the apps you use. You choose what your agent can see and do.">
      {(data?.catalog ?? []).map((c: any) => {
        const conn = connected.find((x: any) => x.provider === c.id);
        return (
          <div key={c.id} className="border-b border-[var(--line)] py-3 last:border-0">
            <div className="flex items-center gap-3">
              <div className="text-xl">{c.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="text-xs text-[var(--muted)]">{c.description}</div>
              </div>
              {conn ? (
                <Button size="sm" variant="ghost" onClick={async () => (await del(`/connectors/${c.id}`), refresh())}>
                  Disconnect
                </Button>
              ) : (
                <Button size="sm" variant="soft" onClick={() => (setOpenId(openId === c.id ? null : c.id), setFields({}), setErr(""))}>
                  Connect
                </Button>
              )}
            </div>
            {conn && (
              <div className="ml-9 mt-2 flex flex-wrap items-center gap-3 text-xs">
                {c.supportsWrite && (
                  <Segmented
                    value={conn.access}
                    onChange={async (v) => (await patch(`/connectors/${c.id}`, { access: v }), refresh())}
                    options={[
                      { value: "read", label: "Read only" },
                      { value: "readwrite", label: "Read & act" },
                    ]}
                  />
                )}
                <Segmented
                  value={conn.approvalMode}
                  onChange={async (v) => (await patch(`/connectors/${c.id}`, { approvalMode: v }), refresh())}
                  options={[
                    { value: "some", label: "Ask for some actions" },
                    { value: "always", label: "Always ask" },
                  ]}
                />
              </div>
            )}
            {openId === c.id && !conn && (
              <div className="ml-9 mt-3 space-y-2">
                <p className="text-xs text-[var(--muted)]">{c.setupHelp}</p>
                {c.fields.map((f: any) => (
                  <Input
                    key={f.key}
                    type={f.secret ? "password" : "text"}
                    placeholder={f.placeholder ?? f.label}
                    aria-label={f.label}
                    value={fields[f.key] ?? ""}
                    onChange={(e) => setFields({ ...fields, [f.key]: e.target.value })}
                  />
                ))}
                {c.supportsWrite && (
                  <select
                    value={access}
                    onChange={(e) => setAccess(e.target.value)}
                    className="h-10 w-full rounded-xl border border-[var(--line)] bg-[var(--card)] px-2 text-sm"
                  >
                    <option value="read">Read only</option>
                    <option value="readwrite">Read and take actions (with approval)</option>
                  </select>
                )}
                {err && <div className="text-xs text-[#B4373C]">{err}</div>}
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    setErr("");
                    try {
                      await post(`/connectors/${c.id}`, { fields, access });
                      setOpenId(null);
                      refresh();
                    } catch (e: any) {
                      setErr(e.message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy && <Loader2 size={12} className="animate-spin" />} Save connection
                </Button>
              </div>
            )}
          </div>
        );
      })}
      {connected
        .filter((c: any) => c.custom)
        .map((c: any) => (
          <div key={c.provider} className="flex items-center gap-3 border-t border-[var(--line)] py-3">
            <div className="text-xl">🧩</div>
            <div className="flex-1 text-sm">
              <div className="font-medium">{c.displayName}</div>
              <div className="text-xs text-[var(--muted)]">Custom connector · {c.config?.baseUrl}</div>
            </div>
            <Button size="sm" variant="ghost" onClick={async () => (await del(`/connectors/${c.provider}`), refresh())}>
              Remove
            </Button>
          </div>
        ))}
      <p className="mt-3 text-xs text-[var(--muted)]">
        Need something else? Ask your agent to "connect to" any service with an API and it'll build a custom connector.
      </p>
    </Section>
  );
}

function PermissionsSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  const s = data?.settings;
  const save = async (body: any) => (await patch("/settings", body), qc.invalidateQueries({ queryKey: ["settings"] }));
  if (!s) return null;
  return (
    <>
      <Section title="Permissions" desc="When your agent should check with you first.">
        <Row
          label="Connectors"
          desc={s.connectorDefault === "some" ? "Asks before changes, and the first time a saved key is used" : "Asks before every connector action"}
        >
          <Segmented
            value={s.connectorDefault}
            onChange={(v) => save({ connectorDefault: v })}
            options={[
              { value: "some", label: "Ask for some" },
              { value: "always", label: "Always ask" },
            ]}
          />
        </Row>
        <Row
          label="Web access"
          desc={
            s.webDefault === "some"
              ? "Asks before forms, payments, and visiting sites you didn't mention or trust."
              : "Asks before visiting any website, plus everything above"
          }
        >
          <Segmented
            value={s.webDefault}
            onChange={(v) => save({ webDefault: v })}
            options={[
              { value: "some", label: "Ask for some" },
              { value: "always", label: "Always ask" },
            ]}
          />
        </Row>
      </Section>
      <Section title="Allowed websites">
        {(data.allowedSites ?? []).length === 0 && (
          <div className="text-sm text-[var(--muted)]">None yet. When you choose "Allow for this site", it shows up here.</div>
        )}
        {(data.allowedSites ?? []).map((w: any) => (
          <Row key={w.id} label={w.host}>
            <Button size="sm" variant="ghost" onClick={async () => (await del(`/settings/sites/${w.id}`), qc.invalidateQueries({ queryKey: ["settings"] }))}>
              Revoke
            </Button>
          </Row>
        ))}
      </Section>
      <Section title="Always allowed actions">
        {(data.grants ?? []).length === 0 && <div className="text-sm text-[var(--muted)]">None.</div>}
        {(data.grants ?? []).map((g: any) => (
          <Row key={g.id} label={`${g.toolName} · ${g.actionClass}`} desc={g.target ?? undefined}>
            <Button size="sm" variant="ghost" onClick={async () => (await del(`/settings/grants/${g.id}`), qc.invalidateQueries({ queryKey: ["settings"] }))}>
              Revoke
            </Button>
          </Row>
        ))}
      </Section>
    </>
  );
}

function CredentialsSettings() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["credentials"], queryFn: () => api("/credentials") });
  return (
    <Section title="Secure credential store" desc="Passwords and API keys you've shared. Encrypted; your agent uses them without ever seeing them.">
      {(data?.credentials ?? []).length === 0 && <div className="text-sm text-[var(--muted)]">Nothing stored.</div>}
      {(data?.credentials ?? []).map((c: any) => (
        <Row key={c.id} label={c.label} desc={[c.kind, c.host, c.username].filter(Boolean).join(" · ")}>
          <Button size="sm" variant="ghost" onClick={async () => (await del(`/credentials/${c.id}`), qc.invalidateQueries({ queryKey: ["credentials"] }))}>
            <Trash2 size={14} />
          </Button>
        </Row>
      ))}
    </Section>
  );
}

function UsageSettings() {
  const { data } = useQuery({ queryKey: ["usage"], queryFn: () => api("/usage") });
  if (!data) return null;
  const u = data.usage;
  return (
    <>
      <Section
        title="Today's usage"
        desc={
          u.limit
            ? `Resets ${new Date(u.resetsAt).toLocaleString()}`
            : "Units approximate model cost: about 1 per 1k input tokens. Set AMUSE_DAILY_LIMIT to cap a day's spend."
        }
      >
        {u.limit && (
          <div className="mb-2 h-3 overflow-hidden rounded-full bg-[var(--line)]">
            <div className="h-full bg-[var(--accent)]" style={{ width: `${u.percent}%` }} />
          </div>
        )}
        <div className="text-sm text-[var(--muted)]">{u.limit ? `${u.used} of ${u.limit} units used today` : `${u.used} units used today`}</div>
      </Section>
      {data.history?.length > 0 && (
        <Section title="Last 14 days">
          <div className="space-y-1 text-sm">
            {data.history.map((h: any) => (
              <div key={h.day} className="flex justify-between border-b border-[var(--line)] py-1.5">
                <span>{h.day}</span>
                <span className="text-[var(--muted)]">
                  {h.units} units · {Math.round((h.tokensIn + h.tokensOut) / 1000)}k tokens{h.images ? ` · ${h.images} images` : ""}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}

function DataSettings({ me }: { me: Me }) {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["settings"], queryFn: () => api("/settings") });
  const [confirm, setConfirm] = useState("");
  const s = data?.settings;
  if (!s) return null;
  const save = async (body: any) => (await patch("/settings", body), qc.invalidateQueries({ queryKey: ["settings"] }));
  return (
    <>
      <Section title="Data controls">
        <Row label="Notifications" desc="Proactive messages and reminders">
          <Toggle checked={s.notifications} onChange={(v) => save({ notifications: v })} label="Notifications" />
        </Row>
        <CallVoiceRow />
        <Row label="Natural voice">
          <select
            value={s.voice}
            onChange={(e) => save({ voice: e.target.value })}
            className="h-9 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-sm"
          >
            {["alloy", "nova", "shimmer", "echo", "onyx", "fable", "sage", "coral"].map((v) => (
              <option key={v}>{v}</option>
            ))}
          </select>
        </Row>
      </Section>
      <Section title="Reset" desc="Permanently deletes all information, chat history, files, spaces and active tasks. This can't be undone.">
        <div className="flex gap-2">
          <Input value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Type RESET to confirm" />
          <Button
            variant="danger"
            disabled={confirm !== "RESET"}
            onClick={async () => {
              await post("/settings/reset", { confirm });
              location.href = "/";
            }}
          >
            Reset {me.agent.name ?? "agent"}
          </Button>
        </div>
      </Section>
    </>
  );
}

const TABS = [
  { id: "agent", label: "Agent" },
  { id: "connectors", label: "Connectors" },
  { id: "permissions", label: "Permissions" },
  { id: "credentials", label: "Credentials", icon: <KeyRound size={14} /> },
  { id: "usage", label: "Usage" },
  { id: "data", label: "Data" },
];

export function SettingsPage({ me }: { me: Me }) {
  const [, params] = useRoute("/settings/:tab");
  const tab = params?.tab ?? "agent";
  return (
    <Page width="collection" title="Settings">
      <div className="flex min-w-0 flex-col gap-6 md:flex-row">
        <nav className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col">
          {TABS.map((t) => (
            <Link
              key={t.id}
              href={`/settings/${t.id}`}
              className={cx(
                "flex items-center justify-between whitespace-nowrap rounded-xl px-3 py-2 text-sm",
                tab === t.id ? "bg-[var(--card)] font-medium" : "text-[var(--muted)] hover:bg-[var(--hover)]",
              )}
            >
              {t.label} <ChevronRight size={14} className="hidden md:block" />
            </Link>
          ))}
        </nav>
        <m.div key={tab} {...reveal} className="min-w-0 flex-1">
          {tab === "agent" && <AgentSettings me={me} />}
          {tab === "connectors" && <ConnectorsSettings />}
          {tab === "permissions" && <PermissionsSettings />}
          {tab === "credentials" && <CredentialsSettings />}
          {tab === "usage" && <UsageSettings />}
          {tab === "data" && <DataSettings me={me} />}
        </m.div>
      </div>
    </Page>
  );
}

function CallVoiceRow() {
  const [engine, setEngine] = useState(voiceEngine());
  return (
    <Row
      label="Call voice"
      desc={
        engine === "device"
          ? "Your browser's built-in voice. Answers start instantly."
          : "Amuse's own natural voice. Sounds richer but takes a few seconds per reply."
      }
    >
      <select
        value={engine}
        onChange={(e) => (setVoiceEngine(e.target.value as VoiceEngine), setEngine(e.target.value as VoiceEngine))}
        className="h-9 rounded-full border border-[var(--line)] bg-[var(--card)] px-3 text-sm"
        data-testid="call-voice-engine"
      >
        {deviceVoiceAvailable() && <option value="device">Instant</option>}
        <option value="natural">Natural (slower)</option>
      </select>
    </Row>
  );
}
