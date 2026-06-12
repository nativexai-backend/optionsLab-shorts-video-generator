import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import os from "os";
import { execFile } from "child_process";

const WHISPER_BIN = "/Users/chokomilo/Library/Python/3.9/bin/whisper";

// ── Groq Whisper (fast, accurate, free) ──

async function transcribeWithGroq(
  audioBuffer: Buffer,
  fileName: string
): Promise<{ word: string; start: number; end: number }[]> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("No GROQ_API_KEY");

  const formData = new FormData();
  const blob = new Blob([new Uint8Array(audioBuffer)], { type: "audio/wav" });
  formData.append("file", blob, fileName);
  formData.append("model", "whisper-large-v3-turbo");
  formData.append("response_format", "verbose_json");
  formData.append("timestamp_granularities[]", "word");
  formData.append("language", "en");

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Groq Whisper error");
    throw new Error(`Groq Whisper ${res.status}: ${err}`);
  }

  const data = await res.json();

  // Groq returns { words: [{ word, start, end }] } at top level
  const rawWords = data.words ?? [];
  return rawWords.map((w: { word: string; start: number; end: number }) => ({
    word: w.word.trim(),
    start: w.start,
    end: w.end,
  }));
}

// ── Local Whisper fallback ──

async function transcribeWithLocalWhisper(
  audioPath: string,
  tmpDir: string
): Promise<{ word: string; start: number; end: number }[]> {
  await new Promise<string>((resolve, reject) => {
    execFile(
      WHISPER_BIN,
      [
        audioPath,
        "--model", "base",
        "--language", "en",
        "--output_format", "json",
        "--output_dir", tmpDir,
        "--word_timestamps", "True",
      ],
      { timeout: 300_000 },
      (err, stdout, stderr) => {
        if (err) {
          console.error("Whisper stderr:", stderr);
          reject(new Error(`Whisper failed: ${err.message}`));
          return;
        }
        resolve(stdout);
      }
    );
  });

  const jsonPath = path.join(tmpDir, "audio.json");
  if (!fs.existsSync(jsonPath)) {
    throw new Error("Whisper did not produce JSON output");
  }

  const whisperOutput = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
  const words: { word: string; start: number; end: number }[] = [];

  for (const segment of whisperOutput.segments || []) {
    for (const w of segment.words || []) {
      words.push({
        word: w.word.trim(),
        start: w.start,
        end: w.end,
      });
    }
  }

  return words;
}

// ── Route handler ──

export async function POST(req: NextRequest) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "vid-transcribe-"));

  try {
    const formData = await req.formData();
    const audioBlob = formData.get("audio") as File | null;

    if (!audioBlob) {
      return NextResponse.json({ error: "Audio file required" }, { status: 400 });
    }

    const audioBuffer = Buffer.from(await audioBlob.arrayBuffer());
    const ext = path.extname(audioBlob.name) || ".wav";

    let words: { word: string; start: number; end: number }[];
    let method: "groq" | "local" = "local";

    // Try Groq Whisper first (faster + more accurate timestamps)
    if (process.env.GROQ_API_KEY) {
      try {
        words = await transcribeWithGroq(audioBuffer, `audio${ext}`);
        method = "groq";
      } catch (err) {
        console.error("Groq Whisper failed, falling back to local:", err);
        // Fall through to local
        const audioPath = path.join(tmpDir, `audio${ext}`);
        fs.writeFileSync(audioPath, audioBuffer);
        words = await transcribeWithLocalWhisper(audioPath, tmpDir);
      }
    } else {
      const audioPath = path.join(tmpDir, `audio${ext}`);
      fs.writeFileSync(audioPath, audioBuffer);
      words = await transcribeWithLocalWhisper(audioPath, tmpDir);
    }

    // Clean up
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return NextResponse.json({ words, method });
  } catch (error) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}

    console.error("Transcribe error:", error);
    const message = error instanceof Error ? error.message : "Transcription failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
