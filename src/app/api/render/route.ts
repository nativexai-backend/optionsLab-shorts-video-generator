import { NextRequest, NextResponse } from "next/server";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import path from "path";
import fs from "fs";
import os from "os";
import crypto from "crypto";
import { VIDEO_FPS, VIDEO_WIDTH, VIDEO_HEIGHT } from "@/remotion/types";

// ── Job store ──
// Kept on globalThis so it survives dev HMR. Renders keep running after the
// client disconnects; the file waits until the browser downloads it.

interface RenderJob {
  id: string;
  status: "bundling" | "rendering" | "done" | "error";
  progress: number; // 0..1, meaningful while rendering
  outputPath?: string;
  mediaDir?: string;
  error?: string;
  createdAt: number;
}

const globalStore = globalThis as unknown as { __vidRenderJobs?: Map<string, RenderJob> };
const jobs: Map<string, RenderJob> = (globalStore.__vidRenderJobs ??= new Map());

const JOB_TTL_MS = 2 * 60 * 60 * 1000; // 2h

function purgeStaleJobs() {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if (now - job.createdAt > JOB_TTL_MS) {
      try {
        if (job.outputPath) fs.rmSync(path.dirname(job.outputPath), { recursive: true, force: true });
        if (job.mediaDir) fs.rmSync(job.mediaDir, { recursive: true, force: true });
      } catch {}
      jobs.delete(id);
    }
  }
}

let bundleLocation: string | null = null;

async function getBundleLocation() {
  // Always rebuild in dev to pick up code changes.
  // In production, cache after first build.
  const isDev = process.env.NODE_ENV !== "production";
  if (bundleLocation && !isDev) return bundleLocation;

  const entryPoint = path.resolve(process.cwd(), "src/remotion/index.ts");
  bundleLocation = await bundle({
    entryPoint,
    webpackOverride: (config) => config,
  });
  return bundleLocation;
}

// Write a file into the bundle's public dir and return a relative URL
// that Remotion's static server will serve over HTTP.
async function writeAssetToBundle(
  bundleDir: string,
  name: string,
  blob: File
): Promise<string> {
  const ext = path.extname(blob.name) || ".bin";
  const filename = `${name}${ext}`;
  const dest = path.join(bundleDir, filename);
  fs.writeFileSync(dest, Buffer.from(await blob.arrayBuffer()));
  // Remotion serves the bundle dir as root, so just use the filename
  return filename;
}

// ── The actual render, detached from the request lifecycle ──

interface RenderInputs {
  videoProps: Record<string, unknown> & {
    audioSrc?: string | null;
    musicSrc?: string | null;
    avatarSrc?: string | null;
    intro?: { src: string } | null;
    outro?: { src: string } | null;
    outroCard?: {
      enabled?: boolean;
      usePreset?: boolean;
      custom?: { logoSrc?: string | null; badgeSrc?: string | null };
    };
    images: { src: string }[];
    durationInSeconds: number;
  };
  audioBlob: File;
  musicBlob: File | null;
  introBlob: File | null;
  outroBlob: File | null;
  outroLogoBlob: File | null;
  outroBadgeBlob: File | null;
  imageBlobs: File[];
  scale: number;
}

