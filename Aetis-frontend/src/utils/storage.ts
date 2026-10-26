/**
 * localStorage that never throws (it can be blocked, full or disabled).
 *
 * Do not store tokens, patient details or caller details here. Any script on
 * the page can read it, and it stays after sign-out. It is for harmless
 * preferences only.
 *
 * Nothing uses this yet: DashboardLayout keeps its own sidebar setting.
 */

const PREFIX = "aetis:";

function getStore(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export const storage = {
  get<T>(key: string, fallback: T): T {
    const store = getStore();
    if (!store) return fallback;

    try {
      const raw = store.getItem(PREFIX + key);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },

  /** Returns false when the value could not be saved */
  set(key: string, value: unknown): boolean {
    const store = getStore();
    if (!store) return false;

    try {
      store.setItem(PREFIX + key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },

  remove(key: string): void {
    try {
      getStore()?.removeItem(PREFIX + key);
    } catch {
      /* nothing to do */
    }
  },
};