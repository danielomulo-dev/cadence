import { useState, useRef, useEffect } from "react";
import {
  Sparkles, Calendar as CalIcon, LayoutGrid, List, Download, RefreshCw,
  Copy, X, Check, Plus, Minus, ChevronRight, Loader2, Wand2, AlertTriangle,
  Target, Megaphone, Save, FolderOpen, Trash2, Clock, FilePlus
} from "lucide-react";
import { loadStore, saveStore } from "./storage.js";

/* ------------------------------------------------------------------ */
/*  CADENCE — Monthly Campaign Content Studio                          */
/*  Define a client brief → Claude drafts a full month of content.     */
/* ------------------------------------------------------------------ */

const PLATFORMS = [
  { id: "instagram", label: "Instagram", short: "IG", color: "#D6456A" },
  { id: "tiktok",    label: "TikTok",    short: "TT", color: "#10A39B" },
  { id: "linkedin",  label: "LinkedIn",  short: "IN", color: "#2B5EAA" },
  { id: "x",         label: "X",         short: "X",  color: "#1A1712" },
  { id: "facebook",  label: "Facebook",  short: "FB", color: "#3D6DCC" },
];

const OBJECTIVES = [
  "Brand Awareness", "Engagement & Community", "Lead Generation",
  "Product Launch", "Sales / Promotion", "Education / Authority",
];

const VOICES = [
  "Bold", "Playful", "Premium", "Minimal", "Warm",
  "Witty", "Authoritative", "Inspirational", "Conversational",
];

const PILLAR_COLORS = ["#FF4D23", "#C99A2E", "#5E6E50", "#2B5EAA", "#9B4DC0", "#0E8C7E"];

const platformById = (id) => PLATFORMS.find((p) => p.id === id) || PLATFORMS[0];

/* ---------- date helpers ---------- */
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const nextMonday = () => {
  const d = new Date(); d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = (day === 1) ? 0 : ((8 - day) % 7) || 7;
  return addDays(d, diff);
};
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const fmtShort = (d) => `${DOW[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`;
const fmtLong = (d) => `${DOW[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;

/* evenly spread N posts across a 7-day week → array of day offsets */
const spread = (n) => {
  const out = [];
  for (let i = 0; i < n; i++) out.push(Math.round((i * 7) / n) % 7);
  return [...new Set(out)].sort((a, b) => a - b);
};

/* ---------- robust JSON extraction ---------- */
function parseLoose(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const aS = t.indexOf("["), aE = t.lastIndexOf("]");
  if (aS !== -1 && aE !== -1 && aE > aS) { try { return JSON.parse(t.slice(aS, aE + 1)); } catch (e) {} }
  const oS = t.indexOf("{"), oE = t.lastIndexOf("}");
  if (oS !== -1 && oE !== -1 && oE > oS) { try { return JSON.parse(t.slice(oS, oE + 1)); } catch (e) {} }
  throw new Error("Could not parse model output.");
}

/* ---------- model providers ---------- */
async function callAnthropic(cfg, system, user) {
  // Browsers can't call api.anthropic.com directly (CORS). cfg.proxy must point
  // to your own endpoint that forwards to Anthropic with the key server-side
  // and returns the standard Anthropic response shape.
  if (!cfg.proxy) throw new Error("Claude needs a proxy URL on a hosted site. Add one in Engine settings, or use OpenAI / Gemini.");
  const res = await fetch(cfg.proxy, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude proxy error ${res.status}`);
  const data = await res.json();
  return (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
}

async function callOpenAI(cfg, system, user) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.key}` },
    body: JSON.stringify({
      model: cfg.model || "gpt-4o-mini",
      max_tokens: 1200,
      temperature: 0.85,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) {
    let m = `OpenAI API error ${res.status}`;
    try { const e = await res.json(); if (e.error && e.error.message) m = e.error.message; } catch (e) {}
    throw new Error(m);
  }
  const data = await res.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || "";
}

async function callGemini(cfg, system, user) {
  const model = cfg.model || "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(cfg.key)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { maxOutputTokens: 1400, temperature: 0.85, responseMimeType: "application/json" },
    }),
  });
  if (!res.ok) {
    let m = `Gemini API error ${res.status}`;
    try { const e = await res.json(); if (e.error && e.error.message) m = e.error.message; } catch (e) {}
    throw new Error(m);
  }
  const data = await res.json();
  const parts = (data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map((p) => p.text || "").join("");
}

/* ================================================================== */

export default function Cadence() {
  const bootRef = useRef(undefined);
  if (bootRef.current === undefined) bootRef.current = loadStore();
  const boot = bootRef.current;
  const bootEngine = boot.engine || {};
  const bootWork = boot.work || {};

  const [brief, setBrief] = useState(boot.brief || {
    brand: "", industry: "", objective: OBJECTIVES[0],
    voices: ["Bold", "Premium"], audience: "", notes: "",
    platforms: ["instagram", "linkedin"], perWeek: 3, start: iso(nextMonday()),
  });

  const [provider, setProvider] = useState(bootEngine.provider || "gemini");
  const [keys, setKeys] = useState({ openai: "", gemini: "", anthropicProxy: "", ...(boot.keys || {}) });
  const [models, setModels] = useState(bootEngine.models || { openai: "gpt-4o-mini", gemini: "gemini-2.5-flash" });
  const [rememberKeys, setRememberKeys] = useState(!!bootEngine.rememberKeys);
  const [keyStatus, setKeyStatus] = useState(null); // null | testing | ok | bad

  const [strategy, setStrategy] = useState(bootWork.strategy || null);
  const [posts, setPosts] = useState(bootWork.posts || []);
  const [campaigns, setCampaigns] = useState(boot.campaigns || []);
  const [libOpen, setLibOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [phase, setPhase] = useState("idle"); // idle | strategy | posts | done
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);
  const [view, setView] = useState("calendar");
  const [fPlat, setFPlat] = useState("all");
  const [fPillar, setFPillar] = useState("all");
  const [selected, setSelected] = useState(null);
  const [regenId, setRegenId] = useState(null);
  const [toast, setToast] = useState(null);
  const [briefOpen, setBriefOpen] = useState(true);

  const busy = phase === "strategy" || phase === "posts";
  const toastT = useRef(null);
  const flash = (m) => {
    setToast(m); clearTimeout(toastT.current);
    toastT.current = setTimeout(() => setToast(null), 1800);
  };

  const set = (k, v) => setBrief((b) => ({ ...b, [k]: v }));
  const toggleArr = (k, v) =>
    setBrief((b) => ({ ...b, [k]: b[k].includes(v) ? b[k].filter((x) => x !== v) : [...b[k], v] }));

  /* ---------- persistence (autosave) ---------- */
  useEffect(() => {
    const persistKeys = { anthropicProxy: keys.anthropicProxy || "" };
    if (rememberKeys) { persistKeys.openai = keys.openai; persistKeys.gemini = keys.gemini; }
    saveStore({
      brief,
      engine: { provider, models, rememberKeys },
      keys: persistKeys,
      work: { strategy, posts },
      campaigns,
    });
  }, [brief, provider, models, rememberKeys, keys, strategy, posts, campaigns]);

  /* ---------- engine router ---------- */
  async function callModel(system, user) {
    if (provider === "openai") {
      if (!keys.openai.trim()) throw new Error("Add your OpenAI API key in Engine settings.");
      return callOpenAI({ key: keys.openai.trim(), model: models.openai }, system, user);
    }
    if (provider === "gemini") {
      if (!keys.gemini.trim()) throw new Error("Add your Gemini API key in Engine settings.");
      return callGemini({ key: keys.gemini.trim(), model: models.gemini }, system, user);
    }
    if (!keys.anthropicProxy.trim())
      throw new Error("Claude needs a proxy URL on a hosted site (browsers can't reach the Anthropic API directly). Add one in Engine settings, or switch to OpenAI / Gemini.");
    return callAnthropic({ proxy: keys.anthropicProxy.trim() }, system, user);
  }

  async function verifyKey() {
    setKeyStatus("testing"); setError(null);
    try {
      await callModel("You are a connection test. Reply with only the word OK.", "Reply with: OK");
      setKeyStatus("ok");
    } catch (e) {
      setKeyStatus("bad");
      setError(e.message || "Connection failed.");
    }
  }

  /* ---------- build the empty schedule (date + platform + pillar slots) ---------- */
  function buildSlots(pillars) {
    const start = new Date(brief.start + "T00:00:00");
    const offs = spread(brief.perWeek);
    const slots = [];
    brief.platforms.forEach((pid) => {
      for (let w = 0; w < 4; w++) {
        offs.forEach((o) => {
          slots.push({ date: addDays(start, w * 7 + o), platform: pid, week: w });
        });
      }
    });
    slots.sort((a, b) => a.date - b.date);
    slots.forEach((s, i) => {
      s.id = `p${i}-${s.platform}`;
      s.pillar = pillars[i % pillars.length].name;
    });
    return slots;
  }

  /* ---------- generation ---------- */
  async function generate() {
    if (!brief.brand.trim() || brief.platforms.length === 0) return;
    setError(null); setPosts([]); setStrategy(null); setSelected(null);
    setProgress({ done: 0, total: 0 });

    try {
      /* 1) strategy */
      setPhase("strategy");
      const sSys = "You are a sharp senior brand strategist at a leading advertising agency. You think in clear campaign architecture. Reply with ONLY valid JSON, no markdown, no commentary.";
      const sUser =
`Build a one-month social campaign strategy for this client.

