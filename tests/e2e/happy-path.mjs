/**
 * Amuse happy-path E2E suite.
 * Usage: BASE_URL=http://localhost:5173 node tests/e2e/happy-path.mjs
 * Drives a real browser through every core flow and writes a JSON + screenshots report.
 * Run it against a fresh database, with the server started with AMUSE_E2E=1 and AMUSE_DAILY_LIMIT set
 * (see CONTRIBUTING.md). It uses real model calls, so it spends API credits.
 */
import { chromium } from "playwright-core";
import fs from "node:fs/promises";
import path from "node:path";

const BASE = (process.env.BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const OUT = process.env.E2E_OUT ?? "e2e-report";
const ONLY = process.env.STEPS ? new Set(process.env.STEPS.split(",")) : null;
const want = (id) => !ONLY || ONLY.has(id);

await fs.mkdir(OUT, { recursive: true });
const results = [];
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
  args: [
    "--no-sandbox",
    "--use-fake-ui-for-media-stream",
    "--use-fake-device-for-media-stream",
    "--autoplay-policy=document-user-activation-required",
    `--use-file-for-fake-audio-capture=${path.resolve(process.env.E2E_MIC_WAV ?? "tests/e2e/fixtures/what-is-two-plus-two.wav")}`,
  ],
});
const VIDEO = process.env.E2E_VIDEO === "1";
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 860 },
  ignoreHTTPSErrors: true,
  permissions: ["microphone"],
  ...(VIDEO ? { recordVideo: { dir: path.join(OUT, "raw-video"), size: { width: 1280, height: 860 } } } : {}),
});
const VIDEO_T0 = Date.now();
const page = await ctx.newPage();
page.setDefaultTimeout(30000);

