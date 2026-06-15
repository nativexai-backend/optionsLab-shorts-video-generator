# OptionsLab Shorts Video Generator

Internal OptionsLab tool that turns a written script into a finished, branded 9:16 short video (TikTok / Reels / Shorts style) — voiceover, word-synced captions, animated visuals, branding, and MP4 export, all in one place.

**Pipeline:** script → AI voiceover → auto-captions → AI shot list → timeline edit → branded MP4.

Built with **Next.js 16** + **Remotion 4** (React-based video rendering).

---

## Features

- **Script → Voiceover** — six presenter avatars, each mapped to an ElevenLabs voice, with one-click voice previews. Multiple "takes" per project; pick which take ships.
- **Smart TTS pronunciation** — money and numbers are normalized before synthesis (`$5.08` → "five dollars and eight cents", `102` → "one hundred and two", `2-3` → "two to three") while the script you typed stays untouched.
- **Word-synced captions** — generated audio is transcribed with word timestamps (Groq Whisper, local Whisper fallback). Karaoke-style highlighting, editable text with automatic timing re-alignment, full style controls (font, position, colors).
- **AI shot list** — the script is broken into 3–8 scenes, each with a category, suggested animation, and a production-ready image prompt (bright, modern editorial photography house style; prompts double as stock-search queries). Per-scene **Refine** regenerates a prompt, optionally steered by your direction. Providers: Groq → Claude → rule-based fallback.
- **Timeline editor** — live Remotion preview, audio waveform, draggable segments, per-image pan/zoom animations (Ken Burns, pans, zooms), drag-to-reorder slots, undo/redo (⌘Z / ⌘⇧Z).
- **Branding** — audio-reactive avatar overlay with four visualizer styles (Pulse Rings, Liquid Wave, Bars, Minimal Glow), animated intro (circle reveal / slide down), OptionsLab outro card with disclaimer, persistent "OptionsLab App" badge.
- **Background music** — optional bed that loops under the voiceover and fades out at the end.
- **Export** — server-side render to H.264 MP4 at 720×1280 or 1080×1920, with real progress reporting; renders run as jobs and survive a page reload.
- **Thumbnail generator** — pick any project image, add bold headline copy over a dark scrim, download a 720×1280 PNG cover. Settings save per project.
- **Multi-project** — auto-save (500 ms debounce), project switcher with thumbnails and date grouping, Ctrl/Cmd+S manual save, server-side persistence on disk.

## Quick start

```bash
npm install
# create .env.local — see below
npm run dev                  # http://localhost:3000
```

### Environment variables (`.env.local`)

| Variable | Required | Used for |
|---|---|---|
| `ELEVENLABS_API_KEY` | **Yes** (for voiceover) | TTS generation + avatar voice previews |
| `GROQ_API_KEY` | Recommended | Whisper transcription (captions) + script analysis + prompt refinement |
| `ANTHROPIC_API_KEY` | Optional | Claude fallback for script analysis / prompt refinement |
| `DATA_DIR` | Optional | Overrides where project data is stored (default `data/projects`) |

The app degrades gracefully: without Groq, transcription falls back to a local Whisper install and scene analysis falls back to a rule-based engine. Without ElevenLabs, voice features are disabled and the UI shows a banner. Service status: `GET /api/health`.

### Presenters / voices

Avatar images live in `public/avatars/` (filename = presenter name). The avatar→voice mapping is in `src/lib/voices.ts` — add an image and a matching ElevenLabs voice ID to add a presenter.

## Using the app

The left panel is the workflow, in order:

1. **① Script & Voice** — pick a presenter (▶ to preview their voice), write/paste the script (5,000-char limit with estimated audio duration), Generate Voiceover. Each generation creates a *take*; click **Use** on the take that should ship. Optional background music and audio delay live here too.
2. **② Visuals** — *Suggest Visuals from Script* builds the AI shot list. **Copy** prompts into your image tool, generate images, then drop them into the numbered placeholder slots (numbers/colors match the timeline). Or skip the AI and just drop images.
3. **③ Captions & Style** — captions appear automatically after a voiceover. Edit the text freely (timings re-align), tune font/position/colors.
4. **④ Branding** — avatar size/position and speaking-indicator style, badge position, intro animation, outro card (OptionsLab preset or custom).

Then **Export MP4** (top right) — name it, pick 1080×1920 or 720×1280, and the render runs server-side with live progress; the download starts automatically, even if you reloaded mid-render. **Thumbnail** (next to Export) produces a matching PNG cover.

Shortcuts: `Space` play/pause · `⌘S` save · `⌘Z`/`⌘⇧Z` undo/redo. The **Safe zones** toggle under the player shows where TikTok/Reels UI covers the frame.

## How image suggestion works

The shot list turns a script into a set of timed image slots. The guiding principle: **the AI decides _what_ to show; deterministic code decides _how long_ and _how many_** — because LLMs are unreliable at duration and word-position math, which was the original source of mis-timed and oversized blocks.

**1. Analysis (`/api/analyze-script`).** The script is broken into 3–8 content *beats*. Each beat returns a category (`person` / `logo` / `chart` / `product` / `b-roll` / `text-overlay`), the script segment it covers, a suggested animation, a priority, and a production-ready **image prompt**. Prompts follow a bright, modern editorial house style, avoid baked-in text/numbers, and double as stock-photo search queries. Provider chain: **Groq → Claude → rule-based fallback**, so it works with no paid keys (the rule engine detects tickers, executives, and trend direction via regex).

