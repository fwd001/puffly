/**
 * `@puffly/game-storage` — the persistence seam, SPEC.md §50, §51, §52, §63.
 *
 * Game Core only knows `StorageAdapter` (§50). This package supplies three implementations
 * of it (IndexedDB, memory, and a primary-with-fallback wrapper), plus the §51 export /
 * import path: a save file is plain JSON the player owns, with no account and no network
 * (§52). Nothing in here talks to a server, and nothing in here prints a technical string
 * for a player to read (§63) — failures travel as codes.
 */

export {
  RECORD_KEY,
  StorageError,
  applySessionFilter,
  isStorageError,
  storageFailureCode,
  type SessionFilter,
  type StorageAdapter,
  type StorageErrorCode,
} from './adapter';

export {
  BASE_IDB_MIGRATIONS,
  CURRENT_IDB_SCHEMA_VERSION,
  META_STORE,
  PROFILE_STORE,
  PROGRESS_STORE,
  SCHEMA_META_ID,
  SESSIONS_STORE,
  SESSION_STARTED_AT_INDEX,
  SETTINGS_STORE,
  createIdbStorage,
  createStoresV1,
  type IdbLayout,
  type IdbMigration,
  type IdbStorage,
  type IdbStorageOptions,
  type StorageIssue,
} from './idb';

export { createMemoryStorage, type MemorySeed, type MemoryStorage } from './memory';

export {
  createFallbackStorage,
  createUnavailableStorage,
  withMemoryFallback,
  type DegradedStorage,
  type FallbackStorageOptions,
  type StorageCallName,
  type StorageFailure,
} from './fallback';

export {
  cloneEvent,
  cloneInput,
  cloneProfile,
  cloneProgress,
  cloneSession,
  cloneSettings,
  copyJson,
  copyPayload,
  stableStringify,
  type JsonValue,
} from './clone';

export {
  exportSaveFile,
  parseSaveFile,
  readSaveFile,
  saveFileName,
  serializeSaveFile,
  type SaveFileSource,
} from './save';

export {
  migrateSaveFile,
  migrationFor,
  saveFileVersion,
  supportedVersions,
  isCurrentVersion,
  UPGRADE_V0_TO_V1,
  SAVE_MIGRATIONS,
  type SaveFileShapeV0,
  type SaveMigration,
} from './migrate';

export {
  mergeSaveFiles,
  mergeSessionLogs,
  type MergeOptions,
  type MergeOutcome,
  type MergeSummary,
} from './merge';

export {
  MAX_REPORTED_ISSUES,
  SAVE_FILE_KEYS,
  isRecord,
  readProfile,
  readProgress,
  readSession,
  readSettings,
  validateSaveFile,
  type ValidationErrors,
  type SaveFileResult,
} from './validate';
