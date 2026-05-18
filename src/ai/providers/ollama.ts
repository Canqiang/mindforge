import {
  AiProviderError,
  type AiProvider,
  type GenerateInput,
  type GenerateOutput
} from './types';

export const OLLAMA_DEFAULT_BASE_URL = 'http://localhost:11434';
export const OLLAMA_DEFAULT_MODEL = 'llama3.2';
const DEFAULT_TIMEOUT_MS = 30_000;

export interface OllamaProviderOptions {
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export function createOllamaProvider(options: OllamaProviderOptions = {}): AiProvider {
  const baseUrl = (options.baseUrl ?? OLLAMA_DEFAULT_BASE_URL).replace(/\/+$/, '');
  const model = options.model ?? OLLAMA_DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;

  return {
    name: `ollama:${model}`,
    async generate(input: GenerateInput, signal?: AbortSignal): Promise<GenerateOutput> {
      const url = `${baseUrl}/api/generate`;
      const body = JSON.stringify({
        model,
        prompt: input.prompt,
        stream: false,
        ...(input.responseFormat === 'json' ? { format: 'json' } : {})
      });

      // Compose a soft timeout that also forwards an externally-supplied
      // abort signal — whichever fires first cancels the underlying fetch.
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(new DOMException('timeout', 'TimeoutError')), timeoutMs);
      const onExternalAbort = () => controller.abort(signal?.reason);
      if (signal) {
        if (signal.aborted) {
          controller.abort(signal.reason);
        } else {
          signal.addEventListener('abort', onExternalAbort, { once: true });
        }
      }

      try {
        const response = await fetchImpl(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body,
          signal: controller.signal
        });
        if (!response.ok) {
          throw new AiProviderError(
            `Ollama responded ${response.status} ${response.statusText}`
          );
        }
        const data = (await response.json()) as { response?: unknown };
        if (typeof data.response !== 'string') {
          throw new AiProviderError('Ollama response missing the `response` field');
        }
        return { text: data.response };
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw new AiProviderError('Ollama request aborted', error);
        }
        if (error instanceof DOMException && error.name === 'TimeoutError') {
          throw new AiProviderError(`Ollama request timed out after ${timeoutMs} ms`, error);
        }
        throw new AiProviderError(
          `Ollama request failed: ${error instanceof Error ? error.message : String(error)}`,
          error
        );
      } finally {
        clearTimeout(timeoutId);
        if (signal) signal.removeEventListener('abort', onExternalAbort);
      }
    }
  };
}
