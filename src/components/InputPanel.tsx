"use client";

import React, { useRef, useState, useEffect, useId, useMemo, useCallback } from "react";
import { TranscriptWord, ImageSegment, IntroOutroSegment, IntroAnimationConfig, OutroCardConfig, OutroCardContent, VideoStyle, AVATAR_POSITIONS, BADGE_POSITIONS, IMAGE_ANIMATIONS, ImageAnimation, INTRO_ANIMATION_STYLES, OUTRO_STYLES, OutroStyle, BadgePosition, SceneSuggestion, VISUALIZER_STYLES, VisualizerStyle } from "../remotion/types";
import type { ProjectMeta } from "../lib/storage";
import { realignWords } from "../lib/transcript";
import { PACE_OPTIONS, PaceName } from "../lib/scene-timing";
import type { LibraryImage } from "../lib/library-types";
import { searchLibrary, libraryFileUrl } from "../lib/library-client";
import { ImageSuggestModal } from "./ImageSuggestModal";
import { Button } from "./Button";
import { IconButton, Chip } from "./IconButton";
import { DELIVERY_PRESETS, V3_AUDIO_TAGS, parseVoiceSpec, type VoiceDelivery, type DeliveryPreset, type VoiceSettings } from "../lib/voices";
import type { TopicMeta } from "../lib/storage";
import { parseDigest } from "../lib/triage-parse";
import { ZONES, formatTime } from "../lib/timezones";

const SCRIPT_CHAR_LIMIT = 5000;
const SPOKEN_WORDS_PER_SECOND = 2.5;

interface Props {
  onAudioUpload: (file: File) => void;
  onImagesUpload: (files: File[]) => void;
  onRemoveImage: (index: number) => void;
  onReplaceImage: (index: number, file: File) => void;
  onReorderImages: (fromIndex: number, toIndex: number) => void;
  onRedistributeImages: () => void;
  onImageTimingChange: (index: number, field: "startTime" | "endTime", value: number) => void;
  onImageAnimationChange: (index: number, animation: ImageAnimation) => void;
  onAvatarSelect: (path: string | null) => void;
  avatarPath: string | null;
  availableAvatars: string[];
  onGenerateAudio: (text: string) => void;
  topicMeta: TopicMeta | null;
  onTopicMetaChange: (m: TopicMeta) => void;
  voiceDelivery: VoiceDelivery;
  onVoiceDeliveryChange: (d: VoiceDelivery) => void;
  ttsAvailable: boolean | null;
  isGeneratingAudio: boolean;
  generatingStartedAt: number | null;
  audioTakes: Array<{ id: string; src: string; file: File; label: string; avatarName: string; scriptUsed: string; transcript: { word: string; start: number; end: number }[]; createdAt: number }>;
  activeTakeId: string | null;
  onSaveTake: (id: string) => void;
  onDeleteTake: (id: string) => void;
  scriptText: string;
  onScriptTextChange: (text: string) => void;
  onTranscriptChange: (words: TranscriptWord[]) => void;
  onTranscribe: () => void;
  isTranscribing: boolean;
  transcript: TranscriptWord[];
  onStyleChange: (style: Partial<VideoStyle>) => void;
  audioDelay: number;
  onAudioDelayChange: (v: number) => void;
  musicFile: File | null;
  musicVolume: number;
  onMusicUpload: (file: File) => void;
  onMusicRemove: () => void;
  onMusicVolumeChange: (v: number) => void;
  intro: IntroOutroSegment | null;
  introFile: File | null;
  onIntroUpload: (file: File) => void;
  onIntroChange: (updates: Partial<IntroOutroSegment>) => void;
  onIntroRemove: () => void;
  outro: IntroOutroSegment | null;
  outroFile: File | null;
  onOutroUpload: (file: File) => void;
  onOutroChange: (updates: Partial<IntroOutroSegment>) => void;
  onOutroRemove: () => void;
  introAnimation: IntroAnimationConfig;
  onIntroAnimationChange: (updates: Partial<IntroAnimationConfig>) => void;
  outroCard: OutroCardConfig;
  onOutroCardChange: (updates: Partial<OutroCardConfig>) => void;
  onOutroCardCustomChange: (updates: Partial<OutroCardContent>) => void;
  onOutroLogoUpload: (file: File) => void;
  onOutroBadgeUpload: (file: File) => void;
  outroLogoFile: File | null;
  outroBadgeFile: File | null;
  style: VideoStyle;
  images: ImageSegment[];
  durationInSeconds: number;
  audioFile: File | null;
  imageFiles: File[];
  showToast: (message: string, type: "error" | "success") => void;
  onNewProject: () => void;
  onManualSave: () => void;
  lastSavedAt: number | null;
  projectName: string;
  projects: ProjectMeta[];
  currentProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  selectedImageIndex: number | null;
  onSelectImage: (index: number) => void;
  openSections: Set<string>;
  onToggleSection: (id: string) => void;
  sceneSuggestions: SceneSuggestion[];
  shotListStale: boolean;
  isAnalyzingScript: boolean;
  onAnalyzeScript: () => void;
  onApplySuggestion: (suggestion: SceneSuggestion) => void;
  onApplyAllSuggestions: () => void;
  onDeleteSuggestion: (id: string) => void;
  onPickFromLibrary: (scene: SceneSuggestion, image: LibraryImage) => void;
  onRefinePrompt: (id: string, guidance?: string) => void;
  refiningPromptId: string | null;
  analysisProvider: "groq" | "claude" | "rules" | "auto";
  availableProviders: ("groq" | "claude" | "rules" | "auto")[];
  onAnalysisProviderChange: (provider: "groq" | "claude" | "rules" | "auto") => void;
  visualPace: PaceName;
  onVisualPaceChange: (pace: PaceName) => void;
}

type IntroType = "none" | "image" | "animation";
type OutroType = "none" | "image" | "card";
type AnalysisProvider = "groq" | "claude" | "rules" | "auto";