async function runRenderJob(job: RenderJob, inputs: RenderInputs) {
  const { videoProps, scale } = inputs;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vid-render-"));

  try {
    const bundleLoc = await getBundleLocation();

    // Unique media subdir per request to avoid concurrent render corruption
    const requestId = crypto.randomUUID();
    const mediaDir = path.join(bundleLoc, `media-${requestId}`);
    fs.mkdirSync(mediaDir, { recursive: true });
    job.mediaDir = mediaDir;
    const mediaPrefix = `media-${requestId}`;

    // Audio
    const audioUrl = await writeAssetToBundle(mediaDir, "audio", inputs.audioBlob);
    videoProps.audioSrc = `${mediaPrefix}/${audioUrl}`;

    // Music
    if (inputs.musicBlob) {
      const musicUrl = await writeAssetToBundle(mediaDir, "music", inputs.musicBlob);
      videoProps.musicSrc = `${mediaPrefix}/${musicUrl}`;
    } else {
      videoProps.musicSrc = null;
    }

    // Copy pre-bundled avatar from public/
    if (
      typeof videoProps.avatarSrc === "string" &&
      videoProps.avatarSrc.startsWith("/avatars/")
    ) {
      const publicDir = path.resolve(process.cwd(), "public");
      const avatarFile = path.join(publicDir, videoProps.avatarSrc);
      if (fs.existsSync(avatarFile)) {
        const ext = path.extname(avatarFile);
        const destName = `avatar${ext}`;
        fs.copyFileSync(avatarFile, path.join(mediaDir, destName));
        videoProps.avatarSrc = `${mediaPrefix}/${destName}`;
      } else {
        videoProps.avatarSrc = null;
      }
    }

    // Intro / outro overlays
    if (inputs.introBlob && videoProps.intro) {
      const introUrl = await writeAssetToBundle(mediaDir, "intro", inputs.introBlob);
      videoProps.intro.src = `${mediaPrefix}/${introUrl}`;
    }
    if (inputs.outroBlob && videoProps.outro) {
      const outroUrl = await writeAssetToBundle(mediaDir, "outro", inputs.outroBlob);
      videoProps.outro.src = `${mediaPrefix}/${outroUrl}`;
    }

    // Outro card assets
    if (videoProps.outroCard?.enabled) {
      const isPreset = videoProps.outroCard.usePreset;
      const publicDir = path.resolve(process.cwd(), "public");

      if (isPreset) {
        const logoFile = path.join(publicDir, "optionslab-logo.svg");
        const badgeFile = path.join(publicDir, "appstore-badge.png");
        if (fs.existsSync(logoFile)) {
          fs.copyFileSync(logoFile, path.join(mediaDir, "optionslab-logo.svg"));
          fs.copyFileSync(logoFile, path.join(bundleLoc, "optionslab-logo.svg"));
        }
        if (fs.existsSync(badgeFile)) {
          fs.copyFileSync(badgeFile, path.join(mediaDir, "appstore-badge.png"));
          fs.copyFileSync(badgeFile, path.join(bundleLoc, "appstore-badge.png"));
        }
      } else {
        if (inputs.outroLogoBlob && videoProps.outroCard.custom) {
          const logoUrl = await writeAssetToBundle(mediaDir, "outroCardLogo", inputs.outroLogoBlob);
          videoProps.outroCard.custom.logoSrc = `${mediaPrefix}/${logoUrl}`;
        }
        if (inputs.outroBadgeBlob && videoProps.outroCard.custom) {
          const badgeUrl = await writeAssetToBundle(mediaDir, "outroCardBadge", inputs.outroBadgeBlob);
          videoProps.outroCard.custom.badgeSrc = `${mediaPrefix}/${badgeUrl}`;
        }
      }
    }

    // Images
    for (let i = 0; i < inputs.imageBlobs.length; i++) {
      const imgUrl = await writeAssetToBundle(mediaDir, `image_${i}`, inputs.imageBlobs[i]);
      if (videoProps.images[i]) {
        videoProps.images[i].src = `${mediaPrefix}/${imgUrl}`;
      }
    }

    // Render
    const durationInFrames = Math.max(
      1,
      Math.round(videoProps.durationInSeconds * VIDEO_FPS)
    );

    const composition = await selectComposition({
      serveUrl: bundleLoc,
      id: "ShortVideo",
      inputProps: videoProps,
    });

    composition.durationInFrames = durationInFrames;
    composition.fps = VIDEO_FPS;
    composition.width = VIDEO_WIDTH;
    composition.height = VIDEO_HEIGHT;

    const outputPath = path.join(tmpDir, "output.mp4");
    job.status = "rendering";

    await renderMedia({
      composition,
      serveUrl: bundleLoc,
      codec: "h264",
      outputLocation: outputPath,
      inputProps: videoProps,
      scale,
      onProgress: ({ progress }) => {
        job.progress = progress;
      },
    });

    // Clean up media files from bundle; keep the mp4 for download
    fs.rmSync(mediaDir, { recursive: true, force: true });
    job.mediaDir = undefined;
    job.outputPath = outputPath;
    job.progress = 1;
    job.status = "done";
  } catch (error) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (job.mediaDir) fs.rmSync(job.mediaDir, { recursive: true, force: true });
    } catch {}
    console.error("Render error:", error);
    job.status = "error";
    job.error = error instanceof Error ? error.message : "Render failed";
  }
}

