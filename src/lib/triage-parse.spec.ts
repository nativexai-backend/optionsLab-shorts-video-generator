import { describe, it, expect } from "vitest";
import { parseDigest } from "./triage-parse";

const DIGEST = `══════════════════════════════════════════════════════════════════════
🎬 PERSONA SHORTS — PRODUCTION DIGEST — 06-23-2026
Ranked best → least for engagement.
══════════════════════════════════════════════════════════════════════

🏆 #1 — Two Stocks Just Crashed Global Tech   (score 89/100)
WHY: Two stocks = half an index, circuit breakers twice — visceral panic hook
BEST PLATFORM: All    POST TIMING: Market open, weekday 8-9am ET

── ELEVENLABS VOICE-DESIGN CONFIG ──
   persona: Dana  [dana_brooks]   |   gender: female
   voice_id: 0mJeboX1Vgl2V6CKvI9H
   voice_name: TL Dana Brooks
   voice_settings: {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true}
   suggested_audio_tags: brisk, warm, upbeat, conversational
   prosody: emotion=Upbeat | emphasis=names | pacing=Rapid
   voice_description: A female American financial-news anchor voice.

── SOCIAL ──
   DESCRIPTION: KOSPI tripped circuit breakers twice. #stockmarket
   HASHTAGS: #stockmarket #investing #stocks
   THUMBNAIL: TWO STOCKS, GLOBAL ROUT
   ON-SCREEN CAPTIONS:
      • KOSPI -10%, circuit breakers tripped twice
      • Samsung + SK Hynix = 50% of the index
   TWITTER KEYWORDS (find tweets to engage): $NVDA, $MU, KOSPI, SK Hynix
──────────────────────────────────────────────────────────────────────
SPOKEN SCRIPT  (verbatim for ElevenLabs — voice: TL Dana Brooks / female):
Two stocks. Just two. Samsung and SK Hynix make up half the entire KOSPI.

And it bled right into us. The Nasdaq one hundred sliding about two and a half.
══════════════════════════════════════════════════════════════════════

#3 — Oracle Cuts 21,000 Jobs, Blames AI   (score 84/100)
WHY: AI replacing 21K jobs admitted in writing — taps universal job-fear anxiety
BEST PLATFORM: TikTok    POST TIMING: Evening 6-9pm

── ELEVENLABS VOICE-DESIGN CONFIG ──
   persona: Margot  [margot_keller]   |   gender: female
   voice_id: nWAqyvxKOc53XlZ7XH4Y
   voice_name: TL Margot Keller
   voice_settings: {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true}
   suggested_audio_tags: [warm], [brisk], [conversational], [curious-rising-intonation on questions]
   prosody: emotion=Upbeat | emphasis=contrast words | pacing=Fast
   voice_description: A female American financial-news anchor voice, warm.

── SOCIAL ──
   DESCRIPTION: Oracle slashes 21K jobs citing AI. #stockmarket #AI
   HASHTAGS: #stockmarket #ailayoffs
   THUMBNAIL: 21,000 Gone. AI Did It
   ON-SCREEN CAPTIONS:
      • Oracle cut 21,000 jobs in 12 months
   TWITTER KEYWORDS (find tweets to engage): $ORCL, Oracle layoffs, AI job cuts
──────────────────────────────────────────────────────────────────────
SPOKEN SCRIPT  (verbatim for ElevenLabs — voice: TL Margot Keller / female):
Twenty-one thousand jobs. That's how many Oracle cut in just twelve months.
══════════════════════════════════════════════════════════════════════

BATCH: 2 shorts`;

describe("parseDigest", () => {
  const topics = parseDigest(DIGEST);

  it("finds all topics in source order with correct rank/title/score", () => {
    expect(topics.map((t) => t.rank)).toEqual([1, 3]);
    expect(topics[0].title).toBe("Two Stocks Just Crashed Global Tech");
    expect(topics[0].score).toBe(89);
    expect(topics[1].title).toBe("Oracle Cuts 21,000 Jobs, Blames AI");
    expect(topics[1].score).toBe(84);
  });

  it("extracts platform, timing, persona, and voice settings", () => {
    expect(topics[0].bestPlatform).toBe("All");
    expect(topics[0].postTiming).toBe("Market open, weekday 8-9am ET");
    expect(topics[0].persona).toBe("Dana");
    expect(topics[0].gender).toBe("female");
    expect(topics[0].voiceName).toBe("TL Dana Brooks");
    expect(topics[0].settings).toEqual({ stability: 0.5, similarity_boost: 0.78, style: 0.25, speed: 1.0, use_speaker_boost: true });
  });

  it("parses tags both plain and bracketed", () => {
    expect(topics[0].tags).toEqual(["brisk", "warm", "upbeat", "conversational"]);
    expect(topics[1].tags).toContain("warm");
    expect(topics[1].tags).toContain("conversational");
  });

  it("captures social block + verbatim script without bleed", () => {
    expect(topics[0].thumbnail).toBe("TWO STOCKS, GLOBAL ROUT");
    expect(topics[0].captions).toHaveLength(2);
    expect(topics[0].twitterKeywords).toContain("$NVDA");
    expect(topics[0].script).toContain("Two stocks. Just two.");
    expect(topics[0].script).toContain("Nasdaq one hundred");
    expect(topics[0].script).not.toContain("SOCIAL");
    expect(topics[0].script).not.toContain("#3");
    expect(topics[1].script.startsWith("Twenty-one thousand jobs.")).toBe(true);
  });
});