async function api(p, method = "GET", body) {
  return page.evaluate(
    async ([p, method, body]) => {
      const r = await fetch("/api" + p, {
        method,
        credentials: "include",
        headers: body ? { "content-type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
      });
      const t = await r.text();
      try {
        return { status: r.status, json: JSON.parse(t) };
      } catch {
        return { status: r.status, text: t };
      }
    },
    [p, method, body],
  );
}

let CURRENT = "setup";
let SHOT_N = 0;
const SHOTS = process.env.E2E_SHOTS === "1";
/** Extra screenshots at key moments of a flow (typed / sent / working / result). */
async function snap(label) {
  if (!SHOTS) return;
  await fs.mkdir(path.join(OUT, "shots"), { recursive: true });
  const name = `${CURRENT}-${String(++SHOT_N).padStart(2, "0")}-${label}.png`;
  await page.screenshot({ path: path.join(OUT, "shots", name) }).catch(() => {});
}

async function step(id, title, fn) {
  if (!want(id)) return;
  CURRENT = id;
  SHOT_N = 0;
  const t0 = Date.now();
  try {
    const detail = await fn();
    await page.waitForTimeout(VIDEO ? 1200 : 0);
    await page.screenshot({ path: path.join(OUT, id + ".png") }).catch(() => {});
    results.push({
      id,
      title,
      ok: true,
      ms: Date.now() - t0,
      detail: detail ?? null,
      videoStart: (t0 - VIDEO_T0) / 1000,
      videoEnd: (Date.now() - VIDEO_T0) / 1000,
    });
    console.log("PASS", id, title);
  } catch (e) {
    await page.screenshot({ path: path.join(OUT, id + "-fail.png") }).catch(() => {});
    results.push({ id, title, ok: false, ms: Date.now() - t0, error: String(e?.message ?? e).slice(0, 500) });
    console.log("FAIL", id, title, e?.message);
  }
}

async function send(text) {
  await page.getByTestId("composer-input").fill(text);
  await snap("typed");
  await page.getByTestId("send").click();
  await page.waitForTimeout(SHOTS ? 900 : 0);
  await snap("sent");
}

async function waitIdle(timeout = 180000) {
  // wait for the run to end: stop button disappears
  await page.waitForTimeout(1500);
  if (SHOTS) {
    // capture the agent mid-task (status line + tool chips) a few seconds in
    await page.waitForTimeout(2500);
    if (await page.locator('[data-testid="stop"]').count()) await snap("working");
  }
  await page.waitForFunction(() => !document.querySelector('[data-testid="stop"]'), null, { timeout });
  if (SHOTS) {
    await page.waitForTimeout(800);
    await snap("result");
  }
}

async function lastAssistantText() {
  return page.locator('[data-testid="msg-assistant"]').last().innerText();
}

if (!want("F01")) {
  await page.goto(BASE + (process.env.START_PATH ?? "/"));
  await page.waitForTimeout(1500);
}

// F01 opens straight into onboarding: no account or sign-in on a local install
await step("F01", "Opens straight into onboarding", async () => {
  await page.goto(BASE + "/");
  if ((await api("/me")).json?.agent?.hatchedAt) {
    if (process.env.E2E_RESET !== "1") throw new Error("This database already has a hatched agent. Use a fresh database, or set E2E_RESET=1 to wipe it.");
    await api("/settings/reset", "POST", { confirm: "RESET" });
    await page.goto(BASE + "/");
  }
  await page.getByTestId("onb-start").waitFor();
});

// F02 hatching
await step("F02", "Agent hatching: name, look, personality", async () => {
  await page.getByTestId("onb-start").click();
  await snap("welcome");
  await page.getByTestId("onb-name-input").fill("Juniper");
  await snap("name");
  await page.getByTestId("onb-next").click();
  await page.getByRole("button", { name: "Moss" }).click();
  await page.getByText("Witty and playful").click();
  await snap("look-and-vibe");
  await page.getByTestId("onb-next").click();
  await page.getByTestId("onb-owner-name").fill("Sam");
  await page.getByText("Saving money").click();
  await snap("interests");
  await page.getByTestId("onb-hatch").click();
  await page.getByTestId("agent-header").waitFor();
  const me = await api("/me");
  if (me.json.agent.name !== "Juniper" || !me.json.agent.hatchedAt) throw new Error("agent not hatched");
  if (me.json.user.name !== "Sam") throw new Error("owner name not saved");
  const id = await api("/files?path=IDENTITY.md");
  if (!id.json.content.includes("Juniper")) throw new Error("IDENTITY.md not updated");
  return { identity: id.json.content };
});

// F03 main chat + streaming greeting (bootstrap)
await step("F03", "One long main chat with streaming replies", async () => {
  await waitIdle();
  await page.locator('[data-testid="msg-assistant"]').first().waitFor();
  await send("Hi! My name is Sam and I live in Portland, Oregon. I'm vegetarian.");
  await page.waitForTimeout(800);
  await send("Also I have a dog named Biscuit.");
  await waitIdle();
  const t = await lastAssistantText();
  if (t.length < 5) throw new Error("no reply");
  return { reply: t.slice(0, 300) };
});

// F15 memory
await step("F15", "Memory: remembers facts and can forget", async () => {
  const user = await api("/files?path=USER.md");
  const mem = (user.json.content ?? "") + ((await api("/files?path=MEMORY.md")).json.content ?? "");
  if (!/portland|vegetarian|biscuit/i.test(mem)) throw new Error("facts not saved: " + mem.slice(0, 200));
  await send("Please forget that I have a dog.");
  await waitIdle();
  const after = (await api("/files?path=USER.md")).json.content + (await api("/files?path=MEMORY.md")).json.content;
  if (/biscuit/i.test(after)) throw new Error("dog not forgotten");
  return { before: mem.slice(0, 300) };
});

// F05 status + F06 web research with sources
await step("F06", "Web research with sources", async () => {
  await send("Search the web: what are 3 highly rated vegetarian restaurants in Portland right now? Cite sources.");
  await page.locator('[data-testid="agent-status"][data-busy="1"]').waitFor({ timeout: 30000 });
  await waitIdle();
  const links = await page.locator('[data-testid="msg-assistant"]').last().locator("a").count();
  if (links < 1) throw new Error("no source links");
  return { links };
});

// F17 artifacts
await step("F17", "Artifacts: interactive page opens outside chat", async () => {
  await send("Make me an interactive packing checklist for a 3-day camping trip as an artifact page.");
  await waitIdle();
  await page.getByTestId("artifact-card").last().click();
  await page.getByTestId("artifact-viewer").waitFor();
  await snap("artifact-open");
  const fl = page.frameLocator('[data-testid="artifact-viewer"] iframe');
  await fl.locator("body").waitFor();
  const box = fl.locator('input[type="checkbox"]').first();
  await box.waitFor({ timeout: 15000 });
  const n = await fl.locator('input[type="checkbox"]').count();
  const before = await box.isChecked();
  await box.click();
  const after = await box.isChecked();
  if (before === after) throw new Error("artifact control did not respond");
  await snap("artifact-interaction");
  await page.getByLabel("Close", { exact: true }).first().click();
  return { checkboxes: n };
});

// F20 PDF
await step("F20", "Document/PDF creation", async () => {
  await send("Create a one-page PDF comparing 3 popular coffee bean origins (taste, acidity, price).");
  await waitIdle();
  const arts = await api("/artifacts");
  if (!arts.json.artifacts.some((a) => a.kind === "pdf")) throw new Error("no pdf");
});

// F19 image
await step("F19", "Image generation", async () => {
  await send("Generate an image of a cozy reading nook with a sleeping dog, watercolor style.");
  await waitIdle();
  const img = page.getByTestId("image-part").last();
  await img.waitFor();
  await page.waitForFunction(
    () => {
      const i = [...document.querySelectorAll('[data-testid="image-part"]')].pop();
      return i && i.complete && i.naturalWidth > 100;
    },
    null,
    { timeout: 30000 },
  );
  const w = await img.evaluate((i) => i.naturalWidth);
  return { naturalWidth: w };
});

// F13 goals
await step("F13", "Goals tab: goal → plan → progress", async () => {
  await send("I want to run a 10k in March. Set that up as a goal with a plan.");
  await waitIdle();
  await page.getByTestId("nav-goals").click();
  await page.getByTestId("goal-card").first().waitFor();
  await snap("goals");
  const before = (await api("/goals")).json.goals[0];
  await page.getByTestId("goal-card").first().locator("li button").first().click();
  await page.waitForTimeout(800);
  const after = (await api("/goals")).json.goals[0];
  if (after.plan.filter((s) => s.done).length <= before.plan.filter((s) => s.done).length) throw new Error("progress not tracked");
  await page.getByTestId("nav-chat").click();
  return { steps: after.plan.length };
});

// F30 + F11 reminders & upcoming
await step("F30", "Reminders scheduled and shown in Upcoming", async () => {
  await send("Remind me in 2 minutes to stretch.");
  await waitIdle();
  const up = await api("/upcoming");
  if (!up.json.upcoming.some((u) => /stretch/i.test(u.title + u.prompt))) throw new Error("no reminder");
  await page.getByTestId("agent-header").click();
  await page.getByTestId("see-all-scheduled").click();
  await snap("scheduled-tasks");
  await page.getByTestId("upcoming-list").waitFor();
  // panel stays open (persistent agent panel)
});

// F10 activity log
await step("F10", "Activity log (audit trail)", async () => {
  await page.getByTestId("agent-header").click();
  await page.getByTestId("activity-list").waitFor();
  const n = await page.getByTestId("activity-item").count();
  if (n < 3) throw new Error("activity too short");
  // panel stays open (persistent agent panel)
  return { entries: n };
});

// F16 system files
await step("F16", "System files readable and editable", async () => {
  await page.getByTestId("agent-header").click();
  await page.getByRole("button", { name: "Identity" }).click();
  await page.getByTestId("file-tile-SOUL.md").click();
  const ed = page.getByTestId("file-editor");
  await ed.waitFor();
  await snap("soul-editor");
  const v = await ed.inputValue();
  await ed.fill(v + "\nAlways sign off with a 🌲 emoji.");
  await page.getByTestId("file-save").click();
  await page.waitForTimeout(500);
  const soul = (await api("/files?path=SOUL.md")).json.content;
  if (!soul.includes("🌲")) throw new Error("edit not saved");
  // panel stays open (persistent agent panel)
});

// F08 approvals (force ask via 'always ask' web setting)
await step("F08", "Approval cards: allow once / site / deny", async () => {
  await api("/settings", "PATCH", { webDefault: "always" });
  await send("Open https://example.com and tell me its heading.");
  await page.getByTestId("approval-card").waitFor({ timeout: 90000 });
  await snap("approval-card");
  await page.getByTestId("approve-site").click();
  await waitIdle();
  const s = await api("/settings");
  if (!s.json.allowedSites.some((x) => x.host === "example.com")) throw new Error("site grant missing");
  await api("/settings", "PATCH", { webDefault: "some" });
});

// F09 permissions settings
await step("F09", "Permission settings", async () => {
  await page.goto(BASE + "/settings/permissions");
  await page.locator("main").getByText("Allowed websites").waitFor();
  await page.locator("main").getByText("example.com").first().waitFor();
});

// F22 connectors UI
await step("F22", "Connectors catalog and connect flow", async () => {
  await page.goto(BASE + "/settings/connectors");
  await page.getByText("Calendar (Google, Outlook, iCloud)").waitFor();
  await snap("connectors");
  const r = await api("/connectors/calendar", "POST", {
    fields: { feedUrl: "https://calendar.google.com/calendar/ical/en.usa%23holiday%40group.v.calendar.google.com/public/basic.ics" },
  });
  if (r.status !== 200) throw new Error("connect failed " + r.status);
  const c = await api("/connectors");
  if (!c.json.connected.some((x) => x.provider === "calendar")) throw new Error("not connected");
  await page.goto(BASE + "/");
  await page.getByTestId("composer-input").waitFor();
  await send("Check my connected calendar: what's the next event on it?");
  await waitIdle();
  const act = await api("/activity");
  if (!act.json.activity.some((a) => a.skill === "Calendar" && /calendar events/i.test(a.summary))) throw new Error("agent did not read the calendar");
  return { reply: (await lastAssistantText()).slice(0, 200) };
});

// F24 credential store
await step("F24", "Secure credentials store (secret never shown)", async () => {
  await api("/credentials", "POST", {
    label: "Demo API key",
    host: "httpbin.org",
    secret: "sk-demo-SECRET-123456",
    baseUrl: "https://httpbin.org",
    header: "X-Api-Key: {token}",
    confirmedHost: "httpbin.org",
  });
  const list = await api("/credentials");
  if (JSON.stringify(list.json).includes("SECRET")) throw new Error("secret leaked to client");
  await page.goto(BASE + "/");
  await waitIdle();
  const msgs = await api("/chats/" + (await api("/me")).json.mainChatId + "/messages");
  if (JSON.stringify(msgs.json).includes("sk-demo-SECRET")) throw new Error("secret visible in chat");
});

// F23 custom connector via api_request with surrogate swap
await step("F23", "Custom connector call with surrogate credentials", async () => {
  await send("Use my Demo API key custom connector to GET /headers and tell me if an X-Api-Key header was sent (don't reveal it).");
  // The first request with a newly saved key always asks.
  await page.getByTestId("approve-once").last().click({ timeout: 120000 });
  await waitIdle();
  const act = await api("/activity");
  if (!act.json.activity.some((a) => /httpbin|headers/i.test(a.summary))) throw new Error("no connector call");
});

// F18 spaces
await step("F18", "Spaces: build, pin, schedule, persist data", async () => {
  await page.getByTestId("nav-chat").click();
  await send("Build me a space: a simple gift tracker where I can add a person and a gift idea and check them off.");
  await waitIdle(240000);
  const sp = (await api("/spaces")).json.spaces;
  if (!sp.length) throw new Error("no space");
  await page.goto(BASE + "/spaces/" + sp[0].id);
  await page.getByTestId("space-frame").waitFor();
  await snap("space");
  await page.getByRole("button", { name: "Tab" }).click();
  await page.waitForTimeout(600);
  const after = (await api("/spaces")).json.spaces[0];
  if (after.placement !== "tab") throw new Error("placement not saved");
  const frame = () => page.frames().find((f) => f.url().includes("/spaces/") && f.url().includes("/raw"));
  await page.waitForFunction(() => true);
  for (let i = 0; i < 20 && !frame(); i++) await page.waitForTimeout(300);
  await frame().evaluate(() => {
    const d = window.amuse.getData() || {};
    d.__e2e = "persist-check";
    window.amuse.setData(d);
  });
  await page.waitForTimeout(1500);
  await page.reload();
  await page.getByTestId("space-frame").waitFor();
  for (let i = 0; i < 20 && !frame(); i++) await page.waitForTimeout(300);
  await page.waitForTimeout(800);
  const kept = await frame().evaluate(() => window.amuse.getData().__e2e);
  if (kept !== "persist-check") throw new Error("space data did not persist");
  return { space: sp[0].title, persisted: true };
});

// F14 ideas
await step("F14", "Ideas tab: personalised suggestions you can run", async () => {
  await page.getByTestId("nav-ideas").click();
  await page.getByTestId("more-ideas").click();
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="idea-card"]').length >= 3, null, { timeout: 90000 });
  await snap("ideas");
  const me = (await api("/me")).json;
  const before = (await api("/chats/" + me.mainChatId + "/messages")).json.messages.length;
  // "Do it" shows the idea's exact prompt in a confirm dialog first.
  page.once("dialog", (d) => d.accept());
  await page.getByTestId("idea-start").first().click();
  await page.getByTestId("composer-input").waitFor();
  await waitIdle(240000);
  const msgs = (await api("/chats/" + me.mainChatId + "/messages")).json.messages;
  const added = msgs.slice(before);
  if (!added.some((m) => m.role === "user") || !added.some((m) => m.role === "assistant" && m.content.length > 20))
    throw new Error("idea did not start a conversation");
  return { newMessages: added.length };
});

