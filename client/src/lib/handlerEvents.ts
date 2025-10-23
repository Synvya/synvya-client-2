import type { EventTemplate } from "nostr-tools";

/**
 * The d-identifier used for Synvya restaurant reservation handler
 * This is used in both kind 31990 (handler info) and kind 31989 (handler recommendation)
 */
export const SYNVYA_HANDLER_D_IDENTIFIER = "synvya-restaurants-v1.0";

/**
 * Event kinds that the Synvya restaurant handler supports
 */
export const SUPPORTED_RESERVATION_KINDS = ["32101", "32102"] as const;

/**
 * Build a NIP-89 Handler Information event (kind 31990)
 * 
 * This event describes what kinds of events the handler can process.
 * For Synvya restaurants, this includes:
 * - kind 32101: reservation.request
 * - kind 32102: reservation.response
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
      ["k", "32101"],
      ["k", "32102"]
    ],
    content: ""
  };
}

/**
 * Build a NIP-89 Handler Recommendation event (kind 31989)
 * 
 * This event recommends a specific handler (31990) for processing
 * a particular event kind. The restaurant publishes two of these:
 * - One recommending itself for kind 32101 (reservation.request)
 * - One recommending itself for kind 32102 (reservation.response)
 * 
 * @param restaurantPubkey - The public key of the restaurant
 * @param eventKind - The event kind this recommendation is for ("32101" or "32102")
 * @param relayUrl - The relay URL to include as a hint for finding the handler
 * @returns EventTemplate for kind 31989
 */
export function buildHandlerRecommendation(
  restaurantPubkey: string,
  eventKind: "32101" | "32102",
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

