"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/Button";
import { Chip } from "@/components/IconButton";
import { parseDigest, type ParsedTopic } from "@/lib/triage-parse";
import { DEFAULT_DELIVERY } from "@/lib/voices";
import { DEFAULT_STYLE } from "@/remotion/types";
import {
  createProject,
  saveProjectState,
  setActiveProjectId,
  createProjectOnServer,
  listProjectsFromServer,
  type SerializableState,
} from "@/lib/storage";
import {
  ZONES,
  type ZoneKey,
  zonedYMD,
  zonedWallToInstant,
  setWallTime,
  formatTime,
  wallHHMM,
} from "@/lib/timezones";

// uid is a globally unique rank across all loaded digests (per-file ranks
// collide, and the AI-select API uses "rank" as the identity token).
type Row = ParsedTopic & { uid: number; source: string; selected: boolean; postAt: number };

const DEFAULT_PICKS = 5;
const MAX_PICKS = 10; // mirrors the clamp in /api/triage-select
const PICKS_KEY = "vid-triage-picks";
const SPOKEN_WPS = 2.5; // rough words/sec, matches the editor's estimate
const NOVELTY_DAYS = 7; // how far back "recently posted" reaches

// Words too generic to signal topic overlap on this channel — everything else
// (tickers, company names, entities) counts as a distinctive term.
const NOVELTY_STOPWORDS = new Set([
  "the", "and", "for", "with", "this", "that", "just", "into", "before", "after", "while", "from",
  "could", "should", "would", "will", "wont", "cant", "gets", "goes", "over", "under", "off",
  "nobody", "everyone", "how", "why", "what", "when", "one", "two", "three", "new", "big",
  "real", "best", "worst", "ever", "still", "again", "back", "now", "its", "your", "our",
  "stock", "stocks", "market", "markets", "earnings", "trade", "trading", "invest", "investing",
  "investors", "shares", "price", "prices", "rally", "crash", "surge", "soars", "drops", "falls",
  "rises", "beats", "beat", "misses", "bull", "bear", "week", "year", "month", "day", "today",
  "quarter", "billion", "trillion", "million", "percent", "high", "low", "highs", "lows", "record",
]);

// Distinctive lowercase tokens of a title/keyword string ("Caterpillar Beat
// Nvidia This Year" → caterpillar, nvidia).
function sigTokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NOVELTY_STOPWORDS.has(w))
  );
}

