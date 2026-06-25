# OptionsLab Shorts Video Generator

Internal OptionsLab tool that turns a written script into a finished, branded 9:16 short video (TikTok / Reels / Shorts style) — voiceover, word-synced captions, animated visuals, branding, and MP4 export, all in one place.

**Pipeline:** script → AI voiceover → auto-captions → AI shot list → timeline edit → branded MP4.

Built with **Next.js 16** + **Remotion 4** (React-based video rendering).

---

## Features

- **Script → Voiceover** — six presenter avatars, each mapped to an ElevenLabs voice, with one-click voice previews. Multiple "takes" per project; pick which take ships. **Delivery presets** (Anchor / Default / Measured / Warm / Energetic, or hand-tuned Custom) steer stability, similarity, style, and speed without changing the voice; an optional **Eleven v3 expressive mode** understands inline `[audio tags]` (`[warm]`, `[curious]`, `[laughs]`) for more characterful reads.
- **Smart TTS pronunciation** — money, numbers, and whole-number percentages are normalized before synthesis (`$5.08` → "five dollars and eight cents", `102` → "one hundred and two", `2-3` → "two to three", `300%` → "three hundred percent") while the script you typed stays untouched. A global **pronunciation dictionary** (top-bar **Pronounce** button) fixes terms TTS mangles — `G7` → "G seven", `FOMC` → "F O M C", `OPEC` → "Oh-peck" — applied only to the spoken text, not the on-screen captions.
- **Word-synced captions** — generated audio is transcribed with word timestamps (Groq Whisper, local Whisper fallback). Karaoke-style highlighting, editable text with automatic timing re-alignment, full style controls (font, position, colors).
- **AI shot list** — the script is broken into beats, each with a category, suggested animation, and a production-ready image prompt (bright, modern editorial photography house style; prompts double as stock-search queries, and stay strictly on the segment's named subject). A **Visual pace** control (Chill / Normal / Fast) auto-splits long beats into evenly-paced shots; per-scene **Refine** rewrites a prompt (optionally steered), and a per-card delete removes a block from the shot list and timeline at once. Provider selectable per session (**Claude by default** for quality; Groq and a rule-based engine also available).
- **Stock photo search (Pexels + Google)** — each shot card has a **Find photos** button that searches **Pexels** first (bright editorial photography) and falls back to **SerpApi / Google Images** for named people and company logos. Source-aware queries (rich visual prompt for Pexels, concise entity query for Google), an editable search box, and quick chips (🏢 HQ + logo · Logo · Storefront · Portrait). Picks are downloaded and saved into the library automatically.
- **Smart image library** — images you drop into scenes (or pick from stock search) are saved and auto-tagged (filename + scene context), then surfaced as thumbnail matches on future shot cards so recurring subjects (a ticker logo, a CEO portrait) are reused instead of re-sourced. Browse/search/edit-tags in the Library modal.
- **Animated stock charts** — branded, on-brand charts that *draw in as the video plays* (replacing off-brand TradingView screenshots). Real OHLC data when a provider key is set, or a realistic synthetic series centered on the ticker's real price level otherwise. Searchable **ticker picker** auto-fills the company name; **real company logos** render in the chart header (with a monogram fallback). Modern card design: logo + ticker/company + date, price + change, a smooth draw-in spline with a glowing endpoint, dashed drop line, and date-labeled x-axis (line / candles / area).
- **API usage tracking** — per-project, per-API consumption (ElevenLabs characters ≈ credits, Groq/Claude tokens, Whisper seconds) with an overall view, so you can see where spend goes. Top-bar **Usage** button.
- **Timeline editor** — live Remotion preview, audio waveform, draggable segments, per-image pan/zoom animations (Ken Burns, pans, zooms), drag-to-reorder slots that keep the shot list in lockstep, undo/redo (⌘Z / ⌘⇧Z).
- **Multi-track timeline** — clips can sit on stacked tracks (z-order: track 0 is the base layer, higher tracks render on top) with a per-clip transform (position + size box) for picture-in-picture / overlay shots. Drag clips between rows, or use the add-track row to stack a new layer. Fully back-compatible: projects without tracks render identically as a single full-frame base layer.
- **Daily triage (`/triage`)** — paste the day's "PERSONA SHORTS" production digest and it's parsed deterministically into ranked topics; optionally let **Claude pick the top 5** balancing engagement score against a 3-day novelty check, set per-topic posting times across **WAT/ET** timezones, then spin up a ready-to-edit project per selected topic (script + voice spec + presenter prefilled, pipeline auto-runs on open).
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
| `ANTHROPIC_API_KEY` (or `ANTHROPIC`) | Recommended | Claude — the default engine for script analysis / prompt refinement (either name is accepted) |
| `GROQ_API_KEY` | Recommended | Whisper transcription (captions) + alternate script-analysis provider |
| `PEXEL_API_KEY` | Optional | Pexels stock-photo search (free at pexels.com/api). Primary source for shot images. |
| `SERPAPI_API_KEY` | Optional | SerpApi / Google Images — fallback for named people and company logos (serpapi.com) |
| `TICKER_LOGO_API_KEY` | Optional | Real company logos in chart headers. Without it, the chart shows a ticker monogram. |
| `TWELVE_DATA_API_KEY` | Optional | Real OHLC data for stock charts (free tier at twelvedata.com). Without it, charts use a realistic synthetic series. |
| `DATA_DIR` | Optional | Overrides where project data is stored (default `data/projects`) |
| `LIBRARY_DIR` | Optional | Overrides the image-library location (default `data/library`) |
| `PRONUNCIATION_PATH` | Optional | Overrides the pronunciation-dictionary file (default `data/pronunciation.json`) |

The app degrades gracefully: without Groq, transcription falls back to a local Whisper install and scene analysis falls back to a rule-based engine. Without ElevenLabs, voice features are disabled and the UI shows a banner. Service status: `GET /api/health`.

**TTS cost note:** the voice model is `eleven_multilingual_v2` (≈1 ElevenLabs credit per character, so a ~1,200-char script ≈ ~1,200 credits per take). To roughly halve credit usage, switch `TTS_MODEL_ID` in `src/lib/voices.ts` to `eleven_flash_v2_5` (≈0.5 credit/char, also faster). Each generated *take* re-charges the full script, so fewer takes = lower spend.

### Presenters / voices

Avatar images live in `public/avatars/` (filename = presenter name). The avatar→voice mapping is in `src/lib/voices.ts` — add an image and a matching ElevenLabs voice ID to add a presenter.

## Using the app

The left panel is the workflow, in order:

1. **① Script & Voice** — pick a presenter (▶ to preview their voice), write/paste the script (5,000-char limit with estimated audio duration), Generate Voiceover. Each generation creates a *take*; click **Use** on the take that should ship. Optional background music and audio delay live here too.
2. **② Visuals** — *Suggest Visuals from Script* builds the AI shot list (Claude by default). Set the **Visual pace** (Chill / Normal / Fast); **Copy** prompts into your image tool, pick a **library match** thumbnail, or click **Find photos** to search Pexels/Google and drop a stock photo straight onto the slot (auto-saved to the library). Drop your own images into the numbered placeholder slots (numbers/colors match the timeline). **Re-sync Timeline** re-paces existing slots; the **×** on a card deletes that block everywhere. Or skip the AI and just drop images.
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

**5. Fill the slots.** *Add All to Timeline* turns every shot into a numbered placeholder slot (numbers/colors match the timeline). You **Copy** the prompt into an image tool, generate, and drop the result into the slot — or pick a library match, **Find photos** from stock search, or drop your own images and skip the AI entirely. The shot-list card, image slot, and timeline segment stay 1:1 by number and color.

## Smart image library

A reusable, self-building asset library so recurring subjects don't get re-sourced every time.

- **Storage (`src/lib/library-storage.ts`).** Images live in `data/library/` — `index.json` (the records) + `files/<contenthash>.<ext>`. The id is a content hash, so identical bytes **dedupe** to one record (drop the same Tesla logo into 10 projects → one entry with a usage count). No database; same file-based pattern as `data/projects/`.
- **Auto-capture.** When an image is assigned to a scene slot it's POSTed to the library and tagged automatically from the **filename** + the scene's **category and description** (harvested free from the analyzer — no vision model in the MVP). Descriptive filenames (`tesla-logo.png`, `elon-musk-stage.jpg`) make matching sharp.
- **Matching (`src/lib/library-types.ts`, tested).** Content overlap is **required** — an image only matches a shot if it shares keywords (tags weighted highest, then description); category and usage only re-rank among already-relevant results, never surface unrelated images on their own. Each shot card shows up to 3 inline thumbnail matches (clicking one loads it into the slot); **Find photos** opens the full picker with stock search.
- **Library browser.** The **Library** button (top bar) opens a modal to search/filter all images and edit tags / description / category / delete — for correcting any mis-tags, which improves matching immediately.
- **API:** `/api/library` (GET search, POST add), `/api/library/[id]` (PATCH/DELETE), `/api/library/[id]/file` (serve).

Phase 2 (not built): vision auto-tagging, embedding-based matching if keywords prove insufficient, cloud storage if multi-machine.

## Stock photo search (Pexels + Google)

Source images per scene without leaving the app, via the **Find photos** button on each shot card. Opens a scene-aware picker (`ImageSuggestModal`).

- **Two providers, the right query for each (`/api/stock-photo`).** **Pexels** is primary — free, bright editorial photography that fits the house style — searched on the scene's rich visual prompt. **SerpApi / Google Images** is the fallback for the things stock libraries lack (named executives, politicians, specific company signage), searched on a *concise entity query*. Both keys stay server-side; results are normalized to one shape. **Auto** does Pexels then tops up with Google; you can force either source.
- **Streamlined to context.** The query is derived subject-first from the prompt (Google gets `Nvidia headquarters building logo sign`, not the full editorial sentence — which is the difference between on-target results and noise). An editable search box and quick chips (**🏢 HQ + logo · Logo · Storefront · Portrait**) retarget instantly — so searching a company returns its HQ with signage, and people resolve to real photos.
- **Saved on pick (`POST /api/stock-photo`).** A chosen photo is downloaded server-side (browser UA + timeout, magic-byte sniffing, and a thumbnail fallback when a source blocks the request) and stored in the library with scene-derived tags — so it's reused next time and ships offline in the render. The modal shows scene suggestions (library matches + stock) up top, with the full library tucked behind a collapsible "Show all".

## Animated stock charts

On-brand charts that draw in as the video plays, instead of pasting TradingView screenshots (which drag in their own chrome/watermark/theme).

- **Data (`/api/chart-data`).** Fetches real OHLC from **Twelve Data** when `TWELVE_DATA_API_KEY` is set; otherwise generates a **realistic synthetic series** centered on the ticker's reference price — the close tracks a deterministic trend line with bounded, volatility-clustered wiggle, so the direction is reliable (up / down / volatile / crash→recover) while still looking like real price action. Candle data is **embedded in the chart segment**, so the video render never hits the network.
- **Company logos (`/api/ticker-logo`).** The chart header shows the **real company logo**, proxied server-side (keeping `TICKER_LOGO_API_KEY` private) and embedded as a self-contained data URL so it renders offline. Theme-aware (dark/light) with a fallback to the other theme, and a ticker-monogram fallback when no logo exists.
- **Rendering.** A timeline segment is either an image **or** a chart (`ImageSegment.chart`). `AnimatedChart.tsx` is a pure SVG component driven by a `progress` (0..1) prop — *no Remotion hooks* — so the **same component powers both the live video and the modal's rAF preview**. The line is a smooth Catmull-Rom spline that draws in left-to-right (revealed by interpolating the tip, so the line and its glowing endpoint marker never desync), with a dashed drop line and a date-labeled x-axis; charts skip the Ken Burns pan/zoom. Card layout: logo + ticker/company + date, price + change (spaced to never overlap), line / candles / area.
- **Creating one.** Top-bar **Chart** button → modal: a searchable **ticker picker** (type a symbol or company name) that auto-fills the company and centers the price; range, trend (shapes the synthetic fallback), style, theme — with a live animated preview. *Add to timeline* replaces the selected slot or appends a new segment. Charts persist with the project (spec embedded in `imageTiming`), so they re-render identically on reload and in the exported MP4.

## Pronunciation dictionary

A global term→spoken-form map that fixes how the TTS voice says acronyms and names that number/money rules can't predict.

- **Where it applies.** The dictionary is applied to the text sent to ElevenLabs **only** — the stored script and the on-screen captions keep their original spelling. Order: dictionary (`G7` → "G seven") → money/number/percentage expansion. Matching is whole-word and case-insensitive, longest term first (so `G20` wins over `G2`).
- **Editing.** The top-bar **Pronounce** button opens a modal to add/edit/remove entries. Ships seeded with common finance/news terms (`G7`, `G20`, `FOMC`, `OPEC`, `NATO`, `ECB`, `GDP`, `CPI`, `FISA`).
- **Storage / API.** One JSON file (`data/pronunciation.json`, override with `PRONUNCIATION_PATH`). `GET /api/pronunciation` reads it (seeded with defaults on first run); `PUT` replaces it.

## Daily triage

A standalone page (`/triage`) for turning the day's content digest into a batch of ready-to-edit projects, in ranked order.

- **Deterministic parse (`src/lib/triage-parse.ts`, tested).** The "PERSONA SHORTS — PRODUCTION DIGEST" is a highly regular format, so it's parsed with no LLM: topics are split on their `#N — Title (score X/100)` headers, and each block yields its voice-design config (persona, gender, voice spec → delivery settings + audio tags), social block (description, hashtags, thumbnail copy, captions, Twitter keywords), and the verbatim spoken script. The source already ranks topics by engagement, so correct parsing alone gives the right order.
- **AI pick (`/api/triage-select`).** *Pick 5 (Claude)* asks Claude (`claude-sonnet-4-6`) to choose the strongest topics while balancing each one's engagement score against a **3-day novelty check** — recently-posted topics are kept in a local log (`vid-triage-log`) and the model skips anything too similar, explaining why. Falls back to pure score order when no Anthropic key is set.
- **Scheduling (`src/lib/timezones.ts`).** Per-topic post times are editable in either **WAT** or **ET**, with a live dual clock and staggered defaults (5:00 PM ET, +90 min apart). The digest's own suggested timing is shown alongside.
- **Create projects.** Selected topics each become a new project — script, parsed voice delivery spec, and gender-matched presenter (female → Claire; male → Nathan/Ethan) prefilled — with `autoPipeline` on so the editor auto-runs voice → captions → shot list when the project opens. (Digest `voice_id`s are ignored; the app reuses its own designed TL characters from `AVATAR_VOICE_MAP`.)

## API usage

The top-bar **Usage** button shows per-project, per-API consumption plus overall totals: ElevenLabs **characters** (≈ credits), Groq / Claude **tokens**, Whisper **seconds**. Each API route records its real reported usage against the current project (`data/usage.json`, gitignored). Tracking starts when the feature is added — earlier usage isn't retroactive.

The **AI provider** dropdown in ② Visuals (Auto / Groq / Claude / Rules) applies to both *Suggest Visuals* and *✦ Refine*. It **defaults to Claude** for the best visual quality (falling back to Auto if no Anthropic key is configured), and is populated from `/api/health` on load. **Auto** tries Groq first (free); **Rules** is the no-key regex engine.

## Architecture

```
src/
├── app/
│   ├── page.tsx                  # entry — renders the Editor
│   ├── triage/                   # daily digest → ranked topics → batch project creation
│   └── api/
│       ├── triage-select/        # Claude picks top topics (engagement + 3-day novelty)
│       ├── tts/                  # ElevenLabs synthesis (+ pronunciation + number normalization)
│       ├── pronunciation/        # global term→spoken-form dictionary (GET/PUT)
│       ├── voice-preview/        # cached per-avatar voice samples
│       ├── transcribe/           # Groq Whisper → word timestamps (local Whisper fallback)
│       ├── analyze-script/       # AI shot list (Claude default; Groq / rules)
│       ├── refine-prompt/        # one-shot image-prompt rewrite, optionally steered
│       ├── stock-photo/          # Pexels + SerpApi search (GET) + import-to-library (POST)
│       ├── render/               # job-based Remotion render (POST start, GET poll/download)
│       ├── library/              # image library: search/add, [id] PATCH/DELETE, [id]/file
│       ├── chart-data/           # OHLC from Twelve Data, or synthetic trend-shaped series
│       ├── ticker-logo/          # proxied real company logos for chart headers
│       ├── usage/                # per-project / per-API usage aggregation
│       ├── projects/             # project index + state + file sync (disk-backed)
│       └── health/               # which API keys are configured
├── components/
│   ├── Editor.tsx                # state owner: projects, takes, history, sync
│   ├── InputPanel.tsx            # the 4-step control panel
│   ├── PlayerPanel.tsx           # Remotion <Player> preview + safe zones
│   ├── Timeline*.tsx             # ruler, waveform, image track, playhead
│   ├── RenderButton.tsx          # export modal + job polling
│   ├── ThumbnailModal.tsx        # canvas thumbnail generator
│   ├── LibraryModal.tsx          # image library browser + tag editor
│   ├── ImageSuggestModal.tsx     # per-scene stock-photo + library picker (Find photos)
│   ├── PronunciationModal.tsx    # pronunciation-dictionary editor
│   ├── ChartModal.tsx            # stock-chart maker + searchable ticker picker + preview
│   └── UsageModal.tsx            # API usage breakdown
├── remotion/
│   ├── VideoComposition.tsx      # composition root (all layers)
│   ├── BackgroundSlideshow.tsx   # images + pan/zoom; renders charts for chart segments
│   ├── AnimatedChart.tsx         # branded draw-in stock chart (pure SVG, progress-driven)
│   ├── CaptionOverlay.tsx        # word-synced captions
│   ├── VoiceVisualizer.tsx       # shared audio-reactive avatar (4 styles)
│   ├── AnimatedIntro/Outro.tsx   # intro reveal, outro card
│   ├── BrandingBadge.tsx         # persistent corner badge
│   └── types.ts                  # dimensions, schemas, defaults, presets, ChartSpec
└── lib/
    ├── storage.ts                # client persistence (localStorage + IndexedDB) + server sync
    ├── server-storage.ts         # disk persistence (data/projects), serialized index writes
    ├── transcript.ts             # Whisper token merging + caption re-alignment  [tested]
    ├── scene-timing.ts           # shot list → timeline matching + pace splitting [tested]
    ├── tts-text.ts               # money/number/percentage speech normalization [tested]
    ├── pronunciation.ts          # dictionary apply + defaults                  [tested]
    ├── pronunciation-storage.ts  # disk persistence for the pronunciation dict
    ├── library-storage.ts        # disk persistence for the image library
    ├── library-types.ts          # library records + relevance matching         [tested]
    ├── library-client.ts         # client wrappers for the library API
    ├── stock-photo-client.ts     # client wrappers for Pexels/Google search + import
    ├── tickers.ts                # ticker list (symbol → company + reference price)
    ├── usage-storage.ts          # per-project / per-API usage recording
    ├── anthropic.ts              # resolves ANTHROPIC_API_KEY or ANTHROPIC
    ├── triage-parse.ts           # daily digest → ranked topics + voice specs    [tested]
    ├── timezones.ts              # WAT/ET zoned time math for triage scheduling
    └── voices.ts                 # avatar → voice map + TTS models + delivery presets / v3 spec parser
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
npm test        # vitest — transcript, scene-timing, TTS-normalization, pronunciation, library-matching, triage-parse suites
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
- **Per-scene "Make chart"** — a chart button on chart-category shot cards, prefilled from the detected ticker/trend.
- **Live market data for charts** — wire up a real-time OHLC provider so synthetic series are only a fallback.