Brand: ${brief.brand}
Industry: ${brief.industry || "n/a"}
Primary objective: ${brief.objective}
Brand voice: ${brief.voices.join(", ") || "neutral"}
Target audience: ${brief.audience || "general"}
Key messages / product notes: ${brief.notes || "n/a"}
Platforms: ${brief.platforms.map((p) => platformById(p).label).join(", ")}

Return ONLY this JSON:
{"theme":"a punchy monthly campaign theme (max 6 words)","bigIdea":"1-2 sentence creative concept","audienceInsight":"1 sentence consumer insight","pillars":[{"name":"short pillar name (1-3 words)","angle":"one line on what content this pillar produces"}]}
Provide exactly 4 content pillars.`;
      const sRaw = await callModel(sSys, sUser);
      const sJson = parseLoose(sRaw);
      const pillars = (sJson.pillars || []).slice(0, 6).map((p, i) => ({
        ...p, color: PILLAR_COLORS[i % PILLAR_COLORS.length],
      }));
      const strat = { ...sJson, pillars };
      setStrategy(strat);

      /* 2) posts in batches */
      setPhase("posts");
      const slots = buildSlots(pillars);
      setProgress({ done: 0, total: slots.length });
      const BATCH = 4;
      const cSys = "You are an elite social copywriter at a top advertising agency. You write scroll-stopping, on-brand, ready-to-publish content tailored to each platform's norms. Reply with ONLY valid JSON array, no markdown, no commentary.";

      let acc = [];
      for (let i = 0; i < slots.length; i += BATCH) {
        const batch = slots.slice(i, i + BATCH);
        const list = batch.map((s, k) =>
          `${k + 1}. platform=${platformById(s.platform).label}; date=${fmtShort(s.date)}; pillar="${s.pillar}"`
        ).join("\n");
        const cUser =
`Campaign theme: "${strat.theme}". Big idea: ${strat.bigIdea}
Brand: ${brief.brand} | Voice: ${brief.voices.join(", ")} | Objective: ${brief.objective}
Audience: ${brief.audience || "general"} | Notes: ${brief.notes || "n/a"}

Write content for these ${batch.length} posts (keep the SAME order):
${list}

Platform norms: LinkedIn = professional, value-led, no hashtag spam. X = tight, punchy, <280 chars. Instagram/TikTok = energetic, hook-driven, light emoji ok. Facebook = friendly, slightly longer.

Return ONLY a JSON array of exactly ${batch.length} objects in the same order:
[{"contentType":"e.g. Reel / Carousel / Single image / Story / Text post / Short video / Poll (fit the platform)","hook":"scroll-stopping first line, under 12 words","caption":"full ready-to-post caption, use \\n for line breaks","hashtags":["3-6 tags WITHOUT the # symbol"],"visual":"one-sentence art direction","cta":"the call to action"}]`;
        let items = [];
        try { items = parseLoose(await callModel(cSys, cUser)); }
        catch (e) { items = []; }
        if (!Array.isArray(items)) items = [];

        const merged = batch.map((s, k) => {
          const it = items[k] || {};
          return {
            id: s.id, date: iso(s.date), platform: s.platform, pillar: s.pillar,
            contentType: it.contentType || "Post",
            hook: it.hook || "(generation incomplete — regenerate)",
            caption: it.caption || "",
            hashtags: Array.isArray(it.hashtags) ? it.hashtags.map((h) => String(h).replace(/^#/, "")) : [],
            visual: it.visual || "",
            cta: it.cta || "",
            status: "draft",
          };
        });
        acc = [...acc, ...merged];
        setPosts([...acc]);
        setProgress({ done: Math.min(i + BATCH, slots.length), total: slots.length });
      }
      setPhase("done");
      setBriefOpen(false);
    } catch (e) {
      setError(e.message || "Something went wrong while generating.");
      setPhase("idle");
    }
  }

  /* ---------- regenerate one post ---------- */
  async function regenOne(post) {
    if (!strategy) return;
    setRegenId(post.id); setError(null);
    try {
      const sys = "You are an elite social copywriter at a top advertising agency. Reply with ONLY one valid JSON object, no markdown.";
      const user =
`Rewrite ONE social post — fresh angle, same slot.
Campaign theme: "${strategy.theme}". Brand: ${brief.brand}. Voice: ${brief.voices.join(", ")}.
Platform: ${platformById(post.platform).label}. Pillar: "${post.pillar}". Date: ${fmtShort(new Date(post.date + "T00:00:00"))}.
Objective: ${brief.objective}. Notes: ${brief.notes || "n/a"}.

