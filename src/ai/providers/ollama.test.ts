import { describe, expect, it, vi } from 'vitest';
import { createOllamaProvider } from './ollama';
import { AiProviderError } from './types';

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init
  });
}

describe('OllamaProvider', () => {
  it('POSTs to /api/generate with stream:false + format:json and returns the text', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ response: '{"titles": ["a","b"]}' }));
    const provider = createOllamaProvider({
      baseUrl: 'http://example.test',
      model: 'tiny-test',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });

    const result = await provider.generate({ prompt: 'hi', responseFormat: 'json' });
    expect(result.text).toBe('{"titles": ["a","b"]}');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('http://example.test/api/generate');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ model: 'tiny-test', prompt: 'hi', stream: false, format: 'json' });
  });

  it('strips trailing slashes from baseUrl', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ response: 'ok' }));
    const provider = createOllamaProvider({
      baseUrl: 'http://example.test/',
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await provider.generate({ prompt: 'hi' });
    expect(fetchImpl.mock.calls[0][0]).toBe('http://example.test/api/generate');
  });

  it('throws AiProviderError on a non-OK status', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('no', { status: 503, statusText: 'Service Unavailable' })
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await expect(provider.generate({ prompt: 'hi' })).rejects.toBeInstanceOf(AiProviderError);
  });

  it('throws AiProviderError when the response is missing the `response` field', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ wrong: 'field' }));
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    await expect(provider.generate({ prompt: 'hi' })).rejects.toThrow(/response/i);
  });

  it('forwards an external abort signal', async () => {
    const fetchImpl = vi.fn(
      (_url: RequestInfo, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
        })
    );
    const provider = createOllamaProvider({
      fetchImpl: fetchImpl as unknown as typeof fetch
    });
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 0);
    await expect(provider.generate({ prompt: 'hi' }, controller.signal)).rejects.toThrow(/aborted/i);
  });
});
