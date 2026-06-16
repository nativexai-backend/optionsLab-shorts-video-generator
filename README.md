# OptionsLab Shorts Video Generator

Internal OptionsLab tool that turns a written script into a finished, branded 9:16 short video (TikTok / Reels / Shorts style) — voiceover, word-synced captions, animated visuals, branding, and MP4 export, all in one place.

**Pipeline:** script → AI voiceover → auto-captions → AI shot list → timeline edit → branded MP4.

Built with **Next.js 16** + **Remotion 4** (React-based video rendering).

---

## Features

- **Script → Voiceover** — six presenter avatars, each mapped to an ElevenLabs voice, with one-click voice previews. Multiple "takes" per project; pick which take ships.
- **Smart TTS pronunciation** — money and numbers are normalized before synthesis (`$5.08` → "five dollars and eight cents", `102` → "one hundred and two", `2-3` → "two to three") while the script you typed stays untouched.
- **Word-synced captions** — generated audio is transcribed with word timestamps (Groq Whisper, local Whisper fallback). Karaoke-style highlighting, editable text with automatic timing re-alignment, full style controls (font, position, colors).
- **AI shot list** — the script is broken into beats, each with a category, suggested animation, and a production-ready image prompt (bright, modern editorial photography house style; prompts double as stock-search queries). A **Visual pace** control (Chill / Normal / Fast) auto-splits long beats into evenly-paced shots; per-scene **Refine** rewrites a prompt (optionally steered), and a per-card delete removes a block from the shot list and timeline at once. Providers: Groq → Claude → rule-based fallback.
- **Smart image library** — images you drop into scenes are saved and auto-tagged (filename + scene context), then surfaced as thumbnail matches on future shot cards so recurring subjects (a ticker logo, a CEO portrait) are reused instead of re-sourced. Browse/search/edit-tags in the Library modal.
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
| `ANTHROPIC_API_KEY` (or `ANTHROPIC`) | Optional | Claude for script analysis / prompt refinement (either name is accepted) |
| `DATA_DIR` | Optional | Overrides where project data is stored (default `data/projects`) |
| `LIBRARY_DIR` | Optional | Overrides the image-library location (default `data/library`) |

The app degrades gracefully: without Groq, transcription falls back to a local Whisper install and scene analysis falls back to a rule-based engine. Without ElevenLabs, voice features are disabled and the UI shows a banner. Service status: `GET /api/health`.

**TTS cost note:** the voice model is `eleven_multilingual_v2` (≈1 ElevenLabs credit per character, so a ~1,200-char script ≈ ~1,200 credits per take). To roughly halve credit usage, switch `TTS_MODEL_ID` in `src/lib/voices.ts` to `eleven_flash_v2_5` (≈0.5 credit/char, also faster). Each generated *take* re-charges the full script, so fewer takes = lower spend.

### Presenters / voices

Avatar images live in `public/avatars/` (filename = presenter name). The avatar→voice mapping is in `src/lib/voices.ts` — add an image and a matching ElevenLabs voice ID to add a presenter.

## Using the app

The left panel is the workflow, in order:

1. **① Script & Voice** — pick a presenter (▶ to preview their voice), write/paste the script (5,000-char limit with estimated audio duration), Generate Voiceover. Each generation creates a *take*; click **Use** on the take that should ship. Optional background music and audio delay live here too.
2. **② Visuals** — *Suggest Visuals from Script* builds the AI shot list. Set the **Visual pace** (Chill / Normal / Fast); **Copy** prompts into your image tool or pick a **library match** thumbnail on the card; drop images into the numbered placeholder slots (numbers/colors match the timeline). **Re-sync Timeline** re-paces existing slots; the **×** on a card deletes that block everywhere. Or skip the AI and just drop images.
3. **③ Captions & Style** — captions appear automatically after a voiceover. Edit the text freely (timings re-align), tune font/position/colors.
4. **④ Branding** — avatar size/position and speaking-indicator style, badge position, intro animation, outro card (OptionsLab preset or custom).