// F04 side chats
await step("F04", "Side chats with separate context", async () => {
  await page.getByTestId("new-side-chat").first().click();
  await page.waitForURL(/\/chats\/\d+/);
  await page.getByText("A fresh side chat").waitFor();
  await send("This is a side chat for planning a birthday party. Just say OK.");
  await waitIdle();
  const chats = (await api("/chats")).json.chats.filter((c) => c.kind === "side");
  if (!chats.length) throw new Error("no side chat");
  await send("Quick check: what's my name and which city do I live in?");
  await waitIdle();
  const t = await lastAssistantText();
  if (!/sam/i.test(t) || !/portland/i.test(t)) throw new Error("side chat lost shared memory: " + t.slice(0, 160));
  const sideId = Number(page.url().split("/chats/")[1]);
  const sideMsgs = (await api("/chats/" + sideId + "/messages")).json.messages;
  if (sideMsgs.some((m) => /camping|coffee bean/i.test(m.content) && m.role === "user")) throw new Error("side chat leaked main chat history");
  return { reply: t.slice(0, 160), sideMessages: sideMsgs.length };
});

// F26 builds own tools
await step("F26", "Builds its own tools (sandboxed code)", async () => {
  await send("Build yourself a reusable tool that splits a restaurant bill with tip among N people, then use it for $184 with 20% tip among 4.");
  await waitIdle();
  const files = (await api("/files")).json.files.map((f) => f.path);
  if (!files.some((p) => p.startsWith("skills/"))) throw new Error("no tool saved");
  const t = await lastAssistantText();
  if (!/55\.2/.test(t)) throw new Error("wrong answer: " + t.slice(0, 200));
});

