/**
 * Swappable AI backend. Implementations call one model API and nothing else —
 * all accounting knowledge (prompts, validation, ledger matching) lives in
 * AiService, so swapping Gemini for Claude/OpenAI/Ollama is a new adapter
 * plus an .env change.
 */
export interface AiJsonRequest {
  /** System / role instruction. */
  system: string;
  /** The user-visible prompt. */
  prompt: string;
  maxOutputTokens?: number;
  /** Optional attachment for vision tasks (bill scans etc.). */
  file?: {
    mimeType: string;
    /** base64-encoded bytes */
    data: string;
  };
}

export interface AiProvider {
  /** e.g. 'gemini' — surfaced in responses for observability. */
  readonly name: string;
  /** Model id actually used, e.g. 'gemini-2.5-flash'. */
  readonly model: string;
  /** Run a completion that must return a single JSON object as text. */
  completeJson(request: AiJsonRequest): Promise<string>;
}

/** Nest injection token for the configured provider. */
export const AI_PROVIDER = 'AI_PROVIDER_IMPL';
