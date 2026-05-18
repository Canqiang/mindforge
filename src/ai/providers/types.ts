/**
 * Minimal provider contract every AI backend has to satisfy. The Ollama
 * implementation is the only one shipped in v0.1; OpenAI / Anthropic /
 * any future provider plug in by satisfying this interface and registering
 * itself in `src/ai/index.ts`.
 */
export interface AiProvider {
  readonly name: string;
  /**
   * Run a single non-streaming generation. Implementations must respect
   * `signal` and abort the underlying request. v0.1 expects JSON output
   * (when `responseFormat === 'json'`); providers that can't enforce that
   * should still attempt the prompt and let the caller parse the result.
   */
  generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateOutput>;
}

export interface GenerateInput {
  prompt: string;
  /**
   * When 'json', the provider should ask the backend to return JSON
   * (Ollama's `format: 'json'`, OpenAI's response_format etc.). When
   * undefined, plain text is acceptable.
   */
  responseFormat?: 'json';
}

export interface GenerateOutput {
  text: string;
}

export class AiProviderError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'AiProviderError';
  }
}
