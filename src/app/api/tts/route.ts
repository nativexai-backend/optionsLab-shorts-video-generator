import { NextRequest, NextResponse } from "next/server";
import { TTS_MODEL_ID, TTS_VOICE_SETTINGS } from "@/lib/voices";
import { normalizeForTTS } from "@/lib/tts-text";
import { recordUsage } from "@/lib/usage-storage";
import { applyPronunciation } from "@/lib/pronunciation";
import { readPronunciations } from "@/lib/pronunciation-storage";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { text?: string; voiceId?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, voiceId, projectId } = body;
  if (!text || !voiceId) {
    return NextResponse.json(
      { error: "Both 'text' and 'voiceId' are required" },
      { status: 400 }
    );
  }

  if (text.length > 5000) {
    return NextResponse.json(
      { error: "Text must be 5000 characters or fewer" },
      { status: 400 }
    );
  }

  // Apply the pronunciation dictionary first ("G7" → "G seven"), then expand
  // money/numbers ("$5.08" → "five dollars and eight cents"). The stored script
  // is untouched; this expanded text is what ElevenLabs bills on (≈1 credit/char).
  const dict = await readPronunciations();
  const billedText = normalizeForTTS(applyPronunciation(text, dict));

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
          text: billedText,
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
      return NextResponse.json(
        { error: message },
        { status: res.status }
      );
    }

    // Record characters billed (≈ ElevenLabs credits) — non-fatal
    recordUsage(projectId, "elevenlabs", { characters: billedText.length }).catch(() => {});

    const audioBuffer = await res.arrayBuffer();
    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: `TTS request failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 }
    );
  }
}
