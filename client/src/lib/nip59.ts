/**
 * NIP-59: Gift Wrap - Private Message Wrapping
 * 
 * Provides three-layer encryption for private, metadata-hiding messages:
 * 1. Rumor (unsigned event with encrypted content)
 * 2. Seal (kind 13 event wrapping the rumor)
 * 3. Gift Wrap (kind 1059 event addressed to recipient)
 * 
 * This ensures that:
 * - Only the recipient can decrypt the message
 * - No metadata leaks to relays (sender/receiver/content/kind)
 * - Messages use random ephemeral keys for gift wraps
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/59.md
 */

import type { Event, UnsignedEvent } from "nostr-tools";
import {
  createRumor as createRumorLib,
  createSeal as createSealLib,
  createWrap as createWrapLib,
  wrapEvent as wrapEventLib,
  unwrapEvent as unwrapEventLib,
} from "nostr-tools/nip59";
import { encryptMessage, decryptMessage } from "./nip44";

/**
 * A Rumor is an unsigned event with an id.
 * It contains the actual message content (encrypted with NIP-44).
 */
export interface Rumor extends UnsignedEvent {
  id: string;
}

/**
 * Creates a rumor (unsigned event with id) from a partial event template.
 * The rumor will contain the encrypted content but no signature.
 * 
 * @param event - Partial event with kind, content, and tags
 * @param privateKey - Sender's private key (used for id generation)
 * @returns Rumor with id but no signature
 * 
 * @example
 * ```typescript
 * const rumor = createRumor({
 *   kind: 9901, // reservation.request
 *   content: encryptedPayload,
 *   tags: [["p", recipientPubkey]],
 *   created_at: Math.floor(Date.now() / 1000)
 * }, senderPrivateKey);
 * ```
 */
export function createRumor(event: Partial<UnsignedEvent>, privateKey: Uint8Array): Rumor {
  return createRumorLib(event, privateKey);
}

/**
 * Creates a seal (kind 13) event that wraps a rumor.
 * The seal is signed and addressed to the recipient.
 * The rumor is serialized and encrypted in the seal's content.
 * 
 * @param rumor - The rumor to seal
 * @param privateKey - Sender's private key (for signing and encryption)
 * @param recipientPublicKey - Recipient's public key (for encryption)
 * @returns Signed kind 13 seal event
 * 
 * @example
 * ```typescript
 * const seal = createSeal(rumor, senderPrivateKey, recipientPubkey);
 * ```
 */
export function createSeal(
  rumor: Rumor,
  privateKey: Uint8Array,
  recipientPublicKey: string
): Event {
  return createSealLib(rumor, privateKey, recipientPublicKey);
}

/**
 * Creates a gift wrap (kind 1059) that wraps a seal.
 * Uses a random ephemeral key so the sender cannot be identified.
 * The gift wrap is addressed to the recipient via 'p' tag.
 * 
 * @param seal - The seal event to wrap
 * @param recipientPublicKey - Recipient's public key
 * @returns Signed kind 1059 gift wrap event with random ephemeral key
 * 
 * @example
 * ```typescript
 * const giftWrap = createWrap(seal, recipientPubkey);
 * // The gift wrap uses a random key, hiding the true sender
 * ```
 */
export function createWrap(seal: Event, recipientPublicKey: string): Event {
  return createWrapLib(seal, recipientPublicKey);
}

/**
 * One-shot function to wrap an event in all three layers.
 * Convenience function that calls createRumor → createSeal → createWrap.
 * 
 * @param event - Partial event to wrap (should have encrypted content)
 * @param senderPrivateKey - Sender's private key
 * @param recipientPublicKey - Recipient's public key
 * @returns Gift-wrapped event ready to publish
 * 
 * @example
 * ```typescript
 * const giftWrap = wrapEvent({
 *   kind: 9901,
 *   content: encryptedContent,
 *   tags: [["p", recipientPubkey]],
 *   created_at: Math.floor(Date.now() / 1000)
 * }, myPrivateKey, recipientPubkey);
 * 
 * await publishToRelays(giftWrap, relays);
 * ```
 */
export function wrapEvent(
  event: Partial<UnsignedEvent>,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string
): Event {
  return wrapEventLib(event, senderPrivateKey, recipientPublicKey);
}

/**
 * Unwraps a gift-wrapped event (kind 1059) to extract the original rumor.
 * Performs all three decryption steps: unwrap → unseal → extract rumor.
 * 
 * @param wrap - The kind 1059 gift wrap event
 * @param recipientPrivateKey - Recipient's private key (for decryption)
 * @returns The original rumor with encrypted content
 * @throws Error if decryption fails or event is malformed
 * 
 * @example
 * ```typescript
 * const rumor = unwrapEvent(giftWrapEvent, myPrivateKey);
 * 
 * // Rumor contains encrypted content - decrypt with NIP-44
 * const decryptedContent = decrypt(
 *   rumor.content,
 *   getConversationKey(myPrivateKey, rumor.pubkey)
 * );
 * 
 * const payload = JSON.parse(decryptedContent);
 * ```
 */
