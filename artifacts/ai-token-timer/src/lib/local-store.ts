export type TimerKind = 'token' | 'quota';

export interface Profile {
  id: string;
  ide: string;
  name: string;
  accountId: string;
  email: string;
  model: string;
  tokenRefreshDurationMinutes: number;
  quotaRefreshDurationMinutes: number;
  tokenRefreshUntil: number | null;
  quotaRefreshUntil: number | null;
  createdAt: number;
}

export type ActivityAction =
  | 'profile-added'
  | 'profile-updated'
  | 'profile-deleted'
  | 'timer-started'
  | 'timer-reset'
  | 'timer-expired'
  | 'backup-imported';

export interface ActivityEntry {
  id: string;
  profileId: string | null;
  profileName: string;
  action: ActivityAction;
  timerKind?: TimerKind;
  timerEndsAt?: number;
  occurredAt: number;
}

export interface Preferences {
  notificationsEnabled: boolean;
}

export interface StorageStatus {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export interface AppSnapshot {
  profiles: Profile[];
  activity: ActivityEntry[];
  preferences: Preferences;
}

export interface BackupFile {
  format: 'token-manager-backup';
  version: 1;
  exportedAt: number;
  profiles: Profile[];
  activity: ActivityEntry[];
  preferences: Preferences;
}

const DATABASE_NAME = 'token-manager';
const DATABASE_VERSION = 1;
const PROFILE_STORE = 'profiles';
const ACTIVITY_STORE = 'activity';
const PREFERENCE_STORE = 'preferences';
const CHANGE_EVENT = 'token-manager-store-change';
const CHANNEL_NAME = 'token-manager-store';
const MAX_ACTIVITY_ENTRIES = 500;
const DEFAULT_PREFERENCES: Preferences = { notificationsEnabled: false };

let databasePromise: Promise<IDBDatabase> | undefined;
let changeChannel: BroadcastChannel | null = null;

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('This browser does not support IndexedDB.'));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(PROFILE_STORE)) {
        database.createObjectStore(PROFILE_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(ACTIVITY_STORE)) {
        database.createObjectStore(ACTIVITY_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(PREFERENCE_STORE)) {
        database.createObjectStore(PREFERENCE_STORE, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = undefined;
      reject(request.error ?? new Error('Could not open local storage.'));
    };
    request.onblocked = () => {
      databasePromise = undefined;
      reject(new Error('Close other Token Manager tabs to finish a storage update.'));
    };
  });

  return databasePromise;
}

function runTransaction<T>(
  storeNames: string | string[],
  mode: IDBTransactionMode,
  perform: (transaction: IDBTransaction) => IDBRequest<T> | null,
): Promise<T | undefined> {
  return openDatabase().then((database) => new Promise((resolve, reject) => {
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(storeNames, mode);
    } catch (error) {
      reject(error);
      return;
    }

    let result: T | undefined;
    let request: IDBRequest<T> | null;
    try {
      request = perform(transaction);
    } catch (error) {
      transaction.abort();
      reject(error);
      return;
    }
    if (request) {
      request.onsuccess = () => { result = request.result; };
      request.onerror = () => reject(request.error ?? new Error('Local storage request failed.'));
    }
    transaction.oncomplete = () => resolve(result);
    transaction.onabort = () => reject(transaction.error ?? new Error('Local storage transaction was cancelled.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Local storage transaction failed.'));
  }));
}

function announceChange() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  if (typeof BroadcastChannel !== 'undefined') {
    changeChannel ??= new BroadcastChannel(CHANNEL_NAME);
    changeChannel.postMessage('changed');
  }
}

export function subscribeToStore(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleWindowChange = () => onChange();
  const handleChannelChange = () => window.dispatchEvent(new Event(CHANGE_EVENT));
  window.addEventListener(CHANGE_EVENT, handleWindowChange);
  if (typeof BroadcastChannel !== 'undefined') {
    changeChannel ??= new BroadcastChannel(CHANNEL_NAME);
    changeChannel.addEventListener('message', handleChannelChange);
  }
  return () => {
    window.removeEventListener(CHANGE_EVENT, handleWindowChange);
    changeChannel?.removeEventListener('message', handleChannelChange);
  };
}

export async function getSnapshot(): Promise<AppSnapshot> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([PROFILE_STORE, ACTIVITY_STORE, PREFERENCE_STORE], 'readonly');
    const profileRequest = transaction.objectStore(PROFILE_STORE).getAll();
    const activityRequest = transaction.objectStore(ACTIVITY_STORE).getAll();
    const preferenceRequest = transaction.objectStore(PREFERENCE_STORE).get('main');
    transaction.oncomplete = () => {
      const storedPreferences = preferenceRequest.result?.value as Preferences | undefined;
      resolve({
        profiles: (profileRequest.result as Profile[]).sort((a, b) => a.name.localeCompare(b.name)),
        activity: (activityRequest.result as ActivityEntry[]).sort((a, b) => b.occurredAt - a.occurredAt),
        preferences: { ...DEFAULT_PREFERENCES, ...storedPreferences },
      });
    };
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not read local data.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not read local data.'));
  });
}