**2. Pace-aware splitting (`src/lib/scene-timing.ts`).** Before the list is shown, each beat is measured against the transcript for its real on-screen duration. Any beat longer than the pace cap is split into evenly-sized **sub-shots** at natural sentence/word boundaries, so visuals change at a watchable rhythm instead of one image held for 15+ seconds. Each sub-shot carries a real slice of the script text, so it still timestamp-matches accurately at apply time.

The **Visual pace** control (Chill / Normal / Fast ≈ 5 / 4 / 2.5s per shot) re-splits the cached beats instantly without another API call, and is saved per project. Example — a 60s video with 5 beats expands to roughly:

| Pace   | Shots | Avg length |
|--------|-------|------------|
| Chill  | ~10   | ~6s        |
| Normal | ~15   | ~4s        |
| Fast   | ~20   | ~3s        |

Short beats that are already a good length pass through unsplit. Sub-shots show a `shot 2/3` badge so it's clear which cards came from the same beat.

**3. Timing match (`computeSceneTimings`).** Each shot's text slice is matched against the transcript with a forward-only cursor (so a phrase repeated later in the script can't pull a shot to the wrong spot), then segments are built contiguously — overlaps and gaps are structurally impossible. Without a transcript yet, it estimates from word counts and firms up once a voiceover exists.

**4. Refine (`/api/refine-prompt`).** Each shot card has a **✦ Refine** button that rewrites its image prompt — once per click, optionally steered by a one-line direction ("night skyline, more dramatic"). The house-style and no-text rules always survive.

**5. Fill the slots.** *Add All to Timeline* turns every shot into a numbered placeholder slot (numbers/colors match the timeline). You **Copy** the prompt into an image tool, generate, and drop the result into the slot — or drop your own images and skip the AI entirely. The shot-list card, image slot, and timeline segment stay 1:1 by number and color.

> Roadmap tie-in: pace-aware splitting produces more, smaller slots — which the planned **image library** (see below) is designed to auto-fill from previously used assets, so recurring subjects (a ticker logo, a CEO portrait) are reused instead of re-sourced.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # entry — renders the Editor
│   └── api/
│       ├── tts/                  # ElevenLabs synthesis (+ pronunciation normalization)
│       ├── voice-preview/        # cached per-avatar voice samples
│       ├── transcribe/           # Groq Whisper → word timestamps (local Whisper fallback)
│       ├── analyze-script/       # AI shot list (Groq → Claude → rules)
│       ├── refine-prompt/        # one-shot image-prompt rewrite, optionally steered
│       ├── render/               # job-based Remotion render (POST start, GET poll/download)
│       ├── projects/             # project index + state + file sync (disk-backed)
│       └── health/               # which API keys are configured
├── components/
│   ├── Editor.tsx                # state owner: projects, takes, history, sync
│   ├── InputPanel.tsx            # the 4-step control panel
│   ├── PlayerPanel.tsx           # Remotion <Player> preview + safe zones
│   ├── Timeline*.tsx             # ruler, waveform, image track, playhead
│   ├── RenderButton.tsx          # export modal + job polling
│   └── ThumbnailModal.tsx        # canvas thumbnail generator
├── remotion/
│   ├── VideoComposition.tsx      # composition root (all layers)
│   ├── BackgroundSlideshow.tsx   # images + pan/zoom animations
│   ├── CaptionOverlay.tsx        # word-synced captions
│   ├── VoiceVisualizer.tsx       # shared audio-reactive avatar (4 styles)
│   ├── AnimatedIntro/Outro.tsx   # intro reveal, outro card
│   ├── BrandingBadge.tsx         # persistent corner badge
│   └── types.ts                  # dimensions, schemas, defaults, presets
└── lib/
    ├── storage.ts                # client persistence (localStorage + IndexedDB) + server sync
    ├── server-storage.ts         # disk persistence (data/projects), serialized index writes
    ├── transcript.ts             # Whisper token merging + caption re-alignment  [tested]
    ├── scene-timing.ts           # shot list → timeline matching                 [tested]
    ├── tts-text.ts               # money/number speech normalization            [tested]
    └── voices.ts                 # avatar → ElevenLabs voice map
```

Video constants (`src/remotion/types.ts`): 720×1280 @ 30 fps; exports can scale to 1080×1920.

## Storage model

Projects are saved in **two layers**, both local to the machine running the app:

- **Disk (source of truth): `data/projects/`** — one folder per project with `state.json` (script, captions, timings, settings) and `files/` (audio, images, takes, music as plain files). `index.json` holds names. Back up by copying this folder. Gitignored.
- **Browser (working copy)** — localStorage for state, IndexedDB for media; makes loads instant and survives server downtime. Cleared browser data is re-hydrated from disk.

Auto-save runs 500 ms after any change and syncs both layers (including the project name, which self-heals against write races).

## Development

```bash
npm run dev     # dev server (Remotion bundle rebuilds per render in dev)
npm run build   # production build
npm test        # vitest — transcript, scene-timing, and TTS-normalization suites
npm run lint
```

Notes:
- Render jobs are kept in process memory (`globalThis`) with output files in the OS temp dir — a server restart forgets in-flight jobs (the client clears its reference automatically).
- The local Whisper fallback path is configured at the top of `src/app/api/transcribe/route.ts`; adjust or rely on Groq.
- `next.config.ts` and `remotion.config.ts` carry the Remotion/Next integration settings.

## Roadmap

- **Image library** — tag previously generated images by entity/category (e.g. "Elon portrait", "Tesla logo") and match them to shot-list scenes automatically, so recurring subjects reuse existing assets instead of regenerating.
