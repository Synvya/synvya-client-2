import type { EventTemplate } from "nostr-tools";

/**
 * The d-identifier used for Synvya restaurant reservation handler
 * This is used in both kind 31990 (handler info) and kind 31989 (handler recommendation)
 */
export const SYNVYA_HANDLER_D_IDENTIFIER = "synvya-restaurants-v1.0";

/**
 * Event kinds that the Synvya restaurant handler supports
 */
export const SUPPORTED_RESERVATION_KINDS = ["9901", "9902"] as const;

/**
 * Build a NIP-89 Handler Information event (kind 31990)
 * 
 * This event describes what kinds of events the handler can process.
 * For Synvya restaurants, this includes:
 * - kind 9901: reservation.request
 * - kind 9902: reservation.response
 * 
 * @param restaurantPubkey - The public key of the restaurant
 * @returns EventTemplate for kind 31990
 */
export function buildHandlerInfo(restaurantPubkey: string): EventTemplate {
  return {
    kind: 31990,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", SYNVYA_HANDLER_D_IDENTIFIER],
      ["k", "9901"],
      ["k", "9902"]
    ],
    content: ""
  };
}

/**
 * Build a NIP-89 Handler Recommendation event (kind 31989)
 * 
 * This event recommends a specific handler (31990) for processing
 * a particular event kind. The restaurant publishes two of these:
 * - One recommending itself for kind 9901 (reservation.request)
 * - One recommending itself for kind 9902 (reservation.response)
 * 
 * @param restaurantPubkey - The public key of the restaurant
 * @param eventKind - The event kind this recommendation is for ("9901" or "9902")
 * @param relayUrl - The relay URL to include as a hint for finding the handler
 * @returns EventTemplate for kind 31989
 */
export function buildHandlerRecommendation(
  restaurantPubkey: string,
  eventKind: "9901" | "9902",
  relayUrl: string
): EventTemplate {
  const aTagValue = `31990:${restaurantPubkey}:${SYNVYA_HANDLER_D_IDENTIFIER}`;
  
  return {
    kind: 31989,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ["d", eventKind],
      ["a", aTagValue, relayUrl, "all"]
    ],
    content: ""
  };
}

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
 * Used to clean up NIP-89 handler events when a restaurant changes business type.
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

