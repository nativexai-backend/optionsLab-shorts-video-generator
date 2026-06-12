import { NextResponse } from "next/server";

// Reports which external services are configured so the UI can warn
// up-front instead of failing mid-flow.
export async function GET() {
  return NextResponse.json({
    elevenlabs: !!process.env.ELEVENLABS_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  });
}