// F27 subagents
await step("F27", "Subagents in parallel", async () => {
  await send("Use parallel subagents to look up the current population of Tokyo, Delhi and Shanghai, then summarize.");
  await waitIdle(240000);
  const act = await api("/activity");
  if (!act.json.activity.some((a) => a.skill === "Subagents")) throw new Error("no subagents");
});

// F07 browser
await step("F07", "Shared browser with live view and take control", async () => {
  await send("Use the browser to go to https://books.toscrape.com and tell me the title of the first book.");
  await page.getByTestId("browser-part").last().waitFor({ timeout: 90000 });
  const sawControls = await page
    .getByTestId("take-control")
    .last()
    .waitFor({ timeout: 60000 })
    .then(
      () => true,
      () => false,
    );
  await snap("browser-live");
  await waitIdle(240000);
  const shot = await page
    .getByTestId("browser-part")
    .last()
    .locator("img")
    .first()
    .evaluate((i) => i.naturalWidth)
    .catch(() => 0);
  if (shot < 300) throw new Error("no live browser screenshot");
  const t = await page
    .locator('[data-testid="msg-assistant"]')
    .filter({ has: page.getByTestId("browser-part") })
    .last()
    .innerText();
  if (t.length < 10) throw new Error("no result");
  return { takeControlShown: sawControls, screenshotWidth: shot, reply: t.slice(0, 160) };
});