Then **Export MP4** (top right) — name it, pick 1080×1920 or 720×1280, and the render runs server-side with live progress; the download starts automatically, even if you reloaded mid-render. **Thumbnail** (next to Export) produces a matching PNG cover.

Shortcuts: `Space` play/pause · `⌘S` save · `⌘Z`/`⌘⇧Z` undo/redo. The **Safe zones** toggle under the player shows where TikTok/Reels UI covers the frame.

## How image suggestion works

The shot list turns a script into a set of timed image slots. The guiding principle: **the AI decides _what_ to show; deterministic code decides _how long_ and _how many_** — because LLMs are unreliable at duration and word-position math, which was the original source of mis-timed and oversized blocks.

**1. Analysis (`/api/analyze-script`).** The script is broken into 3–8 content *beats*. Each beat returns a category (`person` / `logo` / `chart` / `product` / `b-roll` / `text-overlay`), the script segment it covers, a suggested animation, a priority, and a production-ready **image prompt**. Prompts follow a bright, modern editorial house style, avoid baked-in text/numbers, and double as stock-photo search queries. Provider chain: **Groq → Claude → rule-based fallback**, so it works with no paid keys (the rule engine detects tickers, executives, and trend direction via regex).

**2. Pace-aware splitting (`src/lib/scene-timing.ts`).** Before the list is shown, each beat is measured against the transcript for its real on-screen duration. Any beat longer than the pace cap is split into evenly-sized **sub-shots** at natural sentence/word boundaries, so visuals change at a watchable rhythm instead of one image held for 15+ seconds. Each sub-shot carries a real slice of the script text, so it still timestamp-matches accurately at apply time.

The **Visual pace** control (Chill / Normal / Fast ≈ 9 / 6 / 4.5s per shot) re-splits the beats instantly without another API call, and is saved per project. A beat splits into `round(duration / target)` shots, so it only divides once it's clearly longer than the target. Example — a ~60s video:

| Pace   | ~Shots | Per shot |
|--------|--------|----------|
| Chill  | 6–8    | ~9s      |
| Normal | 10–12  | ~6s      |
| Fast   | 13–16  | ~4.5s    |

Short beats that are already a good length pass through unsplit. **Re-sync Timeline** re-paces existing slots (carrying assigned images onto the right new slots by time, exposing the freshly-split ones as empties). Sub-shots show a `shot 2/3` badge so it's clear which cards came from the same beat.

**3. Timing match (`computeSceneTimings`).** Each shot's text slice is matched against the transcript with a forward-only cursor (so a phrase repeated later in the script can't pull a shot to the wrong spot), then segments are built contiguously — overlaps and gaps are structurally impossible. Without a transcript yet, it estimates from word counts and firms up once a voiceover exists.

**4. Refine (`/api/refine-prompt`).** Each shot card has a **✦ Refine** button that rewrites its image prompt — once per click, optionally steered by a one-line direction ("night skyline, more dramatic"). The house-style and no-text rules always survive.

**5. Fill the slots.** *Add All to Timeline* turns every shot into a numbered placeholder slot (numbers/colors match the timeline). You **Copy** the prompt into an image tool, generate, and drop the result into the slot — or pick a library match, or drop your own images and skip the AI entirely. The shot-list card, image slot, and timeline segment stay 1:1 by number and color.

## Smart image library

A reusable, self-building asset library so recurring subjects don't get re-sourced every time.