function dayLabel(ts: number): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(new Date(ts))) / 86400000);
  if (days <= 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function fmtDuration(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function ElapsedTimer({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span className="tabular-nums">{elapsed}s</span>;
}

/* ---- Take row ---- */

function TakeRow({ take, isActive, onUse, onDelete }: { take: { id: string; src: string; label: string; avatarName: string; scriptUsed: string }; isActive: boolean; onUse: () => void; onDelete: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); } else { el.play(); }
    setPlaying(!playing);
  }, [playing]);

  return (
    <div
      className={`group relative rounded-md px-2 py-1.5 transition-colors ${
        isActive ? "bg-green-950/40 border border-green-500/30" : "border border-transparent hover:bg-zinc-800/60"
      }`}
    >
      {isActive && <div className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-green-500" />}
      <audio ref={audioRef} src={take.src} onEnded={() => setPlaying(false)} preload="none" />
      <div className="flex items-center gap-1.5 h-6">
        <IconButton onClick={togglePlay} className="w-5 h-5 flex-shrink-0 hover:bg-zinc-700 text-zinc-400 hover:text-white" title={playing ? "Pause" : "Play"}>
          {playing ? (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="0.5" /><rect x="7" y="1" width="3" height="10" rx="0.5" /></svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 12 12" fill="currentColor"><path d="M3 1.5v9l7.5-4.5z" /></svg>
          )}
        </IconButton>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className={`text-mini font-medium whitespace-nowrap ${isActive ? "text-green-400" : "text-zinc-300"}`}>{take.label}</span>
          {isActive && <span className="text-micro bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded-full uppercase tracking-wider font-bold leading-none">In video</span>}
        </div>
        {!isActive && (
          <Chip
            onClick={onUse}
            className="flex-shrink-0 px-2 py-0.5 text-micro font-medium bg-zinc-700 hover:bg-green-600 text-zinc-300 hover:text-white rounded"
            title="Make this take the voiceover"
          >
            Use
          </Chip>
        )}
        <IconButton onClick={() => setExpanded(!expanded)} className="w-4 h-4 flex-shrink-0 text-zinc-600 hover:text-zinc-300" title="Show script used">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5">{expanded ? <path d="M2 6.5L5 3.5L8 6.5" /> : <path d="M2 3.5L5 6.5L8 3.5" />}</svg>
        </IconButton>
        <IconButton onClick={onDelete} className="w-4 h-4 flex-shrink-0 hover:bg-zinc-700 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100" title="Delete take">
          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
        </IconButton>
      </div>
      {expanded && take.scriptUsed && (
        <p className="text-micro text-zinc-500 leading-relaxed whitespace-pre-wrap pl-6 pr-1 pb-0.5 pt-0.5">{take.scriptUsed}</p>
      )}
    </div>
  );
}

/* ---- Shot list ---- */

const PRIORITY_INDICATOR: Record<string, { dot: string; label: string }> = {
  essential: { dot: "bg-red-400", label: "Essential" },
  recommended: { dot: "bg-yellow-400", label: "Recommended" },
  optional: { dot: "bg-zinc-500", label: "Optional" },
};

function ShotListCard({ scene, index, projectId, onApply, onDelete, onPickFromLibrary, onRefine, isRefining, showToast }: { scene: SceneSuggestion; index: number; projectId: string | null; onApply: () => void; onDelete: () => void; onPickFromLibrary: (image: LibraryImage) => void; onRefine: (guidance?: string) => void; isRefining: boolean; showToast: (message: string, type: "error" | "success") => void }) {
  const [showScript, setShowScript] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showRefineInput, setShowRefineInput] = useState(false);
  const [guidance, setGuidance] = useState("");
  const [browseOpen, setBrowseOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const priority = PRIORITY_INDICATOR[scene.priority] ?? PRIORITY_INDICATOR.recommended;

  // Library matches for this scene — searched once when the card appears.
  const [matches, setMatches] = useState<LibraryImage[]>([]);
  useEffect(() => {
    let cancelled = false;
    const query = [scene.description, scene.scriptSegment].filter(Boolean).join(" ");
    searchLibrary({ text: query, category: scene.category }).then((res) => {
      if (!cancelled) setMatches(res.slice(0, 6));
    });
    return () => { cancelled = true; };
  }, [scene.description, scene.scriptSegment, scene.category]);

  const copyPrompt = useCallback(() => {
    navigator.clipboard.writeText(scene.imagePrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [scene.imagePrompt]);

  const submitRefine = useCallback(() => {
    if (isRefining) return;
    setShowPrompt(true);
    onRefine(guidance.trim() || undefined);
  }, [isRefining, guidance, onRefine]);

  return (
    <div className="bg-zinc-800/60 border border-zinc-700/50 rounded-md p-2 text-xs">
      {/* Resting row: index · description · caption · primary action */}
      <div className="flex items-start gap-2">
        <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center text-micro font-bold text-white flex-shrink-0 ${TIMELINE_COLORS[index % TIMELINE_COLORS.length]}`}>
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-zinc-200 leading-relaxed line-clamp-2">{scene.description}</p>
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "Hide details" : "Show details & image options"}
            className="mt-0.5 flex items-center gap-1.5 text-micro text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priority.dot}`} title={priority.label} />
            <span>{scene.category}</span>
            {scene.partCount != null && scene.partCount > 1 && (
              <span className="text-zinc-600" title="Split from one beat for pacing">· shot {scene.part}/{scene.partCount}</span>
            )}
            <span className="text-zinc-600 truncate" title={scene.animationReason}>· {scene.suggestedAnimation}</span>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={`flex-shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9" /></svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onApply}
          className="flex-shrink-0 px-2 py-1 bg-violet-600 hover:bg-violet-700 rounded text-micro font-medium text-white transition-colors whitespace-nowrap"
          title={`${scene.suggestedAnimation} — ${scene.animationReason}`}
        >
          + Timeline
        </button>
      </div>

      {/* Expanded: secondary actions, details, image sourcing */}
      {expanded && (
        <div className="mt-2 pt-2 border-t border-zinc-700/40 flex flex-col gap-1.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowScript(!showScript)}
              className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap transition-colors ${showScript ? "bg-zinc-700/70 text-zinc-200" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40"}`}
            >
              Script
            </button>
            {scene.imagePrompt && (
              <>
                <button
                  type="button"
                  onClick={() => setShowPrompt(!showPrompt)}
                  className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap transition-colors ${showPrompt ? "bg-zinc-700/70 text-zinc-200" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40"}`}
                >
                  Prompt
                </button>
                <button
                  type="button"
                  onClick={copyPrompt}
                  className="text-micro px-1.5 py-0.5 rounded whitespace-nowrap text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40 transition-colors"
                  title="Copy image prompt to clipboard"
                >
                  {copied ? "Copied ✓" : "Copy"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowRefineInput((v) => !v)}
                  disabled={isRefining}
                  className={`text-micro px-1.5 py-0.5 rounded whitespace-nowrap transition-colors disabled:opacity-50 ${showRefineInput ? "bg-zinc-700/70 text-zinc-200" : "text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/40"}`}
                  title="Rewrite this prompt with AI — optionally tell it what you want"
                >
                  {isRefining ? "Refining…" : "✦ Refine"}
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onDelete}
              aria-label="Delete block"
              title="Delete this block (removes it from the shot list and timeline)"
              className="ml-auto w-5 h-5 flex items-center justify-center rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700/60 transition-colors"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
            </button>
          </div>

          {showScript && (
            <p className="text-micro text-zinc-500 leading-relaxed italic">&ldquo;{scene.scriptSegment}&rdquo;</p>
          )}
          {showRefineInput && (
            <div className="flex items-center gap-1">
              <input
                type="text"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitRefine();
                  if (e.key === "Escape") setShowRefineInput(false);
                }}
                placeholder="Optional direction — e.g. 'night skyline, more dramatic'"
                maxLength={500}
                autoFocus
                className="flex-1 min-w-0 bg-zinc-900 border border-violet-500/30 rounded px-1.5 py-1 text-micro text-zinc-300 placeholder:text-zinc-600 focus-visible:ring-2 focus-visible:ring-violet-500"
              />
              <button
                type="button"
                onClick={submitRefine}
                disabled={isRefining}
                className="flex-shrink-0 px-2 py-1 bg-violet-600 hover:bg-violet-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-micro font-medium text-white transition-colors"
              >
                {isRefining ? (
                  <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                ) : (
                  "Go"
                )}
              </button>
            </div>
          )}
          {showPrompt && scene.imagePrompt && (
            <div className={`bg-zinc-900/60 border rounded px-2 py-1.5 transition-colors ${isRefining ? "border-violet-500/50" : "border-zinc-700/40"}`}>
              <p className={`text-micro leading-relaxed select-all ${isRefining ? "text-zinc-500" : "text-zinc-300"}`}>{scene.imagePrompt}</p>
            </div>
          )}

          {/* Image sourcing: library matches + stock browser */}
          <div className="flex items-center gap-1.5">
            {matches.length > 0 && (
              <div className="flex gap-1 overflow-x-auto pb-0.5">
                {matches.slice(0, 3).map((img) => (
                  <button
                    key={img.id}
                    type="button"
                    onClick={() => onPickFromLibrary(img)}
                    title={`Use "${img.filename}" — ${img.tags.join(", ")}`}
                    className="flex-shrink-0 w-9 h-12 rounded overflow-hidden border border-zinc-700 hover:border-zinc-400 transition-colors"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={libraryFileUrl(img.id)} alt={img.filename} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              className="ml-auto flex-shrink-0 flex items-center gap-1 text-micro px-2 py-1 rounded bg-zinc-700/60 text-zinc-300 hover:bg-zinc-700 transition-colors font-medium"
            >
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
              Find photos
            </button>
          </div>
        </div>
      )}

      <ImageSuggestModal
        open={browseOpen}
        onClose={() => setBrowseOpen(false)}
        scene={scene}
        index={index}
        projectId={projectId}
        onPick={onPickFromLibrary}
        showToast={showToast}
      />
    </div>
  );
}

/* ---- Main panel ---- */

const InputPanelInner: React.FC<Props> = ({
  onImagesUpload,
  onRemoveImage,
  onReplaceImage,
  onReorderImages,
  onRedistributeImages,
  onImageAnimationChange,
  onAvatarSelect,
  avatarPath,
  availableAvatars,
  onGenerateAudio,
  topicMeta,
  onTopicMetaChange,
  voiceDelivery,
  onVoiceDeliveryChange,
  ttsAvailable,
  isGeneratingAudio,
  generatingStartedAt,
  audioTakes,
  activeTakeId,
  onSaveTake,
  onDeleteTake,
  scriptText,
  onScriptTextChange,
  onTranscriptChange,
  onTranscribe,
  isTranscribing,
  transcript,
  onStyleChange,
  audioDelay,
  onAudioDelayChange,
  musicFile,
  musicVolume,
  onMusicUpload,
  onMusicRemove,
  onMusicVolumeChange,
  intro,
  introFile,
  onIntroUpload,
  onIntroChange,
  onIntroRemove,
  outro,
  outroFile,
  onOutroUpload,
  onOutroChange,
  onOutroRemove,
  introAnimation,
  onIntroAnimationChange,
  outroCard,
  onOutroCardChange,
  onOutroCardCustomChange,
  onOutroLogoUpload,
  onOutroBadgeUpload,
  outroLogoFile,
  outroBadgeFile,
  style,
  images,
  durationInSeconds,
  audioFile,
  imageFiles,
  showToast,
  onNewProject,
  onManualSave,
  lastSavedAt,
  projectName,
  projects,
  currentProjectId,
  onSwitchProject,
  onDeleteProject,
  onRenameProject,
  selectedImageIndex,
  onSelectImage,
  openSections,
  onToggleSection,
  sceneSuggestions,
  shotListStale,
  isAnalyzingScript,
  onAnalyzeScript,
  onApplySuggestion,
  onApplyAllSuggestions,
  onDeleteSuggestion,
  onPickFromLibrary,
  onRefinePrompt,
  refiningPromptId,
  analysisProvider,
  availableProviders,
  onAnalysisProviderChange,
  visualPace,
  onVisualPaceChange,
}) => {
  const transcriptRef = useRef<HTMLTextAreaElement>(null);

  // --- Intro/Outro type consolidation ---
  const introType: IntroType = intro ? "image" : introAnimation.enabled ? "animation" : "none";
  const outroType: OutroType = outro ? "image" : outroCard.enabled ? "card" : "none";

  const handleIntroTypeChange = (type: IntroType) => {
    if (type !== "image" && intro) onIntroRemove();
    if (type !== "animation" && introAnimation.enabled) onIntroAnimationChange({ enabled: false });
    if (type === "animation") onIntroAnimationChange({ enabled: true });
  };

  const handleOutroTypeChange = (type: OutroType) => {
    if (type !== "image" && outro) onOutroRemove();
    if (type !== "card" && outroCard.enabled) onOutroCardChange({ enabled: false });
    if (type === "card") onOutroCardChange({ enabled: true });
  };

  const handleTranscriptParse = () => {
    const text = transcriptRef.current?.value || "";
    try {
      const parsed = JSON.parse(text);
      const words: TranscriptWord[] = Array.isArray(parsed)
        ? parsed.map((w: Record<string, unknown>) => ({
            word: String(w.word || w.text || ""),
            start: Number(w.start || w.startTime || 0),
            end: Number(w.end || w.endTime || 0),
          }))
        : [];
      onTranscriptChange(words);
      showToast(`Parsed ${words.length} words`, "success");
    } catch {
      showToast("Invalid JSON. Expected: [{word, start, end}, ...]", "error");
    }
  };

  // ── Voice previews ──
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingVoice, setPreviewingVoice] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState<string | null>(null);

  useEffect(() => () => { previewAudioRef.current?.pause(); }, []);

  const handleVoicePreview = useCallback(async (name: string) => {
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }
    if (previewingVoice === name) {
      setPreviewingVoice(null);
      return;
    }
    setLoadingPreview(name);
    try {
      const audio = new Audio(`/api/voice-preview?avatar=${encodeURIComponent(name)}`);
      audio.onended = () => setPreviewingVoice(null);
      await audio.play();
      previewAudioRef.current = audio;
      setPreviewingVoice(name);
    } catch {
      showToast("Voice preview unavailable — check the ElevenLabs API key", "error");
      setPreviewingVoice(null);
    } finally {
      setLoadingPreview(null);
    }
  }, [previewingVoice, showToast]);

  // ── Script stats ──
  const scriptChars = scriptText.length;
  const scriptWords = useMemo(() => (scriptText.trim() ? scriptText.trim().split(/\s+/).length : 0), [scriptText]);
  const estAudioSecs = Math.round(scriptWords / SPOKEN_WORDS_PER_SECOND);
  const scriptOverLimit = scriptChars > SCRIPT_CHAR_LIMIT;

  // Insert a v3 audio tag (e.g. "[warm] ") at the script textarea's cursor.
  const scriptRef = useRef<HTMLTextAreaElement>(null);
  const insertTag = useCallback((tag: string) => {
    const el = scriptRef.current;
    const snippet = `[${tag}] `;
    const at = el ? el.selectionStart : scriptText.length;
    const next = scriptText.slice(0, at) + snippet + scriptText.slice(at);
    onScriptTextChange(next);
    // Restore focus + place the cursor just after the inserted tag.
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const pos = at + snippet.length;
      el.setSelectionRange(pos, pos);
    });
  }, [scriptText, onScriptTextChange]);

  // ── Project name inline editing ──
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(projectName);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setNameValue(projectName); }, [projectName]);
  useEffect(() => {
    if (editingName) nameInputRef.current?.select();
  }, [editingName]);

  const commitName = useCallback(() => {
    setEditingName(false);
    const trimmed = nameValue.trim();
    if (trimmed && trimmed !== projectName && currentProjectId) {
      onRenameProject(currentProjectId, trimmed);
    } else {
      setNameValue(projectName);
    }
  }, [nameValue, projectName, currentProjectId, onRenameProject]);

  // ── Projects dropdown ──
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showDropdown) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showDropdown]);

  const sortedProjects = useMemo(
    () => [...projects].sort((a, b) => b.modifiedAt - a.modifiedAt),
    [projects]
  );

  // ── Section status summaries ──
  const assignedImageCount = images.filter((img) => img.src).length;
  const hasPlaceholders = images.length > assignedImageCount;

  const scriptStatus = audioFile
    ? `${audioTakes.find((t) => t.id === activeTakeId)?.label ?? "Voiceover"} · ${fmtDuration(durationInSeconds)}`
    : avatarPath
    ? "Write a script"
    : "Start here";

  const visualsStatus = images.length === 0
    ? ""
    : hasPlaceholders
    ? `${assignedImageCount}/${images.length} slots filled`
    : `${images.length} image${images.length === 1 ? "" : "s"}`;

  const captionsStatus = transcript.length > 0 ? `${transcript.length} words` : "";

  const brandingStatus = [
    introType !== "none" ? "Intro" : null,
    outroType === "card" ? "Outro card" : outroType === "image" ? "Outro" : null,
  ].filter(Boolean).join(" · ");

  const copyAllPrompts = useCallback(() => {
    const text = sceneSuggestions.map((s, i) => `${i + 1}. ${s.imagePrompt}`).join("\n\n");
    navigator.clipboard.writeText(text)
      .then(() => showToast("All image prompts copied", "success"))
      .catch(() => showToast("Copy failed", "error"));
  }, [sceneSuggestions, showToast]);

  return (
    <div className="p-4 space-y-1">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 gap-2">
        <div className="flex-1 min-w-0">
          {currentProjectId ? (
            editingName ? (
              <input
                ref={nameInputRef}
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onBlur={commitName}
                onKeyDown={(e) => { if (e.key === "Enter") commitName(); if (e.key === "Escape") { setNameValue(projectName); setEditingName(false); } }}
                className="text-lg font-semibold text-zinc-200 bg-zinc-800 border border-zinc-600 rounded px-1.5 py-0.5 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              />
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="group/name flex items-center gap-1.5 max-w-full text-left"
                title="Rename project"
              >
                <span className="text-lg font-semibold text-zinc-200 group-hover/name:text-white truncate">{projectName}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600 opacity-0 group-hover/name:opacity-100 transition-opacity flex-shrink-0">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
              </button>
            )
          ) : (
            <h1 className="text-lg font-semibold text-zinc-200">Short Video Generator</h1>
          )}
          {currentProjectId && lastSavedAt && (
            <SaveStatus lastSavedAt={lastSavedAt} />
          )}
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <button
            onClick={onManualSave}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            title="Save project (Ctrl+S)"
          >
            Save
          </button>
          <button
            onClick={onNewProject}
            className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
            title="Start a new project"
          >
            New
          </button>

          {projects.length > 0 && (
            <div ref={dropdownRef} className="relative">
              <button
                onClick={() => setShowDropdown((v) => !v)}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors"
              >
                Projects
              </button>

              {showDropdown && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="max-h-72 overflow-y-auto">
                    {sortedProjects.map((p, i) => (
                      <React.Fragment key={p.id}>
                        {(i === 0 || dayLabel(p.modifiedAt) !== dayLabel(sortedProjects[i - 1].modifiedAt)) && (
                          <div className="px-3 pt-2 pb-1 text-micro uppercase tracking-wider text-zinc-500 font-semibold border-b border-zinc-800/60">
                            {dayLabel(p.modifiedAt)}
                          </div>
                        )}
                      <div
                        className={`flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 cursor-pointer group ${
                          p.id === currentProjectId ? "bg-zinc-800/60" : ""
                        }`}
                        onClick={() => { onSwitchProject(p.id); setShowDropdown(false); }}
                      >
                        {p.thumb ? (
                          <img src={p.thumb} alt="" className="w-7 h-12 object-cover rounded flex-shrink-0 border border-zinc-700" />
                        ) : (
                          <div className="w-7 h-12 bg-zinc-800 rounded flex-shrink-0 flex items-center justify-center">
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-600"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-zinc-200 truncate">{p.name}</p>
                          <p className="text-micro text-zinc-400">{timeAgo(p.modifiedAt)}</p>
                        </div>
                        {projects.length > 1 && (
                          confirmDeleteId === p.id ? (
                            <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                              <button
                                onClick={() => { onDeleteProject(p.id); setConfirmDeleteId(null); }}
                                className="px-1.5 py-0.5 text-micro bg-red-600 hover:bg-red-500 text-white rounded transition-colors"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                className="px-1.5 py-0.5 text-micro bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setConfirmDeleteId(p.id);
                              }}
                              className="w-5 h-5 text-zinc-600 hover:text-red-400 hover:bg-zinc-700 rounded flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                              aria-label={`Delete ${p.name}`}
                            >
                              <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                            </button>
                          )
                        )}
                      </div>
                      </React.Fragment>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Posting/social brief — shown when captured, else an attach affordance */}
      <div className="px-3 pt-3">
        {topicMeta ? (
          <PostDetailsCard meta={topicMeta} />
        ) : (
          <AttachPostDetails projectName={projectName} onAttach={onTopicMetaChange} />
        )}
      </div>

      {/* ① Script & Voice */}
      <Section
        id="script"
        num={1}
        title="Script & Voice"
        status={scriptStatus}
        done={!!audioFile}
        open={openSections.has("script")}
        onToggle={() => onToggleSection("script")}
      >
        <div className="space-y-2.5">
          {ttsAvailable === false && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2.5 py-2">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 flex-shrink-0 mt-0.5"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
              <p className="text-mini text-amber-300/90 leading-snug">
                <span className="font-medium">ElevenLabs API key not configured</span> — voice generation and previews are disabled. Add <code className="bg-zinc-800 px-1 rounded">ELEVENLABS_API_KEY</code> to <code className="bg-zinc-800 px-1 rounded">.env.local</code> and restart.
              </p>
            </div>
          )}
          {/* Presenter grid */}
          <div>
            <label className="text-xs text-zinc-400 mb-1.5 block">Presenter</label>
            {availableAvatars.length === 0 ? (
              <p className="text-xs text-zinc-500">No presenters found. Place images in <code className="bg-zinc-800 px-1 rounded">public/avatars/</code></p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {availableAvatars.map((src) => {
                  const name = src.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
                  const isSelected = avatarPath === src;
                  const isPreviewing = previewingVoice === name;
                  const isLoadingPreview = loadingPreview === name;
                  return (
                    <div key={src} className="flex flex-col items-center gap-1">
                      <div className="relative w-full">
                        <button
                          type="button"
                          onClick={() => onAvatarSelect(src)}
                          aria-pressed={isSelected}
                          className={`w-full aspect-square rounded-full overflow-hidden border-2 transition-all block ${
                            isSelected
                              ? "border-blue-500 ring-2 ring-blue-500/40"
                              : "border-zinc-700 hover:border-zinc-500"
                          }`}
                        >
                          <img src={src} alt={name} className="w-full h-full object-cover" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleVoicePreview(name)}
                          title={isPreviewing ? "Stop preview" : `Hear ${name}'s voice`}
                          className={`absolute bottom-0 right-0 w-6 h-6 rounded-full border flex items-center justify-center transition-colors shadow ${
                            isPreviewing
                              ? "bg-blue-600 border-blue-400 text-white"
                              : "bg-zinc-900 border-zinc-600 text-zinc-400 hover:text-white hover:border-zinc-400"
                          }`}
                        >
                          {isLoadingPreview ? (
                            <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                          ) : isPreviewing ? (
                            <svg width="9" height="9" viewBox="0 0 12 12" fill="currentColor"><rect x="2" y="1" width="3" height="10" rx="0.5" /><rect x="7" y="1" width="3" height="10" rx="0.5" /></svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><path d="M11 5L6 9H2v6h4l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.4 5.6a9 9 0 0 1 0 12.8" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                          )}
                        </button>
                      </div>
                      <span className={`text-mini capitalize ${isSelected ? "text-blue-400 font-medium" : "text-zinc-400"}`}>{name}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Script + generate (always visible — never gated behind presenter choice) */}
          <div className="space-y-2 bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
            <div className="flex items-center justify-between">
              <label className="text-xs text-zinc-400">Script</label>
              <span className={`text-micro tabular-nums ${scriptOverLimit ? "text-red-400 font-medium" : "text-zinc-500"}`}>
                {scriptChars.toLocaleString()}/{SCRIPT_CHAR_LIMIT.toLocaleString()}
                {scriptWords > 0 && !scriptOverLimit && <> · ≈ {fmtDuration(estAudioSecs)} of audio</>}
              </span>
            </div>
            <textarea
              ref={scriptRef}
              value={scriptText}
              onChange={(e) => onScriptTextChange(e.target.value)}
              placeholder="Type or paste your script here..."
              rows={5}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-sm text-zinc-300 placeholder:text-zinc-600 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
            />
            {scriptOverLimit && (
              <p className="text-mini text-red-400">Script is over the {SCRIPT_CHAR_LIMIT.toLocaleString()}-character limit — trim it before generating.</p>
            )}
            {!avatarPath && scriptText.trim() && (
              <p className="text-mini text-amber-400">Select a presenter above to generate the voiceover.</p>
            )}
            <DeliveryControl delivery={voiceDelivery} onChange={onVoiceDeliveryChange} onInsertTag={insertTag} />
            <Button
              variant="primary"
              fullWidth
              className="py-2"
              type="button"
              onClick={() => onGenerateAudio(scriptText)}
              disabled={isGeneratingAudio || isTranscribing || !scriptText.trim() || !avatarPath || scriptOverLimit}
              title={
                !avatarPath ? "Select a presenter first" :
                !scriptText.trim() ? "Enter a script first" :
                scriptOverLimit ? "Script is too long" :
                isGeneratingAudio ? "Generating audio..." :
                isTranscribing ? "Transcription in progress..." : undefined
              }
            >
              {isGeneratingAudio || isTranscribing ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  {isTranscribing && !isGeneratingAudio ? "Transcribing..." : <>Generating Audio{generatingStartedAt !== null && <> ... <ElapsedTimer startedAt={generatingStartedAt} /></>}</>}
                </>
              ) : (
                audioTakes.length > 0 ? "Generate New Take" : "Generate Voiceover"
              )}
            </Button>

            {audioTakes.length > 0 && (
              <div className="pt-1.5 border-t border-zinc-700/30">
                <label className="text-micro uppercase tracking-wider text-zinc-400 font-medium mb-1 block">Takes ({audioTakes.length})</label>
                <div className="space-y-0.5">
                  {audioTakes.map((take) => (
                    <TakeRow
                      key={take.id}
                      take={take}
                      isActive={take.id === activeTakeId}
                      onUse={() => onSaveTake(take.id)}
                      onDelete={() => onDeleteTake(take.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {audioFile && (
              <div className="pt-1 border-t border-zinc-700/30">
                <TimeInput
                  label="Audio delay"
                  value={audioDelay}
                  max={durationInSeconds}
                  onChange={onAudioDelayChange}
                />
                <p className="text-micro text-zinc-500 mt-0.5">Silence before the voiceover starts.</p>
              </div>
            )}

            {/* Background music */}
            <div className="pt-1.5 border-t border-zinc-700/30 space-y-1.5">
              <label className="text-micro uppercase tracking-wider text-zinc-400 font-medium block">Background Music</label>
              {!musicFile ? (
                <FileUploadButton
                  accept="audio/*"
                  label="Upload Music (optional)"
                  onFile={onMusicUpload}
                />
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-500 flex-shrink-0"><path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" /></svg>
                    <p className="text-xs text-zinc-400 flex-1 truncate">{musicFile.name}</p>
                    <button
                      onClick={onMusicRemove}
                      aria-label="Remove music"
                      className="w-5 h-5 bg-zinc-800 hover:bg-red-600 rounded flex items-center justify-center flex-shrink-0 transition-colors text-zinc-400 hover:text-white"
                    >
                      <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
                    </button>
                  </div>
                  <SliderControl
                    label="Music Volume"
                    helpText="Loops under the voiceover, fades out at the end"
                    value={musicVolume}
                    min={0}
                    max={0.6}
                    step={0.01}
                    onChange={onMusicVolumeChange}
                  />
                </>
              )}
            </div>
          </div>
        </div>
      </Section>

      <div className="border-t border-zinc-800" />

      {/* ② Visuals */}
      <Section
        id="visuals"
        num={2}
        title="Visuals"
        status={visualsStatus}
        done={imageFiles.length > 0 && !hasPlaceholders}
        open={openSections.has("visuals")}
        onToggle={() => onToggleSection("visuals")}
      >
        <div className="space-y-2.5">
          {/* Shot list — AI scene suggestions from the script */}
          <div className="space-y-1.5 bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
            <div className="flex items-center gap-1.5">
              <Button
                variant="primary"
                size="sm"
                className="flex-1"
                type="button"
                onClick={onAnalyzeScript}
                disabled={isAnalyzingScript || !scriptText.trim()}
                title={!scriptText.trim() ? "Write a script in step 1 first" : undefined}
              >
                {isAnalyzingScript ? (
                  <>
                    <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 2h4l2 3h6v9H2z" /><path d="M6 8h4M8 6v4" /></svg>
                    Suggest Visuals from Script
                  </>
                )}
              </Button>
              <select
                value={analysisProvider}
                onChange={(e) => onAnalysisProviderChange(e.target.value as AnalysisProvider)}
                className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-micro text-zinc-300 focus-visible:ring-2 focus-visible:ring-violet-500"
                title="AI provider — used for both Suggest Visuals and ✦ Refine"
              >
                {availableProviders.map((p) => (
                  <option key={p} value={p}>
                    {p === "auto" ? "Auto" : p === "groq" ? "Groq" : p === "claude" ? "Claude" : "Rules"}
                  </option>
                ))}
              </select>
            </div>

            {/* Visual pace — controls how often the visuals change */}
            <div className="flex items-center gap-2">
              <span className="text-micro text-zinc-500 flex-shrink-0" title="How often the visuals change. Long beats are auto-split into this many shots.">Pace</span>
              <div className="flex flex-1 rounded-md overflow-hidden border border-zinc-700">
                {PACE_OPTIONS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => onVisualPaceChange(p.value)}
                    className={`flex-1 px-2 py-1 text-micro font-medium transition-colors ${
                      visualPace === p.value
                        ? "bg-violet-600 text-white"
                        : "bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700"
                    }`}
                    title={p.value === "single" ? "One shot per scene — no splitting" : p.value === "chill" ? "~9s per shot (fewer cuts)" : p.value === "normal" ? "~6s per shot" : "~4.5s per shot (more cuts)"}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {!scriptText.trim() && (
              <p className="text-micro text-zinc-500">Write a script in step 1 and AI will suggest a visual for each beat — or just drop images below.</p>
            )}

            {shotListStale && sceneSuggestions.length > 0 && (
              <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                <span className="text-micro text-amber-400 flex-1">Script changed — this shot list may be outdated.</span>
                <button
                  type="button"
                  onClick={onAnalyzeScript}
                  className="text-micro text-amber-300 underline underline-offset-2 hover:text-amber-200 whitespace-nowrap"
                >
                  Re-analyze
                </button>
              </div>
            )}

            {sceneSuggestions.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-micro uppercase tracking-wider text-zinc-400 font-medium">Shot List ({sceneSuggestions.length})</label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={copyAllPrompts}
                      className="text-micro px-2 py-0.5 text-violet-400 hover:bg-violet-600/20 rounded transition-colors"
                      title="Copy every image prompt to the clipboard"
                    >
                      Copy all prompts
                    </button>
                    <button
                      type="button"
                      onClick={onApplyAllSuggestions}
                      className="text-micro px-2 py-0.5 bg-violet-600/20 text-violet-400 hover:bg-violet-600/30 rounded transition-colors"
                    >
                      {imageFiles.length > 0 ? "Re-sync Timeline" : "Add All to Timeline"}
                    </button>
                  </div>
                </div>
                <div className="space-y-1">
                  {sceneSuggestions.map((scene, i) => (
                    <ShotListCard
                      key={scene.id}
                      scene={scene}
                      index={i}
                      projectId={currentProjectId}
                      onApply={() => onApplySuggestion(scene)}
                      onDelete={() => onDeleteSuggestion(scene.id)}
                      onPickFromLibrary={(image) => onPickFromLibrary(scene, image)}
                      onRefine={(guidance) => onRefinePrompt(scene.id, guidance)}
                      isRefining={refiningPromptId === scene.id}
                      showToast={showToast}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Image uploads + timeline slots */}
          <ImageDropZone onImagesUpload={onImagesUpload}>
            <SliderControl
              label="Background Motion"
              helpText="Ken Burns pan/zoom intensity"
              value={style.kenBurnsIntensity}
              min={0}
              max={0.2}
              step={0.01}
              onChange={(v) => onStyleChange({ kenBurnsIntensity: v })}
            />
            {imageFiles.length > 0 && (
              <>
                <MiniTimeline images={images} duration={durationInSeconds} />
                <button
                  onClick={onRedistributeImages}
                  className="w-full px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Distribute Evenly
                </button>
                <div className="space-y-1.5">
                  {imageFiles.map((f, i) => (
                    <DraggableImageCard
                      key={`${f.name}-${f.size}-${i}`}
                      index={i}
                      file={f}
                      image={images[i]}
                      onAnimationChange={onImageAnimationChange}
                      onRemove={onRemoveImage}
                      onReplace={onReplaceImage}
                      onReorder={onReorderImages}
                      isSelected={i === selectedImageIndex}
                      onSelect={onSelectImage}
                    />
                  ))}
                </div>
              </>
            )}
          </ImageDropZone>
        </div>
      </Section>

      <div className="border-t border-zinc-800" />

      {/* ③ Captions & Style */}
      <Section
        id="captions"
        num={3}
        title="Captions & Style"
        status={captionsStatus}
        done={transcript.length > 0}
        open={openSections.has("captions")}
        onToggle={() => onToggleSection("captions")}
      >
        <div className="space-y-2">
          {transcript.length === 0 && (
            <p className="text-mini text-zinc-500">Captions appear automatically after you generate a voiceover. You can re-transcribe or fine-tune them here.</p>
          )}
          <Button
            variant="primary"
            fullWidth
            className="py-2"
            onClick={onTranscribe}
            disabled={!audioFile || isTranscribing}
            title={!audioFile ? "Generate a voiceover first" : isTranscribing ? "Transcription in progress..." : undefined}
          >
            {isTranscribing ? (
              <>
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Transcribing...
              </>
            ) : (
              transcript.length > 0 ? "Re-transcribe from Audio" : "Transcribe from Audio"
            )}
          </Button>

          {/* Editable caption view — shown when transcript exists */}
          {transcript.length > 0 && (
            <CaptionEditor
              transcript={transcript}
              onApply={onTranscriptChange}
              showToast={showToast}
            />
          )}

          {/* Manual JSON input — collapsed behind a toggle */}
          <details className="group">
            <summary className="text-xs text-zinc-500 cursor-pointer hover:text-zinc-300 transition-colors">
              Manual JSON input
            </summary>
            <div className="mt-2 space-y-1.5">
              <textarea
                ref={transcriptRef}
                className="w-full h-28 bg-zinc-900 border border-zinc-700 rounded-lg p-2.5 text-xs font-mono text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500 resize-y"
                placeholder={`[{"word":"Hello","start":0,"end":0.5},...]`}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleTranscriptParse}
                  className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded text-xs transition-colors focus-visible:ring-2 focus-visible:ring-blue-500"
                >
                  Parse JSON
                </button>
                <FileUploadButton
                  accept=".json,application/json"
                  label="Load JSON File"
                  onFile={(f) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                      const text = e.target?.result as string;
                      if (transcriptRef.current) transcriptRef.current.value = text;
                      try {
                        const parsed = JSON.parse(text);
                        const words = Array.isArray(parsed)
                          ? parsed.map((w: Record<string, unknown>) => ({
                              word: String(w.word || w.text || ""),
                              start: Number(w.start || w.startTime || 0),
                              end: Number(w.end || w.endTime || 0),
                            }))
                          : [];
                        onTranscriptChange(words);
                        showToast(`Loaded ${words.length} words from file`, "success");
                      } catch {
                        showToast("Invalid JSON in file.", "error");
                      }
                    };
                    reader.readAsText(f);
                  }}
                />
              </div>
            </div>
          </details>

          {/* Caption style controls — set-once, collapsed to keep the editor front */}
          <details className="group border-t border-zinc-800 pt-2 mt-2">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-mini text-zinc-400 hover:text-zinc-200 select-none">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6" /></svg>
              Caption styling — font, position, colors
            </summary>
            <div className="space-y-3 mt-2">
            <SliderControl
              label="Font Size"
              value={style.fontSize}
              min={24}
              max={90}
              onChange={(v) => onStyleChange({ fontSize: v })}
            />
            <SliderControl
              label="Vertical Position"
              helpText="0.2 = top, 0.8 = bottom"
              value={style.captionYPosition}
              min={0.2}
              max={0.8}
              step={0.01}
              onChange={(v) => onStyleChange({ captionYPosition: v })}
            />
            <SliderControl
              label="Words per Caption"
              helpText="How many words shown at once"
              value={style.wordsPerCaption}
              min={1}
              max={8}
              onChange={(v) => onStyleChange({ wordsPerCaption: v })}
            />
            <div>
              <label className="flex justify-between text-xs text-zinc-400 mb-0.5">
                <span>Caption Motion</span>
              </label>
              <select
                value={style.captionAnimation ?? "clean"}
                onChange={(e) => onStyleChange({ captionAnimation: e.target.value as VideoStyle["captionAnimation"] })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <option value="clean">Clean — fade in, highlight sweep</option>
                <option value="dynamic">Dynamic — word pop-in + lift</option>
              </select>
              <p className="text-micro text-zinc-500 mt-0.5">Dynamic springs each word in and lifts the spoken word — preview with audio playing.</p>
            </div>
            <div className="space-y-2">
              <ColorControl
                label="Text"
                value={style.textColor}
                presets={TEXT_COLOR_PRESETS}
                onChange={(v) => onStyleChange({ textColor: v })}
              />
              <ColorControl
                label="Highlight"
                value={style.highlightColor}
                presets={HIGHLIGHT_COLOR_PRESETS}
                onChange={(v) => onStyleChange({ highlightColor: v })}
              />
              <ColorControl
                label="Shadow"
                value={style.shadowColor}
                presets={SHADOW_COLOR_PRESETS}
                onChange={(v) => onStyleChange({ shadowColor: v })}
              />
            </div>
            </div>
          </details>
        </div>
      </Section>

      <div className="border-t border-zinc-800" />

      {/* ④ Branding */}
      <Section
        id="branding"
        num={4}
        title="Branding"
        status={brandingStatus}
        done={introType !== "none" || outroType !== "none"}
        open={openSections.has("branding")}
        onToggle={() => onToggleSection("branding")}
      >
        <div className="space-y-3">
          {/* Avatar overlay placement — set-once brand defaults, collapsed */}
          <details className="group bg-zinc-900 rounded-lg border border-zinc-800">
            <summary className="flex items-center gap-1.5 cursor-pointer list-none text-micro uppercase tracking-wider text-zinc-400 font-medium p-2.5 select-none hover:text-zinc-200">
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6" /></svg>
              Avatar Overlay
            </summary>
            <div className="space-y-2 px-2.5 pb-2.5">
            {!avatarPath && (
              <p className="text-micro text-zinc-500">Select a presenter in step 1 to see the avatar overlay.</p>
            )}
            <SliderControl
              label="Avatar Size"
              value={style.avatarSize}
              min={50}
              max={180}
              onChange={(v) => onStyleChange({ avatarSize: v })}
            />
            <div>
              <label className="flex justify-between text-xs text-zinc-400 mb-0.5">
                <span>Speaking Indicator</span>
              </label>
              <select
                value={style.visualizerStyle ?? "bars"}
                onChange={(e) => onStyleChange({ visualizerStyle: e.target.value as VisualizerStyle })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {VISUALIZER_STYLES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <p className="text-micro text-zinc-500 mt-0.5">How the avatar reacts to the voice — preview it with audio playing.</p>
            </div>
            <div>
              <label className="flex justify-between text-xs text-zinc-400 mb-0.5">
                <span>Avatar Position</span>
              </label>
              <select
                value={style.avatarPosition}
                onChange={(e) => onStyleChange({ avatarPosition: e.target.value as VideoStyle["avatarPosition"] })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {AVATAR_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="flex justify-between text-xs text-zinc-400 mb-0.5">
                <span>Badge Position</span>
              </label>
              <select
                value={style.badgePosition ?? "top-left"}
                onChange={(e) => onStyleChange({ badgePosition: e.target.value as BadgePosition })}
                className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {BADGE_POSITIONS.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </div>
            </div>
          </details>

          {/* Intro */}
          <div className="space-y-2">
            <label className="text-micro uppercase tracking-wider text-zinc-400 font-medium block">Intro</label>
            <select
              value={introType}
              onChange={(e) => handleIntroTypeChange(e.target.value as IntroType)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="image">Image Overlay</option>
              <option value="animation">Avatar Animation</option>
            </select>

            {introType === "image" && !intro && (
              <FileUploadButton
                accept="image/*"
                label="Upload Intro Image"
                onFile={onIntroUpload}
              />
            )}
            {introType === "image" && intro && (
              <IntroOutroCard
                file={introFile}
                segment={intro}
                onChange={onIntroChange}
                onRemove={onIntroRemove}
                maxTime={durationInSeconds}
                removeLabel="Remove intro"
              />
            )}

            {introType === "animation" && (
              <div className="space-y-2 bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
                <div>
                  <label className="text-xs text-zinc-400 mb-0.5 block">Style</label>
                  <select
                    value={introAnimation.style || "circleReveal"}
                    onChange={(e) => onIntroAnimationChange({ style: e.target.value as IntroAnimationConfig["style"] })}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {INTRO_ANIMATION_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>
                <SliderControl
                  label="Hold Duration"
                  helpText="Time avatar stays centered"
                  value={introAnimation.holdDuration}
                  min={0.2}
                  max={2.0}
                  step={0.1}
                  onChange={(v) => onIntroAnimationChange({ holdDuration: v })}
                />
                <SliderControl
                  label="Transition Duration"
                  helpText="Time for the reveal animation"
                  value={introAnimation.transitionDuration}
                  min={0.3}
                  max={2.0}
                  step={0.1}
                  onChange={(v) => onIntroAnimationChange({ transitionDuration: v })}
                />
                <ColorControl
                  label="Background"
                  value={introAnimation.backgroundColor}
                  onChange={(v) => onIntroAnimationChange({ backgroundColor: v })}
                />
              </div>
            )}
          </div>

          {/* Outro */}
          <div className="space-y-2">
            <label className="text-micro uppercase tracking-wider text-zinc-400 font-medium block">Outro</label>
            <select
              value={outroType}
              onChange={(e) => handleOutroTypeChange(e.target.value as OutroType)}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <option value="none">None</option>
              <option value="image">Image Overlay</option>
              <option value="card">Branded Card</option>
            </select>

            {outroType === "image" && !outro && (
              <FileUploadButton
                accept="image/*"
                label="Upload Outro Image"
                onFile={onOutroUpload}
              />
            )}
            {outroType === "image" && outro && (
              <IntroOutroCard
                file={outroFile}
                segment={outro}
                onChange={onOutroChange}
                onRemove={onOutroRemove}
                maxTime={durationInSeconds}
                removeLabel="Remove outro"
              />
            )}

            {outroType === "card" && (
              <div className="space-y-2 bg-zinc-900 rounded-lg p-2.5 border border-zinc-800">
                <div>
                  <label className="text-xs text-zinc-400 mb-0.5 block">Style</label>
                  <select
                    value={outroCard.style || "classic"}
                    onChange={(e) => onOutroCardChange({ style: e.target.value as OutroStyle })}
                    className="w-full bg-zinc-800 text-zinc-300 text-xs rounded px-2 py-1.5 border border-zinc-700 focus-visible:ring-2 focus-visible:ring-blue-500"
                  >
                    {OUTRO_STYLES.map((s) => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <ToggleControl
                  label="OptionsLab Preset"
                  checked={outroCard.usePreset}
                  onChange={(v) => onOutroCardChange({ usePreset: v })}
                />

                {outroCard.usePreset && (
                  <ColorControl
                    label="Background"
                    value={outroCard.presetBackgroundColor ?? "#D6D0EA"}
                    onChange={(v) => onOutroCardChange({ presetBackgroundColor: v })}
                  />
                )}

                {!outroCard.usePreset && (
                  <div className="space-y-2 pt-1 border-t border-zinc-800">
                    <FileUploadButton
                      accept="image/svg+xml,image/png,image/jpeg"
                      label={outroLogoFile ? outroLogoFile.name : "Upload Logo"}
                      onFile={onOutroLogoUpload}
                    />
                    <TextInput
                      label="Brand Name"
                      value={outroCard.custom.brandName}
                      onChange={(v) => onOutroCardCustomChange({ brandName: v })}
                      placeholder="Your Brand"
                    />
                    <TextInput
                      label="Tagline"
                      value={outroCard.custom.tagline}
                      onChange={(v) => onOutroCardCustomChange({ tagline: v })}
                      placeholder="Your tagline here"
                    />
                    <FileUploadButton
                      accept="image/*"
                      label={outroBadgeFile ? outroBadgeFile.name : "Upload Badge (optional)"}
                      onFile={onOutroBadgeUpload}
                    />
                    <TextareaInput
                      label="Disclaimer"
                      value={outroCard.custom.disclaimer}
                      onChange={(v) => onOutroCardCustomChange({ disclaimer: v })}
                      placeholder="Legal disclaimer text..."
                    />
                    <ColorControl
                      label="Background"
                      value={outroCard.custom.backgroundColor}
                      onChange={(v) => onOutroCardCustomChange({ backgroundColor: v })}
                    />
                  </div>
                )}

                <SliderControl
                  label="Outro Duration"
                  helpText="How long the outro card stays on screen"
                  value={outroCard.transitionDuration}
                  min={1.0}
                  max={6.0}
                  step={0.1}
                  onChange={(v) => onOutroCardChange({ transitionDuration: v })}
                />
              </div>
            )}
          </div>
        </div>
      </Section>

    </div>
  );
};

export const InputPanel = React.memo(InputPanelInner);
InputPanel.displayName = "InputPanel";

/* ---- Intro/Outro card ---- */

function IntroOutroCard({
  file,
  segment,
  onChange,
  onRemove,
  maxTime,
  removeLabel,
}: {
  file: File | null;
  segment: IntroOutroSegment;
  onChange: (updates: Partial<IntroOutroSegment>) => void;
  onRemove: () => void;
  maxTime: number;
  removeLabel: string;
}) {
  const previewUrl = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  return (
    <div className="bg-zinc-900 rounded-lg p-2.5 border border-zinc-800 space-y-2">
      <div className="flex items-center gap-2">
        {previewUrl && (
          <img
            src={previewUrl}
            alt={file?.name ?? ""}
            className="w-12 h-12 object-cover rounded flex-shrink-0"
          />
        )}
        <p className="text-xs text-zinc-400 flex-1 truncate">{file?.name}</p>
        <button
          onClick={onRemove}
          aria-label={removeLabel}
          className="w-6 h-6 bg-zinc-800 hover:bg-red-600 rounded flex items-center justify-center flex-shrink-0 transition-colors text-zinc-400 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
        </button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <TimeInput
          label="Start"
          value={segment.startTime}
          max={maxTime}
          onChange={(v) => onChange({ startTime: v })}
        />
        <TimeInput
          label="Dur"
          value={segment.duration}
          max={maxTime}
          onChange={(v) => onChange({ duration: Math.max(0.1, v) })}
        />
        <TimeInput
          label="Fade"
          value={segment.fadeDuration}
          max={segment.duration / 2}
          onChange={(v) => onChange({ fadeDuration: v })}
        />
      </div>
    </div>
  );
}

/* ---- Collapsible numbered section ---- */

function Section({
  id,
  num,
  title,
  status,
  done,
  children,
  open,
  onToggle,
}: {
  id: string;
  num: number;
  title: string;
  status?: string;
  done?: boolean;
  children: React.ReactNode;
  open: boolean;
  onToggle: () => void;
}) {
  const contentId = `section-${id}`;
  return (
    <div>
      <button
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={contentId}
        className="w-full flex items-center gap-2.5 py-2.5 text-left group"
      >
        <span
          aria-hidden="true"
          className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-micro font-semibold transition-colors ${
            done ? "bg-green-500/20 text-green-400" : "bg-zinc-800 text-zinc-500 group-hover:text-zinc-300"
          }`}
        >
          {done ? (
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          ) : (
            num
          )}
        </span>
        <h2 className="text-sm font-medium text-zinc-300 group-hover:text-white transition-colors">
          {title}
        </h2>
        {status && (
          <span className="ml-auto text-micro text-zinc-500 truncate max-w-[150px] text-right">{status}</span>
        )}
        <span
          aria-hidden="true"
          className={`text-zinc-600 text-xs transition-transform duration-150 ${status ? "" : "ml-auto"}`}
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          ▸
        </span>
      </button>
      {open && (
        <div id={contentId} className="pb-2">
          {children}
        </div>
      )}
    </div>
  );
}

/* ---- Shared helpers ---- */

function ImageDropZone({ onImagesUpload, children }: { onImagesUpload: (files: File[]) => void; children: React.ReactNode }) {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith("image/"));
    if (files.length > 0) onImagesUpload(files);
  }, [onImagesUpload]);

  return (
    <div
      className="space-y-2 relative"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) onImagesUpload(files);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className={`w-full px-3 py-4 border-2 border-dashed rounded-lg text-sm transition-colors ${
          isDragging
            ? "border-blue-500 bg-blue-500/10 text-blue-400"
            : "border-zinc-700 hover:border-zinc-500 text-zinc-400 hover:text-zinc-300"
        }`}
      >
        <div className="flex flex-col items-center gap-1">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-60">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
            <circle cx="8.5" cy="8.5" r="1.5" />
            <polyline points="21 15 16 10 5 21" />
          </svg>
          <span>{isDragging ? "Drop images here" : "Drop images or click to browse"}</span>
        </div>
      </button>
      {children}
      {isDragging && (
        <div className="absolute inset-0 rounded-lg border-2 border-blue-500 bg-blue-500/5 pointer-events-none z-10" />
      )}
    </div>
  );
}

function FileUploadButton({
  accept,
  label,
  multiple,
  onFile,
  onFiles,
  primary,
}: {
  accept: string;
  label: string;
  multiple?: boolean;
  onFile?: (file: File) => void;
  onFiles?: (files: File[]) => void;
  primary?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const id = useId();
  return (
    <>
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          if (files.length === 0) return;
          if (onFiles) onFiles(files);
          else if (onFile) onFile(files[0]);
          e.target.value = "";
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className={`w-full px-3 py-2 border rounded-lg text-sm truncate transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 ${
          primary
            ? "bg-blue-600 hover:bg-blue-700 border-blue-500 text-white"
            : "bg-zinc-800 hover:bg-zinc-700 border-zinc-700 text-zinc-300"
        }`}
      >
        {label}
      </button>
    </>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  onChange,
  helpText,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  helpText?: string;
}) {
  const id = useId();
  return (
    <div>
      <div className="flex justify-between text-xs text-zinc-400 mb-0.5">
        <label htmlFor={id}>{label}</label>
        <span>{step && step < 1 ? value.toFixed(2) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step || 1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-blue-500"
      />
      {helpText && <p className="text-xs text-zinc-400 mt-0.5">{helpText}</p>}
    </div>
  );
}

const DELIVERY_OPTIONS: { value: DeliveryPreset; label: string }[] = [
  { value: "anchor", label: "Anchor" },
  { value: "default", label: "Default" },
  { value: "measured", label: "Measured" },
  { value: "warm", label: "Warm" },
  { value: "energetic", label: "Energetic" },
];

// Per-take delivery: pick a preset or fine-tune the ElevenLabs voice_settings.
// Same voice throughout — these only steer how it's performed.
function DeliveryControl({
  delivery,
  onChange,
  onInsertTag,
}: {
  delivery: VoiceDelivery;
  onChange: (d: VoiceDelivery) => void;
  onInsertTag: (tag: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [showSpec, setShowSpec] = useState(false);
  const [specText, setSpecText] = useState("");
  const [specMsg, setSpecMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [showNotes, setShowNotes] = useState(false);
  const s = delivery.settings;
  const setPreset = (preset: DeliveryPreset) => {
    if (preset === "custom") return;
    onChange({ ...delivery, preset, settings: { ...DELIVERY_PRESETS[preset] } });
  };
  const setSetting = (key: keyof VoiceSettings, v: number | boolean) => {
    onChange({ ...delivery, preset: "custom", settings: { ...s, [key]: v } });
  };
  const toggleV3 = () => onChange({ ...delivery, useV3: !delivery.useV3 });

  const openSpec = () => {
    const next = !showSpec;
    setShowSpec(next);
    setSpecMsg(null);
    if (next) setSpecText(delivery.specRaw ?? ""); // prefill with the stored spec to edit
  };

  const applySpec = () => {
    const parsed = parseVoiceSpec(specText);
    const bits: string[] = [];
    const next: VoiceDelivery = { ...delivery };
    if (parsed.settings) { next.settings = parsed.settings; next.preset = "custom"; bits.push("voice settings"); }
    if (parsed.tags) { next.tags = parsed.tags; bits.push(`${parsed.tags.length} tags`); }
    if (parsed.prosody) next.prosody = parsed.prosody;
    if (parsed.voiceDescription) next.voiceDescription = parsed.voiceDescription;
    if (!bits.length) {
      setSpecMsg({ ok: false, text: "Couldn't find a voice_settings or suggested_audio_tags block — check the format." });
      return;
    }
    next.specRaw = specText.trim() || undefined; // keep the verbatim paste
    onChange(next);
    setSpecMsg({ ok: true, text: `Applied ${bits.join(" · ")}.` });
    setShowSpec(false);
  };

  const paletteTags: readonly string[] = delivery.tags?.length ? delivery.tags : V3_AUDIO_TAGS;

  return (
    <div className="space-y-1.5 bg-zinc-900 rounded-lg border border-zinc-800 p-2.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-300 font-medium">Delivery</label>
        <div className="flex items-center gap-2">
          <button type="button" onClick={openSpec} className="text-micro text-violet-400 hover:text-violet-300">
            {showSpec ? "Close" : delivery.specRaw ? "Edit spec" : "Paste spec"}
          </button>
          <button type="button" onClick={() => setAdvanced((a) => !a)} className="text-micro text-zinc-500 hover:text-zinc-300">
            {advanced ? "Hide fine-tune" : "Fine-tune"}
          </button>
        </div>
      </div>

      {/* Paste-a-voice-spec: parse the blob once per script → settings + tags + notes */}
      {showSpec && (
        <div className="space-y-1.5 rounded-md border border-violet-500/30 bg-zinc-950/40 p-2">
          <textarea
            value={specText}
            onChange={(e) => setSpecText(e.target.value)}
            rows={5}
            placeholder={'Paste the voice spec, e.g.\nvoice_settings: {"stability": 0.5, "similarity_boost": 0.78, "style": 0.25, "use_speaker_boost": true}\nsuggested_audio_tags: conversational, brisk, warm, confident\nprosody: ...\nvoice_description: ...'}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-micro text-zinc-300 placeholder:text-zinc-600 resize-y focus-visible:ring-2 focus-visible:ring-violet-500 font-mono"
          />
          <div className="flex items-center gap-2">
            <Chip onClick={applySpec} className="px-2.5 py-1 text-micro rounded bg-violet-600 text-white hover:bg-violet-500">Apply spec</Chip>
            <span className="text-micro text-zinc-500">Reads voice_settings + tags; keeps prosody/description as notes.</span>
          </div>
        </div>
      )}
      {specMsg && (
        <p className={`text-micro ${specMsg.ok ? "text-green-400" : "text-amber-400"}`}>{specMsg.text}</p>
      )}

      <div className="flex gap-1">
        {DELIVERY_OPTIONS.map((o) => (
          <Chip
            key={o.value}
            onClick={() => setPreset(o.value)}
            className={`flex-1 px-2 py-1 text-micro rounded ${
              delivery.preset === o.value
                ? "bg-zinc-700 text-zinc-100"
                : "bg-zinc-800 text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {o.label}
          </Chip>
        ))}
      </div>
      {delivery.preset === "custom" && (
        delivery.specRaw ? (
          <p className="text-micro text-emerald-400">
            ✓ Spec applied — stability {s.stability} · style {s.style}
            {s.use_speaker_boost ? " · boost on" : ""}
            {delivery.tags?.length ? ` · ${delivery.tags.length} tags` : ""}
          </p>
        ) : (
          <p className="text-micro text-zinc-500">Custom delivery{!advanced ? " — open Fine-tune to adjust." : ""}</p>
        )
      )}
      {advanced && (
        <div className="space-y-1.5 pt-1">
          <SliderControl label="Stability" value={s.stability} min={0} max={1} step={0.05} onChange={(v) => setSetting("stability", v)} helpText="Lower = more emotional range; higher = steadier." />
          <SliderControl label="Similarity" value={s.similarity_boost} min={0} max={1} step={0.01} onChange={(v) => setSetting("similarity_boost", v)} helpText="How tightly to cling to the original voice timbre." />
          <SliderControl label="Style" value={s.style} min={0} max={1} step={0.05} onChange={(v) => setSetting("style", v)} helpText="Exaggerates the voice's characterful delivery." />
          <SliderControl label="Speed" value={s.speed} min={0.7} max={1.2} step={0.01} onChange={(v) => setSetting("speed", v)} helpText="1.0 = natural pace." />
          <label className="flex items-center justify-between cursor-pointer select-none">
            <span className="text-xs text-zinc-400">Speaker boost</span>
            <span className="relative inline-flex">
              <input type="checkbox" checked={!!s.use_speaker_boost} onChange={(e) => setSetting("use_speaker_boost", e.target.checked)} className="peer sr-only" />
              <span className="w-7 h-4 rounded-full bg-zinc-700 peer-checked:bg-blue-600 transition-colors" />
              <span className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
            </span>
          </label>
        </div>
      )}

      {/* Spec notes (prosody / voice_description / raw) — reference only, kept per project */}
      {(delivery.prosody || delivery.voiceDescription || delivery.specRaw) && (
        <div className="pt-1">
          <button type="button" onClick={() => setShowNotes((v) => !v)} className="text-micro text-zinc-500 hover:text-zinc-300">
            {showNotes ? "Hide spec notes" : "Spec notes"}
          </button>
          {showNotes && (
            <div className="mt-1 space-y-1.5 rounded-md bg-zinc-950/40 border border-zinc-800 p-2">
              {delivery.voiceDescription && (
                <p className="text-micro text-zinc-400"><span className="text-zinc-500">Voice:</span> {delivery.voiceDescription}</p>
              )}
              {delivery.prosody && (
                <p className="text-micro text-zinc-400"><span className="text-zinc-500">Prosody:</span> {delivery.prosody}</p>
              )}
              <p className="text-micro text-zinc-600">Reference only — ElevenLabs has no field for these; use them to steer your script wording and tag choices.</p>
              {delivery.specRaw && (
                <div className="pt-1 border-t border-zinc-800/80">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-micro text-zinc-500">Raw spec</span>
                    <Chip
                      onClick={() => navigator.clipboard?.writeText(delivery.specRaw ?? "")}
                      className="px-1.5 py-0.5 text-micro rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                      title="Copy the raw spec"
                    >
                      Copy
                    </Chip>
                  </div>
                  <pre className="text-micro text-zinc-500 whitespace-pre-wrap break-words max-h-28 overflow-y-auto font-mono">{delivery.specRaw}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Expressive (v3) mode — inline audio tags. Off by default. */}
      <div className="pt-1.5 mt-0.5 border-t border-zinc-800 space-y-1.5">
        <label className="flex items-center justify-between cursor-pointer select-none">
          <span className="text-micro text-zinc-400">Expressive mode <span className="text-zinc-600">(v3 · alpha)</span></span>
          <span className="relative inline-flex">
            <input type="checkbox" checked={!!delivery.useV3} onChange={toggleV3} className="peer sr-only" />
            <span className="w-7 h-4 rounded-full bg-zinc-700 peer-checked:bg-violet-600 transition-colors" />
            <span className="absolute left-0.5 top-0.5 w-3 h-3 rounded-full bg-white transition-transform peer-checked:translate-x-3" />
          </span>
        </label>
        {delivery.useV3 && (
          <>
            <div className="flex flex-wrap gap-1">
              {paletteTags.map((tag) => (
                <Chip
                  key={tag}
                  onClick={() => onInsertTag(tag)}
                  className="px-1.5 py-0.5 text-micro rounded bg-zinc-800 text-violet-300 hover:bg-zinc-700"
                  title={`Insert [${tag}] at the cursor`}
                >
                  {tag}
                </Chip>
              ))}
            </div>
            <p className="text-micro text-zinc-500">
              {delivery.tags?.length ? "Tags from your pasted spec. " : ""}Tags steer delivery only — spoken cues, never read aloud or shown in captions. v3 is non-deterministic and needs ElevenLabs v3 access.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// Read-only posting/social brief captured from the daily digest, shown on the
// project page. Copy buttons make it quick to grab when actually posting.
function PostDetailsCard({ meta }: { meta: TopicMeta }) {
  const copy = (s?: string) => { if (s) navigator.clipboard?.writeText(s); };
  const t = meta.postAt ? new Date(meta.postAt) : null;
  const CopyRow = ({ label, value }: { label: string; value: string }) => (
    <div>
      <div className="flex items-center justify-between">
        <span className="text-micro text-zinc-500">{label}</span>
        <Chip onClick={() => copy(value)} className="px-1.5 py-0.5 text-micro rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200" title={`Copy ${label.toLowerCase()}`}>Copy</Chip>
      </div>
      <p className="text-mini text-zinc-300 whitespace-pre-wrap break-words">{value}</p>
    </div>
  );
  return (
    <details open className="group bg-zinc-900 rounded-lg border border-zinc-800">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none text-micro uppercase tracking-wider text-zinc-400 font-medium p-2.5 select-none hover:text-zinc-200">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6" /></svg>
        Post details
        {meta.score != null && <span className="ml-auto text-micro px-1.5 py-0.5 rounded bg-zinc-800 text-emerald-300 tabular-nums normal-case">{meta.score}</span>}
      </summary>
      <div className="space-y-2 px-2.5 pb-2.5">
        {t && (
          <div className="flex items-center gap-2 text-mini">
            <span className="text-zinc-500">Post</span>
            <span className="text-zinc-200 tabular-nums">{formatTime(t, ZONES.WAT.id)} <span className="text-zinc-600">WAT</span> · {formatTime(t, ZONES.ET.id)} <span className="text-zinc-600">ET</span></span>
          </div>
        )}
        {meta.postTiming && <p className="text-mini text-zinc-400"><span className="text-zinc-500">Timing:</span> {meta.postTiming}</p>}
        {(meta.platform || meta.why) && (
          <p className="text-mini text-zinc-400">
            {meta.platform && <span className="text-zinc-300">{meta.platform}</span>}
            {meta.platform && meta.why ? " — " : ""}
            {meta.why}
          </p>
        )}
        {meta.thumbnail && <CopyRow label="Thumbnail" value={meta.thumbnail} />}
        {meta.description && <CopyRow label="Description" value={meta.description} />}
        {meta.hashtags && <CopyRow label="Hashtags" value={meta.hashtags} />}
        {meta.captions && meta.captions.length > 0 && (
          <div>
            <span className="text-micro text-zinc-500">On-screen captions</span>
            <ul className="mt-0.5 space-y-0.5">
              {meta.captions.map((c, i) => <li key={i} className="text-mini text-zinc-300">• {c}</li>)}
            </ul>
          </div>
        )}
        {meta.twitterKeywords && meta.twitterKeywords.length > 0 && (
          <div>
            <div className="flex items-center justify-between">
              <span className="text-micro text-zinc-500">Twitter keywords</span>
              <Chip onClick={() => copy(meta.twitterKeywords!.join(", "))} className="px-1.5 py-0.5 text-micro rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200" title="Copy all keywords">Copy</Chip>
            </div>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {meta.twitterKeywords.map((k, i) => <span key={i} className="text-micro px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400">{k}</span>)}
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

// For projects that predate the digest capture: paste the digest (or one
// topic's block) and attach its post details, matched to the project by title.
function AttachPostDetails({ projectName, onAttach }: { projectName: string; onAttach: (m: TopicMeta) => void }) {
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  const attach = () => {
    const topics = parseDigest(text);
    if (topics.length === 0) {
      setMsg({ ok: false, text: "No topics found — paste the digest or one topic block." });
      return;
    }
    const pn = norm(projectName);
    const t =
      topics.find((x) => norm(x.title) === pn) ??
      topics.find((x) => norm(x.title).includes(pn) || pn.includes(norm(x.title))) ??
      (topics.length === 1 ? topics[0] : null);
    if (!t) {
      setMsg({ ok: false, text: `Found ${topics.length} topics but none match “${projectName}”. Paste just this topic's block.` });
      return;
    }
    onAttach({
      postTiming: t.postTiming,
      platform: t.bestPlatform,
      score: t.score,
      why: t.why,
      thumbnail: t.thumbnail,
      description: t.description,
      hashtags: t.hashtags,
      captions: t.captions,
      twitterKeywords: t.twitterKeywords,
    });
    setMsg({ ok: true, text: `Attached details from “${t.title}”.` });
    setText("");
  };
  return (
    <details className="group bg-zinc-900 rounded-lg border border-zinc-800">
      <summary className="flex items-center gap-1.5 cursor-pointer list-none text-micro uppercase tracking-wider text-zinc-400 font-medium p-2.5 select-none hover:text-zinc-200">
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="transition-transform group-open:rotate-90"><polyline points="9 18 15 12 9 6" /></svg>
        Add post details
      </summary>
      <div className="space-y-1.5 px-2.5 pb-2.5">
        <p className="text-micro text-zinc-500">Paste the digest (or just this topic&apos;s block) to attach its thumbnail, description, hashtags, captions &amp; keywords. Matched to this project by title.</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Paste the digest…"
          className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-micro text-zinc-300 placeholder:text-zinc-600 resize-y focus-visible:ring-2 focus-visible:ring-violet-500 font-mono"
        />
        <div className="flex items-center gap-2">
          <Chip onClick={attach} className="px-2.5 py-1 text-micro rounded bg-violet-600 text-white hover:bg-violet-500">Attach</Chip>
          {msg && <span className={`text-micro ${msg.ok ? "text-emerald-400" : "text-amber-400"}`}>{msg.text}</span>}
        </div>
      </div>
    </details>
  );
}

function TimeInput({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-1">
      <label htmlFor={id} className="text-xs text-zinc-500 w-5">{label}</label>
      <input
        id={id}
        type="number"
        min={0}
        max={max}
        step={0.1}
        value={Number(value.toFixed(1))}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (!isNaN(v)) onChange(Math.max(0, Math.min(max, v)));
        }}
        className="w-16 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
      />
      <span className="text-xs text-zinc-400">s</span>
    </div>
  );
}

/* ---- Caption Editor ---- */

function CaptionEditor({
  transcript,
  onApply,
  showToast,
}: {
  transcript: TranscriptWord[];
  onApply: (words: TranscriptWord[]) => void;
  showToast: (message: string, type: "error" | "success") => void;
}) {
  // Build editable text from transcript words
  const originalText = useMemo(() => transcript.map((w) => w.word).join(" "), [transcript]);
  const [editText, setEditText] = useState(originalText);
  const [dirty, setDirty] = useState(false);

  // Sync when transcript changes externally (e.g. re-transcribe)
  useEffect(() => {
    setEditText(originalText);
    setDirty(false);
  }, [originalText]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditText(e.target.value);
    setDirty(true);
  }, []);

  const handleApply = useCallback(() => {
    const result = realignWords(editText, transcript);

    if (result.length === 0) {
      showToast("Caption text is empty", "error");
      return;
    }

    onApply(result);
    setDirty(false);
    showToast(`Applied ${result.length} words`, "success");
  }, [editText, transcript, onApply, showToast]);

  return (
    <div className="bg-zinc-900 rounded-lg border border-zinc-800 p-2.5 space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs text-zinc-400">Edit captions</label>
        {dirty && <span className="text-micro text-amber-400">unsaved</span>}
      </div>
      <textarea
        value={editText}
        onChange={handleChange}
        rows={5}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg p-2.5 text-sm text-zinc-300 leading-relaxed focus-visible:ring-2 focus-visible:ring-blue-500 resize-y"
      />
      <button
        onClick={handleApply}
        disabled={!dirty}
        title={!dirty ? "No changes to apply" : undefined}
        className="w-full px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-green-500"
      >
        Apply Edits
      </button>
    </div>
  );
}

function ToggleControl({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between">
      <label htmlFor={id} className="text-xs text-zinc-400">{label}</label>
      <button
        id={id}
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors ${checked ? "bg-blue-600" : "bg-zinc-700"}`}
      >
        <span
          className="absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full transition-transform"
          style={{ transform: checked ? "translateX(16px)" : "translateX(0)" }}
        />
      </button>
    </div>
  );
}

function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-zinc-400 mb-0.5 block">{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 focus-visible:ring-2 focus-visible:ring-blue-500"
      />
    </div>
  );
}

function TextareaInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-zinc-400 mb-0.5 block">{label}</label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={2}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1.5 text-xs text-zinc-300 resize-y focus-visible:ring-2 focus-visible:ring-blue-500"
      />
    </div>
  );
}

const COLOR_PRESETS = [
  { color: "#D6D0EA", label: "Lavender" },
  { color: "#6B7FD7", label: "Blue" },
  { color: "#2A2A2E", label: "Dark" },
  { color: "#39FF14", label: "Neon" },
];

const TEXT_COLOR_PRESETS = [
  { color: "#FFFFFF", label: "White" },
  { color: "#FACC15", label: "Yellow" },
  { color: "#0A0A0A", label: "Black" },
  { color: "#39FF14", label: "Neon" },
];

const HIGHLIGHT_COLOR_PRESETS = [
  { color: "#FACC15", label: "Yellow" },
  { color: "#22C55E", label: "Green" },
  { color: "#EF4444", label: "Red" },
  { color: "#38BDF8", label: "Sky Blue" },
];

const SHADOW_COLOR_PRESETS = [
  { color: "#000000", label: "Black" },
  { color: "#18181B", label: "Charcoal" },
  { color: "#1E3A8A", label: "Navy" },
  { color: "#FFFFFF", label: "White" },
];

function ColorControl({
  label,
  value,
  onChange,
  presets = COLOR_PRESETS,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  presets?: { color: string; label: string }[];
}) {
  const isPreset = presets.some((p) => p.color.toLowerCase() === value.toLowerCase());
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-zinc-400 flex-shrink-0">{label}</span>
      <div className="flex items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.color}
            type="button"
            onClick={() => onChange(p.color)}
            title={p.label}
            className={`w-6 h-6 rounded-full border-2 transition-all flex-shrink-0 ${
              value.toLowerCase() === p.color.toLowerCase()
                ? "border-white scale-110"
                : "border-zinc-600 hover:border-zinc-400"
            }`}
            style={{ backgroundColor: p.color }}
          />
        ))}
        <div className="w-px h-4 bg-zinc-700 mx-0.5" />
        <label
          className={`relative w-6 h-6 rounded-full border-2 cursor-pointer flex-shrink-0 transition-all ${
            !isPreset ? "border-white scale-110" : "border-zinc-600 hover:border-zinc-400"
          }`}
          style={{
            backgroundColor: value,
            backgroundImage: isPreset
              ? "conic-gradient(#f87171, #facc15, #4ade80, #38bdf8, #a78bfa, #f87171)"
              : undefined,
          }}
          title="Custom color"
        >
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </label>
      </div>
    </div>
  );
}

/* ---- Mini Timeline ---- */

const TIMELINE_COLORS = [
  "bg-blue-500", "bg-emerald-500", "bg-amber-500", "bg-rose-500",
  "bg-violet-500", "bg-cyan-500", "bg-orange-500", "bg-pink-500",
];

function MiniTimeline({ images, duration }: { images: ImageSegment[]; duration: number }) {
  if (duration <= 0) return null;
  return (
    <div className="relative w-full h-6 bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
      {images.map((img, i) => {
        const left = (img.startTime / duration) * 100;
        const width = ((img.endTime - img.startTime) / duration) * 100;
        return (
          <div
            key={i}
            className={`absolute top-0.5 bottom-0.5 rounded-sm ${TIMELINE_COLORS[i % TIMELINE_COLORS.length]} opacity-70`}
            style={{ left: `${left}%`, width: `${Math.max(width, 0.5)}%` }}
            title={`Image ${i + 1}: ${img.startTime.toFixed(1)}s – ${img.endTime.toFixed(1)}s`}
          >
            <span className="absolute inset-0 flex items-center justify-center text-micro text-white font-bold drop-shadow">
              {i + 1}
            </span>
          </div>
        );
      })}
      {/* Time markers */}
      <div className="absolute bottom-0 left-0 right-0 flex justify-between px-1">
        <span className="text-micro text-zinc-400">0s</span>
        <span className="text-micro text-zinc-400">{duration.toFixed(0)}s</span>
      </div>
    </div>
  );
}

/* ---- Draggable Image Card ---- */

function DraggableImageCard({
  index,
  file,
  image,
  onAnimationChange,
  onRemove,
  onReplace,
  onReorder,
  isSelected,
  onSelect,
}: {
  index: number;
  file: File;
  image: ImageSegment | undefined;
  onAnimationChange: (index: number, animation: ImageAnimation) => void;
  onRemove: (index: number) => void;
  onReplace: (index: number, file: File) => void;
  onReorder: (from: number, to: number) => void;
  isSelected: boolean;
  onSelect: (index: number) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isChart = !!image?.chart;
  const isPlaceholder = !image?.src && !isChart;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setIsDragging(true);
  }, [index]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);

    // Check if an image file was dropped directly onto a placeholder
    const files = e.dataTransfer.files;
    if (files.length > 0 && files[0].type.startsWith("image/")) {
      onReplace(index, files[0]);
      return;
    }

    const fromIndex = parseInt(e.dataTransfer.getData("text/plain"), 10);
    if (!isNaN(fromIndex) && fromIndex !== index) {
      onReorder(fromIndex, index);
    }
  }, [index, onReorder, onReplace]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) onReplace(index, f);
    e.target.value = "";
  }, [index, onReplace]);

  return (
    <div
      draggable={!isPlaceholder}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => isPlaceholder ? fileInputRef.current?.click() : onSelect(index)}
      className={`flex items-center gap-2 bg-zinc-900 rounded-lg p-2 border transition-all cursor-pointer ${
        isDragging ? "opacity-40 border-zinc-700" :
        isDragOver ? "border-violet-500 bg-violet-500/5" :
        isPlaceholder ? "border-dashed border-zinc-600 hover:border-violet-500" :
        isSelected ? "border-blue-500 ring-1 ring-blue-500/50" :
        "border-zinc-800 hover:border-zinc-700"
      }`}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
      {/* Drag handle + thumbnail or placeholder */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isPlaceholder && (
          <span className="text-zinc-600 text-micro cursor-grab active:cursor-grabbing select-none" title="Drag to reorder">
            ⠿
          </span>
        )}
        {isChart ? (
          <div className="w-9 h-9 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-emerald-400" title={`${image?.chart?.ticker} chart`}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
          </div>
        ) : isPlaceholder ? (
          <div className="w-9 h-9 rounded bg-zinc-800 border border-dashed border-zinc-600 flex items-center justify-center" title="Click or drop image">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-zinc-500"><path d="M8 3v10M3 8h10" /></svg>
          </div>
        ) : (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
            title="Click to replace this image"
            className="relative w-9 h-9 rounded overflow-hidden group/thumb"
          >
            <img src={image?.src} alt={file.name} className="w-full h-full object-cover" />
            <span className="absolute inset-0 bg-black/55 opacity-0 group-hover/thumb:opacity-100 flex items-center justify-center transition-opacity">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
            </span>
          </button>
        )}
      </div>

      {/* Name/description + Animation */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className={`w-4 h-4 rounded flex items-center justify-center text-micro font-bold text-white flex-shrink-0 ${TIMELINE_COLORS[index % TIMELINE_COLORS.length]}`}>
          {index + 1}
        </span>
        {isChart ? (
          <span className="text-mini text-zinc-300 truncate">
            {image?.chart?.ticker} chart <span className="text-zinc-500">· animated</span>
          </span>
        ) : isPlaceholder ? (
          <span className="text-micro text-zinc-500 truncate italic" title={file.name.replace(/^placeholder-/, "").replace(/\.png$/, "")}>
            Drop image here
          </span>
        ) : (
          <select
            value={image?.animation ?? "kenBurns"}
            onChange={(e) => {
              e.stopPropagation();
              onAnimationChange(index, e.target.value as ImageAnimation);
            }}
            onClick={(e) => e.stopPropagation()}
            className="flex-1 min-w-0 bg-zinc-800 border border-zinc-700 rounded px-1.5 py-0.5 text-mini text-zinc-400 focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            {IMAGE_ANIMATIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        )}
      </div>

      {/* Remove button */}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(index); }}
        aria-label="Remove image"
        className="w-5 h-5 bg-zinc-800 hover:bg-red-600 rounded flex items-center justify-center flex-shrink-0 transition-colors text-zinc-400 hover:text-white"
      >
        <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
      </button>
    </div>
  );
}

function SaveStatus({ lastSavedAt }: { lastSavedAt: number }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(interval);
  }, []);

  const seconds = Math.floor((Date.now() - lastSavedAt) / 1000);
  const label =
    seconds < 5 ? "Saved" :
    seconds < 60 ? `Saved ${seconds}s ago` :
    `Saved ${Math.floor(seconds / 60)}m ago`;

  return (
    <span className="text-micro text-zinc-500 leading-none">{label}</span>
  );
}