// F21 podcast
await step("F21", "Podcast/audio generation", async () => {
  await send("Make me a 1-minute podcast about why octopuses are smart.");
  await page.getByTestId("audio-part").last().waitFor({ timeout: 240000 });
  await waitIdle();
  const arts = (await api("/artifacts")).json.artifacts;
  const pod = arts.find((a) => a.kind === "audio" || /^Podcast:/i.test(a.title));
  if (!pod) throw new Error("no podcast artifact");
  const full = (await api("/artifacts/" + pod.id)).json;
  const body = JSON.stringify(full);
  if (!/octop/i.test(body) || body.length < 800) throw new Error("podcast script missing");
  return { artifact: pod.kind, chars: body.length };
});

// F12 background + proactive
await step("F12", "Background work and proactive messages", async () => {
  // Wait for the stretch reminder scheduled in F30 (2 minutes) to fire. Polled from the test, since
  // waitForFunction doesn't await an async predicate.
  const me = (await api("/me")).json;
  let fired = false;
  for (let i = 0; i < 48 && !fired; i++) {
    const msgs = (await api("/chats/" + me.mainChatId + "/messages")).json.messages;
    fired = msgs.some((m) => m.proactive && /^⏰/.test(m.content) && /stretch/i.test(m.content));
    if (!fired) await page.waitForTimeout(5000);
  }
  if (!fired) throw new Error("reminder did not fire within 4 minutes");
  const n = await api("/notifications");
  if (!n.json.notifications.some((x) => /stretch/i.test(x.body))) throw new Error("no reminder notification");
});

