/** Which AI backend to use. `mock` = deterministic demo adapter (no OpenAI calls). */
export function resolveAIProviderId(): "mock" | "openai" {
  const mode = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (mode === "mock") return "mock";
  if (mode === "openai") return "openai";
  return process.env.OPENAI_API_KEY?.trim() ? "openai" : "mock";
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
