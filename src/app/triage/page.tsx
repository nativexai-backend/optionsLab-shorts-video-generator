"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Chip } from "@/components/IconButton";
import { parseDigest, type ParsedTopic } from "@/lib/triage-parse";
import { DEFAULT_DELIVERY } from "@/lib/voices";
import { DEFAULT_STYLE } from "@/remotion/types";
import {
  createProject,
  saveProjectState,
  setActiveProjectId,
  createProjectOnServer,
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

type Row = ParsedTopic & { selected: boolean; postAt: number };

const TARGET_PICKS = 5;
const SPOKEN_WPS = 2.5; // rough words/sec, matches the editor's estimate

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

export default function TriagePage() {
  const [raw, setRaw] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [zone, setZone] = useState<ZoneKey>("WAT");
  const [now, setNow] = useState(() => Date.now());
  const [picking, setPicking] = useState(false);
  const [pickReasons, setPickReasons] = useState<Record<number, { reason: string; noveltyNote?: string }>>({});
  const [skipped, setSkipped] = useState<{ rank: number; similarTo: string; why: string }[]>([]);
  const [pickMethod, setPickMethod] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const zoneId = ZONES[zone].id;
  const otherZone: ZoneKey = zone === "WAT" ? "ET" : "WAT";
  const otherId = ZONES[otherZone].id;

  const selectedCount = useMemo(() => rows.filter((r) => r.selected).length, [rows]);

  const parse = () => {
    const topics = parseDigest(raw);
    setRows(
      topics.map((t, i) => ({
        ...t,
        selected: t.rank <= TARGET_PICKS, // pre-select the source's top 5
        postAt: defaultPostTime(i),
      }))
    );
  };

  const update = (id: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const setTimeFromInput = (r: Row, hhmm: string) => {
    const [hh, mm] = hhmm.split(":").map(Number);
    if (Number.isNaN(hh) || Number.isNaN(mm)) return;
    update(r.id, { postAt: setWallTime(new Date(r.postAt), hh, mm, zoneId).getTime() });
  };

  // ── posted-topic history (localStorage), for the 3-day novelty check ──
  // Dates are WAT calendar days so the window matches the local schedule.
  const LOG_KEY = "vid-triage-log";
  type LogEntry = { date: string; title: string; score?: number; why?: string; persona?: string; keywords?: string[] };
  const loadLog = (): LogEntry[] => {
    try { return JSON.parse(localStorage.getItem(LOG_KEY) || "[]"); } catch { return []; }
  };
  const recentTopics = (): LogEntry[] => {
    const cutoff = watDate(-3); // ISO strings compare lexicographically
    return loadLog().filter((e) => e.date >= cutoff);
  };
  const clearLog = () => {
    localStorage.removeItem(LOG_KEY);
    setCreated(null);
    setPickMethod(null);
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
  const MALE_AVATARS = ["/avatars/nathan.png", "/avatars/ethan.png"];
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
        useV3: false,
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
    setPicking(true);
    setCreated(null);
    try {
      const res = await fetch("/api/triage-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topics: rows.map((r) => ({ rank: r.rank, title: r.title, why: r.why, score: r.score, bestPlatform: r.bestPlatform, thumbnail: r.thumbnail, keywords: r.twitterKeywords })),
          recent: recentTopics(),
          target: TARGET_PICKS,
        }),
      });
      const data = await res.json();
      const ranks = new Set<number>((data.picks ?? []).map((p: { rank: number }) => p.rank));
      const reasons: Record<number, { reason: string; noveltyNote?: string }> = {};
      (data.picks ?? []).forEach((p: { rank: number; reason: string; noveltyNote?: string }) => {
        reasons[p.rank] = { reason: p.reason, noveltyNote: p.noveltyNote };
      });
      setRows((prev) => prev.map((r) => ({ ...r, selected: ranks.has(r.rank) })));
      setPickReasons(reasons);
      setSkipped(data.skipped ?? []);
      setPickMethod(data.method ?? null);
    } catch {
      setPickMethod("error");
    } finally {
      setPicking(false);
    }
  };

  return (
    <div className="min-h-dvh bg-zinc-950 text-zinc-200">
      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-lg font-semibold text-zinc-100">Today&apos;s Topics</h1>
          <Link href="/" className="text-xs text-zinc-400 hover:text-zinc-200 transition-colors">← Editor</Link>
        </div>
        <p className="text-mini text-zinc-500 mb-4">
          Paste the day&apos;s production digest, pick {TARGET_PICKS}, and set posting times. Novelty check vs the last 3 days comes next.
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

        {/* Paste + parse */}
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          rows={5}
          placeholder="Paste the full PERSONA SHORTS production digest here…"
          className="w-full bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-300 placeholder:text-zinc-600 resize-y focus-visible:ring-2 focus-visible:ring-blue-500 font-mono"
        />
        <div className="flex items-center gap-3 mt-2 mb-3">
          <Chip onClick={parse} className="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500">
            Parse digest
          </Chip>
          {rows.length > 0 && (
            <Chip
              onClick={pickWithClaude}
              className="px-3 py-1.5 text-xs rounded bg-violet-600 text-white hover:bg-violet-500"
            >
              {picking ? "Picking…" : `Pick ${TARGET_PICKS} (AI)`}
            </Chip>
          )}
          {rows.length > 0 && (
            <span className="text-mini text-zinc-500">
              {rows.length} topics · {selectedCount}/{TARGET_PICKS} selected
              {selectedCount > TARGET_PICKS && <span className="text-amber-400"> (over {TARGET_PICKS})</span>}
            </span>
          )}
          <button onClick={clearLog} className="ml-auto text-micro text-zinc-600 hover:text-zinc-400" title="Clear the 3-day posted-topic history (for clean re-tests)">
            Reset novelty log
          </button>
        </div>

        {/* Pick result banner */}
        {pickMethod && (
          <div className="mb-4 text-mini">
            {pickMethod === "claude" && <span className="text-violet-300">Claude picked {TARGET_PICKS} — balancing engagement + 3-day novelty.</span>}
            {pickMethod === "groq" && <span className="text-violet-300">Groq picked {TARGET_PICKS} — balancing engagement + 3-day novelty.</span>}
            {pickMethod === "score" && <span className="text-zinc-400">Picked by engagement score (no Groq/Anthropic key, or model fell back).</span>}
            {pickMethod === "error" && <span className="text-amber-400">Selection failed — left your manual picks as-is.</span>}
            {skipped.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {skipped.map((s) => (
                  <li key={s.rank} className="text-zinc-500">↳ skipped #{s.rank}: too close to <span className="text-zinc-400">{s.similarTo}</span> — {s.why}</li>
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
                  {pickReasons[r.rank] && (
                    <p className="text-mini text-violet-300/90 mt-1.5">
                      ✦ {pickReasons[r.rank].reason}
                      {pickReasons[r.rank].noveltyNote ? <span className="text-violet-400/70"> · {pickReasons[r.rank].noveltyNote}</span> : null}
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
          <p className="text-mini text-zinc-600 text-center py-8">No topics yet — paste the digest and hit “Parse digest”.</p>
        )}

        {rows.length > 0 && (
          <div className="mt-6 flex items-center gap-3">
            <Chip
              onClick={createProjects}
              className={`px-3 py-1.5 text-xs rounded text-white ${selectedCount === 0 || creating ? "bg-zinc-700 cursor-not-allowed" : "bg-emerald-600 hover:bg-emerald-500"}`}
            >
              {creating ? "Creating…" : `Create ${selectedCount} project${selectedCount === 1 ? "" : "s"} →`}
            </Chip>
            {created !== null && (
              <span className="text-mini text-emerald-400">
                Created {created} · logged for novelty · <Link href="/" className="underline hover:text-emerald-300">open Editor →</Link>
              </span>
            )}
            <span className="text-micro text-zinc-600">Creating auto-logs the slate (WAT day) for the 3-day novelty check.</span>
          </div>
        )}
      </div>
    </div>
  );
}