// F05 live status
await step("F05", "Live status under avatar while working", async () => {
  await page.goto(BASE + "/");
  await send("Look up today's weather in Seattle.");
  await page.locator('[data-testid="agent-status"][data-busy="1"]').waitFor({ timeout: 30000 });
  const s = await page.getByTestId("agent-status").innerText();
  await waitIdle();
  return { status: s };
});

// F31 search
await step("F31", "Search across chats, artifacts and files", async () => {
  await page.getByTestId("nav-search").click();
  const viewport = page.viewportSize();
  try {
    for (const width of [390, 820, 1440]) {
      await page.setViewportSize({ width, height: viewport.height });
      const heading = await page.getByRole("heading", { name: "Search", exact: true }).boundingBox();
      const field = await page.getByTestId("search-input").boundingBox();
      if (!heading || !field || Math.abs(heading.x - field.x) > 1 || field.x + field.width > width)
        throw new Error(`Search title and field must align and fit at ${width}px`);
    }
  } finally {
    await page.setViewportSize(viewport);
  }
  await page.getByTestId("search-input").fill("Portland");
  await page.getByTestId("search-results").locator("> *").first().waitFor({ timeout: 15000 });
  return { results: await page.getByTestId("search-results").locator("> *").count() };
});

// F32 feed
await step("F32", "Feed of check-ins, background work and things made", async () => {
  await page.getByTestId("nav-feed").click();
  await page.getByTestId("feed-list").locator("> *").first().waitFor({ timeout: 15000 });
  return { items: await page.getByTestId("feed-list").locator("> *").count() };
});