export function unwrapEvent(wrap: Event, recipientPrivateKey: Uint8Array): Rumor {
  return unwrapEventLib(wrap, recipientPrivateKey);
}

/**
 * Unwraps multiple gift-wrapped events at once.
 * Useful for batch processing incoming messages.
 * 
 * @param wraps - Array of kind 1059 gift wrap events
 * @param recipientPrivateKey - Recipient's private key
 * @returns Array of unwrapped rumors
 * 
 * @example
 * ```typescript
 * const rumors = unwrapManyEvents(giftWrapEvents, myPrivateKey);
 * 
 * for (const rumor of rumors) {
 *   const decrypted = decryptMessage(
 *     rumor.content,
 *     myPrivateKey,
 *     rumor.pubkey
 *   );
 *   console.log('Message:', JSON.parse(decrypted));
 * }
 * ```
 */
export function unwrapManyEvents(wraps: Event[], recipientPrivateKey: Uint8Array): Rumor[] {
  const rumors: Rumor[] = [];
  for (const wrap of wraps) {
    try {
      rumors.push(unwrapEventLib(wrap, recipientPrivateKey));
    } catch (error) {
      // Skip events that fail to unwrap (wrong recipient, corrupted, etc.)
      console.warn("Failed to unwrap event:", wrap.id, error);
    }
  }
  return rumors;
}

/**
 * Helper to create a gift-wrapped message with encrypted content.
 * Handles both NIP-44 encryption and NIP-59 wrapping.
 * 
 * @param kind - Event kind (e.g., 9901 for reservation.request)
 * @param payload - Plain object to encrypt and send
 * @param senderPrivateKey - Sender's private key
 * @param recipientPublicKey - Recipient's public key
 * @param additionalTags - Optional additional tags for the rumor
 * @returns Gift-wrapped event ready to publish
 * 
 * @example
 * ```typescript
 * import { encryptMessage } from './nip44';
 * 
 * const reservationRequest = {
 *   party_size: 2,
 *   iso_time: "2025-10-20T19:00:00-07:00",
 *   notes: "Window seat"
 * };
 * 
 * const encrypted = encryptMessage(
 *   JSON.stringify(reservationRequest),
 *   myPrivateKey,
 *   restaurantPubkey
 * );
 * 
 * const giftWrap = wrapEvent({
 *   kind: 9901,
 *   content: encrypted,
 *   tags: [["p", restaurantPubkey]],
 *   created_at: Math.floor(Date.now() / 1000)
 * }, myPrivateKey, restaurantPubkey);
 * ```
 */
export function createGiftWrappedMessage(
  kind: number,
  payload: unknown,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  additionalTags: string[][] = []
): Event {
  const encrypted = encryptMessage(
    JSON.stringify(payload),
    senderPrivateKey,
    recipientPublicKey
  );

  const tags = [["p", recipientPublicKey], ...additionalTags];

  return wrapEvent(
    {
      kind,
      content: encrypted,
      tags,
      created_at: Math.floor(Date.now() / 1000),
    },
    senderPrivateKey,
    recipientPublicKey
  );
}

/**
 * Helper to unwrap and decrypt a gift-wrapped message.
 * Handles both NIP-59 unwrapping and NIP-44 decryption.
 * 
 * @param wrap - The kind 1059 gift wrap event
 * @param recipientPrivateKey - Recipient's private key
 * @returns Object with unwrapped rumor and decrypted payload
 * @throws Error if unwrapping or decryption fails
 * 
 * @example
 * ```typescript
 * const { rumor, payload } = unwrapAndDecrypt(giftWrapEvent, myPrivateKey);
 * 
 * console.log('Message kind:', rumor.kind);
 * console.log('From:', rumor.pubkey);
 * console.log('Payload:', payload);
 * ```
 */
export function unwrapAndDecrypt<T = unknown>(
  wrap: Event,
  recipientPrivateKey: Uint8Array
): { rumor: Rumor; payload: T } {
  const rumor = unwrapEvent(wrap, recipientPrivateKey);
  const decrypted = decryptMessage(rumor.content, recipientPrivateKey, rumor.pubkey);
  const payload = JSON.parse(decrypted) as T;

  return { rumor, payload };
}

/**
 * Type guard to check if an event is a gift wrap (kind 1059)
 */
export function isGiftWrap(event: Event): boolean {
  return event.kind === 1059;
}

/**
 * Type guard to check if an event is a seal (kind 13)
 */
export function isSeal(event: Event): boolean {
  return event.kind === 13;
}

