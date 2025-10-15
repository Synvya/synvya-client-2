const LOCATION_KEY = "synvya:profile:location";

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function cacheProfileLocation(value: string | null | undefined): void {
  if (!isBrowser()) return;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      window.localStorage.setItem(LOCATION_KEY, trimmed);
      return;
    }
  }
  try {
    window.localStorage.removeItem(LOCATION_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getCachedProfileLocation(): string | null {
  if (!isBrowser()) return null;
  try {
    const value = window.localStorage.getItem(LOCATION_KEY);
    if (typeof value === "string") {
      const trimmed = value.trim();
      return trimmed || null;
    }
    return null;
  } catch {
    return null;
  }
}
