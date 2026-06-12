import { NextRequest, NextResponse } from "next/server";
import { TTS_MODEL_ID, TTS_VOICE_SETTINGS } from "@/lib/voices";
import { normalizeForTTS } from "@/lib/tts-text";

export async function POST(req: NextRequest) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured" },
      { status: 500 }
    );
  }

  let body: { text?: string; voiceId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { text, voiceId } = body;
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
          // Money and numbers are expanded ("$5.08" → "five dollars and
          // eight cents", "102" → "one hundred and two") so the voice reads
          // them naturally; the stored script is untouched.
          text: normalizeForTTS(text),
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