Return ONLY: {"contentType":"...","hook":"under 12 words","caption":"use \\n for breaks","hashtags":["no # symbol"],"visual":"one sentence","cta":"..."}`;
      const it = parseLoose(await callModel(sys, user));
      setPosts((ps) => ps.map((p) => p.id === post.id ? {
        ...p,
        contentType: it.contentType || p.contentType,
        hook: it.hook || p.hook,
        caption: it.caption || p.caption,
        hashtags: Array.isArray(it.hashtags) ? it.hashtags.map((h) => String(h).replace(/^#/, "")) : p.hashtags,
        visual: it.visual || p.visual,
        cta: it.cta || p.cta,
        status: "draft",
      } : p));
      if (selected && selected.id === post.id) {
        setSelected((s) => ({ ...s })); // trigger refresh via posts lookup below
      }
      flash("Post regenerated");
    } catch (e) {
      setError("Couldn't regenerate that post. Try again.");
    } finally { setRegenId(null); }
  }

  const updatePost = (id, patch) => setPosts((ps) => ps.map((p) => p.id === id ? { ...p, ...patch } : p));

  /* keep selected in sync with posts */
  const selectedPost = selected ? posts.find((p) => p.id === selected.id) || null : null;

  /* ---------- copy / export ---------- */
  function copyText(text) {
    try {
      navigator.clipboard.writeText(text).then(() => flash("Copied to clipboard"),
        () => fallbackCopy(text));
    } catch (e) { fallbackCopy(text); }
  }
  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); flash("Copied to clipboard"); } catch (e) {}
    document.body.removeChild(ta);
  }
  const postToText = (p) =>
    `${platformById(p.platform).label} — ${fmtLong(new Date(p.date + "T00:00:00"))}\n${p.contentType} · ${p.pillar}\n\n${p.caption}\n\n${p.hashtags.map((h) => "#" + h).join(" ")}\n\nVisual: ${p.visual}\nCTA: ${p.cta}`;

  function exportCSV() {
    const esc = (s) => `"${String(s ?? "").replace(/"/g, '""')}"`;
    const rows = [["Date", "Platform", "Type", "Pillar", "Hook", "Caption", "Hashtags", "Visual", "CTA", "Status"]];
    [...posts].sort((a, b) => a.date.localeCompare(b.date)).forEach((p) =>
      rows.push([p.date, platformById(p.platform).label, p.contentType, p.pillar, p.hook,
        p.caption, p.hashtags.map((h) => "#" + h).join(" "), p.visual, p.cta, p.status].map(esc)));
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${(brief.brand || "campaign").toLowerCase().replace(/\s+/g, "-")}-content-calendar.csv`;
    a.click(); URL.revokeObjectURL(a.href);
    flash("CSV exported");
  }

  /* ---------- campaign library ---------- */
  function doSaveCampaign() {
    const name = saveName.trim() || brief.brand.trim() || "Untitled campaign";
    const camp = {
      id: `c${Date.now()}`, name, savedAt: Date.now(),
      brief: JSON.parse(JSON.stringify(brief)),
      strategy: strategy ? JSON.parse(JSON.stringify(strategy)) : null,
      posts: JSON.parse(JSON.stringify(posts)),
    };
    setCampaigns((cs) => [camp, ...cs]);
    setSaveOpen(false); setSaveName("");
    flash("Campaign saved");
  }
  function loadCampaign(c) {
    setBrief(c.brief); setStrategy(c.strategy || null); setPosts(c.posts || []);
    setSelected(null); setPhase((c.posts && c.posts.length) ? "done" : "idle");
    setBriefOpen(false); setLibOpen(false);
    flash(`Loaded "${c.name}"`);
  }
  function deleteCampaign(id) { setCampaigns((cs) => cs.filter((c) => c.id !== id)); }
  function newCampaign() {
    setStrategy(null); setPosts([]); setSelected(null); setPhase("idle");
    setLibOpen(false); setBriefOpen(true);
  }

  /* ---------- filters & stats ---------- */
  const filtered = posts.filter((p) =>
    (fPlat === "all" || p.platform === fPlat) && (fPillar === "all" || p.pillar === fPillar));
  const approved = posts.filter((p) => p.status === "approved").length;
  const pillarCounts = (strategy?.pillars || []).map((pl) => ({
    ...pl, count: posts.filter((p) => p.pillar === pl.name).length,
  }));
  const maxPillar = Math.max(1, ...pillarCounts.map((c) => c.count));

  /* weeks for calendar */
  const start = new Date(brief.start + "T00:00:00");
  const weeks = [0, 1, 2, 3];

  return (
    <div style={S.root}>
      <style>{CSS}</style>

      {/* ===== top bar ===== */}
      <header style={S.header}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={S.dot} />
          <h1 style={S.wordmark}>Cadence</h1>
          <span style={S.tagline}>Monthly Campaign Content Studio</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={S.enginePill}>
            {provider === "claude" ? "Claude · proxy"
              : provider === "openai" ? `OpenAI · ${models.openai}`
              : `Gemini · ${models.gemini}`}
          </span>
          {posts.length > 0 && <span style={S.metaPill}>{posts.length} posts · {approved} approved</span>}
          {posts.length > 0 && (
            <button className="cd-ghost" onClick={() => { setSaveName(brief.brand || ""); setSaveOpen(true); }}>
              <Save size={15} /> Save
            </button>
          )}
          <button className="cd-ghost" onClick={() => setLibOpen(true)}>
            <FolderOpen size={15} /> Library{campaigns.length ? ` · ${campaigns.length}` : ""}
          </button>
          {posts.length > 0 && <button className="cd-ghost" onClick={exportCSV}><Download size={15} /> CSV</button>}
        </div>
      </header>

      <div style={S.body}>
        {/* ===== brief sidebar ===== */}
        <aside style={{ ...S.aside, width: briefOpen ? 340 : 0, padding: briefOpen ? "22px 22px 40px" : 0, borderRight: briefOpen ? "1px solid var(--line)" : "none" }}>
          {briefOpen && (
            <div className="cd-fade">
              <SectionTitle icon={<Sparkles size={13} />} text="Engine" />
              <div style={S.segment2}>
                {[["claude", "Claude"], ["openai", "OpenAI"], ["gemini", "Gemini"]].map(([v, l]) => (
                  <button key={v} className="cd-seg"
                    style={{ flex: 1, justifyContent: "center", ...(provider === v ? S.segOn : {}) }}
                    onClick={() => { setProvider(v); setKeyStatus(null); }}>{l}</button>
                ))}
              </div>

              {provider === "claude" && (
                <div style={{ marginTop: 12 }}>
                  <Field label="Claude Proxy URL">
                    <input className="cd-in" type="url" autoComplete="off"
                      placeholder="https://your-proxy.workers.dev"
                      value={keys.anthropicProxy}
                      onChange={(e) => { setKeys((k) => ({ ...k, anthropicProxy: e.target.value })); setKeyStatus(null); }} />
                  </Field>
                  <button className="cd-ghost" style={{ width: "100%", justifyContent: "center",
                      ...(keyStatus === "ok" ? { borderColor: "var(--sage)", color: "var(--sage)" } : {}),
                      ...(keyStatus === "bad" ? { borderColor: "var(--accent)", color: "var(--accent-deep)" } : {}) }}
                    onClick={verifyKey} disabled={keyStatus === "testing" || !keys.anthropicProxy.trim()}>
                    {keyStatus === "testing" ? <Loader2 size={14} className="cd-spin" /> :
                     keyStatus === "ok" ? <Check size={14} /> :
                     keyStatus === "bad" ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
                    {keyStatus === "ok" ? "Connected" : keyStatus === "bad" ? "Check proxy" :
                     keyStatus === "testing" ? "Testing…" : "Test connection"}
                  </button>
                  <div style={S.engineWarn}>
                    Browsers can't call the Anthropic API directly. Point this at a small proxy
                    (Cloudflare Worker, Vercel/Netlify function) that forwards to api.anthropic.com
                    with your key held server-side. Leave Claude aside and use OpenAI or Gemini for a
                    pure client-side setup.
                  </div>
                </div>
              )}

              {provider !== "claude" && (
                <div style={{ marginTop: 12 }}>
                  <Field label={`${provider === "openai" ? "OpenAI" : "Gemini"} API Key`}>
                    <input className="cd-in" type="password" autoComplete="off"
                      placeholder={provider === "openai" ? "sk-…" : "AIza…"}
                      value={keys[provider]}
                      onChange={(e) => { setKeys((k) => ({ ...k, [provider]: e.target.value })); setKeyStatus(null); }} />
                  </Field>
                  <Field label="Model">
                    <input className="cd-in" list={`models-${provider}`} value={models[provider]}
                      onChange={(e) => setModels((m) => ({ ...m, [provider]: e.target.value }))} />
                    <datalist id="models-openai">
                      <option value="gpt-4o-mini" /><option value="gpt-4o" />
                      <option value="gpt-4.1" /><option value="gpt-4.1-mini" />
                    </datalist>
                    <datalist id="models-gemini">
                      <option value="gemini-2.5-flash" /><option value="gemini-2.5-pro" />
                      <option value="gemini-2.0-flash" /><option value="gemini-1.5-pro" />
                    </datalist>
                  </Field>
                  <button className="cd-ghost" style={{ width: "100%", justifyContent: "center",
                      ...(keyStatus === "ok" ? { borderColor: "var(--sage)", color: "var(--sage)" } : {}),
                      ...(keyStatus === "bad" ? { borderColor: "var(--accent)", color: "var(--accent-deep)" } : {}) }}
                    onClick={verifyKey} disabled={keyStatus === "testing" || !keys[provider].trim()}>
                    {keyStatus === "testing" ? <Loader2 size={14} className="cd-spin" /> :
                     keyStatus === "ok" ? <Check size={14} /> :
                     keyStatus === "bad" ? <AlertTriangle size={14} /> : <Sparkles size={14} />}
                    {keyStatus === "ok" ? "Connected" : keyStatus === "bad" ? "Check key / model" :
                     keyStatus === "testing" ? "Testing…" : "Test connection"}
                  </button>
                  <label style={S.remember}>
                    <input type="checkbox" checked={rememberKeys} style={{ accentColor: "#FF4D23", width: 15, height: 15 }}
                      onChange={(e) => setRememberKeys(e.target.checked)} />
                    Remember key on this device
                  </label>
                  <div style={S.engineWarn}>
                    {rememberKeys
                      ? "Saved in this browser's localStorage — convenient, but readable by any script on the page. Use only on a device you trust."
                      : "Key lives in memory only and clears on refresh. Tick the box above to persist it on this device."}
                  </div>
                </div>
              )}

              <div style={{ height: 22 }} />
              <SectionTitle icon={<Target size={13} />} text="The Brief" />

              <Field label="Client / Brand">
                <input className="cd-in" value={brief.brand} placeholder="e.g. Tabasamu Sips"
                  onChange={(e) => set("brand", e.target.value)} />
              </Field>
              <Field label="Industry / Category">
                <input className="cd-in" value={brief.industry} placeholder="e.g. Premium beverage"
                  onChange={(e) => set("industry", e.target.value)} />
              </Field>

              <Field label="Primary Objective">
                <select className="cd-in" value={brief.objective} onChange={(e) => set("objective", e.target.value)}>
                  {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
                </select>
              </Field>

              <Field label="Brand Voice">
                <div style={S.chipWrap}>
                  {VOICES.map((v) => {
                    const on = brief.voices.includes(v);
                    return <button key={v} onClick={() => toggleArr("voices", v)}
                      className="cd-chip" style={on ? S.chipOn : null}>{v}</button>;
                  })}
                </div>
              </Field>

              <Field label="Target Audience">
                <textarea className="cd-in" rows={2} value={brief.audience} placeholder="Who are we talking to?"
                  onChange={(e) => set("audience", e.target.value)} />
              </Field>
              <Field label="Key Messages / Product Notes">
                <textarea className="cd-in" rows={3} value={brief.notes} placeholder="What must this campaign say?"
                  onChange={(e) => set("notes", e.target.value)} />
              </Field>

              <Field label="Platforms">
                <div style={S.chipWrap}>
                  {PLATFORMS.map((p) => {
                    const on = brief.platforms.includes(p.id);
                    return (
                      <button key={p.id} onClick={() => toggleArr("platforms", p.id)} className="cd-chip"
                        style={on ? { ...S.chipOn, background: p.color, borderColor: p.color } : null}>
                        <span style={{ ...S.swatch, background: on ? "#fff" : p.color }} />{p.label}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label={`Cadence — ${brief.perWeek} posts / week / platform`}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <button className="cd-step" onClick={() => set("perWeek", Math.max(1, brief.perWeek - 1))}><Minus size={14} /></button>
                  <div style={S.stepBar}>
                    <div style={{ ...S.stepFill, width: `${(brief.perWeek / 7) * 100}%` }} />
                  </div>
                  <button className="cd-step" onClick={() => set("perWeek", Math.min(7, brief.perWeek + 1))}><Plus size={14} /></button>
                </div>
                <div style={S.estimate}>
                  ≈ {brief.platforms.length * brief.perWeek * 4} posts over 4 weeks
                </div>
              </Field>

              <Field label="Start Date">
                <input className="cd-in" type="date" value={brief.start} onChange={(e) => set("start", e.target.value)} />
              </Field>

              <button className="cd-primary" onClick={generate}
                disabled={busy || !brief.brand.trim() || brief.platforms.length === 0}>
                {busy ? <Loader2 size={16} className="cd-spin" /> : <Wand2 size={16} />}
                {phase === "strategy" ? "Building strategy…" :
                 phase === "posts" ? `Drafting ${progress.done}/${progress.total}…` :
                 posts.length ? "Regenerate Month" : "Generate Month"}
              </button>
              {error && <div style={S.error}><AlertTriangle size={14} /> {error}</div>}
            </div>
          )}
        </aside>

        {/* ===== main ===== */}
        <main style={S.main}>
          <button className="cd-toggle" onClick={() => setBriefOpen((o) => !o)}
            title={briefOpen ? "Hide brief" : "Show brief"}>
            <ChevronRight size={16} style={{ transform: briefOpen ? "rotate(180deg)" : "none", transition: ".2s" }} />
          </button>

          {/* empty / loading hero */}
          {posts.length === 0 && (
            <div style={S.hero}>
              <div style={S.heroMark}><Megaphone size={26} /></div>
              <h2 style={S.heroTitle}>A month of content,<br /><em>drafted in one brief.</em></h2>
              <p style={S.heroSub}>
                Fill the brief on the left, then let Cadence architect a campaign — theme, content
                pillars, and a platform-by-platform calendar of ready-to-publish posts.
              </p>
              {phase === "strategy" && <div style={S.loadLine}><Loader2 size={15} className="cd-spin" /> Setting the strategy…</div>}
              {phase === "idle" && <div style={S.heroHint}>Start with a client name and at least one platform →</div>}
            </div>
          )}

          {/* strategy banner */}
          {strategy && posts.length > 0 && (
            <section style={S.strategy} className="cd-fade">
              <div style={{ flex: 1, minWidth: 260 }}>
                <div style={S.kicker}>Campaign Theme</div>
                <h2 style={S.theme}>{strategy.theme}</h2>
                <p style={S.bigIdea}>{strategy.bigIdea}</p>
                {strategy.audienceInsight && (
                  <p style={S.insight}><Sparkles size={12} style={{ opacity: .7 }} /> {strategy.audienceInsight}</p>
                )}
              </div>
              <div style={S.pillarsBox}>
                <div style={S.kicker}>Content Pillars</div>
                {pillarCounts.map((pl) => (
                  <div key={pl.name} style={S.pillarRow}>
                    <span style={{ ...S.pillarDot, background: pl.color }} />
                    <span style={S.pillarName}>{pl.name}</span>
                    <div style={S.pillarTrack}>
                      <div style={{ ...S.pillarBarFill, width: `${(pl.count / maxPillar) * 100}%`, background: pl.color }} />
                    </div>
                    <span style={S.pillarCount}>{pl.count}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* progress while drafting */}
          {phase === "posts" && (
            <div style={S.progress}>
              <div style={S.progressBar}>
                <div style={{ ...S.progressFill, width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
              </div>
              <span style={S.progressTxt}>Drafting posts — {progress.done} of {progress.total}</span>
            </div>
          )}

          {/* toolbar */}
          {posts.length > 0 && (
            <div style={S.toolbar} className="cd-fade">
              <div style={S.segment}>
                {[["calendar", CalIcon, "Calendar"], ["board", LayoutGrid, "Board"], ["list", List, "List"]].map(([v, Ic, lbl]) => (
                  <button key={v} className="cd-seg" style={view === v ? S.segOn : null} onClick={() => setView(v)}>
                    <Ic size={14} /> {lbl}
                  </button>
                ))}
              </div>
              <div style={{ flex: 1 }} />
              <select className="cd-filter" value={fPlat} onChange={(e) => setFPlat(e.target.value)}>
                <option value="all">All platforms</option>
                {brief.platforms.map((p) => <option key={p} value={p}>{platformById(p).label}</option>)}
              </select>
              <select className="cd-filter" value={fPillar} onChange={(e) => setFPillar(e.target.value)}>
                <option value="all">All pillars</option>
                {(strategy?.pillars || []).map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            </div>
          )}

          {/* ===== CALENDAR ===== */}
          {posts.length > 0 && view === "calendar" && (
            <div style={S.calWrap} className="cd-fade">
              <div style={S.calHead}>
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div key={i} style={S.calHcell}>{DOW[addDays(start, i).getDay()]}</div>
                ))}
              </div>
              {weeks.map((w) => (
                <div key={w} style={S.calRow}>
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const cellDate = addDays(start, w * 7 + d);
                    const key = iso(cellDate);
                    const dayPosts = filtered.filter((p) => p.date === key);
                    return (
                      <div key={d} style={S.calCell}>
                        <div style={S.calDate}>
                          <span>{cellDate.getDate()}</span>
                          {cellDate.getDate() <= 7 || (cellDate.getDate() > 28) ?
                            <span style={S.calMon}>{MON[cellDate.getMonth()]}</span> : null}
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                          {dayPosts.map((p) => {
                            const pl = platformById(p.platform);
                            return (
                              <button key={p.id} className="cd-chiprow" onClick={() => setSelected(p)}
                                style={{ borderLeft: `3px solid ${pl.color}`, opacity: p.status === "approved" ? 1 : .96 }}>
                                <span style={{ ...S.miniBadge, color: pl.color }}>{pl.short}</span>
                                <span style={S.chipHook}>{p.hook}</span>
                                {p.status === "approved" && <Check size={11} style={{ color: "var(--sage)", flexShrink: 0 }} />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* ===== BOARD (by platform) ===== */}
          {posts.length > 0 && view === "board" && (
            <div style={S.board} className="cd-fade">
              {brief.platforms.filter((p) => fPlat === "all" || p === fPlat).map((pid) => {
                const pl = platformById(pid);
                const col = filtered.filter((p) => p.platform === pid);
                return (
                  <div key={pid} style={S.boardCol}>
                    <div style={S.boardHead}>
                      <span style={{ ...S.swatch, background: pl.color }} />
                      <span style={{ fontWeight: 700 }}>{pl.label}</span>
                      <span style={S.boardCount}>{col.length}</span>
                    </div>
                    {col.map((p) => <PostCard key={p.id} p={p} onOpen={() => setSelected(p)} compact />)}
                  </div>
                );
              })}
            </div>
          )}

          {/* ===== LIST ===== */}
          {posts.length > 0 && view === "list" && (
            <div style={S.list} className="cd-fade">
              {[...filtered].sort((a, b) => a.date.localeCompare(b.date)).map((p) => (
                <PostCard key={p.id} p={p} onOpen={() => setSelected(p)} />
              ))}
            </div>
          )}
        </main>
      </div>

      {/* ===== detail drawer ===== */}
      {selectedPost && (
        <>
          <div style={S.scrim} onClick={() => setSelected(null)} />
          <Drawer
            p={selectedPost}
            onClose={() => setSelected(null)}
            onCopy={() => copyText(postToText(selectedPost))}
            onRegen={() => regenOne(selectedPost)}
            regenning={regenId === selectedPost.id}
            onEdit={(patch) => updatePost(selectedPost.id, patch)}
            onApprove={() => updatePost(selectedPost.id, { status: selectedPost.status === "approved" ? "draft" : "approved" })}
          />
        </>
      )}

      {/* ===== library modal ===== */}
      {libOpen && (
        <div style={S.modalWrap} onClick={() => setLibOpen(false)}>
          <div style={S.modal} className="cd-fade" onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div>
                <div style={S.kicker2}>Saved on this device</div>
                <h3 style={S.modalTitle}>Campaign Library</h3>
              </div>
              <button className="cd-x" onClick={() => setLibOpen(false)}><X size={18} /></button>
            </div>
            <button className="cd-ghost" style={{ width: "100%", justifyContent: "center", marginBottom: 14 }} onClick={newCampaign}>
              <FilePlus size={15} /> Start a new campaign
            </button>
            {campaigns.length === 0 ? (
              <div style={S.libEmpty}>No saved campaigns yet. Generate a month, then hit <strong>Save</strong> to keep it here.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {campaigns.map((c) => (
                  <div key={c.id} style={S.campRow}>
                    <button className="cd-camp" onClick={() => loadCampaign(c)}>
                      <div style={S.campName}>{c.name}</div>
                      <div style={S.campMeta}>
                        <Clock size={11} /> {new Date(c.savedAt).toLocaleDateString()} · {(c.posts || []).length} posts
                        {c.brief && c.brief.platforms ? ` · ${c.brief.platforms.length} platforms` : ""}
                      </div>
                    </button>
                    <button className="cd-x" style={{ width: 36, height: 36 }} onClick={() => deleteCampaign(c.id)} title="Delete">
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== save modal ===== */}
      {saveOpen && (
        <div style={S.modalWrap} onClick={() => setSaveOpen(false)}>
          <div style={{ ...S.modal, maxWidth: 420 }} className="cd-fade" onClick={(e) => e.stopPropagation()}>
            <div style={S.modalHead}>
              <div>
                <div style={S.kicker2}>Snapshot current work</div>
                <h3 style={S.modalTitle}>Save Campaign</h3>
              </div>
              <button className="cd-x" onClick={() => setSaveOpen(false)}><X size={18} /></button>
            </div>
            <Field label="Campaign name">
              <input className="cd-in" value={saveName} autoFocus
                placeholder="e.g. Tabasamu — June Launch"
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") doSaveCampaign(); }} />
            </Field>
            <button className="cd-primary" onClick={doSaveCampaign}><Save size={15} /> Save to library</button>
          </div>
        </div>
      )}

      {toast && <div style={S.toast}><Check size={14} /> {toast}</div>}
    </div>
  );
}

/* ================================================================== */
/*  sub-components                                                     */
/* ================================================================== */

function SectionTitle({ icon, text }) {
  return <div style={S.secTitle}>{icon}<span>{text}</span></div>;
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={S.label}>{label}</label>
      {children}
    </div>
  );
}

function PostCard({ p, onOpen, compact }) {
  const pl = platformById(p.platform);
  return (
    <button className="cd-card" onClick={onOpen} style={{ borderTop: `3px solid ${pl.color}` }}>
      <div style={S.cardTop}>
        <span style={{ ...S.miniBadge, color: pl.color, fontWeight: 800 }}>{pl.label}</span>
        <span style={S.cardDate}>{fmtShort(new Date(p.date + "T00:00:00"))}</span>
        {p.status === "approved" && <Check size={13} style={{ color: "var(--sage)" }} />}
      </div>
      <div style={S.cardHook}>{p.hook}</div>
      {!compact && <div style={S.cardCap}>{p.caption}</div>}
      <div style={S.cardMeta}>
        <span style={S.tag}>{p.contentType}</span>
        <span style={S.tag}>{p.pillar}</span>
      </div>
    </button>
  );
}

function Drawer({ p, onClose, onCopy, onRegen, regenning, onEdit, onApprove }) {
  const pl = platformById(p.platform);
  const [editing, setEditing] = useState(false);
  useEffect(() => { setEditing(false); }, [p.id]);
  return (
    <div style={S.drawer} className="cd-slide">
      <div style={{ ...S.drawerBar, background: pl.color }} />
      <div style={S.drawerInner}>
        <div style={S.drawerHead}>
          <div>
            <div style={{ ...S.miniBadge, color: pl.color, fontWeight: 800, fontSize: 13 }}>{pl.label}</div>
            <div style={S.drawerDate}>{fmtLong(new Date(p.date + "T00:00:00"))}</div>
          </div>
          <button className="cd-x" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={S.drawerTags}>
          <span style={{ ...S.tag, ...S.tagSolid }}>{p.contentType}</span>
          <span style={S.tag}>{p.pillar}</span>
          {p.status === "approved"
            ? <span style={{ ...S.tag, color: "var(--sage)", borderColor: "var(--sage)" }}><Check size={11} /> Approved</span>
            : <span style={{ ...S.tag, opacity: .7 }}>Draft</span>}
        </div>

        <div style={S.dLabel}>Hook</div>
        <div style={S.drawerHook}>{p.hook}</div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={S.dLabel}>Caption</div>
          <button className="cd-mini" onClick={() => setEditing((e) => !e)}>{editing ? "Done" : "Edit"}</button>
        </div>
        {editing
          ? <textarea className="cd-in" style={{ minHeight: 160 }} value={p.caption}
              onChange={(e) => onEdit({ caption: e.target.value })} />
          : <div style={S.drawerCap}>{p.caption || "—"}</div>}

        {p.hashtags.length > 0 && (
          <>
            <div style={S.dLabel}>Hashtags</div>
            <div style={S.chipWrap}>
              {p.hashtags.map((h, i) => <span key={i} style={S.hashtag}>#{h}</span>)}
            </div>
          </>
        )}

        {p.visual && (<><div style={S.dLabel}>Art Direction</div><div style={S.drawerVisual}>{p.visual}</div></>)}
        {p.cta && (<><div style={S.dLabel}>Call to Action</div><div style={S.drawerCta}>{p.cta}</div></>)}

        <div style={S.drawerActions}>
          <button className="cd-primary" style={{ flex: 1 }} onClick={onApprove}>
            <Check size={15} /> {p.status === "approved" ? "Mark as Draft" : "Approve"}
          </button>
          <button className="cd-ghost" onClick={onRegen} disabled={regenning}>
            {regenning ? <Loader2 size={15} className="cd-spin" /> : <RefreshCw size={15} />}
          </button>
          <button className="cd-ghost" onClick={onCopy}><Copy size={15} /></button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  styles                                                             */
/* ================================================================== */

const S = {
  root: { fontFamily: "var(--sans)", background: "var(--paper)", color: "var(--ink)", minHeight: "100vh", position: "relative" },
  header: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 26px", borderBottom: "1px solid var(--line)", background: "var(--paper)", position: "sticky", top: 0, zIndex: 30 },
  dot: { width: 11, height: 11, borderRadius: 2, background: "var(--accent)", transform: "rotate(45deg)", display: "inline-block" },
  wordmark: { fontFamily: "var(--display)", fontSize: 26, fontWeight: 600, letterSpacing: "-.02em", margin: 0, lineHeight: 1 },
  tagline: { fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-soft)" },
  metaPill: { fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".05em", color: "var(--ink-soft)", padding: "5px 10px", border: "1px solid var(--line)", borderRadius: 20 },
  enginePill: { fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".04em", color: "var(--accent)", padding: "5px 10px", border: "1px solid var(--accent)", borderRadius: 20, whiteSpace: "nowrap" },
  segment2: { display: "flex", border: "1px solid var(--line)", borderRadius: 9, padding: 3, gap: 2, background: "#fff" },
  engineNote: { fontSize: 12, lineHeight: 1.5, color: "var(--ink-soft)", background: "#fff", border: "1px solid var(--line)", borderRadius: 8, padding: "9px 11px", marginTop: 10 },
  engineWarn: { fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)", marginTop: 12, paddingTop: 11, borderTop: "1px dashed var(--line)" },

  body: { display: "flex", alignItems: "stretch", minHeight: "calc(100vh - 65px)" },
  aside: { background: "var(--paper-2)", overflow: "hidden", transition: "width .25s ease, padding .25s ease", flexShrink: 0, position: "sticky", top: 65, alignSelf: "flex-start", maxHeight: "calc(100vh - 65px)", overflowY: "auto" },
  main: { flex: 1, padding: "26px 32px 64px", position: "relative", minWidth: 0 },

  secTitle: { display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--mono)", fontSize: 11, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 18, paddingBottom: 10, borderBottom: "1px solid var(--line)" },
  label: { display: "block", fontSize: 11.5, fontWeight: 700, letterSpacing: ".02em", color: "var(--ink-soft)", marginBottom: 6, textTransform: "uppercase" },
  chipWrap: { display: "flex", flexWrap: "wrap", gap: 6 },
  chipOn: { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" },
  swatch: { width: 9, height: 9, borderRadius: 2, display: "inline-block", marginRight: 6 },
  stepBar: { flex: 1, height: 6, background: "var(--line)", borderRadius: 4, overflow: "hidden" },
  stepFill: { height: "100%", background: "var(--accent)", transition: "width .2s" },
  estimate: { fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-soft)", marginTop: 8, letterSpacing: ".03em" },
  error: { display: "flex", alignItems: "center", gap: 7, fontSize: 12.5, color: "var(--accent-deep)", marginTop: 12, background: "#fff", border: "1px solid var(--accent)", padding: "9px 11px", borderRadius: 8 },

  toggle: {},
  hero: { maxWidth: 620, margin: "56px auto", textAlign: "center" },
  heroMark: { width: 60, height: 60, borderRadius: 14, background: "var(--ink)", color: "var(--paper)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 26px" },
  heroTitle: { fontFamily: "var(--display)", fontSize: 46, lineHeight: 1.05, fontWeight: 500, letterSpacing: "-.02em", margin: "0 0 18px" },
  heroSub: { fontSize: 16, lineHeight: 1.6, color: "var(--ink-soft)", maxWidth: 480, margin: "0 auto" },
  heroHint: { fontFamily: "var(--mono)", fontSize: 12, letterSpacing: ".05em", color: "var(--accent)", marginTop: 26 },
  loadLine: { display: "inline-flex", alignItems: "center", gap: 9, fontFamily: "var(--mono)", fontSize: 13, color: "var(--ink-soft)", marginTop: 26, letterSpacing: ".03em" },

  strategy: { display: "flex", flexWrap: "wrap", gap: 30, background: "var(--ink)", color: "var(--paper)", borderRadius: 16, padding: "26px 30px", marginBottom: 22 },
  kicker: { fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".18em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 8 },
  theme: { fontFamily: "var(--display)", fontSize: 34, fontWeight: 500, letterSpacing: "-.02em", margin: "0 0 12px", lineHeight: 1.05 },
  bigIdea: { fontSize: 14.5, lineHeight: 1.6, color: "rgba(243,239,230,.82)", margin: "0 0 12px", maxWidth: 460 },
  insight: { display: "flex", alignItems: "center", gap: 7, fontStyle: "italic", fontSize: 13, color: "rgba(243,239,230,.6)", margin: 0 },
  pillarsBox: { minWidth: 260, flex: ".7" },
  pillarRow: { display: "flex", alignItems: "center", gap: 9, marginBottom: 9 },
  pillarDot: { width: 9, height: 9, borderRadius: 2, flexShrink: 0 },
  pillarName: { fontSize: 12.5, fontWeight: 600, width: 110, flexShrink: 0 },
  pillarTrack: { flex: 1, height: 5, background: "rgba(243,239,230,.14)", borderRadius: 4, overflow: "hidden" },
  pillarBarFill: { height: "100%", borderRadius: 4, transition: "width .5s" },
  pillarCount: { fontFamily: "var(--mono)", fontSize: 11, color: "rgba(243,239,230,.6)", width: 18, textAlign: "right" },

  progress: { display: "flex", alignItems: "center", gap: 14, marginBottom: 18 },
  progressBar: { flex: 1, height: 7, background: "var(--line)", borderRadius: 5, overflow: "hidden" },
  progressFill: { height: "100%", background: "var(--accent)", transition: "width .4s" },
  progressTxt: { fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--ink-soft)", letterSpacing: ".03em", whiteSpace: "nowrap" },

  toolbar: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" },
  segment: { display: "flex", background: "var(--paper-2)", borderRadius: 9, padding: 3, gap: 2 },
  segOn: { background: "var(--ink)", color: "var(--paper)" },

  calWrap: { border: "1px solid var(--line)", borderRadius: 14, overflow: "hidden", background: "#fff" },
  calHead: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", background: "var(--paper-2)", borderBottom: "1px solid var(--line)" },
  calHcell: { padding: "9px 10px", fontFamily: "var(--mono)", fontSize: 10.5, letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-soft)", textAlign: "left" },
  calRow: { display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid var(--line)" },
  calCell: { minHeight: 116, borderRight: "1px solid var(--line)", padding: 8, display: "flex", flexDirection: "column", gap: 7 },
  calDate: { display: "flex", alignItems: "baseline", gap: 5, fontFamily: "var(--mono)", fontSize: 12, color: "var(--ink-soft)", fontWeight: 600 },
  calMon: { fontSize: 9, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)" },
  miniBadge: { fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".06em", fontWeight: 700, flexShrink: 0 },
  chipHook: { fontSize: 11, lineHeight: 1.25, color: "var(--ink)", overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" },

  board: { display: "flex", gap: 16, overflowX: "auto", paddingBottom: 10 },
  boardCol: { minWidth: 270, flex: 1, display: "flex", flexDirection: "column", gap: 10 },
  boardHead: { display: "flex", alignItems: "center", gap: 8, padding: "8px 4px", fontSize: 13, borderBottom: "2px solid var(--line)" },
  boardCount: { marginLeft: "auto", fontFamily: "var(--mono)", fontSize: 11, color: "var(--ink-soft)" },

  list: { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(280px,1fr))", gap: 14 },

  cardTop: { display: "flex", alignItems: "center", gap: 8, marginBottom: 9 },
  cardDate: { fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-soft)", marginLeft: "auto" },
  cardHook: { fontFamily: "var(--display)", fontSize: 16.5, fontWeight: 500, lineHeight: 1.2, letterSpacing: "-.01em", marginBottom: 8 },
  cardCap: { fontSize: 12.5, lineHeight: 1.5, color: "var(--ink-soft)", marginBottom: 10, display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden", whiteSpace: "pre-wrap" },
  cardMeta: { display: "flex", gap: 6, flexWrap: "wrap" },
  tag: { fontFamily: "var(--mono)", fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase", padding: "3px 8px", border: "1px solid var(--line)", borderRadius: 20, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center", gap: 4 },
  tagSolid: { background: "var(--ink)", color: "var(--paper)", borderColor: "var(--ink)" },

  scrim: { position: "fixed", inset: 0, background: "rgba(26,23,18,.4)", zIndex: 40, backdropFilter: "blur(2px)" },
  drawer: { position: "fixed", top: 0, right: 0, height: "100vh", width: "min(460px,94vw)", background: "var(--paper)", zIndex: 50, boxShadow: "-20px 0 60px rgba(26,23,18,.2)", display: "flex", flexDirection: "column" },
  drawerBar: { height: 5, width: "100%", flexShrink: 0 },
  drawerInner: { padding: "22px 26px 32px", overflowY: "auto" },
  drawerHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  drawerDate: { fontSize: 13, color: "var(--ink-soft)", marginTop: 3 },
  drawerTags: { display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 },
  dLabel: { fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)", margin: "18px 0 7px" },
  drawerHook: { fontFamily: "var(--display)", fontSize: 23, fontWeight: 500, lineHeight: 1.18, letterSpacing: "-.01em" },
  drawerCap: { fontSize: 14, lineHeight: 1.65, whiteSpace: "pre-wrap", color: "var(--ink)" },
  hashtag: { fontFamily: "var(--mono)", fontSize: 11.5, color: "var(--accent-deep)", background: "#fff", border: "1px solid var(--line)", padding: "3px 9px", borderRadius: 6 },
  drawerVisual: { fontSize: 13.5, lineHeight: 1.55, fontStyle: "italic", color: "var(--ink-soft)" },
  drawerCta: { fontSize: 13.5, fontWeight: 600 },
  drawerActions: { display: "flex", gap: 8, marginTop: 28, position: "sticky", bottom: 0 },

  toast: { position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: "var(--ink)", color: "var(--paper)", padding: "10px 18px", borderRadius: 30, fontSize: 13, display: "flex", alignItems: "center", gap: 8, zIndex: 60, boxShadow: "0 10px 30px rgba(26,23,18,.3)" },

  remember: { display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: "var(--ink-soft)", marginTop: 12, cursor: "pointer", userSelect: "none" },

  modalWrap: { position: "fixed", inset: 0, background: "rgba(26,23,18,.42)", backdropFilter: "blur(2px)", zIndex: 45, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
  modal: { width: "min(520px,92vw)", maxHeight: "85vh", overflowY: "auto", background: "var(--paper)", borderRadius: 16, padding: "22px 24px 26px", boxShadow: "0 30px 80px rgba(26,23,18,.3)", border: "1px solid var(--line)" },
  modalHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 18 },
  modalTitle: { fontFamily: "var(--display)", fontSize: 24, fontWeight: 500, letterSpacing: "-.01em", margin: "3px 0 0" },
  kicker2: { fontFamily: "var(--mono)", fontSize: 10, letterSpacing: ".16em", textTransform: "uppercase", color: "var(--accent)" },
  libEmpty: { fontSize: 13.5, lineHeight: 1.6, color: "var(--ink-soft)", background: "#fff", border: "1px dashed var(--line)", borderRadius: 10, padding: "18px 16px", textAlign: "center" },
  campRow: { display: "flex", gap: 8, alignItems: "stretch" },
  campName: { fontWeight: 700, fontSize: 14, marginBottom: 4 },
  campMeta: { display: "flex", alignItems: "center", gap: 5, fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--ink-soft)" },
};

const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400..600;1,9..144,400..500&family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
:root{
  --paper:#F4F0E7; --paper-2:#EAE3D4; --ink:#1A1712; --ink-soft:#6A6253;
  --line:#DAD2C0; --accent:#FF4D23; --accent-deep:#D63A14; --sage:#5E7350; --gold:#C99A2E;
  --display:'Fraunces',Georgia,serif; --sans:'Hanken Grotesk',system-ui,sans-serif; --mono:'JetBrains Mono',monospace;
}
*{box-sizing:border-box}
.cd-in{width:100%;font-family:var(--sans);font-size:13.5px;color:var(--ink);background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 11px;outline:none;transition:border-color .15s,box-shadow .15s;resize:vertical}
.cd-in:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(255,77,35,.12)}
select.cd-in{cursor:pointer}
.cd-chip{font-family:var(--sans);font-size:12px;font-weight:600;background:#fff;border:1px solid var(--line);color:var(--ink-soft);border-radius:20px;padding:5px 11px;cursor:pointer;transition:.15s;display:inline-flex;align-items:center}
.cd-chip:hover{border-color:var(--ink)}
.cd-step{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);background:#fff;border-radius:8px;cursor:pointer;color:var(--ink);transition:.15s}
.cd-step:hover{border-color:var(--accent);color:var(--accent)}
.cd-primary{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;font-family:var(--sans);font-size:14px;font-weight:700;background:var(--accent);color:#fff;border:none;border-radius:10px;padding:12px;cursor:pointer;transition:.15s;margin-top:8px}
.cd-primary:hover{background:var(--accent-deep)}
.cd-primary:disabled{opacity:.45;cursor:not-allowed}
.cd-ghost{display:inline-flex;align-items:center;justify-content:center;gap:7px;font-family:var(--sans);font-size:13px;font-weight:600;background:#fff;color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:9px 13px;cursor:pointer;transition:.15s}
.cd-ghost:hover{border-color:var(--ink)}
.cd-ghost:disabled{opacity:.5;cursor:wait}
.cd-seg{display:inline-flex;align-items:center;gap:6px;font-family:var(--sans);font-size:12.5px;font-weight:600;background:transparent;color:var(--ink-soft);border:none;border-radius:7px;padding:7px 13px;cursor:pointer;transition:.15s}
.cd-seg:hover{color:var(--ink)}
.cd-filter{font-family:var(--sans);font-size:12.5px;font-weight:600;background:#fff;border:1px solid var(--line);border-radius:8px;padding:7px 11px;color:var(--ink);cursor:pointer;outline:none}
.cd-toggle{position:absolute;left:-18px;top:14px;width:30px;height:30px;border-radius:50%;border:1px solid var(--line);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink-soft);z-index:5;box-shadow:0 2px 8px rgba(26,23,18,.08)}
.cd-toggle:hover{color:var(--accent);border-color:var(--accent)}
.cd-chiprow{display:flex;align-items:center;gap:6px;width:100%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:6px;padding:5px 7px;cursor:pointer;transition:.12s}
.cd-chiprow:hover{transform:translateX(2px);box-shadow:2px 2px 0 var(--line)}
.cd-card{display:block;width:100%;text-align:left;background:#fff;border:1px solid var(--line);border-radius:11px;padding:15px 16px;cursor:pointer;transition:.15s}
.cd-card:hover{transform:translateY(-2px);box-shadow:0 8px 20px rgba(26,23,18,.09);border-color:var(--ink)}
.cd-camp{flex:1;text-align:left;background:#fff;border:1px solid var(--line);border-radius:10px;padding:11px 13px;cursor:pointer;transition:.13s}
.cd-camp:hover{border-color:var(--ink);box-shadow:2px 2px 0 var(--line)}
.cd-x{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border:1px solid var(--line);background:#fff;border-radius:9px;cursor:pointer;color:var(--ink)}
.cd-x:hover{border-color:var(--accent);color:var(--accent)}
.cd-mini{font-family:var(--mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--accent);background:none;border:none;cursor:pointer;font-weight:700}
.cd-spin{animation:cdspin 1s linear infinite}
@keyframes cdspin{to{transform:rotate(360deg)}}
.cd-fade{animation:cdfade .4s ease both}
@keyframes cdfade{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.cd-slide{animation:cdslide .28s cubic-bezier(.22,1,.36,1) both}
@keyframes cdslide{from{transform:translateX(40px);opacity:0}to{transform:none;opacity:1}}
::-webkit-scrollbar{width:9px;height:9px}
::-webkit-scrollbar-thumb{background:var(--line);border-radius:6px}
::-webkit-scrollbar-track{background:transparent}
`;