async function addActivityInTransaction(transaction: IDBTransaction, entry: ActivityEntry) {
  const store = transaction.objectStore(ACTIVITY_STORE);
  store.put(entry);
  const request = store.getAll();
  request.onsuccess = () => {
    const entries = (request.result as ActivityEntry[]).sort((a, b) => b.occurredAt - a.occurredAt);
    entries.slice(MAX_ACTIVITY_ENTRIES).forEach(({ id }) => store.delete(id));
  };
}

export async function saveProfileWithActivity(profile: Profile, entry: ActivityEntry): Promise<void> {
  await runTransaction([PROFILE_STORE, ACTIVITY_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(PROFILE_STORE).put(profile);
    addActivityInTransaction(transaction, entry);
    return null;
  });
  announceChange();
}

export async function updateProfileWithActivity(id: string, changes: Partial<Profile>, entry: ActivityEntry): Promise<Profile> {
  const database = await openDatabase();
  const updated = await new Promise<Profile>((resolve, reject) => {
    const transaction = database.transaction([PROFILE_STORE, ACTIVITY_STORE], 'readwrite');
    const profiles = transaction.objectStore(PROFILE_STORE);
    const request = profiles.get(id);
    let result: Profile | undefined;
    request.onsuccess = () => {
      const current = request.result as Profile | undefined;
      if (!current) {
        transaction.abort();
        return;
      }
      result = { ...current, ...changes };
      entry.profileName = typeof changes.name === 'string' ? changes.name : current.name;
      profiles.put(result);
      addActivityInTransaction(transaction, entry);
    };
    request.onerror = () => reject(request.error ?? new Error('Could not load this profile.'));
    transaction.oncomplete = () => result ? resolve(result) : reject(new Error('Profile not found.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Could not update this profile.'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Could not update this profile.'));
  });
  announceChange();
  return updated;
}

export async function removeProfileWithActivity(profile: Profile, entry: ActivityEntry): Promise<void> {
  await runTransaction([PROFILE_STORE, ACTIVITY_STORE], 'readwrite', (transaction) => {
    transaction.objectStore(PROFILE_STORE).delete(profile.id);
    addActivityInTransaction(transaction, entry);
    return null;
  });
  announceChange();
}

export async function appendActivity(entry: ActivityEntry): Promise<void> {
  await runTransaction(ACTIVITY_STORE, 'readwrite', (transaction) => {
    addActivityInTransaction(transaction, entry);
    return null;
  });
  announceChange();
}

export async function savePreferences(preferences: Preferences): Promise<void> {
  await runTransaction(PREFERENCE_STORE, 'readwrite', (transaction) =>
    transaction.objectStore(PREFERENCE_STORE).put({ key: 'main', value: preferences }),
  );
  announceChange();
}

export async function clearActivity(): Promise<void> {
  await runTransaction(ACTIVITY_STORE, 'readwrite', (transaction) => transaction.objectStore(ACTIVITY_STORE).clear());
  announceChange();
}

export async function exportBackup(): Promise<BackupFile> {
  const snapshot = await getSnapshot();
  return {
    format: 'token-manager-backup',
    version: 1,
    exportedAt: Date.now(),
    ...snapshot,
  };
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<Profile> & { durationMinutes?: unknown; limitedUntil?: unknown; agent?: unknown };
  const tokenDuration = item.tokenRefreshDurationMinutes ?? item.durationMinutes;
  const quotaDuration = item.quotaRefreshDurationMinutes ?? item.durationMinutes;
  const tokenUntil = item.tokenRefreshUntil ?? item.limitedUntil ?? null;
  const quotaUntil = item.quotaRefreshUntil ?? item.limitedUntil ?? null;
  return typeof item.id === 'string'
    && typeof item.ide === 'string'
    && typeof item.name === 'string'
    && typeof item.email === 'string'
    && typeof (item.model ?? item.agent) === 'string'
    && Number.isSafeInteger(tokenDuration) && Number(tokenDuration) > 0
    && Number.isSafeInteger(quotaDuration) && Number(quotaDuration) > 0
    && (tokenUntil === null || (typeof tokenUntil === 'number' && Number.isFinite(tokenUntil) && Math.abs(tokenUntil) <= 8.64e15))
    && (quotaUntil === null || (typeof quotaUntil === 'number' && Number.isFinite(quotaUntil) && Math.abs(quotaUntil) <= 8.64e15))
    && typeof item.createdAt === 'number' && Number.isFinite(item.createdAt);
}

function normalizeProfile(value: Partial<Profile> & {
  id: string; ide: string; name: string; email: string; createdAt: number;
  durationMinutes?: number; limitedUntil?: number | null; agent?: string;
}): Profile {
  return {
    id: value.id,
    ide: value.ide.trim(),
    name: value.name.trim(),
    accountId: typeof value.accountId === 'string' ? value.accountId.trim() : '',
    email: value.email.trim(),
    model: (value.model ?? value.agent ?? '').trim(),
    tokenRefreshDurationMinutes: value.tokenRefreshDurationMinutes ?? 60,
    quotaRefreshDurationMinutes: value.quotaRefreshDurationMinutes ?? value.durationMinutes ?? 60,
    tokenRefreshUntil: value.tokenRefreshUntil ?? null,
    quotaRefreshUntil: value.quotaRefreshUntil ?? value.limitedUntil ?? null,
    createdAt: value.createdAt,
  };
}

function normalizeActivity(value: unknown): ActivityEntry | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Partial<ActivityEntry>;
  const actions: ActivityAction[] = ['profile-added', 'profile-updated', 'profile-deleted', 'timer-started', 'timer-reset', 'timer-expired', 'backup-imported'];
  if (typeof item.id !== 'string' || typeof item.profileName !== 'string' || !actions.includes(item.action as ActivityAction) || typeof item.occurredAt !== 'number' || !Number.isFinite(item.occurredAt) || Math.abs(item.occurredAt) > 8.64e15) return null;
  return {
    id: item.id,
    profileId: typeof item.profileId === 'string' ? item.profileId : null,
    profileName: item.profileName,
    action: item.action as ActivityAction,
    ...(item.timerKind === 'token' || item.timerKind === 'quota' ? { timerKind: item.timerKind } : {}),
    ...(typeof item.timerEndsAt === 'number' && Number.isFinite(item.timerEndsAt) && Math.abs(item.timerEndsAt) <= 8.64e15 ? { timerEndsAt: item.timerEndsAt } : {}),
    occurredAt: item.occurredAt,
  };
}

export async function importBackup(value: unknown): Promise<{ imported: number; profiles: number }> {
  if (!value || typeof value !== 'object') throw new Error('That file is not a Token Manager backup.');
  const legacyProfiles = Array.isArray(value) ? value : null;
  const backup = value as Partial<BackupFile>;
  const isCurrentBackup = backup.format === 'token-manager-backup' && backup.version === 1 && Array.isArray(backup.profiles) && Array.isArray(backup.activity);
  if (!isCurrentBackup && !legacyProfiles) {
    throw new Error('That backup format is not supported.');
  }
  const profileRecords = legacyProfiles ?? backup.profiles!;
  if (!profileRecords.every(isProfile)) throw new Error('The backup contains an invalid profile record.');
  const profiles = profileRecords.map((profile) => normalizeProfile(profile));
  const activity = (backup.activity ?? []).map(normalizeActivity).filter((entry): entry is ActivityEntry => entry !== null);
  const preferences = {
    notificationsEnabled: backup.preferences?.notificationsEnabled === true,
  };
  const importedEntry: ActivityEntry = {
    id: createId(), profileId: null, profileName: 'Backup', action: 'backup-imported', occurredAt: Date.now(),
  };
  await runTransaction([PROFILE_STORE, ACTIVITY_STORE, PREFERENCE_STORE], 'readwrite', (transaction) => {
    const profileStore = transaction.objectStore(PROFILE_STORE);
    profiles.forEach((profile) => profileStore.put(profile));
    const activityStore = transaction.objectStore(ACTIVITY_STORE);
    activity.forEach((entry) => activityStore.put(entry));
    addActivityInTransaction(transaction, importedEntry);
    transaction.objectStore(PREFERENCE_STORE).put({ key: 'main', value: preferences });
    return null;
  });
  announceChange();
  return { imported: activity.length, profiles: profiles.length };
}

export async function getStorageStatus(): Promise<StorageStatus> {
  if (typeof navigator === 'undefined' || !navigator.storage) return { persisted: null, usage: null, quota: null };
  const [persisted, estimate] = await Promise.all([
    typeof navigator.storage.persisted === 'function' ? navigator.storage.persisted().catch(() => false) : Promise.resolve(null),
    typeof navigator.storage.estimate === 'function' ? navigator.storage.estimate().catch(() => null) : Promise.resolve(null),
  ]);
  return {
    persisted,
    usage: estimate?.usage ?? null,
    quota: estimate?.quota ?? null,
  };
}

export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage || typeof navigator.storage.persist !== 'function') return false;
  return navigator.storage.persist();
}
