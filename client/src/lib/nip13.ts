/**
 * NIP-13: Proof of Work
 * 
 * Provides utilities for mining proof-of-work on Nostr events.
 * PoW adds computational cost to event creation, providing anti-spam protection.
 * 
 * The difficulty is measured by counting leading zero bits in the event ID.
 * A nonce tag is added and incremented until the target difficulty is achieved.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/13.md
 */

import { getEventHash, getPublicKey, type EventTemplate, type UnsignedEvent } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";

/**
 * Result of mining an event with PoW
 */
export interface MinedEvent {
  event: UnsignedEvent;
  nonce: number;
  difficulty: number;
}

/**
 * Options for mining PoW
 */
export interface MineOptions {
  /** Target difficulty (number of leading zero bits) */
  targetDifficulty: number;
  /** Maximum number of iterations before giving up (default: 1 million) */
  maxIterations?: number;
  /** Starting nonce value (default: 0) */
  startNonce?: number;
  /** Callback for progress updates (called every N iterations) */
  onProgress?: (nonce: number, difficulty: number) => void;
  /** How often to call onProgress (default: 10000) */
  progressInterval?: number;
}

/**
 * Counts the number of leading zero bits in a hex string.
 * 
 * @param hex - Hex string (event ID)
 * @returns Number of leading zero bits
 * 
 * @example
 * ```typescript
 * const difficulty = countLeadingZeroBits("000abc123...");
 * // Returns number of leading zero bits
 * ```
 */
export function countLeadingZeroBits(hex: string): number {
  let count = 0;

  for (let i = 0; i < hex.length; i++) {
    const nibble = parseInt(hex[i], 16);

    if (nibble === 0) {
      count += 4;
      continue;
    }

    // Count leading zeros in this nibble
    if (nibble < 8) count += 1;
    if (nibble < 4) count += 1;
    if (nibble < 2) count += 1;

    break;
  }

  return count;
}

/**
 * Calculates the PoW difficulty of an event ID.
 * 
 * @param eventId - The event ID (hex string)
 * @returns Difficulty (number of leading zero bits)
 * 
 * @example
 * ```typescript
 * const difficulty = getEventDifficulty(event.id);
 * console.log(`Event has ${difficulty} bits of PoW`);
 * ```
 */
export function getEventDifficulty(eventId: string): number {
  return countLeadingZeroBits(eventId);
}

/**
 * Checks if an event meets the minimum PoW difficulty requirement.
 * 
 * @param eventId - The event ID to check
 * @param minDifficulty - Minimum required difficulty
 * @returns True if the event meets or exceeds the difficulty
 * 
 * @example
 * ```typescript
 * if (hasValidPoW(event.id, 20)) {
 *   console.log('Event has sufficient PoW');
 * }
 * ```
 */
export function hasValidPoW(eventId: string, minDifficulty: number): boolean {
  return getEventDifficulty(eventId) >= minDifficulty;
}

/**
 * Extracts the nonce and target difficulty from an event's tags.
 * 
 * @param event - The event to check
 * @returns Object with nonce and target difficulty, or null if no nonce tag
 * 
 * @example
 * ```typescript
 * const pow = getPowTag(event);
 * if (pow) {
 *   console.log(`Nonce: ${pow.nonce}, Target: ${pow.targetDifficulty}`);
 * }
 * ```
 */
export function getPowTag(event: { tags: string[][] }): { nonce: number; targetDifficulty: number } | null {
  const nonceTag = event.tags.find((tag) => tag[0] === "nonce");
  if (!nonceTag) return null;

  const nonce = parseInt(nonceTag[1], 10);
  const targetDifficulty = nonceTag[2] ? parseInt(nonceTag[2], 10) : 0;

  return {
    nonce: isNaN(nonce) ? 0 : nonce,
    targetDifficulty: isNaN(targetDifficulty) ? 0 : targetDifficulty,
  };
}

/**
 * Mines proof-of-work on an event template by finding a nonce that achieves
 * the target difficulty.
 * 
 * WARNING: This is CPU-intensive and may freeze the browser if difficulty is too high.
 * Consider using a Web Worker for mining in production.
 * 
 * @param template - Event template to mine
 * @param privateKey - Private key to sign the final event
 * @param options - Mining options
 * @returns Mined and signed event
 * @throws Error if target difficulty not reached within maxIterations
 * 
 * @example
 * ```typescript
 * const minedEvent = await mineEvent(
 *   {
 *     kind: 9902,
 *     content: "encrypted-response",
 *     tags: [["p", recipientPubkey]],
 *     created_at: Math.floor(Date.now() / 1000)
 *   },
 *   myPrivateKey,
 *   { targetDifficulty: 20 }
 * );
 * 
 * console.log(`Mined with difficulty ${minedEvent.difficulty}`);
 * await publishToRelays(minedEvent.event, relays);
 * ```
 */
