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

// Current digest format: "── ELEVENLABS VOICE (assigned) ──" + a ready-to-send
// "── ELEVENLABS API CALL ──" block carrying the authoritative request.
const DIGEST_V2 = `══════════════════════════════════════════════════════════════════════
🎬 PERSONA SHORTS — PRODUCTION DIGEST — 06-24-2026
Ranked best → least for engagement.
══════════════════════════════════════════════════════════════════════

🏆 #1 — OpenAI's Jalapeño Chip Targets Nvidia   (score 89/100)
WHY: 'Jalapeño' codename hook is novel and shareable
BEST PLATFORM: All    POST TIMING: Weekday 8-9am ET

── ELEVENLABS VOICE (assigned) ──
   character: Claire Donovan (female)   voice_id: kKAaQzEMVeLLLPOrH5EV
   tts_model: eleven_multilingual_v2    settings: {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true}
   (script written by internal persona: dana_brooks)

── SOCIAL ──
   DESCRIPTION: OpenAI & Broadcom unveil Jalapeño 🌶️ #stockmarket
   HASHTAGS: #stockmarket #nvidia
   THUMBNAIL: Jalapeño Chip vs Nvidia
   ON-SCREEN CAPTIONS:
      • OpenAI + Broadcom chip: "Jalapeño"
      • Up to 50% cost savings vs Nvidia
   TWITTER KEYWORDS (find tweets to engage): $NVDA, $AVGO, OpenAI custom chip
──────────────────────────────────────────────────────────────────────
SPOKEN SCRIPT  (voice: Claire Donovan / female):
Up to fifty percent. That's the cost savings OpenAI is claiming on its first custom chip.

In plain English, cheaper to run for every answer the model spits out.

── ELEVENLABS API CALL (ready to send — add your xi-api-key) ──
POST https://api.elevenlabs.io/v1/text-to-speech/kKAaQzEMVeLLLPOrH5EV?output_format=mp3_44100_128
Headers: xi-api-key: <YOUR_ELEVENLABS_KEY> | Content-Type: application/json
Body:
{
  "text": "Up to fifty percent. That's the cost savings OpenAI is claiming on its first custom chip.\\n\\nIn plain English, cheaper to run for every answer the model spits out.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": {
    "stability": 0.5,
    "similarity_boost": 0.78,
    "style": 0.25,
    "use_speaker_boost": true
  }
}
══════════════════════════════════════════════════════════════════════

#14 — Netflix's Ugly Head-and-Shoulders Top   (score 52/100)
WHY: Technical pattern appeals to traders
BEST PLATFORM: YouTube Shorts    POST TIMING: Weekday 9:30am ET

── ELEVENLABS VOICE (assigned) ──
   character: Daniel "Dan" Wu (male)   voice_id: TB7rdtCihmzAOzwKauTT
   tts_model: eleven_multilingual_v2    settings: {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true}
   (script written by internal persona: composite_male)

── SOCIAL ──
   DESCRIPTION: NFLX breaks $75 #stocks
   HASHTAGS: #stocks #netflix
   THUMBNAIL: Netflix Falling Knife
   ON-SCREEN CAPTIONS:
      • NFLX $71.84, broke support at $75
   TWITTER KEYWORDS (find tweets to engage): $NFLX, Netflix stock
──────────────────────────────────────────────────────────────────────
SPOKEN SCRIPT  (voice: Daniel "Dan" Wu / male):
Netflix peaked near the end of last June and it's been a falling knife ever since.

── ELEVENLABS API CALL (ready to send — add your xi-api-key) ──
POST https://api.elevenlabs.io/v1/text-to-speech/TB7rdtCihmzAOzwKauTT?output_format=mp3_44100_128
Headers: xi-api-key: <YOUR_ELEVENLABS_KEY> | Content-Type: application/json
Body:
{
  "text": "Netflix peaked near the end of last June and it's been a falling knife ever since.",
  "model_id": "eleven_multilingual_v2",
  "voice_settings": { "stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true }
}
══════════════════════════════════════════════════════════════════════

BATCH: 2 shorts`;

describe("parseDigest — current format (VOICE assigned + API CALL)", () => {
  const topics = parseDigest(DIGEST_V2);

  it("finds both topics with rank/title/score", () => {
    expect(topics.map((t) => t.rank)).toEqual([1, 14]);
    expect(topics[0].title).toBe("OpenAI's Jalapeño Chip Targets Nvidia");
    expect(topics[1].title).toBe("Netflix's Ugly Head-and-Shoulders Top");
  });

  it("extracts character, gender, and the assigned voice_id", () => {
    expect(topics[0].character).toBe("Claire Donovan");
    expect(topics[0].gender).toBe("female");
    expect(topics[0].voiceId).toBe("kKAaQzEMVeLLLPOrH5EV");
    expect(topics[0].model).toBe("eleven_multilingual_v2");
    // a quoted nickname in the character name doesn't break name/gender parsing
    expect(topics[1].character).toBe('Daniel "Dan" Wu');
    expect(topics[1].gender).toBe("male");
    expect(topics[1].voiceId).toBe("TB7rdtCihmzAOzwKauTT");
  });

  it("reads voice_settings from the ready-to-send API call body", () => {
    expect(topics[0].settings).toEqual({
      stability: 0.5,
      similarity_boost: 0.78,
      style: 0.25,
      speed: 1.0,
      use_speaker_boost: true,
    });
  });

  it("keeps the verbatim script and drops the API call block", () => {
    expect(topics[0].script).toContain("Up to fifty percent.");
    expect(topics[0].script).toContain("cheaper to run");
    expect(topics[0].script).not.toContain("ELEVENLABS API CALL");
    expect(topics[0].script).not.toContain("text-to-speech");
    expect(topics[0].script).not.toContain("model_id");
    expect(topics[0].script).not.toContain("#14");
    expect(topics[1].script).toBe(
      "Netflix peaked near the end of last June and it's been a falling knife ever since."
    );
  });
});
