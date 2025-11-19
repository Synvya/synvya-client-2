import type { EventTemplate } from "nostr-tools";

/**
 * Build a NIP-17 DM Relay event (kind 10050)
 * 
 * This event indicates the user's preferred relays to receive DMs.
 * According to NIP-17, this event MUST include a list of relay tags with relay URIs.
 * 
 * @param relayUrls - Array of relay URLs to include as preferred DM relays
 * @returns EventTemplate for kind 10050
 */
export function buildDmRelayEvent(relayUrls: string[]): EventTemplate {
  const tags: string[][] = relayUrls.map((url) => ["relay", url]);
  
  return {
    kind: 10050,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ""
  };
}

/**
 * Build a NIP-09 Event Deletion event (kind 5)
 * 
 * This event requests deletion of one or more previously published events.
 * 
 * @param eventIds - Array of event IDs to delete
 * @param eventKinds - Optional array of event kinds being deleted (for additional context)
 * @returns EventTemplate for kind 5
 */
export function buildDeletionEvent(
  eventIds: string[],
  eventKinds?: number[]
): EventTemplate {
  const tags: string[][] = eventIds.map((id) => ["e", id]);
  
  if (eventKinds && eventKinds.length > 0) {
    eventKinds.forEach((kind) => {
      tags.push(["k", kind.toString()]);
    });
  }
  
  return {
    kind: 5,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: ""
  };
}

