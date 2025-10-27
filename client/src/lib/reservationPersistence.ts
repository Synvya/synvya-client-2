/**
 * Reservation Persistence Layer
 * 
 * Handles persisting reservation messages to localStorage so that
 * reservation status persists across app sessions.
 */

import type { ReservationMessage } from "@/services/reservationService";

const STORAGE_KEY = "synvya:reservation:messages";
const STORAGE_VERSION = 1;

interface PersistedData {
  version: number;
  messages: ReservationMessage[];
  lastUpdated: number;
}

/**
 * Saves reservation messages to localStorage
 */
export function persistReservationMessages(messages: ReservationMessage[]): void {
  try {
    const data: PersistedData = {
      version: STORAGE_VERSION,
      messages,
      lastUpdated: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error("Failed to persist reservation messages:", error);
  }
}

/**
 * Loads reservation messages from localStorage
 */
export function loadPersistedReservationMessages(): ReservationMessage[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return [];
    }

    const data: PersistedData = JSON.parse(stored);
    
    // Check version compatibility
    if (data.version !== STORAGE_VERSION) {
      console.warn("Storage version mismatch, clearing persisted data");
      clearPersistedReservationMessages();
      return [];
    }

    return data.messages || [];
  } catch (error) {
    console.error("Failed to load persisted reservation messages:", error);
    return [];
  }
}

/**
 * Clears persisted reservation messages from localStorage
 */
export function clearPersistedReservationMessages(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error("Failed to clear persisted reservation messages:", error);
  }
}

/**
 * Merges new messages with existing messages, deduplicating by rumor ID
 */
export function mergeReservationMessages(
  existing: ReservationMessage[],
  incoming: ReservationMessage[]
): ReservationMessage[] {
  const merged = [...existing];
  const existingIds = new Set(existing.map(m => m.rumor.id));

  for (const message of incoming) {
    if (!existingIds.has(message.rumor.id)) {
      merged.push(message);
      existingIds.add(message.rumor.id);
    }
  }

  // Sort by timestamp (newest first)
  return merged.sort((a, b) => b.rumor.created_at - a.rumor.created_at);
}

