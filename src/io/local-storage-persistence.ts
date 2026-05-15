import type { CoreStore, Doc, Unsubscribe } from '../core';
import { repairDoc, validateDoc } from '../core';

/**
 * Versioned key. Bumping this key (e.g. v2) is the migration story: a future
 * release reads v1 first, runs a migration, writes v2, leaves v1 alone for one
 * release for safety, then deletes v1.
 */
const STORAGE_KEY = 'mindforge:doc:v1';
const DEFAULT_DEBOUNCE_MS = 500;

export interface PersistenceLogger {
  warn(message: string, detail?: unknown): void;
}

export interface PersistenceOptions {
  debounceMs?: number;
  /**
   * Override the storage backend (used by tests). Anything that implements
   * the Web Storage API's getItem / setItem / removeItem subset works.
   */
  storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  logger?: PersistenceLogger;
}

const defaultLogger: PersistenceLogger = {
  warn(message, detail) {
    if (typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn(`[mindforge:persistence] ${message}`, detail ?? '');
    }
  }
};

function resolveStorage(options: PersistenceOptions): PersistenceOptions['storage'] | null {
  if (options.storage) {
    return options.storage;
  }
  if (typeof window === 'undefined') {
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Read the most recent persisted doc, if any. Returns null when:
 *  - storage is unavailable (SSR, private mode quirks),
 *  - no entry has been written yet,
 *  - the entry can't be parsed,
 *  - the entry's schema version is unknown,
 *  - the entry fails validation even after repair.
 *
 * All failure modes log via the supplied logger and never throw.
 */
export function loadStoredDoc(options: PersistenceOptions = {}): Doc | null {
  const storage = resolveStorage(options);
  if (!storage) return null;
  const logger = options.logger ?? defaultLogger;

  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch (error) {
    logger.warn('Failed to read localStorage', error);
    return null;
  }
  if (!raw) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    logger.warn('Stored doc is not valid JSON; ignoring', error);
    return null;
  }

  if (!isDocShape(parsed)) {
    logger.warn('Stored doc has unexpected shape; ignoring');
    return null;
  }
  if (parsed.version !== 1) {
    logger.warn(`Stored doc version ${parsed.version} is not supported by this build`);
    return null;
  }

  // localStorage is untrusted (devtools edits, partial writes). Run repair
  // first so common drift is auto-fixed; then check validation.
  const { doc: repaired, validation, repaired: repairedPaths } = repairDoc(parsed);
  if (repairedPaths.length > 0) {
    logger.warn(`Stored doc auto-repaired ${repairedPaths.length} path(s)`, repairedPaths);
  }
  if (!validation.ok) {
    logger.warn('Stored doc failed validation; discarding', validation.issues[0]?.path);
    return null;
  }
  return repaired;
}

/**
 * Persist a doc snapshot. Catches quota and storage errors so the editor
 * keeps running even when the disk is full.
 */
export function persistDocSnapshot(doc: Doc, options: PersistenceOptions = {}): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  const logger = options.logger ?? defaultLogger;

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(doc));
  } catch (error) {
    logger.warn('Failed to persist doc to localStorage', error);
  }
}

export function clearStoredDoc(options: PersistenceOptions = {}): void {
  const storage = resolveStorage(options);
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // best-effort
  }
}

/**
 * Subscribe a CoreStore so every doc change is debounced and persisted.
 * Returns an unsubscribe that ALSO flushes any pending save synchronously,
 * so `beforeunload` / route-change handlers don't lose the last keystroke.
 *
 * Pending saves are skipped when the doc fails validation — keeps a broken
 * intermediate state out of storage.
 */
export function subscribeStorePersistence(store: CoreStore, options: PersistenceOptions = {}): Unsubscribe {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const logger = options.logger ?? defaultLogger;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flush = () => {
    timer = null;
    const doc = store.getDoc();
    const validation = validateDoc(doc);
    if (!validation.ok) {
      logger.warn('Skipping persist of an invalid doc', validation.issues[0]?.path);
      return;
    }
    persistDocSnapshot(doc, options);
  };

  const unsubscribeStore = store.subscribe(() => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });

  return () => {
    unsubscribeStore();
    if (timer !== null) {
      clearTimeout(timer);
      flush();
    }
  };
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
