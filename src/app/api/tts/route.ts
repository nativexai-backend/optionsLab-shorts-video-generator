import { NextRequest, NextResponse } from "next/server";
import { TTS_MODEL_ID, TTS_MODEL_ID_V3, V3_CHAR_LIMIT, TTS_VOICE_SETTINGS, sanitizeVoiceSettings, snapV3Stability, type VoiceSettings } from "@/lib/voices";
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

  let body: {
    text?: string;
    voiceId?: string;
    projectId?: string;
    voiceSettings?: Partial<VoiceSettings>;
    useV3?: boolean;
    deliveryPreset?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, voiceId, projectId } = body;
  const useV3 = body.useV3 === true;
  const modelId = useV3 ? TTS_MODEL_ID_V3 : TTS_MODEL_ID;
  // Per-take delivery override (stability/style/speed). Falls back to the
  // default settings when the client doesn't send any. v3 only accepts
  // discrete stability values, so snap it when in expressive mode.
  const voiceSettings = body.voiceSettings
    ? sanitizeVoiceSettings(body.voiceSettings)
    : { ...TTS_VOICE_SETTINGS };
  if (useV3) voiceSettings.stability = snapV3Stability(voiceSettings.stability);
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

  if (useV3 && billedText.length > V3_CHAR_LIMIT) {
    return NextResponse.json(
      { error: `Expressive (v3) mode supports up to ${V3_CHAR_LIMIT} characters — shorten the script or switch off Expressive mode.` },
      { status: 400 }
    );
  }

  // Dev-only: confirm exactly what's being sent to ElevenLabs (model + the
  // resolved voice_settings + payload size). Watch the dev-server console.
  if (process.env.NODE_ENV !== "production") {
    console.log("[tts] →", {
      voiceId,
      model_id: modelId,
      preset: body.deliveryPreset ?? "(none)",
      voice_settings: voiceSettings,
      chars: billedText.length,
    });
  }

  try {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
          Accept: "audio/mpeg",
        },
        body: JSON.stringify({
          text: billedText,
          model_id: modelId,
          voice_settings: voiceSettings,
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
