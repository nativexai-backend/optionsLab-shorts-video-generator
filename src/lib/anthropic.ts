// Resolve the Anthropic API key, accepting the standard ANTHROPIC_API_KEY
// (which the SDK auto-detects) or a bare ANTHROPIC.
export function anthropicKey(): string | undefined {
  return process.env.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC;
}
