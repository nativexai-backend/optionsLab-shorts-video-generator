"use client";

import React, { useState, useCallback, useEffect, useRef, useMemo, Suspense, lazy } from "react";
import Link from "next/link";
import { IconButton } from "./IconButton";
import type { PlayerRef } from "@remotion/player";
import { InputPanel } from "./InputPanel";
import { ErrorBoundary } from "./ErrorBoundary";
import { Timeline } from "./Timeline";
import { RenderButton } from "./RenderButton";
import { ThumbnailModal } from "./ThumbnailModal";
import { LibraryModal } from "./LibraryModal";
import { UsageModal } from "./UsageModal";
import { ChartModal } from "./ChartModal";
import { PronunciationModal } from "./PronunciationModal";
import { ToolbarMenu } from "./ToolbarMenu";

const PlayerPanel = lazy(() => import("./PlayerPanel").then(m => ({ default: m.PlayerPanel })));
import {
  TranscriptWord,
  ImageSegment,
  IntroOutroSegment,
  IntroAnimationConfig,
  OutroCardConfig,
  OutroCardContent,
  ImageAnimation,
  VideoStyle,
  DEFAULT_STYLE,
  DEFAULT_INTRO_ANIMATION,
  DEFAULT_OUTRO_CARD,
  DEFAULT_MUSIC_VOLUME,
  SceneSuggestion,
  ChartSpec,
  ClipTransform,
} from "../remotion/types";
import { AVATAR_VOICE_MAP, DEFAULT_DELIVERY, type VoiceDelivery } from "../lib/voices";
import {
  saveProjectFile,
  loadProjectFile,
  deleteProjectFile,
  clearProjectFiles,
  saveProjectState,
  loadProjectState,
  clearProjectState,
  migrateIfNeeded,
  listProjects,
  saveProjectsIndex,
  createProject,
  renameProject as storageRenameProject,
  deleteProject as storageDeleteProject,
  getActiveProjectId,
  setActiveProjectId,
  setProjectThumb,
  touchProject,
  listProjectsFromServer,
  createProjectOnServer,
  syncToServer,
  syncRenameToServer,
  loadFromServer,
  deleteProjectOnServer,
  syncFileToServer,
  loadFileFromServer,
  deleteFileOnServer,
  ProjectMeta,
  SerializableState,
  TopicMeta,
} from "../lib/storage";

import { postProcessTranscript } from "../lib/transcript";
import { computeSceneTimings, paceSuggestions, PACE_PRESETS, PaceName } from "../lib/scene-timing";
import { addImageToLibrary, fetchLibraryImageAsFile } from "../lib/library-client";
import type { LibraryImage } from "../lib/library-types";

// ── Undo/redo history ──
// Snapshot-based: captures the editable state (files by reference — File objects
// are immutable, so this is cheap). Audio takes are excluded; they have their
// own delete-undo flow.
interface HistorySnapshot {
  imageFiles: File[];
  images: ImageSegment[];
  transcript: TranscriptWord[];
  style: VideoStyle;
  audioDelay: number;
  musicVolume: number;
  durationInSeconds: number;
  introAnimation: IntroAnimationConfig;
  outroCard: OutroCardConfig;
  scriptText: string;
  sceneSuggestions: SceneSuggestion[];
}

// Module-level guard (survives Strict-Mode remounts, unlike a useRef): which
// projects have already had their auto-setup chain kicked off this session.
const startedPipelines = new Set<string>();

function snapshotKey(s: HistorySnapshot): string {
  return JSON.stringify({
    img: s.images.map((i) => [i.startTime, i.endTime, i.animation, i.src]),
    f: s.imageFiles.map((f) => `${f.name}:${f.size}`),
    t: s.transcript,
    st: s.style,
    ad: s.audioDelay,
    mv: s.musicVolume,
    d: s.durationInSeconds,
    ia: s.introAnimation,
    oc: s.outroCard,
    sc: s.scriptText,
    sg: s.sceneSuggestions.map((x) => x.id),
  });
}

const HISTORY_LIMIT = 60;

/** Merge local and server project lists. Server wins on conflict (by modifiedAt). */
function mergeProjectLists(
  local: ProjectMeta[],
  server: ProjectMeta[]
): ProjectMeta[] {
  const map = new Map<string, ProjectMeta>();
  for (const p of local) map.set(p.id, p);
  for (const sp of server) {
    const existing = map.get(sp.id);
    if (!existing || sp.modifiedAt >= existing.modifiedAt) {
      // Thumbnails are local-only — keep ours when the server entry wins.
      // Never let a server-side "Untitled" clobber a real local name
      // (state syncs used to auto-create projects as Untitled).
      const name =
        sp.name === "Untitled" && existing && existing.name !== "Untitled"
          ? existing.name
          : sp.name;
      map.set(sp.id, { ...sp, name, thumb: sp.thumb ?? existing?.thumb });
    }
  }
  return Array.from(map.values());
}

