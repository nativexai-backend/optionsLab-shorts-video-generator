/**
 * Avatar-to-ElevenLabs voice mapping.
 * Replace placeholder voice IDs with real ones from your ElevenLabs dashboard.
 * https://elevenlabs.io/app/voice-library
 */

export const AVATAR_VOICE_MAP: Record<string, string> = {
  claire: "POvRpPEhg5SE7LXEOjXg",   // Custom
  daniel: "7ZR2iJm4VSCFebusrLi8",   // Custom
  ethan: "9uQPk0rhRUuox6MJowrh",     // Custom
  malik: "LP5b3qayq4ueDLxlkIYa",     // Custom
  nathan: "m4jhXDDlzRAQ10HfEGZO",    // Custom
  lucas: "Mf2qODiujEJgrMxuo4OO",     // Custom
};

export const TTS_MODEL_ID = "eleven_multilingual_v2";

export const TTS_VOICE_SETTINGS = {
  stability: 0.5,
  similarity_boost: 0.75,
  style: 0.3,
  speed: 1.0,
};
