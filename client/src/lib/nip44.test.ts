/**
 * Tests for NIP-44 encryption/decryption
 */

import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  getConversationKey,
  encrypt,
  decrypt,
  encryptMessage,
  decryptMessage,
} from "./nip44";

describe("nip44", () => {
  describe("getConversationKey", () => {
    it("derives a conversation key from private and public keys", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const conversationKey = getConversationKey(alicePrivateKey, bobPublicKey);

      expect(conversationKey).toBeInstanceOf(Uint8Array);
      expect(conversationKey.length).toBe(32);
    });

    it("derives the same conversation key for both parties", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const alicePublicKey = getPublicKey(alicePrivateKey);
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const aliceToBob = getConversationKey(alicePrivateKey, bobPublicKey);
      const bobToAlice = getConversationKey(bobPrivateKey, alicePublicKey);

      expect(aliceToBob).toEqual(bobToAlice);
    });

    it("derives different keys for different key pairs", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const charliePrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);
      const charliePublicKey = getPublicKey(charliePrivateKey);

      const aliceToBob = getConversationKey(alicePrivateKey, bobPublicKey);
      const aliceToCharlie = getConversationKey(alicePrivateKey, charliePublicKey);

      expect(aliceToBob).not.toEqual(aliceToCharlie);
    });
  });

  describe("encrypt and decrypt", () => {
    it("encrypts and decrypts a simple message", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const conversationKey = getConversationKey(alicePrivateKey, bobPublicKey);
      const plaintext = "Hello, Bob!";

      const encrypted = encrypt(plaintext, conversationKey);
      const decrypted = decrypt(encrypted, conversationKey);

      expect(decrypted).toBe(plaintext);
    });

    it("encrypts to base64 string", () => {
      const conversationKey = generateSecretKey(); // Use as conversation key
      const plaintext = "Test message";

      const encrypted = encrypt(plaintext, conversationKey);

      expect(typeof encrypted).toBe("string");
      expect(encrypted.length).toBeGreaterThan(0);
      // Base64 should only contain valid characters
      expect(encrypted).toMatch(/^[A-Za-z0-9+/=]+$/);
    });

    it("produces different ciphertexts for the same plaintext (random nonce)", () => {
      const conversationKey = generateSecretKey();
      const plaintext = "Same message";

      const encrypted1 = encrypt(plaintext, conversationKey);
      const encrypted2 = encrypt(plaintext, conversationKey);

      expect(encrypted1).not.toBe(encrypted2);
      // But both should decrypt to the same plaintext
      expect(decrypt(encrypted1, conversationKey)).toBe(plaintext);
      expect(decrypt(encrypted2, conversationKey)).toBe(plaintext);
    });

    it("rejects empty string (NIP-44 spec requires 1-65535 bytes)", () => {
      const conversationKey = generateSecretKey();
      const plaintext = "";

      // NIP-44 spec requires plaintext to be between 1 and 65535 bytes
      expect(() => encrypt(plaintext, conversationKey)).toThrow();
    });

    it("handles unicode characters", () => {
      const conversationKey = generateSecretKey();
      const plaintext = "Hello 👋 World 🌍 emoji test 🎉";

      const encrypted = encrypt(plaintext, conversationKey);
      const decrypted = decrypt(encrypted, conversationKey);

      expect(decrypted).toBe(plaintext);
    });

    it("handles long messages", () => {
      const conversationKey = generateSecretKey();
      const plaintext = "A".repeat(10000); // 10KB message

      const encrypted = encrypt(plaintext, conversationKey);
      const decrypted = decrypt(encrypted, conversationKey);

      expect(decrypted).toBe(plaintext);
    });

    it("handles JSON payloads", () => {
      const conversationKey = generateSecretKey();
      const payload = {
        party_size: 4,
        iso_time: "2025-10-17T19:00:00-07:00",
        notes: "Window seat if possible",
      };
      const plaintext = JSON.stringify(payload);

      const encrypted = encrypt(plaintext, conversationKey);
      const decrypted = decrypt(encrypted, conversationKey);

      expect(JSON.parse(decrypted)).toEqual(payload);
    });

    it("throws error on invalid ciphertext", () => {
      const conversationKey = generateSecretKey();
      const invalidCiphertext = "invalid-base64-!@#$%";

      expect(() => decrypt(invalidCiphertext, conversationKey)).toThrow();
    });

    it("throws error when using wrong conversation key", () => {
      const correctKey = generateSecretKey();
      const wrongKey = generateSecretKey();
      const plaintext = "Secret message";

      const encrypted = encrypt(plaintext, correctKey);

      expect(() => decrypt(encrypted, wrongKey)).toThrow();
    });
  });

  describe("encryptMessage and decryptMessage", () => {
    it("encrypts and decrypts messages between two parties", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const alicePublicKey = getPublicKey(alicePrivateKey);
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const message = "Hello from Alice to Bob!";

      // Alice encrypts message to Bob
      const encrypted = encryptMessage(message, alicePrivateKey, bobPublicKey);

      // Bob decrypts message from Alice
      const decrypted = decryptMessage(encrypted, bobPrivateKey, alicePublicKey);

      expect(decrypted).toBe(message);
    });

    it("supports bidirectional communication", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const alicePublicKey = getPublicKey(alicePrivateKey);
      const bobPublicKey = getPublicKey(bobPrivateKey);

      // Alice to Bob
      const aliceMessage = "Hi Bob!";
      const aliceEncrypted = encryptMessage(aliceMessage, alicePrivateKey, bobPublicKey);
      const aliceDecrypted = decryptMessage(aliceEncrypted, bobPrivateKey, alicePublicKey);
      expect(aliceDecrypted).toBe(aliceMessage);

      // Bob to Alice
      const bobMessage = "Hi Alice!";
      const bobEncrypted = encryptMessage(bobMessage, bobPrivateKey, alicePublicKey);
      const bobDecrypted = decryptMessage(bobEncrypted, alicePrivateKey, bobPublicKey);
      expect(bobDecrypted).toBe(bobMessage);
    });

    it("handles reservation request payload", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      const reservationRequest = JSON.stringify({
        party_size: 2,
        iso_time: "2025-10-17T19:00:00-07:00",
        notes: "Window seat if possible",
        contact: {
          name: "Alejandro",
          phone: "+1-555-0100",
        },
      });

      // Concierge encrypts request to restaurant
      const encrypted = encryptMessage(
        reservationRequest,
        conciergePrivateKey,
        restaurantPublicKey
      );

      // Restaurant decrypts request from concierge
      const decrypted = decryptMessage(
        encrypted,
        restaurantPrivateKey,
        conciergePublicKey
      );

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(reservationRequest));
    });

    it("handles reservation response payload", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const reservationResponse = JSON.stringify({
        status: "confirmed",
        iso_time: "2025-10-17T19:00:00-07:00",
        table: "A4",
        message: "See you at 7pm!",
      });

      // Restaurant encrypts response to concierge
      const encrypted = encryptMessage(
        reservationResponse,
        restaurantPrivateKey,
        conciergePublicKey
      );

      // Concierge decrypts response from restaurant
      const decrypted = decryptMessage(
        encrypted,
        conciergePrivateKey,
        restaurantPublicKey
      );

      expect(JSON.parse(decrypted)).toEqual(JSON.parse(reservationResponse));
    });

    it("fails when wrong recipient tries to decrypt", () => {
      const alicePrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const charliePrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);
      const alicePublicKey = getPublicKey(alicePrivateKey);

      const message = "Secret message for Bob only";
      const encrypted = encryptMessage(message, alicePrivateKey, bobPublicKey);

      // Charlie shouldn't be able to decrypt Alice's message to Bob
      expect(() =>
        decryptMessage(encrypted, charliePrivateKey, alicePublicKey)
      ).toThrow();
    });
  });

  describe("integration scenarios", () => {
    it("simulates AI concierge to restaurant message flow", () => {
      // Generate keys for AI Concierge and Restaurant
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      // Step 1: Concierge creates reservation request
      const requestPayload = {
        party_size: 4,
        iso_time: "2025-10-20T20:00:00-07:00",
        notes: "Celebrating an anniversary",
        contact: {
          name: "John Doe",
          email: "john@example.com",
        },
      };

      // Step 2: Encrypt request (this will be part of rumor content)
      const encryptedRequest = encryptMessage(
        JSON.stringify(requestPayload),
        conciergePrivateKey,
        restaurantPublicKey
      );

      // Step 3: Restaurant receives and decrypts
      const decryptedRequest = decryptMessage(
        encryptedRequest,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const parsedRequest = JSON.parse(decryptedRequest);

      expect(parsedRequest).toEqual(requestPayload);

      // Step 4: Restaurant creates response
      const responsePayload = {
        status: "confirmed",
        iso_time: "2025-10-20T20:00:00-07:00",
        table: "12",
        message: "Confirmed for 4 guests at 8pm. Happy anniversary!",
      };

      // Step 5: Encrypt response
      const encryptedResponse = encryptMessage(
        JSON.stringify(responsePayload),
        restaurantPrivateKey,
        conciergePublicKey
      );

      // Step 6: Concierge receives and decrypts
      const decryptedResponse = decryptMessage(
        encryptedResponse,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const parsedResponse = JSON.parse(decryptedResponse);

      expect(parsedResponse).toEqual(responsePayload);
    });
  });
});