export async function mineEvent(
  template: EventTemplate,
  privateKey: Uint8Array,
  options: MineOptions
): Promise<{ event: ReturnType<typeof finalizeEvent>; nonce: number; difficulty: number }> {
  const {
    targetDifficulty,
    maxIterations = 1_000_000,
    startNonce = 0,
    onProgress,
    progressInterval = 10_000,
  } = options;

  // Derive the pubkey from private key
  const pubkey = getPublicKey(privateKey);

  let nonce = startNonce;
  let bestDifficulty = 0;
  let progressCalled = false;

  for (let i = 0; i < maxIterations; i++) {
    // Create unsigned event with current nonce
    const tags = [
      ...template.tags,
      ["nonce", nonce.toString(), targetDifficulty.toString()],
    ];

    const unsignedEvent: UnsignedEvent = {
      kind: template.kind,
      created_at: template.created_at,
      tags,
      content: template.content,
      pubkey,
    };

    // Calculate event ID with this nonce
    const eventId = getEventHash(unsignedEvent);
    const difficulty = getEventDifficulty(eventId);

    if (difficulty > bestDifficulty) {
      bestDifficulty = difficulty;
    }

    // Check if we've reached target difficulty
    if (difficulty >= targetDifficulty) {
      // Ensure progress callback is called at least once
      if (onProgress && !progressCalled) {
        onProgress(nonce, bestDifficulty);
      }
      
      // Finalize with correct signature
      const finalEvent = finalizeEvent(
        {
          kind: template.kind,
          created_at: template.created_at,
          tags,
          content: template.content,
        },
        privateKey
      );

      return {
        event: finalEvent,
        nonce,
        difficulty,
      };
    }

    // Progress callback
    if (onProgress && i % progressInterval === 0) {
      onProgress(nonce, bestDifficulty);
      progressCalled = true;
    }

    nonce++;
  }

  throw new Error(
    `Failed to mine event with difficulty ${targetDifficulty} after ${maxIterations} iterations. Best: ${bestDifficulty}`
  );
}

/**
 * Mines PoW without signing (for use with gift wrap where signing happens elsewhere).
 * Returns the unsigned event with nonce tag.
 * 
 * @param template - Event template to mine
 * @param pubkey - Public key (hex) to use for hash calculation
 * @param options - Mining options
 * @returns Unsigned event template with nonce tag
 * 
 * @example
 * ```typescript
 * const minedTemplate = await mineEventUnsigned(
 *   {
 *     kind: 9901,
 *     content: encrypted,
 *     tags: [["p", recipientPubkey]],
 *     created_at: Math.floor(Date.now() / 1000)
 *   },
 *   myPublicKey,
 *   { targetDifficulty: 18 }
 * );
 * 
 * // Use the mined template in gift wrap
 * const giftWrap = wrapEvent(minedTemplate, myPrivateKey, recipientPubkey);
 * ```
 */
export async function mineEventUnsigned(
  template: EventTemplate,
  pubkey: string,
  options: MineOptions
): Promise<{ template: EventTemplate; nonce: number; difficulty: number }> {
  const {
    targetDifficulty,
    maxIterations = 1_000_000,
    startNonce = 0,
    onProgress,
    progressInterval = 10_000,
  } = options;

  let nonce = startNonce;
  let bestDifficulty = 0;
  let progressCalled = false;

  for (let i = 0; i < maxIterations; i++) {
    const tags = [
      ...template.tags,
      ["nonce", nonce.toString(), targetDifficulty.toString()],
    ];

    const unsignedEvent: UnsignedEvent = {
      kind: template.kind,
      created_at: template.created_at,
      tags,
      content: template.content,
      pubkey,
    };

    const eventId = getEventHash(unsignedEvent);
    const difficulty = getEventDifficulty(eventId);

    if (difficulty > bestDifficulty) {
      bestDifficulty = difficulty;
    }

    if (difficulty >= targetDifficulty) {
      // Ensure progress callback is called at least once
      if (onProgress && !progressCalled) {
        onProgress(nonce, bestDifficulty);
      }
      
      return {
        template: {
          kind: template.kind,
          created_at: template.created_at,
          tags,
          content: template.content,
        },
        nonce,
        difficulty,
      };
    }

    if (onProgress && i % progressInterval === 0) {
      onProgress(nonce, bestDifficulty);
      progressCalled = true;
    }

    nonce++;
  }

  throw new Error(
    `Failed to mine event with difficulty ${targetDifficulty} after ${maxIterations} iterations. Best: ${bestDifficulty}`
  );
}

/**
 * Estimates the time required to mine a given difficulty (very rough estimate).
 * Based on average hash rate and assuming uniform distribution.
 * 
 * @param targetDifficulty - Target difficulty in bits
 * @param hashesPerSecond - Estimated hashing rate (default: 100,000/sec)
 * @returns Estimated time in seconds
 * 
 * @example
 * ```typescript
 * const estimatedSeconds = estimateMiningTime(20);
 * console.log(`Estimated time: ${estimatedSeconds}s`);
 * ```
 */
export function estimateMiningTime(targetDifficulty: number, hashesPerSecond = 100_000): number {
  // Expected number of hashes = 2^difficulty
  const expectedHashes = Math.pow(2, targetDifficulty);
  return expectedHashes / hashesPerSecond;
}

/**
 * Validates that an event's claimed PoW matches its actual difficulty.
 * 
 * @param event - Event to validate
 * @returns True if the event's nonce tag matches its actual difficulty
 * 
 * @example
 * ```typescript
 * if (validatePow(event)) {
 *   console.log('PoW is valid');
 * } else {
 *   console.log('PoW is invalid or missing');
 * }
 * ```
 */
export function validatePow(event: { id: string; tags: string[][] }): boolean {
  const powTag = getPowTag(event);
  if (!powTag) return false;

  const actualDifficulty = getEventDifficulty(event.id);
  return actualDifficulty >= powTag.targetDifficulty;
}