// ── Route handlers ──

export async function POST(req: NextRequest) {
  purgeStaleJobs();

  try {
    const formData = await req.formData();

    const audioBlob = formData.get("audio") as File | null;
    const videoPropsRaw = formData.get("videoProps") as string;

    if (!audioBlob) {
      return NextResponse.json({ error: "Audio file required" }, { status: 400 });
    }

    let videoProps: RenderInputs["videoProps"];
    try {
      videoProps = JSON.parse(videoPropsRaw);
    } catch {
      return NextResponse.json({ error: "Invalid videoProps JSON" }, { status: 400 });
    }

    if (!videoProps.durationInSeconds || videoProps.durationInSeconds <= 0 || videoProps.durationInSeconds > 600) {
      return NextResponse.json({ error: "Duration must be between 0 and 600 seconds" }, { status: 400 });
    }

    const rawScale = parseFloat(String(formData.get("scale") ?? "1"));
    const scale = rawScale === 1.5 ? 1.5 : 1; // 720x1280 or 1080x1920 only

    const imageEntries: [string, File][] = [];
    formData.forEach((value, key) => {
      if (key.startsWith("image_")) imageEntries.push([key, value as File]);
    });
    imageEntries.sort((a, b) => {
      const ai = parseInt(a[0].split("_")[1]);
      const bi = parseInt(b[0].split("_")[1]);
      return ai - bi;
    });

    const job: RenderJob = {
      id: crypto.randomUUID(),
      status: "bundling",
      progress: 0,
      createdAt: Date.now(),
    };
    jobs.set(job.id, job);

    // Detached — the render continues even if the client goes away
    runRenderJob(job, {
      videoProps,
      audioBlob,
      musicBlob: formData.get("music") as File | null,
      introBlob: formData.get("intro") as File | null,
      outroBlob: formData.get("outro") as File | null,
      outroLogoBlob: formData.get("outroCardLogo") as File | null,
      outroBadgeBlob: formData.get("outroCardBadge") as File | null,
      imageBlobs: imageEntries.map(([, f]) => f),
      scale,
    });

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    console.error("Render start error:", error);
    const message = error instanceof Error ? error.message : "Failed to start render";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("job");
  if (!id) {
    return NextResponse.json({ error: "Missing job parameter" }, { status: 400 });
  }
  const job = jobs.get(id);
  if (!job) {
    return NextResponse.json({ error: "Unknown job" }, { status: 404 });
  }

  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";

  if (wantsDownload) {
    if (job.status !== "done" || !job.outputPath || !fs.existsSync(job.outputPath)) {
      return NextResponse.json({ error: "Render not finished" }, { status: 409 });
    }
    const mp4Buffer = fs.readFileSync(job.outputPath);
    try {
      fs.rmSync(path.dirname(job.outputPath), { recursive: true, force: true });
    } catch {}
    jobs.delete(id);
    return new NextResponse(new Uint8Array(mp4Buffer), {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Disposition": 'attachment; filename="short_video.mp4"',
      },
    });
  }

  return NextResponse.json({
    status: job.status,
    progress: job.progress,
    error: job.error ?? null,
  });
}
