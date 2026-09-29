/** §51-52: the portable save file. Local-first, no account, JSON in and out. */

import type { Settings } from './settings';
import type { Progress } from './progress';
import type { Session } from './session';

export const SAVE_SCHEMA_VERSION = 1 as const;

export interface UserProfile {
  id: string;
  createdAt: number;
  /** Optional, never required to play (§52). */
  displayName?: string;
}

export interface SaveFile {
  version: typeof SAVE_SCHEMA_VERSION;
  app: 'puffly';
  exportedAt: number;
  profile: UserProfile;
  settings: Settings;
  progress: Progress;
  sessions: Session[];
}
