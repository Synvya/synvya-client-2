/**
 * NIP-44: Versioned Encryption for Nostr Messages
 * 
 * Provides authenticated encryption for direct messages and rumor content.
 * Uses xchacha20-poly1305 for encryption and HKDF-SHA256 for key derivation.
 * 
 * @see https://github.com/nostr-protocol/nips/blob/master/44.md
 */

import { getConversationKey as getConversationKeyFromLib, encrypt as encryptLib, decrypt as decryptLib } from "nostr-tools/nip44";

/**
 * Derives a shared conversation key from a private key and public key using ECDH + HKDF.
 * This key is used for encrypting/decrypting messages between two parties.
 * 
 * @param privateKey - The sender's/receiver's 32-byte private key
 * @param publicKey - The other party's 32-byte hex public key
 * @returns 32-byte conversation key
 * 
 * @example
 * ```typescript
 * const myPrivateKey = new Uint8Array(32); // Your private key
 * const theirPublicKey = "abc123..."; // Their public key (64-char hex)
 * const conversationKey = getConversationKey(myPrivateKey, theirPublicKey);
 * ```
 */
export function getConversationKey(privateKey: Uint8Array, publicKey: string): Uint8Array {
  return getConversationKeyFromLib(privateKey, publicKey);
}

/**
 * Encrypts plaintext using NIP-44 v2 encryption.
 * Returns base64-encoded payload: [version_byte][nonce][ciphertext][mac]
 * 
 * @param plaintext - The message to encrypt (UTF-8 string)
 * @param conversationKey - 32-byte shared key from getConversationKey()
 * @param nonce - Optional 32-byte nonce (randomly generated if not provided)
 * @returns Base64-encoded encrypted payload
 * 
 * @example
 * ```typescript
 * const encrypted = encrypt("Hello, world!", conversationKey);
 * // Returns: "AgAB..." (base64)
 * ```
 */
export function encrypt(plaintext: string, conversationKey: Uint8Array, nonce?: Uint8Array): string {
  return encryptLib(plaintext, conversationKey, nonce);
}

/**
 * Decrypts a NIP-44 v2 encrypted payload.
 * 
 * @param payload - Base64-encoded encrypted payload from encrypt()
 * @param conversationKey - 32-byte shared key from getConversationKey()
 * @returns Decrypted plaintext (UTF-8 string)
 * @throws Error if payload is malformed or MAC verification fails
 * 
 * @example
 * ```typescript
 * const decrypted = decrypt("AgAB...", conversationKey);
 * // Returns: "Hello, world!"
 * ```
 */
export function decrypt(payload: string, conversationKey: Uint8Array): string {
  return decryptLib(payload, conversationKey);
}

/**
 * Encrypts a message from sender to recipient.
 * Convenience function that derives the conversation key and encrypts in one call.
 * 
 * @param plaintext - The message to encrypt
 * @param senderPrivateKey - Sender's 32-byte private key
 * @param recipientPublicKey - Recipient's 32-byte hex public key
 * @returns Base64-encoded encrypted payload
 * 
 * @example
 * ```typescript
 * const encrypted = encryptMessage(
 *   "Secret message",
 *   myPrivateKey,
 *   theirPublicKey
 * );
 * ```
 */
export function encryptMessage(
  plaintext: string,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string
): string {
  const conversationKey = getConversationKey(senderPrivateKey, recipientPublicKey);
  return encrypt(plaintext, conversationKey);
}

/**
 * Decrypts a message sent to recipient from sender.
 * Convenience function that derives the conversation key and decrypts in one call.
 * 
 * @param payload - Base64-encoded encrypted payload
 * @param recipientPrivateKey - Recipient's 32-byte private key
 * @param senderPublicKey - Sender's 32-byte hex public key
 * @returns Decrypted plaintext
 * @throws Error if decryption fails
 * 
 * @example
 * ```typescript
 * const decrypted = decryptMessage(
 *   encryptedPayload,
 *   myPrivateKey,
 *   theirPublicKey
 * );
 * ```
 */
export function decryptMessage(
  payload: string,
  recipientPrivateKey: Uint8Array,
  senderPublicKey: string
): string {
  const conversationKey = getConversationKey(recipientPrivateKey, senderPublicKey);
  return decrypt(payload, conversationKey);
}

