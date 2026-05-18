import { repairDoc, validateDoc, type Doc } from '../core';

export const DOC_FILE_EXTENSION = '.mindforge.json';
export const DOC_MIME_TYPE = 'application/json';

export interface ParsedDoc {
  doc: Doc;
  /**
   * Repair / validation notes — non-fatal nudges that landed during parsing.
   * UI can surface them, but the import still succeeded.
   */
  warnings: string[];
}

export type ParseError =
  | { code: 'NOT_JSON'; message: string }
  | { code: 'NOT_DOC_SHAPE'; message: string }
  | { code: 'UNSUPPORTED_VERSION'; message: string; version: unknown }
  | { code: 'INVALID_DOC'; message: string; path?: string };

export type ParseResult = { ok: true; data: ParsedDoc } | { ok: false; error: ParseError };

/**
 * Serialize a doc to a JSON Blob ready to hand to the browser's download
 * machinery. Pretty-printed with 2 spaces — the file is small and humans
 * occasionally inspect it in a text editor.
 */
export function exportDocToBlob(doc: Doc): Blob {
  const json = JSON.stringify(doc, null, 2);
  return new Blob([json], { type: DOC_MIME_TYPE });
}

/**
 * Suggest a filename from doc.meta.title with a hard `.mindforge.json`
 * extension. Slug is lowercase ASCII letters, digits, and dashes; we strip
 * everything else so the filename is portable across operating systems.
 */
export function suggestDocFilename(doc: Doc): string {
  const slug = (doc.meta.title ?? 'mindforge')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  const base = slug.length > 0 ? slug : 'mindforge';
  return `${base}${DOC_FILE_EXTENSION}`;
}

/**
 * Parse a text payload (typically the result of FileReader.readAsText) into
 * a validated Doc. Never throws: every failure mode returns a structured
 * `ParseError` so the UI can render a useful message.
 */
export function parseDocFromText(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return {
      ok: false,
      error: {
        code: 'NOT_JSON',
        message: error instanceof Error ? error.message : 'Not valid JSON'
      }
    };
  }

  if (!isDocShape(parsed)) {
    return {
      ok: false,
      error: {
        code: 'NOT_DOC_SHAPE',
        message: 'File does not look like a MindForge document'
      }
    };
  }

  if (parsed.version !== 1) {
    return {
      ok: false,
      error: {
        code: 'UNSUPPORTED_VERSION',
        message: `Unsupported MindForge document version: ${String(parsed.version)}`,
        version: parsed.version
      }
    };
  }

  const { doc, validation, repaired } = repairDoc(parsed);
  const warnings: string[] = [];
  if (repaired.length > 0) {
    warnings.push(`Auto-repaired ${repaired.length} structural drift item(s).`);
  }
  if (!validation.ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DOC',
        message: 'Imported document failed validation even after repair',
        path: validation.issues[0]?.path
      }
    };
  }
  // The post-repair doc has been validated. validateDoc here is redundant
  // but cheap; we keep it as an explicit pin in case repairDoc's contract
  // ever drifts away from "validates before returning".
  if (!validateDoc(doc).ok) {
    return {
      ok: false,
      error: {
        code: 'INVALID_DOC',
        message: 'Imported document failed post-repair validation'
      }
    };
  }

  return { ok: true, data: { doc, warnings } };
}

function isDocShape(value: unknown): value is Doc {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<Doc>;
  return (
    typeof candidate.rootId === 'string' &&
    candidate.nodes !== undefined &&
    typeof candidate.nodes === 'object' &&
    candidate.edges !== undefined &&
    typeof candidate.edges === 'object' &&
    typeof candidate.theme === 'string' &&
    candidate.meta !== undefined &&
    typeof candidate.meta === 'object'
  );
}
