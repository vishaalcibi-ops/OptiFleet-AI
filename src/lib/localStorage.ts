const PREFIX = 'optifleet_';

export function lsGet<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function lsSet<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore quota errors silently
  }
}

export function lsDel(key: string): void {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    // Ignore
  }
}
