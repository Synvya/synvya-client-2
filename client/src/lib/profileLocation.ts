import type { Event } from "nostr-tools";
import { getPool } from "@/lib/relayPool";
import { cacheProfileLocation, getCachedProfileLocation } from "@/lib/profileLocationCache";

function extractLocationFromEvent(event: Event | null | undefined): string | null {
  if (!event) return null;
  if (Array.isArray(event.tags)) {
    for (const tag of event.tags) {
      if (Array.isArray(tag) && tag.length >= 2 && tag[0] === "i" && typeof tag[1] === "string") {
        if (tag[1].startsWith("location:")) {
          const value = tag[1].slice("location:".length).trim();
          if (value) {
            return value;
          }
        }
      }
    }
  }

  if (typeof event.content === "string" && event.content.trim()) {
    try {
      const parsed = JSON.parse(event.content) as Record<string, unknown>;
      const value = parsed.location;
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    } catch (error) {
      console.warn("Failed to parse profile content for location", error);
    }
  }

  return null;
}

function normalizeFallback(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function firstFallback(...candidates: Array<unknown>): string | null {
  for (const candidate of candidates) {
    const normalized = normalizeFallback(candidate);
    if (normalized) {
      return normalized;
    }
  }
  return null;
}

export async function resolveProfileLocation(
  pubkey: string | null | undefined,
  relays: string[] | null | undefined,
  ...fallbacks: Array<unknown>
): Promise<string | null> {
  const cached = getCachedProfileLocation();
  const fallback = firstFallback(...fallbacks, cached);
  if (!pubkey) {
    if (fallback) cacheProfileLocation(fallback);
    return fallback;
  }
  const targets = Array.from(new Set((relays ?? []).map((relay) => relay.trim()).filter(Boolean)));
  if (!targets.length) {
    if (fallback) cacheProfileLocation(fallback);
    return fallback;
  }

  const pool = getPool();
  try {
    const event = await pool.get(targets, {
      kinds: [0],
      authors: [pubkey]
    });
    const resolved = extractLocationFromEvent(event);
    if (resolved) {
      cacheProfileLocation(resolved);
      return resolved;
    }
    if (fallback) cacheProfileLocation(fallback);
    return fallback;
  } catch (error) {
    console.warn("Unable to load profile location", error);
    if (fallback) cacheProfileLocation(fallback);
    return fallback;
  }
}