- **Storage (`src/lib/library-storage.ts`).** Images live in `data/library/` — `index.json` (the records) + `files/<contenthash>.<ext>`. The id is a content hash, so identical bytes **dedupe** to one record (drop the same Tesla logo into 10 projects → one entry with a usage count). No database; same file-based pattern as `data/projects/`.
- **Auto-capture.** When an image is assigned to a scene slot it's POSTed to the library and tagged automatically from the **filename** + the scene's **category and description** (harvested free from the analyzer — no vision model in the MVP). Descriptive filenames (`tesla-logo.png`, `elon-musk-stage.jpg`) make matching sharp.
- **Matching (`src/lib/library-types.ts`, tested).** Content overlap is **required** — an image only matches a shot if it shares keywords (tags weighted highest, then description); category and usage only re-rank among already-relevant results, never surface unrelated images on their own. Each shot card shows up to 6 thumbnail matches; clicking one loads it into the slot.
- **Library browser.** The **Library** button (top bar) opens a modal to search/filter all images and edit tags / description / category / delete — for correcting any mis-tags, which improves matching immediately.
- **API:** `/api/library` (GET search, POST add), `/api/library/[id]` (PATCH/DELETE), `/api/library/[id]/file` (serve).

Phase 2 (not built): vision auto-tagging, embedding-based matching if keywords prove insufficient, cloud storage if multi-machine.

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
│       ├── library/              # image library: search/add, [id] PATCH/DELETE, [id]/file
│       ├── projects/             # project index + state + file sync (disk-backed)
│       └── health/               # which API keys are configured
├── components/
│   ├── Editor.tsx                # state owner: projects, takes, history, sync
│   ├── InputPanel.tsx            # the 4-step control panel
│   ├── PlayerPanel.tsx           # Remotion <Player> preview + safe zones
│   ├── Timeline*.tsx             # ruler, waveform, image track, playhead
│   ├── RenderButton.tsx          # export modal + job polling
│   ├── ThumbnailModal.tsx        # canvas thumbnail generator
│   └── LibraryModal.tsx          # image library browser + tag editor
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
    ├── scene-timing.ts           # shot list → timeline matching + pace splitting [tested]
    ├── tts-text.ts               # money/number speech normalization            [tested]
    ├── library-storage.ts        # disk persistence for the image library
    ├── library-types.ts          # library records + relevance matching         [tested]
    ├── library-client.ts         # client wrappers for the library API
    ├── anthropic.ts              # resolves ANTHROPIC_API_KEY or ANTHROPIC
    └── voices.ts                 # avatar → ElevenLabs voice map + TTS model
```

Video constants (`src/remotion/types.ts`): 720×1280 @ 30 fps; exports can scale to 1080×1920.

## Storage model

Projects are saved in **two layers**, both local to the machine running the app:

- **Disk (source of truth): `data/projects/`** (and `data/library/` for the shared image library) — one folder per project with `state.json` (script, captions, timings, settings) and `files/` (audio, images, takes, music as plain files). `index.json` holds names. Back up by copying `data/`. Gitignored.
- **Browser (working copy)** — localStorage for state, IndexedDB for media; makes loads instant and survives server downtime. Cleared browser data is re-hydrated from disk.

Auto-save runs 500 ms after any change and syncs both layers (including the project name, which self-heals against write races).

## Development

```bash
npm run dev     # dev server (Remotion bundle rebuilds per render in dev)
npm run build   # production build
npm test        # vitest — transcript, scene-timing, TTS-normalization, library-matching suites
npm run lint
```

Notes:
- Render jobs are kept in process memory (`globalThis`) with output files in the OS temp dir — a server restart forgets in-flight jobs (the client clears its reference automatically).
- The local Whisper fallback path is configured at the top of `src/app/api/transcribe/route.ts`; adjust or rely on Groq.
- `next.config.ts` and `remotion.config.ts` carry the Remotion/Next integration settings.

## Roadmap

- **Vision auto-tagging** — send captured images to a vision model to tag people/logos/objects automatically, on top of the current filename + scene-context tagging.
- **Semantic matching** — embedding-based library search if keyword matching proves insufficient.
- **Cheaper/faster TTS default** — option to switch the voice model to `eleven_flash_v2_5` (≈half the credits).