// Today's date (YYYY-MM-DD) in WAT, so the novelty window matches the local day.
function watDate(offsetDays = 0): string {
  const { y, mo, d } = zonedYMD(new Date(Date.now() + offsetDays * 86400000), ZONES.WAT.id);
  return `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// Staggered default slot per topic: 5:00 PM ET, then +90 min apart.
function defaultPostTime(index: number): number {
  const now = new Date();
  const { y, mo, d } = zonedYMD(now, ZONES.ET.id);
  const start = zonedWallToInstant(y, mo, d, 17, 0, ZONES.ET.id);
  return start.getTime() + index * 90 * 60000;
}

// Short display label for a digest source ("q3-digest.txt" → "q3-digest").
function shortSource(name: string): string {
  const base = name.replace(/\.(txt|md|text)$/i, "");
  return base.length > 18 ? `${base.slice(0, 17)}…` : base;
}

export default function TriagePage() {
  const [raw, setRaw] = useState("");
  const [files, setFiles] = useState<{ name: string; text: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  // Whole-page drag-and-drop: depth counter because dragenter/leave also fire
  // on every child element crossed.
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [zone, setZone] = useState<ZoneKey>("WAT");
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [pickReasons, setPickReasons] = useState<Record<number, { reason: string; noveltyNote?: string }>>({});
  const [skipped, setSkipped] = useState<{ rank: number; similarTo: string; why: string }[]>([]);
  const [pickMethod, setPickMethod] = useState<string | null>(null);
  const [pickNote, setPickNote] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<number | null>(null);
  const [parsedEmpty, setParsedEmpty] = useState(false);
  const [targetPicks, setTargetPicks] = useState(DEFAULT_PICKS);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Persist the pick count across visits (read in an effect to avoid a
  // hydration mismatch — the server always renders the default).
  useEffect(() => {
    const saved = Number(localStorage.getItem(PICKS_KEY));
    if (Number.isInteger(saved) && saved >= 1 && saved <= MAX_PICKS) {
      queueMicrotask(() => setTargetPicks(saved));
    }
  }, []);
  const changeTargetPicks = (n: number) => {
    const clamped = Math.max(1, Math.min(MAX_PICKS, n));
    setTargetPicks(clamped);
    localStorage.setItem(PICKS_KEY, String(clamped));
  };

  const zoneId = ZONES[zone].id;
  const otherZone: ZoneKey = zone === "WAT" ? "ET" : "WAT";
  const otherId = ZONES[otherZone].id;

  const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);
  const sourceNames = useMemo(() => [...new Set(rows.map((r) => r.source))], [rows]);
  const multiSource = sourceNames.length > 1;
  const rowByUid = useMemo(() => new Map(rows.map((r) => [r.uid, r])), [rows]);

  // Parse every loaded digest (uploaded files + anything pasted) into one
  // combined topic list. Ids get a source prefix so per-file ranks can repeat.
  const parseAll = (fileList = files, rawText = raw) => {
    const sources = [
      ...fileList.map((f) => ({ label: f.name, text: f.text })),
      ...(rawText.trim() ? [{ label: "pasted", text: rawText }] : []),
    ];
    const combined: (ParsedTopic & { source: string })[] = [];
    sources.forEach((s, si) => {
      for (const t of parseDigest(s.text)) combined.push({ ...t, source: s.label, id: `${si}:${t.id}` });
    });
    setParsedEmpty(sources.length > 0 && combined.length === 0);
    // A fresh slate may be created again; old pick reasons are keyed by uid and
    // would mis-attach to the new rows.
    setCreated(null);
    setPickReasons({});
    setSkipped([]);
    setPickMethod(null);
    setPickNote(null);

    // Default selection: one digest keeps its own top N; with several digests,
    // round-robin by rank so every script contributes to the slate.
    const chosen = new Set<string>();
    const distinct = [...new Set(combined.map((t) => t.source))];
    if (distinct.length <= 1) {
      combined.filter((t) => t.rank <= targetPicks).forEach((t) => chosen.add(t.id));
    } else {
      const lists = distinct.map((s) => combined.filter((t) => t.source === s).sort((a, b) => a.rank - b.rank));
      const maxLen = Math.max(...lists.map((l) => l.length));
      for (let i = 0; i < maxLen && chosen.size < targetPicks; i++) {
        for (const l of lists) {
          if (chosen.size >= targetPicks) break;
          if (l[i]) chosen.add(l[i].id);
        }
      }
    }

    setRows(
      combined.map((t, i) => ({
        ...t,
        uid: i + 1,
        selected: chosen.has(t.id),
        postAt: defaultPostTime(i),
      }))
    );
  };

  const onFiles = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const loaded = await Promise.all(
      Array.from(list).map(async (f) => ({ name: f.name, text: await f.text() }))
    );
    const next = [...files, ...loaded];
    setFiles(next);
    parseAll(next); // uploading parses immediately — no extra click
  };

  const removeFile = (index: number) => {
    const next = files.filter((_, i) => i !== index);
    setFiles(next);
    parseAll(next);
  };

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setTimeFromInput = (r: Row, hhmm: string) => {
    const [hh, mm] = hhmm.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    update(r.id, { postAt: setWallTime(new Date(r.postAt), hh, mm, zoneId).getTime() });
  };

  // ── posted-topic history, for the 7-day novelty check ──
  // Two sources, merged: the localStorage log (has keywords, but per-browser
  // and resettable) and the server's project list (survives everything — a
  // created project is proof the topic was produced). Dates are WAT days.
  const LOG_KEY = "vid-triage-log";
  type LogEntry = { date: string; title: string; score?: number; why?: string; persona?: string; keywords?: string[] };
  const loadLog = (): LogEntry[] => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
  };
  const recentTopics = (): LogEntry[] => {
    const cutoff = watDate(-NOVELTY_DAYS); // ISO strings compare lexicographically
    return loadLog().filter((e) => e.date >= cutoff);
  };

  const [serverHistory, setServerHistory] = useState<LogEntry[]>([]);
  useEffect(() => {
    listProjectsFromServer()
      .then((projects) => {
        const cutoff = Date.now() - NOVELTY_DAYS * 86400000;
        setServerHistory(
          projects
            .filter((p) => p.createdAt >= cutoff && p.name && p.name !== "Untitled")
            .map((p) => {
              const { y, mo, d } = zonedYMD(new Date(p.createdAt), ZONES.WAT.id);
              return { date: `${y}-${String(mo + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`, title: p.name };
            })
        );
      })
      .catch(() => {}); // offline: localStorage log still covers it
  }, []);

  // Log + server projects, deduped (a triage-created project appears in both
  // under the same title and WAT day).
  const noveltyHistory = (): LogEntry[] => {
    const seen = new Set<string>();
    return [...recentTopics(), ...serverHistory].filter((e) => {
      const k = `${e.date}::${e.title.toLowerCase()}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const daysAgoOf = (date: string): number => {
    const [y, m, d] = date.split("-").map(Number);
    const [ty, tm, td] = watDate().split("-").map(Number);
    return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(y, m - 1, d)) / 86400000);
  };

  // Parse-time novelty warnings: a topic whose title/keywords share a
  // distinctive term with something posted in the window gets flagged on its
  // card, before any AI pick runs.
  const noveltyWarnings = useMemo(() => {
    const map = new Map<string, { title: string; daysAgo: number; term: string }>();
    const history = noveltyHistory().map((e) => ({
      ...e,
      tokens: sigTokens(`${e.title} ${(e.keywords ?? []).join(" ")}`),
    }));
    for (const r of rows) {
      const tokens = sigTokens(`${r.title} ${r.twitterKeywords.join(" ")}`);
      let best: { title: string; daysAgo: number; term: string } | null = null;
      for (const h of history) {
        const term = [...tokens].find((t) => h.tokens.has(t));
        if (!term) continue;
        const daysAgo = daysAgoOf(h.date);
        if (!best || daysAgo < best.daysAgo) best = { title: h.title, daysAgo, term };
      }
      if (best) map.set(r.id, best);
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, serverHistory]);
  const clearLog = () => {
    localStorage.removeItem(LOG_KEY);
    setCreated(null);
    setPickMethod(null);
    setPickNote(null);
  };
  const logSelected = (selected: Row[]) => {
    const today = watDate();
    const existing = loadLog();
    const k = (e: LogEntry) => `${e.date}::${e.title}`;
    const seen = new Set(existing.map(k));
    const additions = selected
      .map((r) => ({ date: today, title: r.title, score: r.score, why: r.why, persona: r.persona, keywords: r.twitterKeywords }))
      .filter((a) => !seen.has(k(a)));
    localStorage.setItem(LOG_KEY, JSON.stringify([...existing, ...additions]));
  };

  // Pick the on-screen face from the digest's assigned character name
  // ("Claire Donovan" → claire.png). The voice itself is pinned separately via
  // the digest's voice_id (see stateForTopic), so face and voice both match the
  // assignment. Falls back to a gender-based pick when the character has no
  // matching avatar art (older digests with no character line).
  const AVATAR_BY_NAME: Record<string, string> = {
    claire: "/avatars/claire.png",
    ethan: "/avatars/ethan.png",
    nathan: "/avatars/nathan.png",
    malik: "/avatars/malik.png",
    daniel: "/avatars/daniel.png",
    lucas: "/avatars/lucas.png",
  };
  const FEMALE_AVATAR = "/avatars/claire.png";
  const MALE_AVATARS = [
    "/avatars/nathan.png",
    "/avatars/ethan.png",
    "/avatars/malik.png",
    "/avatars/daniel.png",
    "/avatars/lucas.png",
  ];
  const avatarFor = (r: Row, maleSeq: number): string => {
    const first = (r.character ?? "").trim().split(/\s+/)[0]?.toLowerCase();
    if (first && AVATAR_BY_NAME[first]) return AVATAR_BY_NAME[first];
    return (r.gender ?? "").toLowerCase().startsWith("f") ? FEMALE_AVATAR : MALE_AVATARS[maleSeq % MALE_AVATARS.length];
  };

  // Build a minimal project state for a topic — script + parsed voice spec +
  // chosen character. The editor's loader fills everything else from defaults.
  const stateForTopic = (r: Row, avatarPath: string): SerializableState => {
    const words = r.script.trim() ? r.script.trim().split(/\s+/).length : 0;
    return {
      audioDelay: 0,
      durationInSeconds: Math.max(8, Math.round(words / SPOKEN_WPS)),
      transcript: [],
      imageTiming: [],
      intro: null,
      outro: null,
      style: DEFAULT_STYLE as unknown as Record<string, unknown>,
      avatarPath,
      scriptText: r.script,
      autoPipeline: true, // editor auto-runs voice → captions → shot list on open
      // Pre-fill the thumbnail copy from the digest's THUMBNAIL line.
      thumbnail: { copy: r.thumbnail ?? "", fontSize: 78, imageIndex: 0 },
      voiceDelivery: {
        preset: r.settings ? "custom" : DEFAULT_DELIVERY.preset,
        settings: r.settings ?? DEFAULT_DELIVERY.settings,
        // Pin the digest's assigned ElevenLabs voice so TTS reproduces it
        // exactly, independent of the avatar→voice map. ("(...)" placeholders
        // from un-designed voices are ignored.)
        voiceId: r.voiceId && !r.voiceId.startsWith("(") ? r.voiceId : undefined,
        // Expressive (v3) is always on now (the TTS route forces it). v3 caps
        // at 3000 billed chars, so overly long digest scripts will need a trim
        // before voicing.
        useV3: true,
        tags: r.tags,
        prosody: r.prosody,
        voiceDescription: r.voiceDescription,
        specRaw: r.raw,
      },
      // Posting/social brief — surfaced read-only on the project page.
      topicMeta: {
        postAt: r.postAt,
        postTiming: r.postTiming,
        platform: r.bestPlatform,
        score: r.score,
        why: r.why,
        thumbnail: r.thumbnail,
        description: r.description,
        hashtags: r.hashtags,
        captions: r.captions,
        twitterKeywords: r.twitterKeywords,
      },
    };
  };

  // Create one project per selected topic, then auto-log the slate for novelty.
  const createProjects = () => {
    // Guard against double-fire: a second click while creating (or re-clicking
    // after success) would duplicate the whole slate.
    if (creating || created !== null) return;
    const selected = rows.filter((r) => r.selected);
    if (selected.length === 0) return;
    setCreating(true);
    try {
      let firstId: string | null = null;
      let maleSeq = 0;
      for (const r of selected) {
        const avatarPath = avatarFor(r, maleSeq);
        if (!(r.gender ?? "").toLowerCase().startsWith("f")) maleSeq++;
        const meta = createProject(r.title);
        if (!firstId) firstId = meta.id;
        saveProjectState(meta.id, stateForTopic(r, avatarPath));
        createProjectOnServer(meta); // fire-and-forget sync
      }
      logSelected(selected); // auto-log: history reflects what you committed to
      if (firstId) setActiveProjectId(firstId);
      setCreated(selected.length);
    } finally {
      setCreating(false);
    }
  };

  const pickWithClaude = async () => {
    if (picking) return;
    setPicking(true);
    setCreated(null);
    try {
      const res = await fetch("/api/triage-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // "rank" here is the row uid — unique across digests (per-file ranks
          // collide when several are loaded).
          topics: rows.map((r) => ({ rank: r.uid, title: r.title, why: r.why, score: r.score, bestPlatform: r.bestPlatform, thumbnail: r.thumbnail, keywords: r.twitterKeywords, source: multiSource ? shortSource(r.source) : undefined })),
          recent: noveltyHistory(),
          target: targetPicks,
        }),
      });
      const data = await res.json();
      const ranks = new Set<number>((data.picks ?? []).map((p: { rank: number }) => p.rank));
      const reasons: Record<number, { reason: string; noveltyNote?: string }> = {};
      (data.picks ?? []).forEach((p: { rank: number; reason: string; noveltyNote?: string }) => {
        reasons[p.rank] = { reason: p.reason, noveltyNote: p.noveltyNote };
      });
      setRows((prev) => prev.map((r) => ({ ...r, selected: ranks.has(r.uid) })));
      setPickReasons(reasons);
      setSkipped(data.skipped ?? []);
      setPickMethod(data.method ?? null);
      setPickNote(data.note ?? null);
    } catch {
      setPickMethod("error");
      setPickNote(null);
    } finally {
      setPicking(false);
    }
  };

  return (
    <div
      className="min-h-dvh bg-zinc-950 text-zinc-200"
      onDragEnter={(e) => {
        if (e.dataTransfer?.types?.includes("Files")) {
          dragDepth.current++;
          setDragging(true);
        }
      }}
      onDragLeave={() => {
        if (--dragDepth.current <= 0) {
          dragDepth.current = 0;
          setDragging(false);
        }
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files);
      }}
    >
      {dragging && (
        <div className="fixed inset-0 z-50 pointer-events-none bg-zinc-950/70 flex items-center justify-center">
          <div className="border-2 border-dashed border-sky-400 rounded-xl px-10 py-8 bg-zinc-900/90 text-center">
            <div className="text-2xl mb-2">⬇</div>
            <div className="text-sm text-sky-300 font-medium">Drop digest .txt files anywhere</div>
            <div className="text-mini text-zinc-500 mt-1">They parse instantly and add to the topic pool</div>
          </div>
        </div>
      )}
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-zinc-100">Today&apos;s Topics</h1>
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">← Editor</Link>
        </div>
        <p className="text-mini text-zinc-500 mb-4">
          Upload (or paste) one or more production digests, pick your topics, and set posting times. With several digests loaded, picks draw from each to fill the slate. Topics overlapping the last {NOVELTY_DAYS} days of projects get flagged.
        </p>

        {/* Zone toggle + live dual clock */}
        <div className="flex items-center justify-between mb-4 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5">
          <div className="text-mini text-zinc-400">
            <span className="text-zinc-100 font-medium tabular-nums">{formatTime(new Date(now), zoneId)}</span>{" "}
            <span className="text-zinc-600">{ZONES[zone].label}</span>
            <span className="mx-2 text-zinc-700">·</span>
            <span className="tabular-nums">{formatTime(new Date(now), otherId)}</span>{" "}
            <span className="text-zinc-600">{ZONES[otherZone].label}</span>
          </div>
          <div className="flex items-center gap-0.5 bg-zinc-800 rounded-md p-0.5">
            {(Object.keys(ZONES) as ZoneKey[]).map((z) => (
              <Chip
                key={z}
                onClick={() => setZone(z)}
                className={`px-2.5 py-1 text-mini rounded ${zone === z ? "bg-zinc-700 text-zinc-100" : "text-zinc-400 hover:text-zinc-200"}`}
              >
                {ZONES[z].label}
              </Chip>
            ))}
          </div>
        </div>

        {/* Upload + paste + parse */}
        <input
          ref={fileRef}
          type="file"
          accept=".txt,.md,text/plain"
          multiple
          className="hidden"
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = ""; // allow re-picking the same file after removal
          }}
        />
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <Button size="sm" variant="ghost" onClick={() => fileRef.current?.click()}>
            ⬆ Upload digest (.txt)
          </Button>
          {files.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1.5 text-mini px-2 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-sky-300"
            >
              {shortSource(f.name)}
              <span className="text-sky-500/70 tabular-nums">{rows.filter((r) => r.source === f.name).length}</span>
              <button
                onClick={() => removeFile(i)}
                className="text-sky-400/70 hover:text-sky-200"
                aria-label={`Remove ${f.name}`}
                title="Remove this digest"
              >
                ×
              </button>
            </span>
          ))}
          {files.length > 0 && <span className="text-micro text-zinc-600">more files add to the pool · paste below works too</span>}
        </div>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder="…or paste a PERSONA SHORTS production digest here (you can also drop .txt files anywhere on the page)"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 resize-y focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
        />
        <div className="flex items-center gap-3 mt-2 mb-3">
          <Button size="sm" onClick={() => parseAll()}>
            Parse digest{files.length + (raw.trim() ? 1 : 0) > 1 ? "s" : ""}
          </Button>
          {rows.length > 0 && (
            <div className="flex items-center gap-1">
              <Button size="sm" variant="ghost" onClick={pickWithClaude} disabled={picking}>
                {picking ? "Picking…" : `Pick ${targetPicks} (AI)`}
              </Button>
              <div className="flex items-center bg-zinc-800 rounded-md" role="group" aria-label="Number of topics to pick">
                <button
                  onClick={() => changeTargetPicks(targetPicks - 1)}
                  disabled={picking || targetPicks <= 1}
                  className="px-1.5 py-1 text-mini text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
                  aria-label="Pick one fewer topic"
                >
                  −
                </button>
                <span className="text-mini text-zinc-300 tabular-nums w-4 text-center">{targetPicks}</span>
                <button
                  onClick={() => changeTargetPicks(targetPicks + 1)}
                  disabled={picking || targetPicks >= MAX_PICKS}
                  className="px-1.5 py-1 text-mini text-zinc-400 hover:text-zinc-100 disabled:opacity-40"
                  aria-label="Pick one more topic"
                >
                  +
                </button>
              </div>
            </div>
          )}
          {rows.length > 0 && (
            <span className="text-mini text-zinc-500">
              {rows.length} topics{multiSource ? ` from ${sourceNames.length} digests` : ""} · {selectedCount}/{targetPicks} selected
              {selectedCount > targetPicks && <span className="text-amber-400"> (over {targetPicks})</span>}
              {multiSource && (
                <span className="text-zinc-600">
                  {" "}({sourceNames.map((s) => `${rows.filter((r) => r.source === s && r.selected).length} ${shortSource(s)}`).join(" · ")})
                </span>
              )}
            </span>
          )}
          <button onClick={clearLog} className="ml-auto text-micro text-zinc-600 hover:text-zinc-400" title="Clear the local posted-topic log (server project history still applies)">
            Reset novelty log
          </button>
        </div>

        {/* Pick result banner */}
        {pickMethod && (
          <div className="mb-4 text-mini">
            {pickMethod === "claude" && <span className="text-violet-300">Claude picked {Object.keys(pickReasons).length} — balancing engagement + {NOVELTY_DAYS}-day novelty.</span>}
            {pickMethod === "groq" && <span className="text-violet-300">Groq picked {Object.keys(pickReasons).length} — balancing engagement + {NOVELTY_DAYS}-day novelty.</span>}
            {pickMethod === "score" && <span className="text-zinc-400">Picked by engagement score (no Groq/Anthropic key, or model fell back).</span>}
            {pickMethod === "error" && <span className="text-amber-400">Selection failed — left your manual picks as-is.</span>}
            {pickNote && <div className="mt-1 text-amber-400">⚠ {pickNote}</div>}
            {skipped.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {skipped.map((s) => (
                  <li key={s.rank} className="text-zinc-500">↳ skipped {rowByUid.get(s.rank)?.title ?? `#${s.rank}`}: too close to <span className="text-zinc-400">{s.similarTo}</span> — {s.why}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Topic cards — in the digest's ranked order */}
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className={`rounded-lg border p-3 transition-colors ${
                r.selected ? "border-blue-500/50 bg-blue-950/20" : "border-zinc-800 bg-zinc-900"
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={r.selected}
                  onChange={(e) => update(r.id, { selected: e.target.checked })}
                  className="mt-1 accent-blue-500 w-4 h-4 flex-shrink-0"
                  aria-label="Select topic"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-micro font-semibold text-zinc-500 tabular-nums">#{r.rank}</span>
                    {multiSource && (
                      <span className="text-micro px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-300 max-w-[10rem] truncate" title={r.source}>
                        {shortSource(r.source)}
                      </span>
                    )}
                    <span className="text-micro px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 tabular-nums">{r.score}</span>
                    <span className="text-sm font-medium text-zinc-100">{r.title}</span>
                  </div>
                  {r.why && <p className="text-mini text-zinc-400 mt-1">{r.why}</p>}
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {(r.character ?? r.persona) && (
                      <span className="text-micro px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-300">
                        {r.character ?? r.persona}{r.gender ? ` · ${r.gender[0].toUpperCase()}` : ""}
                      </span>
                    )}
                    {r.bestPlatform && <span className="text-micro px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{r.bestPlatform}</span>}
                    {r.tags && r.tags.length > 0 && <span className="text-micro px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">{r.tags.length} tags</span>}
                    {!r.voiceId || r.voiceId.startsWith("(") ? (
                      <span className="text-micro px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">voice not designed</span>
                    ) : null}
                  </div>
                  {noveltyWarnings.has(r.id) && (
                    <p className="text-mini text-amber-400 mt-1.5">
                      ⚠ “{noveltyWarnings.get(r.id)!.term}” posted{" "}
                      {noveltyWarnings.get(r.id)!.daysAgo === 0 ? "today" : `${noveltyWarnings.get(r.id)!.daysAgo}d ago`}:{" "}
                      <span className="text-amber-300/80">{noveltyWarnings.get(r.id)!.title}</span>
                    </p>
                  )}
                  {pickReasons[r.uid] && (
                    <p className="text-mini text-violet-300/90 mt-1.5">
                      ✦ {pickReasons[r.uid].reason}
                      {pickReasons[r.uid].noveltyNote ? <span className="text-violet-400/70"> · {pickReasons[r.uid].noveltyNote}</span> : null}
                    </p>
                  )}
                  {r.script && <p className="text-mini text-zinc-600 mt-1.5 line-clamp-2">{r.script}</p>}
                </div>

                {/* Time to post — editable in active zone, both zones shown */}
                <div className="flex-shrink-0 text-right w-36">
                  <label className="block text-micro text-zinc-600 mb-0.5">Post time</label>
                  <input
                    type="time"
                    value={wallHHMM(new Date(r.postAt), zoneId)}
                    onChange={(e) => setTimeFromInput(r, e.target.value)}
                    className="bg-zinc-800 border border-zinc-700 rounded px-1.5 py-1 text-xs text-zinc-200 tabular-nums focus-visible:ring-2 focus-visible:ring-blue-500"
                  />
                  <div className="text-micro text-zinc-500 mt-0.5 tabular-nums">
                    {formatTime(new Date(r.postAt), zoneId)} {ZONES[zone].label}
                    <span className="text-zinc-700"> · </span>
                    {formatTime(new Date(r.postAt), otherId)} {ZONES[otherZone].label}
                  </div>
                  {r.postTiming && <div className="text-micro text-zinc-600 mt-0.5 leading-tight">digest: {r.postTiming}</div>}
                </div>
              </div>
            </div>
          ))}
        </div>

        {rows.length === 0 && (
          <p className="text-mini text-zinc-600 text-center py-8">
            {parsedEmpty
              ? "Found 0 topics in the provided text — check the digest format (expects the PERSONA SHORTS production digest)."
              : "No topics yet — upload a .txt digest (or paste one) and hit “Parse”."}
          </p>
        )}

        {rows.length > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <Button
              size="sm"
              variant="primary"
              onClick={createProjects}
              disabled={creating || created !== null || selectedCount === 0}
            >
              {creating ? "Creating…" : `Create ${selectedCount} project${selectedCount === 1 ? "" : "s"} →`}
            </Button>
            {created !== null && (
              <span className="text-mini text-emerald-400">
                Created {created} · logged for novelty · <Link href="/" className="underline hover:text-emerald-300">open Editor →</Link>
              </span>
            )}
            <span className="text-micro text-zinc-600">Creating auto-logs the slate (WAT day) for the {NOVELTY_DAYS}-day novelty check.</span>
          </div>
        )}
      </div>
    </div>
  );
}
