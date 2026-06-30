import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";
import { AVATAR_VOICE_MAP, TTS_MODEL_ID, TTS_VOICE_SETTINGS } from "@/lib/voices";

// Short voice samples are generated once per avatar and cached on disk,
// so previews don't burn ElevenLabs credits on every click.
const CACHE_DIR = path.join(os.tmpdir(), "vid-voice-previews");

function sampleText(name: string): string {
  const display = name.charAt(0).toUpperCase() + name.slice(1);
  return `Hey, I'm ${display} — and this is what my voice sounds like.`;
}

export async function GET(req: NextRequest) {
  const avatar = req.nextUrl.searchParams.get("avatar")?.toLowerCase() ?? "";
  const voiceId = AVATAR_VOICE_MAP[avatar];
  if (!voiceId) {
    return NextResponse.json({ error: `Unknown avatar "${avatar}"` }, { status: 404 });
  }

  // Key the cache by voiceId so changing an avatar's voice in AVATAR_VOICE_MAP
  // automatically produces a fresh sample instead of serving the old (or a
  // stale/partial) file under the same name.
  const cachePath = path.join(CACHE_DIR, `${avatar}-${voiceId}.mp3`);
  if (fs.existsSync(cachePath)) {
    const cached = fs.readFileSync(cachePath);
    return new NextResponse(new Uint8Array(cached), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        // Don't let the browser pin a sample: the URL (?avatar=name) stays the
        // same across voice-id changes, so always revalidate against our
        // (disk-cached, credit-free) server response.
        "Cache-Control": "no-store",
      },
    });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not configured" }, { status: 500 });
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: sampleText(avatar),
          model_id: TTS_MODEL_ID,
          voice_settings: TTS_VOICE_SETTINGS,
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      let message = "ElevenLabs API error";
      try {
        message = JSON.parse(errText).detail?.message || message;
      } catch {}
      return NextResponse.json({ error: message }, { status: res.status });
    }

    const audioBuffer = Buffer.from(await res.arrayBuffer());
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(cachePath, audioBuffer);

    return new NextResponse(new Uint8Array(audioBuffer), {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `Voice preview failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