// F33 library
await step("F33", "Library of everything made", async () => {
  await page.getByTestId("nav-library").click();
  await page.getByTestId("library-grid").locator("> *").first().waitFor({ timeout: 15000 });
  return { items: await page.getByTestId("library-grid").locator("> *").count() };
});

// F34 approvals tab
await step("F34", "Approvals tab with history", async () => {
  await page.getByTestId("nav-chat").click();
  await page.getByTestId("agent-header").click();
  await page.getByRole("button", { name: "Approvals" }).click();
  await page
    .getByTestId("approvals-tab")
    .getByText(/Allowed for site|Allowed once|Always allowed/)
    .first()
    .waitFor();
  // panel stays open (persistent agent panel)
});

// F35 identity tab
await step("F35", "Identity tab: name, look, vibe", async () => {
  await page.getByTestId("agent-header").click();
  await page.getByRole("button", { name: "Identity" }).click();
  await page.getByTestId("identity-tab").waitFor();
  const v = await page.getByTestId("identity-name").innerText();
  // panel stays open (persistent agent panel)
  if (!v) throw new Error("no name");
  return { name: v };
});

// F36 heartbeat
await step("F36", "Heartbeat scheduled every 30 minutes", async () => {
  const up = await api("/upcoming");
  const hb = up.json.upcoming.find((u) => u.kind === "heartbeat");
  if (!hb || hb.intervalMinutes !== 30) throw new Error("no heartbeat");
  const r = await api("/test/heartbeat", "POST", {});
  if (r.status !== 200 || !r.json.run || r.json.run.status !== "done")
    throw new Error("heartbeat run did not complete: " + JSON.stringify(r.json).slice(0, 200));
  const files = (await api("/files?path=HEARTBEAT.md")).json;
  if (!files.content) throw new Error("no HEARTBEAT.md");
  return { run: r.json.run, nextRunAt: r.json.nextRunAt, notifications: r.json.recentNotifications };
});

// F25 voice mode
await step("F25", "Voice mode with animated avatar", async () => {
  // Real audio: the fake microphone plays a recorded spoken question (tests/e2e/fixtures/what-is-two-plus-two.wav).
  const me = (await api("/me")).json;
  const before = (await api("/chats/" + me.mainChatId + "/messages")).json.messages.length;
  const calls = [];
  const onResp = (r) => {
    if (/\/api\/voice\/(transcribe|speak)/.test(r.url())) calls.push(r.url().split("/api/")[1] + ":" + r.status());
  };
  page.on("response", onResp);
  // Real browser sound policy (no autoplay override): audio must be unlocked by the Call tap itself.
  // Real recorded audio exercises the server speech path (headless Chrome has no on-device recogniser).
  await page.evaluate(() => {
    localStorage.setItem("amuse.voiceEngine", "natural");
    window.__amuseSpoken = [];
    window.__amuseVoiceStats = undefined;
    window.__amusePhases = [];
  });
  await page.getByTestId("call").click();
  await page.getByTestId("voice-overlay").waitFor();
  await page.evaluate(() => {
    const el = document.querySelector('[data-testid="voice-overlay"]');
    const rec = () => {
      const p = el.getAttribute("data-phase");
      if (window.__amusePhases.at(-1) !== p) window.__amusePhases.push(p);
    };
    rec();
    new MutationObserver(rec).observe(el, { attributes: true, attributeFilter: ["data-phase"] });
  });
  await page.locator('[data-testid="voice-overlay"][data-phase="listening"]').waitFor({ timeout: 30000 });
  await snap("call-listening");
  await page.locator('[data-testid="voice-overlay"][data-phase="speaking"]').waitFor({ timeout: 150000 });
  await snap("call-speaking");
  // After speaking, the call must go back to listening on its own.
  await page.locator('[data-testid="voice-overlay"][data-phase="listening"]').waitFor({ timeout: 60000 });
  const spoken = await page.evaluate(() => window.__amuseSpoken.join(" | "));
  const stats = await page.evaluate(() => window.__amuseVoiceStats);
  const phases = await page.evaluate(() => window.__amusePhases.join(">"));
  await page.getByLabel("End voice mode").click();
  if (!stats || stats.ctxState !== "running" || stats.blocked) throw new Error("audio was blocked by the browser: " + JSON.stringify(stats));
  if (!(stats.chunksPlayed > 0 && stats.secondsPlayed > 0.3 && stats.peakOut > 3)) throw new Error("no audible reply played: " + JSON.stringify(stats));
  for (const p of ["listening", "transcribing", "thinking", "speaking"]) if (!phases.includes(p)) throw new Error("call never showed '" + p + "': " + phases);
  page.off("response", onResp);
  const added = (await api("/chats/" + me.mainChatId + "/messages")).json.messages.slice(before);
  const heard = added.find((m) => m.role === "user")?.content ?? "";
  if (!/(two|2) ?(plus|\+) ?(two|2)/i.test(heard)) throw new Error("speech not transcribed correctly: " + heard);
  if (!/four|\b4\b/i.test(spoken)) throw new Error("voice reply wrong: " + spoken.slice(0, 120));
  if (!calls.some((c) => c === "voice/transcribe:200") || !calls.some((c) => c === "voice/speak:200"))
    throw new Error("server speech not used: " + calls.join(","));
  return { heard, spoken: spoken.slice(0, 120), calls, phases, audio: stats };
});