export const Editor: React.FC = () => {
  const [loaded, setLoaded] = useState(false);

  // ── Save status ──
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  // ── Multi-project state ──
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string>("");
  const [projects, setProjects] = useState<ProjectMeta[]>([]);

  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDelay, setAudioDelay] = useState(0);
  const [musicSrc, setMusicSrc] = useState<string | null>(null);
  const [musicFile, setMusicFile] = useState<File | null>(null);
  const [musicVolume, setMusicVolume] = useState(DEFAULT_MUSIC_VOLUME);
  const [voiceDelivery, setVoiceDelivery] = useState<VoiceDelivery>(DEFAULT_DELIVERY);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [availableAvatars, setAvailableAvatars] = useState<string[]>([]);
  const [images, setImages] = useState<ImageSegment[]>([]);
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [transcript, setTranscript] = useState<TranscriptWord[]>([]);
  const [style, setStyle] = useState<VideoStyle>(DEFAULT_STYLE);
  const [durationInSeconds, setDurationInSeconds] = useState(10);

  const [intro, setIntro] = useState<IntroOutroSegment | null>(null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [outro, setOutro] = useState<IntroOutroSegment | null>(null);
  const [outroFile, setOutroFile] = useState<File | null>(null);
  const [introAnimation, setIntroAnimation] = useState<IntroAnimationConfig>(DEFAULT_INTRO_ANIMATION);
  const [outroCard, setOutroCard] = useState<OutroCardConfig>(DEFAULT_OUTRO_CARD);
  const [outroLogoFile, setOutroLogoFile] = useState<File | null>(null);
  const [outroBadgeFile, setOutroBadgeFile] = useState<File | null>(null);

  const playerRef = useRef<PlayerRef>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState<number | null>(null);
  const [timelineExpanded, setTimelineExpanded] = useState(true);

  // Thumbnail settings — saved per project
  const [thumbnailCopy, setThumbnailCopy] = useState("");
  const [thumbnailFontSize, setThumbnailFontSize] = useState(78);
  const [thumbnailImageIndex, setThumbnailImageIndex] = useState(0);

  const [scriptText, setScriptText] = useState("");
  const [isGeneratingAudio, setIsGeneratingAudio] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [generatingStartedAt, setGeneratingStartedAt] = useState<number | null>(null);
  const [audioTakes, setAudioTakes] = useState<Array<{ id: string; src: string; file: File; label: string; avatarName: string; scriptUsed: string; transcript: TranscriptWord[]; createdAt: number }>>([]);
  const [activeVoiceName, setActiveVoiceName] = useState<string | null>(null);
  const [activeTakeId, setActiveTakeId] = useState<string | null>(null);

  // --- Scene suggestions (shot list) ---
  const [sceneSuggestions, setSceneSuggestions] = useState<SceneSuggestion[]>([]);
  const [isAnalyzingScript, setIsAnalyzingScript] = useState(false);

  // --- Auto-setup chain for triage-created projects (voice → captions → shot list) ---
  type PipelineStage = null | "start" | "audio" | "captions" | "scenes" | "done";
  const [autoPipeline, setAutoPipeline] = useState<PipelineStage>(null);
  // Guard so the chain fires exactly once per project, even if loadProject runs
  // twice (React Strict Mode dev double-invoke, or overlapping triggers).
  const pipelineStartedRef = useRef<Set<string>>(new Set());
  // Other triage projects still awaiting their auto-setup (flag not yet consumed).
  const [pendingProjects, setPendingProjects] = useState<ProjectMeta[]>([]);
  // Posting/social brief from the digest (shown read-only on the project page).
  const [topicMeta, setTopicMeta] = useState<TopicMeta | null>(null);
  type AnalysisProvider = "groq" | "claude" | "rules" | "auto";
  // Visuals (shot list + image prompts) default to Claude for the best quality;
  // falls back to Auto if no Anthropic key is configured (see the health check).
  const [analysisProvider, setAnalysisProvider] = useState<AnalysisProvider>("claude");
  const [availableProviders, setAvailableProviders] = useState<AnalysisProvider[]>(["auto", "claude", "rules"]);
  const [visualPace, setVisualPace] = useState<PaceName>("single");
  // The raw (un-paced) beats from the last analysis, so the pace control can
  // re-split instantly without another API call.
  const rawSuggestionsRef = useRef<SceneSuggestion[]>([]);

  // Mark the shot list stale when the script changes (instead of silently wiping it)
  const [shotListStale, setShotListStale] = useState(false);
  const prevScriptRef = useRef(scriptText);
  useEffect(() => {
    if (scriptText !== prevScriptRef.current) {
      prevScriptRef.current = scriptText;
      if (sceneSuggestions.length > 0) {
        setShotListStale(true);
      }
    }
  }, [scriptText, sceneSuggestions.length]);

  // ── Collapsible sections (lifted here so the empty-state checklist can open them) ──
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(["script"]));

  const toggleSection = useCallback((id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const openSection = useCallback((id: string) => {
    setOpenSections((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }, []);

  // ── Re-analyze confirmation (destructive — needs a real dialog, not a toast) ──
  const [showReanalyzeConfirm, setShowReanalyzeConfirm] = useState(false);
  useEffect(() => {
    if (!showReanalyzeConfirm) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") setShowReanalyzeConfirm(false); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [showReanalyzeConfirm]);

  // ── Undo/redo history ──
  const undoStack = useRef<HistorySnapshot[]>([]);
  const redoStack = useRef<HistorySnapshot[]>([]);
  const lastSnapshotKeyRef = useRef<string | null>(null);
  const skipHistoryRef = useRef(false);

  const takeSnapshot = useCallback((): HistorySnapshot => ({
    imageFiles, images, transcript, style, audioDelay, musicVolume,
    durationInSeconds, introAnimation, outroCard, scriptText, sceneSuggestions,
  }), [imageFiles, images, transcript, style, audioDelay, musicVolume, durationInSeconds, introAnimation, outroCard, scriptText, sceneSuggestions]);

  // Record history 500ms after edits settle. The first run after a project
  // loads records the baseline so the first edit is undoable.
  useEffect(() => {
    if (!loaded || !currentProjectId) return;
    const timer = setTimeout(() => {
      if (skipHistoryRef.current) {
        skipHistoryRef.current = false;
        return;
      }
      const snap = takeSnapshot();
      const key = snapshotKey(snap);
      if (lastSnapshotKeyRef.current === key) return;
      undoStack.current.push(snap);
      lastSnapshotKeyRef.current = key;
      if (undoStack.current.length > HISTORY_LIMIT) undoStack.current.shift();
      redoStack.current = [];
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, currentProjectId, takeSnapshot]);

  const resetHistory = useCallback(() => {
    undoStack.current = [];
    redoStack.current = [];
    lastSnapshotKeyRef.current = null;
    skipHistoryRef.current = false;
  }, []);

  // Auto-open sections as content appears so the panel follows the user's progress
  useEffect(() => {
    if (imageFiles.length > 0) openSection("visuals");
  }, [imageFiles.length, openSection]);
  useEffect(() => {
    if (transcript.length > 0) openSection("captions");
  }, [transcript.length, openSection]);

  // --- Toast system ---
  const [toast, setToast] = useState<{ message: string; type: "error" | "success"; action?: { label: string; onClick: () => void } } | null>(null);

  const showToast = useCallback((message: string, type: "error" | "success", action?: { label: string; onClick: () => void }) => {
    setToast({ message, type, action });
  }, []);

  useEffect(() => {
    if (!toast) return;
    // Errors stick around longer — users shouldn't have to catch them mid-flight
    const timer = setTimeout(
      () => setToast(null),
      toast.type === "error" ? 8000 : toast.action ? 5000 : 4000
    );
    return () => clearTimeout(timer);
  }, [toast]);

  // --- Computed hasContent ---
  const hasContent = Boolean(
    audioFile || avatarPath || imageFiles.length > 0 || transcript.length > 0 || intro || outro
  );

  // ── Helpers ──

  const revokeAllUrls = useCallback(() => {
    if (audioSrc) URL.revokeObjectURL(audioSrc);
    if (musicSrc) URL.revokeObjectURL(musicSrc);
    images.forEach((img) => URL.revokeObjectURL(img.src));
    if (intro?.src) URL.revokeObjectURL(intro.src);
    if (outro?.src) URL.revokeObjectURL(outro.src);
  }, [audioSrc, musicSrc, images, intro, outro]);

  const resetToDefaults = useCallback(() => {
    setAudioSrc(null);
    setAudioFile(null);
    setAudioDelay(0);
    setMusicSrc(null);
    setMusicFile(null);
    setMusicVolume(DEFAULT_MUSIC_VOLUME);
    setVoiceDelivery(DEFAULT_DELIVERY);
    setTopicMeta(null);
    setAvatarSrc(null);
    setAvatarPath(null);
    setImages([]);
    setImageFiles([]);
    setTranscript([]);
    setStyle(DEFAULT_STYLE);
    setDurationInSeconds(10);
    setIntro(null);
    setIntroFile(null);
    setOutro(null);
    setOutroFile(null);
    setIntroAnimation(DEFAULT_INTRO_ANIMATION);
    setOutroCard(DEFAULT_OUTRO_CARD);
    setOutroLogoFile(null);
    setOutroBadgeFile(null);
    setScriptText("");
    setThumbnailCopy("");
    setThumbnailFontSize(78);
    setThumbnailImageIndex(0);
    setAudioTakes((prev) => {
      prev.forEach((t) => URL.revokeObjectURL(t.src));
      return [];
    });
    setActiveVoiceName(null);
    setActiveTakeId(null);
    setSceneSuggestions([]);
    setVisualPace("single");
    rawSuggestionsRef.current = [];
  }, []);

  const buildSerializableState = useCallback((): SerializableState => ({
    ...(topicMeta ? { topicMeta } : {}),
    audioDelay,
    musicVolume,
    voiceDelivery,
    durationInSeconds,
    transcript,
    imageTiming: images.map((img) => ({
      startTime: img.startTime,
      endTime: img.endTime,
      animation: img.animation,
      ...(img.track ? { track: img.track } : {}),
      ...(img.transform ? { transform: img.transform } : {}),
      ...(img.chart ? { chart: img.chart } : {}),
    })),
    intro: intro ? { startTime: intro.startTime, duration: intro.duration, fadeDuration: intro.fadeDuration } : null,
    outro: outro ? { startTime: outro.startTime, duration: outro.duration, fadeDuration: outro.fadeDuration } : null,
    introAnimation,
    outroCard: {
      enabled: outroCard.enabled,
      usePreset: outroCard.usePreset,
      presetBackgroundColor: outroCard.presetBackgroundColor,
      custom: {
        brandName: outroCard.custom.brandName,
        tagline: outroCard.custom.tagline,
        disclaimer: outroCard.custom.disclaimer,
        backgroundColor: outroCard.custom.backgroundColor,
      },
      transitionDuration: outroCard.transitionDuration,
      style: outroCard.style,
    },
    style: style as unknown as Record<string, unknown>,
    avatarPath,
    scriptText,
    thumbnail: { copy: thumbnailCopy, fontSize: thumbnailFontSize, imageIndex: thumbnailImageIndex },
    visualPace,
    audioTakes: audioTakes.map((t) => ({ id: t.id, label: t.label, avatarName: t.avatarName, scriptUsed: t.scriptUsed, transcript: t.transcript, createdAt: t.createdAt })),
    activeVoiceName,
    activeTakeId,
    sceneSuggestions: sceneSuggestions.map((s) => ({ id: s.id, scriptSegment: s.scriptSegment, description: s.description, imagePrompt: s.imagePrompt, category: s.category, suggestedAnimation: s.suggestedAnimation, animationReason: s.animationReason, priority: s.priority, wordRange: s.wordRange, part: s.part, partCount: s.partCount })),
  }), [topicMeta, audioDelay, musicVolume, voiceDelivery, durationInSeconds, transcript, images, intro, outro, introAnimation, outroCard, style, avatarPath, scriptText, thumbnailCopy, thumbnailFontSize, thumbnailImageIndex, visualPace, audioTakes, activeVoiceName, activeTakeId, sceneSuggestions]);

  const forceSaveCurrent = useCallback(() => {
    if (!currentProjectId) return;
    const state = buildSerializableState();
    saveProjectState(currentProjectId, state);
    touchProject(currentProjectId);
    setLastSavedAt(Date.now());
    syncToServer(currentProjectId, state, currentProjectName); // non-blocking
  }, [currentProjectId, currentProjectName, buildSerializableState]);

  // ── Load a project by ID (try server first, fall back to local) ──
  const loadProject = useCallback(async (id: string) => {
    revokeAllUrls();
    resetToDefaults();
    resetHistory();
    setAutoPipeline(null); // cancel any in-flight auto-setup from a prior project

    const projectsList = listProjects();
    const meta = projectsList.find((p) => p.id === id);
    if (!meta) return;

    setCurrentProjectId(id);
    setCurrentProjectName(meta.name);
    setActiveProjectId(id);

    // Try loading state from server first, fall back to local
    let state = loadProjectState(id);
    const serverData = await loadFromServer(id);
    if (serverData?.state) {
      // Server state wins ONLY if strictly newer than local (local is freshest on ties)
      const localMod = meta.modifiedAt;
      const serverMod = serverData.project?.modifiedAt ?? 0;
      if (!state || serverMod > localMod) {
        state = serverData.state;
        // Cache server state locally
        saveProjectState(id, state);
      }
    }

    // Restore files: try local (IndexedDB) first, fall back to server
    const restoreFile = async (key: string): Promise<File | null> => {
      const local = await loadProjectFile(id, key);
      if (local) return local;
      const remote = await loadFileFromServer(id, key);
      if (remote) {
        // Cache in IndexedDB
        await saveProjectFile(id, key, remote);
      }
      return remote;
    };

    const restoredAudio = await restoreFile("audio");
    const restoredMusic = await restoreFile("music");
    const restoredIntro = await restoreFile("intro");
    const restoredOutro = await restoreFile("outro");

    if (restoredAudio) {
      setAudioFile(restoredAudio);
      setAudioSrc(URL.createObjectURL(restoredAudio));
    }
    if (restoredMusic) {
      setMusicFile(restoredMusic);
      setMusicSrc(URL.createObjectURL(restoredMusic));
    }

    // Rebuild segments from the timing list — each is either an image (from a
    // restored file) or an animated chart (spec embedded in the timing entry).
    const timing = state?.imageTiming ?? [];
    if (timing.length > 0) {
      const files: File[] = [];
      const segs: ImageSegment[] = [];
      for (let i = 0; i < timing.length; i++) {
        const t = (timing[i] ?? {}) as { startTime?: number; endTime?: number; animation?: ImageAnimation; chart?: ChartSpec; track?: number; transform?: ClipTransform };
        const f = await restoreFile(`image_${i}`);
        files.push(f ?? new File([], `placeholder-${i}.png`, { type: "image/png" }));
        segs.push({
          src: t.chart ? "" : (f && f.size > 0 ? URL.createObjectURL(f) : ""),
          startTime: t.startTime ?? 0,
          endTime: t.endTime ?? 10,
          animation: t.animation ?? (t.chart ? "static" : "kenBurns"),
          ...(t.track ? { track: t.track } : {}),
          ...(t.transform ? { transform: t.transform } : {}),
          ...(t.chart ? { chart: t.chart } : {}),
        });
      }
      setImageFiles(files);
      setImages(segs);
    }
    if (restoredIntro && state?.intro) {
      setIntroFile(restoredIntro);
      setIntro({ ...state.intro, src: URL.createObjectURL(restoredIntro) });
    }
    if (restoredOutro && state?.outro) {
      setOutroFile(restoredOutro);
      setOutro({ ...state.outro, src: URL.createObjectURL(restoredOutro) });
    }

    const restoredOutroLogo = await restoreFile("outroCardLogo");
    const restoredOutroBadge = await restoreFile("outroCardBadge");
    if (restoredOutroLogo) setOutroLogoFile(restoredOutroLogo);
    if (restoredOutroBadge) setOutroBadgeFile(restoredOutroBadge);

    if (state) {
      setAudioDelay(state.audioDelay ?? 0);
      setMusicVolume(state.musicVolume ?? DEFAULT_MUSIC_VOLUME);
      setVoiceDelivery(state.voiceDelivery ? (state.voiceDelivery as VoiceDelivery) : DEFAULT_DELIVERY);
      setTopicMeta(state.topicMeta ?? null);
      setDurationInSeconds(state.durationInSeconds ?? 10);
      setTranscript(state.transcript ?? []);
      setStyle((prev) => {
        const saved = state.style as Record<string, unknown>;
        const clean = Object.fromEntries(Object.entries(saved).filter(([, v]) => v !== undefined));
        return { ...prev, ...clean };
      });
      if (state.avatarPath) {
        setAvatarPath(state.avatarPath);
        setAvatarSrc(state.avatarPath);
      }
      if (state.scriptText !== undefined) {
        setScriptText(state.scriptText);
      }
      if (state.thumbnail) {
        setThumbnailCopy(state.thumbnail.copy ?? "");
        setThumbnailFontSize(state.thumbnail.fontSize ?? 78);
        setThumbnailImageIndex(state.thumbnail.imageIndex ?? 0);
      }
      if (state.visualPace) {
        setVisualPace(state.visualPace as PaceName);
      }
      if (state.sceneSuggestions && state.sceneSuggestions.length > 0) {
        setSceneSuggestions(state.sceneSuggestions as SceneSuggestion[]);
      }
      if (state.activeVoiceName !== undefined) {
        setActiveVoiceName(state.activeVoiceName);
      }
      if (state.activeTakeId !== undefined) {
        setActiveTakeId(state.activeTakeId);
      }
      if (state.audioTakes && state.audioTakes.length > 0) {
        const restoredTakes = [];
        for (const meta of state.audioTakes) {
          const takeFile = await restoreFile(`take_${meta.id}`);
          if (takeFile) {
            restoredTakes.push({
              ...meta,
              src: URL.createObjectURL(takeFile),
              file: takeFile,
            });
          }
        }
        setAudioTakes(restoredTakes);
      }
      if (state.introAnimation) {
        setIntroAnimation((prev) => ({ ...prev, ...state.introAnimation } as IntroAnimationConfig));
      }
      if (state.outroCard) {
        const savedCustom = state.outroCard.custom;
        setOutroCard((prev) => ({
          enabled: state.outroCard!.enabled,
          usePreset: state.outroCard!.usePreset,
          presetBackgroundColor: (state.outroCard as OutroCardConfig).presetBackgroundColor ?? prev.presetBackgroundColor,
          transitionDuration: state.outroCard!.transitionDuration,
          style: ((state.outroCard as OutroCardConfig).style ?? prev.style) as OutroCardConfig["style"],
          custom: {
            ...prev.custom,
            brandName: savedCustom.brandName,
            tagline: savedCustom.tagline,
            disclaimer: savedCustom.disclaimer,
            backgroundColor: savedCustom.backgroundColor,
            logoSrc: restoredOutroLogo ? URL.createObjectURL(restoredOutroLogo) : prev.custom.logoSrc,
            badgeSrc: restoredOutroBadge ? URL.createObjectURL(restoredOutroBadge) : prev.custom.badgeSrc,
          },
        }));
      }
      // Triage-created project: kick off the auto-setup chain once per project.
      // The flag isn't part of buildSerializableState, so it's never re-saved;
      // the ref guards against Strict-Mode / double-load re-triggers.
      if (state.autoPipeline && !pipelineStartedRef.current.has(id)) {
        pipelineStartedRef.current.add(id);
        setAutoPipeline("start");
      }
    }
  }, [revokeAllUrls, resetToDefaults, resetHistory]);

  // --- Fetch available avatars on mount ---
  useEffect(() => {
    fetch("/api/avatars")
      .then((res) => res.json())
      .then((data) => setAvailableAvatars(data.avatars ?? []))
      .catch(() => {});
  }, []);

  // --- Service health (warn up-front about missing API keys) ---
  const [ttsAvailable, setTtsAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then((data) => {
        setTtsAvailable(!!data.elevenlabs);
        // Populate the provider dropdown up-front so Claude/Groq are selectable
        // before the first analysis (otherwise only Auto/Rules show, and Auto
        // always picks Groq — leaving Claude unreachable).
        const providers: AnalysisProvider[] = ["auto"];
        if (data.groq) providers.push("groq");
        if (data.anthropic) providers.push("claude");
        providers.push("rules");
        setAvailableProviders(providers);
        // Default-to-Claude only holds when a key is present; otherwise drop to Auto.
        if (!data.anthropic) setAnalysisProvider((p) => (p === "claude" ? "auto" : p));
      })
      .catch(() => {});
  }, []);

  // --- Restore from storage on mount, merge with server ---
  useEffect(() => {
    (async () => {
      try {
        await migrateIfNeeded();
        const localProjects = listProjects();

        // Fetch server projects and merge
        const serverProjects = await listProjectsFromServer();
        const merged = mergeProjectLists(localProjects, serverProjects);
        saveProjectsIndex(merged);
        setProjects(merged);

        // Push any local-only projects to server
        for (const lp of merged) {
          if (!serverProjects.some((sp) => sp.id === lp.id)) {
            createProjectOnServer(lp); // fire-and-forget
          }
        }

        const activeId = getActiveProjectId();
        if (activeId && merged.some((p) => p.id === activeId)) {
          await loadProject(activeId);
        } else if (merged.length > 0 && !activeId) {
          // New browser — load the most recent project from server
          const sorted = [...merged].sort((a, b) => b.modifiedAt - a.modifiedAt);
          await loadProject(sorted[0].id);
        }
      } catch (err) {
        console.warn("Failed to restore state:", err);
      }
      setLoaded(true);
    })();
  // loadProject is stable enough for mount; we only run once
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Auto-create project when content is first added ──
  const prevHasContent = useRef(false);
  useEffect(() => {
    if (!loaded) return;
    if (hasContent && !prevHasContent.current && !currentProjectId) {
      const project = createProject("Untitled");
      setCurrentProjectId(project.id);
      setCurrentProjectName(project.name);
      setProjects(listProjects());
      createProjectOnServer(project); // non-blocking
    }
    prevHasContent.current = hasContent;
  }, [loaded, hasContent, currentProjectId]);

  // --- Persist state on changes (debounced) ---
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (!loaded || !currentProjectId) return;
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      const state = buildSerializableState();
      saveProjectState(currentProjectId, state);
      touchProject(currentProjectId);
      setProjects(listProjects());
      setLastSavedAt(Date.now());
      // Non-blocking server sync — includes the name so renames self-heal
      syncToServer(currentProjectId, state, currentProjectName);
    }, 500);
    return () => clearTimeout(timer);
  }, [loaded, currentProjectId, currentProjectName, buildSerializableState]);

  // --- Persist files to IndexedDB + server ---
  const persistFile = useCallback(async (key: string, file: File | null) => {
    if (!currentProjectId) return;
    if (file) {
      await saveProjectFile(currentProjectId, key, file);
      syncFileToServer(currentProjectId, key, file); // non-blocking
    } else {
      await deleteProjectFile(currentProjectId, key);
      deleteFileOnServer(currentProjectId, key); // non-blocking
    }
  }, [currentProjectId]);

  // ── Undo/redo restore ──
  const restoreSnapshot = useCallback((snap: HistorySnapshot) => {
    skipHistoryRef.current = true;
    lastSnapshotKeyRef.current = snapshotKey(snap);
    setImageFiles(snap.imageFiles);
    // Regenerate object URLs from files — originals may have been revoked
    setImages(snap.images.map((img, i) => {
      const f = snap.imageFiles[i];
      return { ...img, src: f && f.size > 0 ? URL.createObjectURL(f) : img.src };
    }));
    setTranscript(snap.transcript);
    setStyle(snap.style);
    setAudioDelay(snap.audioDelay);
    setMusicVolume(snap.musicVolume);
    setDurationInSeconds(snap.durationInSeconds);
    setIntroAnimation(snap.introAnimation);
    setOutroCard(snap.outroCard);
    setScriptText(snap.scriptText);
    setSceneSuggestions(snap.sceneSuggestions);
    rawSuggestionsRef.current = snap.sceneSuggestions;
    // Re-sync persisted image files with the restored set
    snap.imageFiles.forEach((f, i) => persistFile(`image_${i}`, f));
    if (currentProjectId) deleteProjectFile(currentProjectId, `image_${snap.imageFiles.length}`);
  }, [persistFile, currentProjectId]);

  const handleUndo = useCallback(() => {
    if (undoStack.current.length < 2) return;
    const current = undoStack.current.pop()!;
    redoStack.current.push(current);
    restoreSnapshot(undoStack.current[undoStack.current.length - 1]);
  }, [restoreSnapshot]);

  const handleRedo = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push(snap);
    restoreSnapshot(snap);
  }, [restoreSnapshot]);

  // ── Project thumbnail from the first assigned image ──
  const thumbSourceRef = useRef<File | null>(null);
  useEffect(() => {
    if (!currentProjectId) return;
    const first = imageFiles.find((f) => f.size > 0) ?? null;
    if (first === thumbSourceRef.current) return;
    thumbSourceRef.current = first;
    if (!first) {
      setProjectThumb(currentProjectId, null);
      queueMicrotask(() => setProjects(listProjects()));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(first);
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = 72;
        canvas.height = 128;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Cover-fit crop
          const scale = Math.max(72 / img.width, 128 / img.height);
          const dw = img.width * scale;
          const dh = img.height * scale;
          ctx.drawImage(img, (72 - dw) / 2, (128 - dh) / 2, dw, dh);
          setProjectThumb(currentProjectId, canvas.toDataURL("image/jpeg", 0.6));
          setProjects(listProjects());
        }
      } catch {}
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [imageFiles, currentProjectId]);

  // Keep outro anchored to the end when duration changes
  useEffect(() => {
    setOutro((prev) => {
      if (!prev) return prev;
      const newStart = Math.max(0, durationInSeconds - prev.duration);
      if (prev.startTime === newStart) return prev;
      return { ...prev, startTime: newStart };
    });
  }, [durationInSeconds]);

  // Warn before losing work (only when there's content)
  useEffect(() => {
    if (!hasContent) return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasContent]);

  // --- Project handlers ---

  const handleManualSave = useCallback(() => {
    if (!currentProjectId) return;
    forceSaveCurrent();
    setProjects(listProjects());
    showToast("Project saved", "success");
  }, [currentProjectId, forceSaveCurrent, showToast]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Ctrl/Cmd+S — save (works even in inputs)
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        handleManualSave();
        return;
      }

      // Ignore when typing in inputs
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.target as HTMLElement)?.isContentEditable) return;

      // Undo / redo (text fields keep their native undo via the guard above)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        const player = playerRef.current;
        if (!player) return;
        if (player.isPlaying()) player.pause();
        else player.play();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playerRef, handleManualSave, handleUndo, handleRedo]);

  const handleNewProject = useCallback(() => {
    if (currentProjectId) forceSaveCurrent();
    revokeAllUrls();
    resetToDefaults();
    resetHistory();

    const project = createProject("Untitled");
    setCurrentProjectId(project.id);
    setCurrentProjectName(project.name);
    setProjects(listProjects());
    isFirstRender.current = true; // prevent immediate auto-save of defaults

    createProjectOnServer(project); // non-blocking

    showToast("New project started", "success");
  }, [currentProjectId, forceSaveCurrent, revokeAllUrls, resetToDefaults, resetHistory, showToast]);

  const handleSwitchProject = useCallback(async (id: string) => {
    if (id === currentProjectId) return;
    if (currentProjectId) forceSaveCurrent();

    await loadProject(id);
    setProjects(listProjects());
    isFirstRender.current = true;
  }, [currentProjectId, forceSaveCurrent, loadProject]);

  const handleDeleteProject = useCallback(async (id: string) => {
    await storageDeleteProject(id);
    deleteProjectOnServer(id); // non-blocking
    const remaining = listProjects();
    setProjects(remaining);

    if (id === currentProjectId) {
      if (remaining.length > 0) {
        // Switch to most recently modified
        const sorted = [...remaining].sort((a, b) => b.modifiedAt - a.modifiedAt);
        await loadProject(sorted[0].id);
        isFirstRender.current = true;
      } else {
        revokeAllUrls();
        resetToDefaults();
        setCurrentProjectId(null);
        setCurrentProjectName("");
        setActiveProjectId(null);
      }
    }
  }, [currentProjectId, loadProject, revokeAllUrls, resetToDefaults]);

  const handleRenameProject = useCallback((id: string, name: string) => {
    storageRenameProject(id, name);
    syncRenameToServer(id, name); // non-blocking
    setProjects(listProjects());
    if (id === currentProjectId) {
      setCurrentProjectName(name);
    }
  }, [currentProjectId]);

  const handleAudioUpload = useCallback((file: File) => {
    setAudioFile(file);
    persistFile("audio", file);
    const url = URL.createObjectURL(file);
    setAudioSrc(url);

    const audio = new window.Audio();
    audio.addEventListener("loadedmetadata", () => {
      const dur = audio.duration;
      setDurationInSeconds(dur);
      setImages((prev) => {
        if (prev.length === 0) return prev;
        const segDur = dur / prev.length;
        return prev.map((img, i) => ({
          ...img,
          startTime: i * segDur,
          endTime: (i + 1) * segDur,
          animation: img.animation ?? "kenBurns",
        }));
      });
    });
    audio.src = url;
  }, [persistFile]);

  const handleMusicUpload = useCallback((file: File) => {
    setMusicFile(file);
    persistFile("music", file);
    setMusicSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return URL.createObjectURL(file);
    });
  }, [persistFile]);

  const handleMusicRemove = useCallback(() => {
    setMusicSrc((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setMusicFile(null);
    persistFile("music", null);
  }, [persistFile]);

  const handleImagesUpload = useCallback(
    (files: File[]) => {
      const allFiles = [...imageFiles, ...files];
      setImageFiles(allFiles);
      for (let i = imageFiles.length; i < allFiles.length; i++) {
        persistFile(`image_${i}`, allFiles[i]);
        // Auto-capture into the library with whatever scene context aligns
        const scene = sceneSuggestions[i];
        addImageToLibrary(allFiles[i], {
          description: scene?.description,
          category: scene?.category,
          projectId: currentProjectId,
        });
      }

      setImages((prev) => {
        const lastEnd = prev.length > 0 ? Math.max(...prev.map((img) => img.endTime)) : 0;
        const segDur = 4; // 4 seconds per image by default
        const wouldEnd = lastEnd + files.length * segDur;

        const newImages: ImageSegment[] = files.map((f, i) => ({
          src: URL.createObjectURL(f),
          startTime: lastEnd + i * segDur,
          endTime: lastEnd + (i + 1) * segDur,
          animation: "kenBurns" as ImageAnimation,
        }));

        const all = [...prev, ...newImages];

        // If images would extend past audio, redistribute evenly
        if (durationInSeconds > 0 && wouldEnd > durationInSeconds) {
          const evenDur = durationInSeconds / all.length;
          return all.map((img, i) => ({
            ...img,
            startTime: i * evenDur,
            endTime: (i + 1) * evenDur,
          }));
        }

        return all;
      });
    },
    [durationInSeconds, imageFiles, persistFile, sceneSuggestions, currentProjectId]
  );

  // Remove a whole block — its timeline slot AND its shot-list card — so the two
  // stay aligned 1:1. Used by both the image-slot × and the shot-card ×.
  const handleRemoveImage = useCallback(
    (index: number) => {
      // Snapshot for undo (URLs are kept valid until the toast expires)
      const prevFiles = [...imageFiles];
      const prevImages = [...images];
      const prevSugs = [...sceneSuggestions];

      if (index < imageFiles.length) {
        const newFiles = imageFiles.filter((_, i) => i !== index);
        setImageFiles(newFiles);
        setImages((prev) => prev.filter((_, i) => i !== index));
        newFiles.forEach((f, i) => persistFile(`image_${i}`, f));
        if (currentProjectId) deleteProjectFile(currentProjectId, `image_${newFiles.length}`);
      }
      if (index < sceneSuggestions.length) {
        const newSugs = sceneSuggestions.filter((_, i) => i !== index);
        setSceneSuggestions(newSugs);
        rawSuggestionsRef.current = newSugs; // curated list — pace won't resurrect it
      }

      showToast("Block removed", "success", {
        label: "Undo",
        onClick: () => {
          setImageFiles(prevFiles);
          setImages(prevImages);
          setSceneSuggestions(prevSugs);
          rawSuggestionsRef.current = prevSugs;
          prevFiles.forEach((f, i) => persistFile(`image_${i}`, f));
          setToast(null);
        },
      });
    },
    [imageFiles, images, sceneSuggestions, persistFile, currentProjectId, showToast]
  );

  const handleReplaceImage = useCallback(
    (index: number, file: File) => {
      const newFiles = [...imageFiles];
      newFiles[index] = file;
      setImageFiles(newFiles);
      persistFile(`image_${index}`, file);

      const url = URL.createObjectURL(file);
      setImages((prev) =>
        prev.map((img, i) => {
          if (i !== index) return img;
          if (img.src) URL.revokeObjectURL(img.src);
          return { ...img, src: url };
        })
      );

      // Auto-capture into the library, tagged with this slot's scene context
      const scene = sceneSuggestions[index];
      addImageToLibrary(file, {
        description: scene?.description,
        category: scene?.category,
        projectId: currentProjectId,
      });
    },
    [imageFiles, persistFile, sceneSuggestions, currentProjectId]
  );

  const handleReorderImages = useCallback(
    (fromIndex: number, toIndex: number) => {
      setImageFiles((prev) => {
        const next = [...prev];
        const [moved] = next.splice(fromIndex, 1);
        next.splice(toIndex, 0, moved);
        next.forEach((f, i) => persistFile(`image_${i}`, f));
        return next;
      });
      setImages((prev) => {
        // Move the visual assignment (src + animation); each slot keeps its timing
        const assignments = prev.map((img) => ({ src: img.src, animation: img.animation }));
        const [moved] = assignments.splice(fromIndex, 1);
        assignments.splice(toIndex, 0, moved);
        return prev.map((img, i) => ({ ...img, src: assignments[i].src, animation: assignments[i].animation }));
      });
      // Move the shot card too, so card N keeps matching image N after reorder
      if (fromIndex < sceneSuggestions.length && toIndex < sceneSuggestions.length) {
        const nextSugs = [...sceneSuggestions];
        const [moved] = nextSugs.splice(fromIndex, 1);
        nextSugs.splice(toIndex, 0, moved);
        setSceneSuggestions(nextSugs);
        rawSuggestionsRef.current = nextSugs;
      }
    },
    [persistFile, sceneSuggestions]
  );

  const handleRedistributeImages = useCallback(() => {
    setImages((prev) => {
      if (prev.length === 0) return prev;
      const segDur = durationInSeconds / prev.length;
      return prev.map((img, i) => ({
        ...img,
        startTime: i * segDur,
        endTime: (i + 1) * segDur,
      }));
    });
  }, [durationInSeconds]);

  const handleImageTimingChange = useCallback(
    (index: number, field: "startTime" | "endTime", value: number) => {
      setImages((prev) =>
        prev.map((img, i) => (i === index ? { ...img, [field]: value } : img))
      );
    },
    []
  );

  const handleImageAnimationChange = useCallback(
    (index: number, animation: ImageAnimation) => {
      setImages((prev) =>
        prev.map((img, i) => (i === index ? { ...img, animation } : img))
      );
    },
    []
  );

  // Move a clip to another track (z-order layer). Tracks are derived from the
  // data, so dropping the last clip off a track makes that track disappear.
  // Overlay tracks get a default picture-in-picture box so the clip is visible
  // on top of the base (it can then be repositioned in the preview); track 0
  // returns the clip to full-frame.
  const handleImageTrackChange = useCallback(
    (index: number, track: number) => {
      setImages((prev) =>
        prev.map((img, i) => {
          if (i !== index) return img;
          if (track <= 0) {
            const next = { ...img };
            delete next.transform;
            next.track = undefined;
            return next;
          }
          return {
            ...img,
            track,
            transform: img.transform ?? { x: 0.55, y: 0.06, width: 0.4, height: 0.24 },
          };
        })
      );
    },
    []
  );

  const handleImageTimingBatchChange = useCallback(
    (index: number, startTime: number, endTime: number) => {
      setImages((prev) =>
        prev.map((img, i) =>
          i === index ? { ...img, startTime, endTime } : img
        )
      );
    },
    []
  );

  const handleSelectImage = useCallback((index: number) => {
    setSelectedImageIndex(index);
  }, []);

  const handleToggleTimeline = useCallback(() => {
    setTimelineExpanded((prev) => !prev);
  }, []);

  const handleAvatarSelect = useCallback((p: string | null) => {
    setAvatarPath(p);
    setAvatarSrc(p);
  }, []);

  const handleGenerateAudio = useCallback(async (text: string) => {
    if (!avatarPath) {
      showToast("Select an avatar first", "error");
      return;
    }
    // Extract avatar name from path like "/avatars/claire.png"
    const filename = avatarPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
    const voiceId = AVATAR_VOICE_MAP[filename];
    if (!voiceId) {
      showToast(`No voice mapped for avatar "${filename}"`, "error");
      return;
    }

    setIsGeneratingAudio(true);
    setGeneratingStartedAt(Date.now());
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId, projectId: currentProjectId, voiceSettings: voiceDelivery.settings, useV3: voiceDelivery.useV3 === true, deliveryPreset: voiceDelivery.preset }),
      });

      if (!res.ok) {
        let msg = "Audio generation failed";
        try {
          const errData = await res.json();
          msg = errData.error || msg;
        } catch {}
        throw new Error(msg);
      }

      const blob = await res.blob();
      const avatarName = filename.charAt(0).toUpperCase() + filename.slice(1);
      const file = new File([blob], `${avatarName}-tts.mp3`, { type: "audio/mpeg" });
      const src = URL.createObjectURL(file);
      const takeId = crypto.randomUUID();
      const isFirstTake = audioTakes.length === 0 && !activeTakeId;
      setAudioTakes((prev) => {
        const sameNameCount = prev.filter((t) => t.avatarName === avatarName).length;
        const label = sameNameCount === 0 ? avatarName : `${avatarName} ${sameNameCount + 1}`;
        return [...prev, { id: takeId, src, file, label, avatarName, scriptUsed: text, transcript: [], createdAt: Date.now() }];
      });
      // Persist the take file outside state updater
      if (currentProjectId) {
        saveProjectFile(currentProjectId, `take_${takeId}`, file);
        syncFileToServer(currentProjectId, `take_${takeId}`, file);
      }

      // Auto-lock first take as active
      if (isFirstTake) {
        handleAudioUpload(file);
        setActiveVoiceName(avatarName);
        setActiveTakeId(takeId);
      }

      showToast(`${avatarName} voice generated — transcribing...`, "success");

      // Auto-transcribe the generated audio
      setIsTranscribing(true);
      try {
        const formData = new FormData();
        formData.append("audio", file);
        if (currentProjectId) formData.append("projectId", currentProjectId);
        const transcribeRes = await fetch("/api/transcribe", { method: "POST", body: formData });
        const transcribeText = await transcribeRes.text();
        if (transcribeRes.ok) {
          const { words } = JSON.parse(transcribeText);
          const cleaned = postProcessTranscript(words);
          // Attach transcript to the take
          setAudioTakes((prev) => prev.map((t) => t.id === takeId ? { ...t, transcript: cleaned } : t));
          // If this is the active take, also update the project transcript
          if (isFirstTake) {
            setTranscript(cleaned);
          }
          showToast(`${avatarName} — ${cleaned.length} words transcribed`, "success");
        }
      } catch {
        // Non-fatal: take exists without transcript
      } finally {
        setIsTranscribing(false);
      }
    } catch (err) {
      showToast(
        `TTS failed: ${err instanceof Error ? err.message : String(err)}`,
        "error"
      );
    } finally {
      setIsGeneratingAudio(false);
      setGeneratingStartedAt(null);
    }
  }, [avatarPath, currentProjectId, showToast, audioTakes.length, activeTakeId, handleAudioUpload, voiceDelivery]);

  const handleSaveTake = useCallback((id: string) => {
    const take = audioTakes.find((t) => t.id === id);
    if (take) {
      handleAudioUpload(take.file);
      setActiveVoiceName(take.avatarName);
      setActiveTakeId(id);
      if (take.transcript?.length > 0) {
        setTranscript(take.transcript);
      }
      showToast(`Locked in: ${take.label}`, "success");
    }
  }, [audioTakes, handleAudioUpload, showToast]);

  const handleDeleteTake = useCallback((id: string) => {
    const prevTakes = [...audioTakes];
    const take = prevTakes.find((t) => t.id === id);
    if (!take) return;

    // Remove immediately (don't revoke URL yet — needed for undo)
    setAudioTakes((prev) => prev.filter((t) => t.id !== id));

    // If this was the active take, clear it
    if (activeTakeId === id) {
      setActiveTakeId(null);
    }

    showToast(`Deleted "${take.label}"`, "success", {
      label: "Undo",
      onClick: () => {
        setAudioTakes(prevTakes);
        if (activeTakeId === id) setActiveTakeId(id);
        // Re-persist the file
        if (currentProjectId) {
          saveProjectFile(currentProjectId, `take_${id}`, take.file);
          syncFileToServer(currentProjectId, `take_${id}`, take.file);
        }
        setToast(null);
      },
    });

    // Defer actual file deletion — if undo fires, the closure above re-saves
    setTimeout(() => {
      // Check if take was restored by undo
      setAudioTakes((current) => {
        if (!current.find((t) => t.id === id)) {
          // Not restored — commit deletion
          URL.revokeObjectURL(take.src);
          if (currentProjectId) {
            deleteProjectFile(currentProjectId, `take_${id}`);
            deleteFileOnServer(currentProjectId, `take_${id}`);
          }
        }
        return current;
      });
    }, 5500); // after toast timeout (5s) + buffer
  }, [audioTakes, activeTakeId, currentProjectId, showToast]);

  const handleTranscriptChange = useCallback((words: TranscriptWord[]) => {
    setTranscript(words);
  }, []);

  const handleTranscribe = useCallback(async () => {
    if (!audioFile) {
      showToast("Upload audio first", "error");
      return;
    }
    setIsTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioFile);
      if (currentProjectId) formData.append("projectId", currentProjectId);
      const res = await fetch("/api/transcribe", { method: "POST", body: formData });
      const text = await res.text();
      if (!res.ok) {
        let msg = "Transcription failed";
        try { msg = JSON.parse(text).error || msg; } catch {}
        throw new Error(msg);
      }
      const { words } = JSON.parse(text);
      const cleaned = postProcessTranscript(words);
      setTranscript(cleaned);
      showToast(`Transcribed ${cleaned.length} words`, "success");
    } catch (err) {
      showToast(`Transcription failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setIsTranscribing(false);
    }
  }, [audioFile, showToast, currentProjectId]);

  const handleStyleChange = useCallback((newStyle: Partial<VideoStyle>) => {
    setStyle((prev) => ({ ...prev, ...newStyle }));
  }, []);

  const handleIntroUpload = useCallback(
    (file: File) => {
      setIntroFile(file);
      persistFile("intro", file);
      setIntro({
        src: URL.createObjectURL(file),
        startTime: 0,
        duration: 3,
        fadeDuration: 0.5,
      });
    },
    [persistFile]
  );

  const handleIntroChange = useCallback(
    (updates: Partial<IntroOutroSegment>) => {
      setIntro((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    []
  );

  const handleIntroRemove = useCallback(() => {
    setIntro(null);
    setIntroFile(null);
    persistFile("intro", null);
  }, [persistFile]);

  const handleOutroUpload = useCallback(
    (file: File) => {
      setOutroFile(file);
      persistFile("outro", file);
      setOutro({
        src: URL.createObjectURL(file),
        startTime: Math.max(0, durationInSeconds - 3),
        duration: 3,
        fadeDuration: 0.5,
      });
    },
    [durationInSeconds, persistFile]
  );

  const handleOutroChange = useCallback(
    (updates: Partial<IntroOutroSegment>) => {
      setOutro((prev) => (prev ? { ...prev, ...updates } : prev));
    },
    []
  );

  const handleOutroRemove = useCallback(() => {
    setOutro(null);
    setOutroFile(null);
    persistFile("outro", null);
  }, [persistFile]);

  const handleIntroAnimationChange = useCallback(
    (updates: Partial<IntroAnimationConfig>) => {
      setIntroAnimation((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const handleOutroCardChange = useCallback(
    (updates: Partial<OutroCardConfig>) => {
      setOutroCard((prev) => ({ ...prev, ...updates }));
    },
    []
  );

  const handleOutroCardCustomChange = useCallback(
    (updates: Partial<OutroCardContent>) => {
      setOutroCard((prev) => ({
        ...prev,
        custom: { ...prev.custom, ...updates },
      }));
    },
    []
  );

  const handleOutroLogoUpload = useCallback(
    (file: File) => {
      setOutroLogoFile(file);
      persistFile("outroCardLogo", file);
      const url = URL.createObjectURL(file);
      setOutroCard((prev) => ({
        ...prev,
        custom: { ...prev.custom, logoSrc: url },
      }));
    },
    [persistFile]
  );

  const handleOutroBadgeUpload = useCallback(
    (file: File) => {
      setOutroBadgeFile(file);
      persistFile("outroCardBadge", file);
      const url = URL.createObjectURL(file);
      setOutroCard((prev) => ({
        ...prev,
        custom: { ...prev.custom, badgeSrc: url },
      }));
    },
    [persistFile]
  );

  // ── Scene analysis handlers ──

  // Expand raw beats into a paced shot list: long beats split into sub-shots so
  // visuals change at a watchable rhythm instead of one image held for 18s.
  const paceBeats = useCallback(
    (beats: SceneSuggestion[], pace: PaceName): SceneSuggestion[] => {
      const parts = paceSuggestions(beats, transcript, durationInSeconds, PACE_PRESETS[pace]);
      return parts.map((p) => ({
        ...p.source,
        id: p.partCount > 1 ? `${p.source.id}::${p.part}` : p.source.id,
        scriptSegment: p.scriptSegment,
        wordRange: p.wordRange,
        part: p.part,
        partCount: p.partCount,
      }));
    },
    [transcript, durationInSeconds]
  );

  const runAnalysis = useCallback(async () => {
    if (!scriptText.trim() || isAnalyzingScript) return;
    setIsAnalyzingScript(true);
    setSceneSuggestions([]);
    try {
      const res = await fetch("/api/analyze-script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scriptText, provider: analysisProvider, projectId: currentProjectId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Analysis failed" }));
        throw new Error(err.error || "Analysis failed");
      }
      const data = await res.json();
      const beats: SceneSuggestion[] = data.scenes ?? [];
      rawSuggestionsRef.current = beats;
      setSceneSuggestions(paceBeats(beats, visualPace));
      setShotListStale(false);
      if (data.available) setAvailableProviders(data.available);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Script analysis failed", "error");
    } finally {
      setIsAnalyzingScript(false);
    }
  }, [scriptText, isAnalyzingScript, showToast, analysisProvider, visualPace, paceBeats, currentProjectId]);

  // Re-pace instantly when the pace control changes — re-split the stored raw
  // beats; fall back to a fresh analysis if none are cached (e.g. after reload).
  const handleVisualPaceChange = useCallback(
    (pace: PaceName) => {
      setVisualPace(pace);
      // Re-pace from the original beats if cached; otherwise re-pace the current
      // shot list (after a reload). Re-pacing only splits over-long beats — going
      // to a coarser pace can't merge already-split shots without the raw beats.
      const source = rawSuggestionsRef.current.length > 0 ? rawSuggestionsRef.current : sceneSuggestions;
      if (source.length > 0) {
        setSceneSuggestions(paceBeats(source, pace));
      }
    },
    [paceBeats, sceneSuggestions]
  );

  const handleAnalyzeScript = useCallback(async () => {
    // If timeline already has images with actual sources, confirm via dialog
    const hasAssignedImages = images.some((img) => img.src);
    if (hasAssignedImages) {
      setShowReanalyzeConfirm(true);
      return;
    }
    // No images assigned yet — safe to re-analyze, clear placeholders
    setImages([]);
    setImageFiles([]);
    runAnalysis();
  }, [images, runAnalysis]);

  // Other triage projects whose auto-setup hasn't run yet (saved flag intact).
  const findPendingTriageProjects = useCallback((): ProjectMeta[] => {
    return listProjects().filter((p) => {
      if (p.id === currentProjectId) return false;
      return loadProjectState(p.id)?.autoPipeline === true;
    });
  }, [currentProjectId]);

  // ── Auto-setup chain (triage projects) ──────────────────────────────
  // Driven by completion signals, not an await-chain, since each step sets
  // state the next one reads. Each effect advances the stage exactly once.
  useEffect(() => {
    if (autoPipeline !== "start") return;
    if (!scriptText.trim() || !avatarPath) {
      setAutoPipeline(null); // missing script/avatar — nothing to run
      return;
    }
    // Generate exactly once per project. If this effect re-runs (Strict Mode)
    // for a project already kicked off, just advance the stage without a 2nd TTS.
    if (currentProjectId && startedPipelines.has(currentProjectId)) {
      setAutoPipeline("audio");
      return;
    }
    if (currentProjectId) startedPipelines.add(currentProjectId);
    setAutoPipeline("audio");
    handleGenerateAudio(scriptText);
  }, [autoPipeline, scriptText, avatarPath, currentProjectId, handleGenerateAudio]);

  useEffect(() => {
    // handleGenerateAudio does TTS *and* auto-transcribes the take, so once both
    // have settled and the transcript has landed, go straight to the shot list —
    // no separate transcribe call needed.
    if (autoPipeline === "audio" && !isGeneratingAudio && !isTranscribing && transcript.length > 0) {
      setAutoPipeline("scenes");
      runAnalysis();
    }
  }, [autoPipeline, isGeneratingAudio, isTranscribing, transcript, runAnalysis]);

  useEffect(() => {
    if (autoPipeline === "scenes" && !isAnalyzingScript && sceneSuggestions.length > 0) {
      setAutoPipeline("done");
      setTimelineExpanded(true); // land the user on the timeline
      setPendingProjects(findPendingTriageProjects()); // surface the next one
    }
  }, [autoPipeline, isAnalyzingScript, sceneSuggestions, findPendingTriageProjects]);

  // ── Thumbnail generator modal ──
  const [showThumbnailModal, setShowThumbnailModal] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);
  const [showUsageModal, setShowUsageModal] = useState(false);
  const [showChartModal, setShowChartModal] = useState(false);
  const [showPronunciationModal, setShowPronunciationModal] = useState(false);

  // Add an animated chart as a timeline segment — replaces the selected slot if
  // one is selected, otherwise appends a new ~5s segment to fill on the timeline.
  const handleAddChart = useCallback((chart: ChartSpec, targetIndex: number | null) => {
    const placeholder = (i: number) => new File([], `chart-${i}.png`, { type: "image/png" });
    if (targetIndex != null && targetIndex < images.length) {
      const idx = targetIndex;
      setImages((prev) => prev.map((img, i) => {
        if (i !== idx) return img;
        if (img.src) URL.revokeObjectURL(img.src);
        return { ...img, src: "", animation: "static", chart };
      }));
      setImageFiles((prev) => {
        const next = [...prev];
        next[idx] = placeholder(idx);
        persistFile(`image_${idx}`, next[idx]);
        return next;
      });
    } else {
      const segDur = 5;
      const lastEnd = images.length > 0 ? Math.max(...images.map((i) => i.endTime)) : 0;
      const start = Math.min(lastEnd, Math.max(0, durationInSeconds - segDur));
      setImages((prev) => [...prev, { src: "", startTime: start, endTime: start + segDur, animation: "static", chart }]);
      setImageFiles((prev) => {
        const next = [...prev, placeholder(prev.length)];
        persistFile(`image_${next.length - 1}`, next[next.length - 1]);
        return next;
      });
    }
  }, [images, durationInSeconds, persistFile]);

  // ── Per-scene prompt refinement (one new variation per click, optionally steered) ──
  const [refiningPromptId, setRefiningPromptId] = useState<string | null>(null);

  const handleRefinePrompt = useCallback(async (id: string, guidance?: string) => {
    const suggestion = sceneSuggestions.find((s) => s.id === id);
    if (!suggestion || refiningPromptId) return;
    setRefiningPromptId(id);
    try {
      const res = await fetch("/api/refine-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imagePrompt: suggestion.imagePrompt,
          scriptSegment: suggestion.scriptSegment,
          description: suggestion.description,
          category: suggestion.category,
          guidance,
          provider: analysisProvider,
          projectId: currentProjectId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Refine failed" }));
        throw new Error(err.error || "Refine failed");
      }
      const data = await res.json();
      if (data.imagePrompt) {
        setSceneSuggestions((prev) =>
          prev.map((s) => (s.id === id ? { ...s, imagePrompt: data.imagePrompt } : s))
        );
      }
    } catch (err) {
      showToast(`Prompt refine failed: ${err instanceof Error ? err.message : err}`, "error");
    } finally {
      setRefiningPromptId(null);
    }
  }, [sceneSuggestions, refiningPromptId, showToast, analysisProvider, currentProjectId]);

  const handleConfirmReanalyze = useCallback(() => {
    setShowReanalyzeConfirm(false);
    images.forEach((img) => { if (img.src) URL.revokeObjectURL(img.src); });
    setImages([]);
    setImageFiles([]);
    runAnalysis();
  }, [images, runAnalysis]);

  // Delete a whole block: remove the shot card AND its matching timeline slot.
  const handleDeleteSuggestion = useCallback((id: string) => {
    const idx = sceneSuggestions.findIndex((s) => s.id === id);
    if (idx === -1) return;
    // Same block-removal as the image-slot × — keeps shot list and timeline aligned.
    handleRemoveImage(idx);
  }, [sceneSuggestions, handleRemoveImage]);

  // Scene timings are computed for the WHOLE shot list at once (sequential
  // transcript matching — see src/lib/scene-timing.ts) so repeated phrases
  // can't anchor a scene to the wrong occurrence.
  const getAllSuggestionTimings = useCallback(
    () => computeSceneTimings(sceneSuggestions, transcript, scriptText, durationInSeconds),
    [sceneSuggestions, transcript, scriptText, durationInSeconds]
  );

  const handleApplySuggestion = useCallback(
    (suggestion: SceneSuggestion) => {
      const idx = sceneSuggestions.findIndex((s) => s.id === suggestion.id);
      const timings = getAllSuggestionTimings();
      const { startTime, endTime } = timings[idx] ?? { startTime: 0, endTime: durationInSeconds };

      const newSegment: ImageSegment = {
        src: "",  // Placeholder — user uploads actual image
        startTime,
        endTime,
        animation: suggestion.suggestedAnimation,
      };

      setImages((prev) => [...prev, newSegment]);
      // Add a placeholder file entry so indices stay aligned
      setImageFiles((prev) => [...prev, new File([], `placeholder-${suggestion.id}.png`, { type: "image/png" })]);
    },
    [sceneSuggestions, getAllSuggestionTimings, durationInSeconds]
  );

  // Load a library image directly into a shot's timeline slot, creating the
  // slot (and any earlier ones) if the timeline isn't built yet.
  const handlePickFromLibrary = useCallback(
    async (suggestion: SceneSuggestion, image: LibraryImage) => {
      const idx = sceneSuggestions.findIndex((s) => s.id === suggestion.id);
      if (idx === -1) return;
      const file = await fetchLibraryImageAsFile(image);
      if (!file) {
        showToast("Couldn't load that library image", "error");
        return;
      }
      const timings = getAllSuggestionTimings();
      const url = URL.createObjectURL(file);

      setImages((prev) => {
        const next = [...prev];
        for (let i = next.length; i <= idx; i++) {
          const t = timings[i] ?? { startTime: 0, endTime: durationInSeconds };
          next[i] = { src: "", startTime: t.startTime, endTime: t.endTime, animation: sceneSuggestions[i].suggestedAnimation };
        }
        if (next[idx].src) URL.revokeObjectURL(next[idx].src);
        next[idx] = { ...next[idx], src: url };
        return next;
      });
      setImageFiles((prev) => {
        const next = [...prev];
        for (let i = next.length; i <= idx; i++) {
          next[i] = new File([], `placeholder-${sceneSuggestions[i].id}.png`, { type: "image/png" });
        }
        next[idx] = file;
        next.forEach((f, i) => persistFile(`image_${i}`, f));
        return next;
      });

      // Record this project's use of the image (dedupes server-side)
      addImageToLibrary(file, { description: suggestion.description, category: suggestion.category, projectId: currentProjectId });
      showToast("Loaded from library", "success");
    },
    [sceneSuggestions, getAllSuggestionTimings, durationInSeconds, persistFile, currentProjectId, showToast]
  );

  const handleApplyAllSuggestions = useCallback(() => {
    // Re-pace first: re-split any over-long beats at the current pace using the
    // live transcript/duration. Prefer the original beats (rawSuggestionsRef);
    // fall back to the current shot list (e.g. after a reload) — long cards
    // still split, already-short ones pass through.
    const source = rawSuggestionsRef.current.length > 0 ? rawSuggestionsRef.current : sceneSuggestions;
    const paced = paceBeats(source, visualPace);
    setSceneSuggestions(paced);
    rawSuggestionsRef.current = source;

    const timings = computeSceneTimings(paced, transcript, scriptText, durationInSeconds);

    // Build the new slot list, then carry each already-assigned image onto the
    // new slot that covers its old time span (so a freshly-split beat keeps its
    // image on the first piece and exposes empty slots for the rest).
    const newImages: ImageSegment[] = paced.map((s, i) => ({
      src: "",
      startTime: timings[i].startTime,
      endTime: timings[i].endTime,
      animation: s.suggestedAnimation,
    }));
    const newFiles: File[] = paced.map((s) => new File([], `placeholder-${s.id}.png`, { type: "image/png" }));

    const used = new Set<number>();
    images.forEach((oldImg, oi) => {
      if (!oldImg.src) return; // skip empty placeholders
      // Anchor on the image's start so a split beat keeps its image on the
      // first new piece and leaves the rest empty to fill.
      const anchor = oldImg.startTime + 0.001;
      let target = newImages.findIndex(
        (ns, ni) => !used.has(ni) && anchor >= ns.startTime && anchor < ns.endTime
      );
      if (target === -1) {
        // anchor outside all slots — attach to the nearest free slot
        target = newImages.findIndex((_, ni) => !used.has(ni));
      }
      if (target !== -1) {
        used.add(target);
        newImages[target] = { ...newImages[target], src: oldImg.src, animation: oldImg.animation };
        newFiles[target] = imageFiles[oi];
      }
    });

    setImages(newImages);
    setImageFiles(newFiles);
    newFiles.forEach((f, i) => persistFile(`image_${i}`, f));
    // Drop any persisted files beyond the new length
    if (currentProjectId) {
      for (let i = newFiles.length; i < imageFiles.length; i++) {
        deleteProjectFile(currentProjectId, `image_${i}`);
      }
    }

    const filled = newImages.filter((img) => img.src).length;
    showToast(
      images.length === 0
        ? `${newImages.length} slots added — drop your images into them below`
        : `Re-synced to ${newImages.length} slots${filled < newImages.length ? ` — ${newImages.length - filled} new empty slot${newImages.length - filled === 1 ? "" : "s"} to fill` : ""}`,
      "success"
    );
  }, [images, imageFiles, sceneSuggestions, visualPace, paceBeats, transcript, scriptText, durationInSeconds, persistFile, currentProjectId, showToast]);

  // ── Example project (lets a new user see a working composition in one click) ──

  const makeGradientImage = (from: string, to: string, name: string): Promise<File> => {
    return new Promise((resolve, reject) => {
      const canvas = document.createElement("canvas");
      canvas.width = 720;
      canvas.height = 1280;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("Canvas unavailable")); return; }
      const grad = ctx.createLinearGradient(0, 0, 720, 1280);
      grad.addColorStop(0, from);
      grad.addColorStop(1, to);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 720, 1280);
      // Soft glow circles for visual depth
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.arc(180, 320, 220, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(560, 920, 280, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      canvas.toBlob((blob) => {
        if (blob) resolve(new File([blob], name, { type: "image/png" }));
        else reject(new Error("Canvas export failed"));
      }, "image/png");
    });
  };

  const handleLoadExample = useCallback(async () => {
    try {
      const res = await fetch("/sample-transcript.json");
      if (!res.ok) throw new Error("Sample transcript not found");
      const words: TranscriptWord[] = await res.json();

      const files = await Promise.all([
        makeGradientImage("#1e3a8a", "#7c3aed", "example-1.png"),
        makeGradientImage("#0f766e", "#1e40af", "example-2.png"),
        makeGradientImage("#7c2d12", "#a21caf", "example-3.png"),
      ]);

      const dur = Math.ceil((words[words.length - 1]?.end ?? 9) + 1);
      const segDur = dur / files.length;
      const animations: ImageAnimation[] = ["kenBurns", "panLeft", "zoomIn"];

      if (availableAvatars.length > 0) {
        setAvatarPath(availableAvatars[0]);
        setAvatarSrc(availableAvatars[0]);
      }
      setTranscript(words);
      setScriptText(words.map((w) => w.word).join(" "));
      setDurationInSeconds(dur);
      setImageFiles(files);
      setImages(files.map((f, i) => ({
        src: URL.createObjectURL(f),
        startTime: i * segDur,
        endTime: (i + 1) * segDur,
        animation: animations[i % animations.length],
      })));
      showToast("Example loaded — press play to see captions and visuals in action", "success");
    } catch (err) {
      showToast(`Could not load example: ${err instanceof Error ? err.message : err}`, "error");
    }
  }, [availableAvatars, showToast]);

  const videoProps = useMemo(() => ({
    audioSrc,
    audioDelay,
    musicSrc,
    musicVolume,
    transcript,
    images,
    avatarSrc,
    intro,
    outro,
    introAnimation,
    outroCard,
    style,
    durationInSeconds,
  }), [audioSrc, audioDelay, musicSrc, musicVolume, transcript, images, avatarSrc, intro, outro, introAnimation, outroCard, style, durationInSeconds]);

  if (!loaded) {
    return (
      <div className="flex h-screen bg-zinc-950 text-white items-center justify-center">
        <p className="text-zinc-400">Restoring session...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-zinc-950 text-white">
      <aside aria-label="Editor controls" className="w-[420px] flex-shrink-0 border-r border-zinc-800 overflow-y-auto">
        <InputPanel
          onAudioUpload={handleAudioUpload}
          onImagesUpload={handleImagesUpload}
          onRemoveImage={handleRemoveImage}
          onReplaceImage={handleReplaceImage}
          onReorderImages={handleReorderImages}
          onRedistributeImages={handleRedistributeImages}
          onImageTimingChange={handleImageTimingChange}
          onImageAnimationChange={handleImageAnimationChange}
          onAvatarSelect={handleAvatarSelect}
          avatarPath={avatarPath}
          availableAvatars={availableAvatars}
          onGenerateAudio={handleGenerateAudio}
          topicMeta={topicMeta}
          onTopicMetaChange={setTopicMeta}
          voiceDelivery={voiceDelivery}
          onVoiceDeliveryChange={setVoiceDelivery}
          ttsAvailable={ttsAvailable}
          isGeneratingAudio={isGeneratingAudio}
          generatingStartedAt={generatingStartedAt}
          audioTakes={audioTakes}
          activeTakeId={activeTakeId}
          onSaveTake={handleSaveTake}
          onDeleteTake={handleDeleteTake}
          scriptText={scriptText}
          onScriptTextChange={setScriptText}
          onTranscriptChange={handleTranscriptChange}
          onTranscribe={handleTranscribe}
          isTranscribing={isTranscribing}
          transcript={transcript}
          onStyleChange={handleStyleChange}
          audioDelay={audioDelay}
          onAudioDelayChange={setAudioDelay}
          musicFile={musicFile}
          musicVolume={musicVolume}
          onMusicUpload={handleMusicUpload}
          onMusicRemove={handleMusicRemove}
          onMusicVolumeChange={setMusicVolume}
          intro={intro}
          introFile={introFile}
          onIntroUpload={handleIntroUpload}
          onIntroChange={handleIntroChange}
          onIntroRemove={handleIntroRemove}
          outro={outro}
          outroFile={outroFile}
          onOutroUpload={handleOutroUpload}
          onOutroChange={handleOutroChange}
          onOutroRemove={handleOutroRemove}
          introAnimation={introAnimation}
          onIntroAnimationChange={handleIntroAnimationChange}
          outroCard={outroCard}
          onOutroCardChange={handleOutroCardChange}
          onOutroCardCustomChange={handleOutroCardCustomChange}
          onOutroLogoUpload={handleOutroLogoUpload}
          onOutroBadgeUpload={handleOutroBadgeUpload}
          outroLogoFile={outroLogoFile}
          outroBadgeFile={outroBadgeFile}
          style={style}
          images={images}
          durationInSeconds={durationInSeconds}
          audioFile={audioFile}
          imageFiles={imageFiles}
          showToast={showToast}
          onNewProject={handleNewProject}
          onManualSave={handleManualSave}
          lastSavedAt={lastSavedAt}
          projectName={currentProjectName}
          projects={projects}
          currentProjectId={currentProjectId}
          onSwitchProject={handleSwitchProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          selectedImageIndex={selectedImageIndex}
          onSelectImage={handleSelectImage}
          openSections={openSections}
          onToggleSection={toggleSection}
          sceneSuggestions={sceneSuggestions}
          shotListStale={shotListStale}
          isAnalyzingScript={isAnalyzingScript}
          onAnalyzeScript={handleAnalyzeScript}
          onApplySuggestion={handleApplySuggestion}
          onApplyAllSuggestions={handleApplyAllSuggestions}
          onDeleteSuggestion={handleDeleteSuggestion}
          onPickFromLibrary={handlePickFromLibrary}
          onRefinePrompt={handleRefinePrompt}
          refiningPromptId={refiningPromptId}
          analysisProvider={analysisProvider}
          availableProviders={availableProviders}
          onAnalysisProviderChange={setAnalysisProvider}
          visualPace={visualPace}
          onVisualPaceChange={handleVisualPaceChange}
        />
      </aside>
      <main aria-label="Video preview" className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar: avatar/voice info + export */}
        <div className="flex items-center gap-3 px-4 py-2 border-b border-zinc-800 flex-shrink-0">
          {/* Status cluster — muted, not actionable (keeps only the mismatch warning loud) */}
          <div className="flex items-center gap-2 text-mini text-zinc-500 min-w-0">
            {avatarPath && (() => {
              const name = avatarPath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
              const display = name.charAt(0).toUpperCase() + name.slice(1);
              return (
                <span className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full overflow-hidden border border-zinc-700 flex-shrink-0">
                    <img src={avatarPath} alt="" className="w-full h-full object-cover" />
                  </span>
                  <span className="text-zinc-400">{display}</span>
                </span>
              );
            })()}
            {activeVoiceName && (() => {
              const avatarName = avatarPath?.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
              const currentAvatar = avatarName.charAt(0).toUpperCase() + avatarName.slice(1);
              const mismatch = avatarPath && activeVoiceName !== currentAvatar;
              return (
                <span className="flex items-center gap-1.5">
                  <span className="text-zinc-600">·</span>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" className="text-zinc-600 flex-shrink-0">
                    <path d="M12 3a9 9 0 00-9 9v4a3 3 0 003 3h1a1 1 0 001-1v-5a1 1 0 00-1-1H6a7 7 0 0114 0h-1a1 1 0 00-1 1v5a1 1 0 001 1h1a3 3 0 003-3v-4a9 9 0 00-9-9z" fill="currentColor"/>
                  </svg>
                  <span className={mismatch ? "text-amber-400" : "text-zinc-400"}>{activeVoiceName}</span>
                  {mismatch && <span className="text-micro text-amber-500/80" title="Voice doesn't match the selected avatar">mismatch</span>}
                </span>
              );
            })()}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {/* Today's Topics — the triage intake page */}
            <Link
              href="/triage"
              title="Today's Topics — paste the daily digest and spin up projects"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>
              Topics
            </Link>
            {/* Chart — add an animated stock chart to the timeline */}
            <button
              onClick={() => setShowChartModal(true)}
              title="Add an animated stock chart"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
              Chart
            </button>
            {/* Library — icon only */}
            <button
              onClick={() => setShowLibraryModal(true)}
              title="Image library"
              aria-label="Image library"
              className="px-2 py-1.5 text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="7" height="7" rx="1" />
                <rect x="14" y="3" width="7" height="7" rx="1" />
                <rect x="3" y="14" width="7" height="7" rx="1" />
                <rect x="14" y="14" width="7" height="7" rx="1" />
              </svg>
            </button>
            {/* Settings — rare config + info */}
            <ToolbarMenu
              title="Settings"
              icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>}
              items={[
                {
                  label: "Pronunciation",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" /><path d="M7 12h2l1.5 4 3-8L16 12h1" /></svg>,
                  onClick: () => setShowPronunciationModal(true),
                },
                {
                  label: "API usage",
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg>,
                  onClick: () => setShowUsageModal(true),
                },
              ]}
            />
            <div className="w-px h-5 bg-zinc-800 mx-1" />
            {/* Output lane */}
            <button
              onClick={() => setShowThumbnailModal(true)}
              title="Create a cover thumbnail from a project image"
              className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 border border-zinc-700 rounded-lg transition-colors inline-flex items-center gap-1.5"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              Thumbnail
            </button>
            <RenderButton
              videoProps={videoProps}
              audioFile={audioFile}
              musicFile={musicFile}
              imageFiles={imageFiles}
              introFile={introFile}
              outroFile={outroFile}
              outroLogoFile={outroLogoFile}
              outroBadgeFile={outroBadgeFile}
              showToast={showToast}
              projectName={currentProjectName}
            />
          </div>
        </div>
        <div className="flex-1 flex items-center justify-center min-h-0 overflow-y-auto">
        <ErrorBoundary>
        <Suspense fallback={<div className="text-zinc-500 text-sm">Loading player...</div>}>
        <PlayerPanel
          videoProps={videoProps}
          audioFile={audioFile}
          imageFiles={imageFiles}
          showToast={showToast}
          hasContent={hasContent}
          playerRef={playerRef}
          onOpenSection={openSection}
          onLoadExample={handleLoadExample}
        />
        </Suspense>
        </ErrorBoundary>
        </div>
        <Timeline
          playerRef={playerRef}
          audioFile={audioFile}
          images={images}
          durationInSeconds={durationInSeconds}
          selectedImageIndex={selectedImageIndex}
          onSelectImage={handleSelectImage}
          onImageTimingChange={handleImageTimingBatchChange}
          onImageTrackChange={handleImageTrackChange}
          intro={intro}
          outro={outro}
          expanded={timelineExpanded}
          onToggleExpanded={handleToggleTimeline}
        />
      </main>

      {/* Pronunciation dictionary */}
      <PronunciationModal
        open={showPronunciationModal}
        onClose={() => setShowPronunciationModal(false)}
        showToast={showToast}
      />

      {/* Stock chart maker */}
      <ChartModal
        open={showChartModal}
        onClose={() => setShowChartModal(false)}
        onAddChart={handleAddChart}
        slotCount={images.length}
        selectedIndex={selectedImageIndex}
        showToast={showToast}
      />

      {/* API usage */}
      <UsageModal open={showUsageModal} onClose={() => setShowUsageModal(false)} />

      {/* Image library browser */}
      <LibraryModal
        open={showLibraryModal}
        onClose={() => setShowLibraryModal(false)}
        showToast={showToast}
      />

      {/* Thumbnail generator */}
      <ThumbnailModal
        open={showThumbnailModal}
        onClose={() => setShowThumbnailModal(false)}
        images={images}
        projectName={currentProjectName}
        showToast={showToast}
        copy={thumbnailCopy}
        onCopyChange={setThumbnailCopy}
        fontSize={thumbnailFontSize}
        onFontSizeChange={setThumbnailFontSize}
        imageIndex={thumbnailImageIndex}
        onImageIndexChange={setThumbnailImageIndex}
      />

      {/* Re-analyze confirmation dialog */}
      {showReanalyzeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowReanalyzeConfirm(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-96 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-zinc-200 mb-2">Re-analyze script?</h3>
            <p className="text-xs text-zinc-400 leading-relaxed mb-4">
              This resets the timeline and removes the images you&apos;ve already assigned. The new shot list will create fresh placeholder slots.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowReanalyzeConfirm(false)}
                className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmReanalyze}
                className="px-4 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 rounded-md text-white transition-colors"
              >
                Reset & Re-analyze
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-setup progress (triage-created projects) */}
      {autoPipeline && autoPipeline !== "done" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-violet-500/40 rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-3">
          <svg className="animate-spin h-4 w-4 text-violet-400" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
          <div className="text-xs text-zinc-200">
            Auto-setup:{" "}
            <span className="text-violet-300">
              {autoPipeline === "start" || autoPipeline === "audio" ? "generating voice + captions…" : "building shot list…"}
            </span>
          </div>
          <button onClick={() => setAutoPipeline(null)} className="text-micro text-zinc-500 hover:text-zinc-300" aria-label="Stop auto-setup">stop</button>
        </div>
      )}
      {autoPipeline === "done" && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-zinc-900 border border-emerald-500/40 rounded-lg shadow-xl px-4 py-2.5 flex items-center gap-3">
          <span className="text-xs text-emerald-400">✓ Setup complete</span>
          {pendingProjects.length > 0 ? (
            <button
              onClick={() => loadProject(pendingProjects[0].id)}
              className="text-xs font-medium text-white bg-gradient-to-br from-blue-600 to-violet-600 hover:from-blue-500 hover:to-violet-500 rounded-md px-2.5 py-1 transition active:scale-[0.97]"
            >
              Next: {pendingProjects[0].name} ({pendingProjects.length} left) →
            </button>
          ) : (
            <span className="text-xs text-zinc-400">all projects set up</span>
          )}
          <button onClick={() => setAutoPipeline(null)} className="text-micro text-zinc-500 hover:text-zinc-300" aria-label="Dismiss">dismiss</button>
        </div>
      )}

      {/* Toast — always-rendered live region for screen reader announcements */}
      <div role="status" aria-live="polite" aria-atomic="true" className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
        {toast && (
          <div
            className={`toast-enter px-4 py-3 rounded-lg shadow-xl text-sm font-medium flex items-center gap-3 ${
              toast.type === "error"
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {toast.message}
            {toast.action && (
              <button
                onClick={toast.action.onClick}
                className="underline underline-offset-2 font-semibold hover:opacity-80 transition-opacity"
              >
                {toast.action.label}
              </button>
            )}
            <IconButton
              onClick={() => setToast(null)}
              aria-label="Dismiss"
              className="ml-1 -mr-1 w-5 h-5 hover:bg-white/20 flex-shrink-0"
            >
              <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="2" y1="2" x2="8" y2="8" /><line x1="8" y1="2" x2="2" y2="8" /></svg>
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
};