// F28 usage
await step("F28", "Usage metered and daily limit enforced", async () => {
  await page.goto(BASE + "/settings/usage");
  await page.getByText("Today's usage").waitFor();
  const u = await api("/usage");
  if (!(u.json.usage.used > 0)) throw new Error("usage not metered");
  if (!u.json.usage.limit) throw new Error("Start the server with AMUSE_DAILY_LIMIT set to test the limit");
  const saved = u.json.usage.used;
  await api("/test/usage", "POST", { fill: true });
  await page.goto(BASE + "/");
  await page.getByTestId("composer-input").waitFor();
  await send("Tell me a fun fact about otters.");
  let blocked = false;
  for (let i = 0; i < 20 && !blocked; i++) {
    await page.waitForTimeout(1000);
    const me = (await api("/me")).json;
    const msgs = (await api("/chats/" + me.mainChatId + "/messages")).json.messages;
    const last = msgs[msgs.length - 1];
    blocked = last.role === "assistant" && (last.parts || []).some((p) => p.type === "limit");
  }
  await api("/test/usage", "POST", { units: saved });
  if (!blocked) throw new Error("usage cap did not block the run");
  return { usedBefore: saved, capEnforced: true };
});

// F29 data controls & reset
await step("F29", "Data controls & reset", async () => {
  await page.goto(BASE + "/settings/data");
  await page.getByText("Data controls").waitFor();
  const r = await api("/settings/reset", "POST", { confirm: "RESET" });
  if (r.status !== 200) throw new Error("reset failed");
  const me = await api("/me");
  if (me.json.agent.hatchedAt) throw new Error("not reset");
});

const videoPath = VIDEO ? await page.video()?.path() : null;
await ctx.close();
await browser.close();
if (videoPath) {
  const batch = path.join(OUT, "video", `batch-${Date.now()}.webm`);
  await fs.mkdir(path.dirname(batch), { recursive: true });
  await fs.rename(videoPath, batch);
  for (const r of results) r.video = batch;
}
const passed = results.filter((r) => r.ok).length;
let prev = [];
try {
  prev = JSON.parse(await fs.readFile(path.join(OUT, "report.json"), "utf8")).results ?? [];
} catch {}
const merged = [...prev.filter((p) => !results.some((r) => r.id === p.id)), ...results];
const report = { base: BASE, at: new Date().toISOString(), passed: merged.filter((r) => r.ok).length, total: merged.length, results: merged };
await fs.writeFile(path.join(OUT, "report.json"), JSON.stringify(report, null, 2));
console.log(`\n${passed}/${results.length} passed`);
process.exit(passed === results.length ? 0 : 1);
