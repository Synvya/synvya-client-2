/**
 * Tests for NIP-59 Gift Wrap
 */

import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event } from "nostr-tools";
import {
  createRumor,
  createSeal,
  createWrap,
  wrapEvent,
  unwrapEvent,
  unwrapManyEvents,
  createGiftWrappedMessage,
  unwrapAndDecrypt,
  isGiftWrap,
  isSeal,
  type Rumor,
} from "./nip59";
import { encryptMessage, decryptMessage } from "./nip44";

describe("nip59", () => {
  describe("createRumor", () => {
    it("creates a rumor from a partial event", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const rumor = createRumor(
        {
          kind: 32101,
          content: "encrypted-content",
          tags: [["p", publicKey]],
          created_at: Math.floor(Date.now() / 1000),
        },
        privateKey
      );

      expect(rumor).toHaveProperty("id");
      expect(rumor).toHaveProperty("pubkey");
      expect(rumor).toHaveProperty("kind", 32101);
      expect(rumor).toHaveProperty("content", "encrypted-content");
      expect(rumor).not.toHaveProperty("sig"); // Rumors are unsigned
    });

    it("generates different ids for different content", () => {
      const privateKey = generateSecretKey();

      const rumor1 = createRumor(
        {
          kind: 32101,
          content: "content-1",
          tags: [],
          created_at: 1000,
        },
        privateKey
      );

      const rumor2 = createRumor(
        {
          kind: 32101,
          content: "content-2",
          tags: [],
          created_at: 1000,
        },
        privateKey
      );

      expect(rumor1.id).not.toBe(rumor2.id);
    });
  });

  describe("createSeal", () => {
    it("creates a seal (kind 13) from a rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const rumor = createRumor(
        {
          kind: 32101,
          content: "test",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey
      );

      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);

      expect(seal.kind).toBe(13);
      expect(seal).toHaveProperty("id");
      expect(seal).toHaveProperty("sig"); // Seals are signed
      expect(seal).toHaveProperty("pubkey");
      expect(seal.content).toBeTruthy(); // Contains encrypted rumor
    });
  });

  describe("createWrap", () => {
    it("creates a gift wrap (kind 1059) from a seal", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const rumor = createRumor(
        {
          kind: 32101,
          content: "test",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey
      );

      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
      const wrap = createWrap(seal, recipientPublicKey);

      expect(wrap.kind).toBe(1059);
      expect(wrap).toHaveProperty("id");
      expect(wrap).toHaveProperty("sig");
      expect(wrap.content).toBeTruthy();

      // Check for 'p' tag pointing to recipient
      const pTag = wrap.tags.find((tag) => tag[0] === "p");
      expect(pTag).toBeTruthy();
      expect(pTag?.[1]).toBe(recipientPublicKey);
    });

    it("uses random ephemeral key for gift wrap", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);
      const senderPublicKey = getPublicKey(senderPrivateKey);

      const rumor = createRumor(
        {
          kind: 32101,
          content: "test",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey
      );

      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);
      const wrap = createWrap(seal, recipientPublicKey);

      // Gift wrap should NOT use sender's real pubkey
      expect(wrap.pubkey).not.toBe(senderPublicKey);
    });
  });

  describe("wrapEvent", () => {
    it("performs full three-layer wrapping in one call", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const wrap = wrapEvent(
        {
          kind: 32101,
          content: "test-content",
          tags: [["p", recipientPublicKey]],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey,
        recipientPublicKey
      );

      expect(wrap.kind).toBe(1059);
      expect(wrap).toHaveProperty("id");
      expect(wrap).toHaveProperty("sig");
    });
  });

  describe("unwrapEvent", () => {
    it("unwraps a gift-wrapped event to extract the rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const originalContent = "secret-message";

      const wrap = wrapEvent(
        {
          kind: 32101,
          content: originalContent,
          tags: [["t", "test"]],
          created_at: 1000,
        },
        senderPrivateKey,
        recipientPublicKey
      );

      const rumor = unwrapEvent(wrap, recipientPrivateKey);

      expect(rumor.kind).toBe(32101);
      expect(rumor.content).toBe(originalContent);
      expect(rumor.created_at).toBe(1000);
      expect(rumor.tags).toContainEqual(["t", "test"]);
    });

    it("full wrap/unwrap cycle preserves event data", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const originalEvent = {
        kind: 32102,
        content: "response-content",
        tags: [
          ["e", "parent-event-id", "", "root"],
          ["p", recipientPublicKey],
        ],
        created_at: 1234567890,
      };

      const wrap = wrapEvent(originalEvent, senderPrivateKey, recipientPublicKey);
      const rumor = unwrapEvent(wrap, recipientPrivateKey);

      expect(rumor.kind).toBe(originalEvent.kind);
      expect(rumor.content).toBe(originalEvent.content);
      expect(rumor.created_at).toBe(originalEvent.created_at);
      expect(rumor.tags).toEqual(originalEvent.tags);
      expect(rumor.pubkey).toBe(senderPublicKey);
    });

    it("throws error when wrong recipient tries to unwrap", () => {
      const senderPrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const charliePrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const wrap = wrapEvent(
        {
          kind: 32101,
          content: "for-bob-only",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey,
        bobPublicKey
      );

      // Charlie tries to unwrap a message meant for Bob
      expect(() => unwrapEvent(wrap, charliePrivateKey)).toThrow();
    });
  });

  describe("unwrapManyEvents", () => {
    it("unwraps multiple gift-wrapped events", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const wraps = [
        wrapEvent(
          { kind: 32101, content: "msg-1", tags: [], created_at: 1000 },
          senderPrivateKey,
          recipientPublicKey
        ),
        wrapEvent(
          { kind: 32101, content: "msg-2", tags: [], created_at: 2000 },
          senderPrivateKey,
          recipientPublicKey
        ),
        wrapEvent(
          { kind: 32102, content: "msg-3", tags: [], created_at: 3000 },
          senderPrivateKey,
          recipientPublicKey
        ),
      ];

      const rumors = unwrapManyEvents(wraps, recipientPrivateKey);

      expect(rumors).toHaveLength(3);
      expect(rumors[0].content).toBe("msg-1");
      expect(rumors[1].content).toBe("msg-2");
      expect(rumors[2].content).toBe("msg-3");
    });

    it("skips events that fail to unwrap", () => {
      const senderPrivateKey = generateSecretKey();
      const bobPrivateKey = generateSecretKey();
      const charliePrivateKey = generateSecretKey();
      const bobPublicKey = getPublicKey(bobPrivateKey);

      const wraps = [
        wrapEvent(
          { kind: 32101, content: "for-bob-1", tags: [], created_at: 1000 },
          senderPrivateKey,
          bobPublicKey
        ),
        wrapEvent(
          { kind: 32101, content: "for-bob-2", tags: [], created_at: 2000 },
          senderPrivateKey,
          bobPublicKey
        ),
      ];

      // Charlie tries to unwrap Bob's messages - should return empty array
      const rumors = unwrapManyEvents(wraps, charliePrivateKey);
      expect(rumors).toHaveLength(0);
    });
  });

  describe("createGiftWrappedMessage", () => {
    it("creates a gift-wrapped message with encrypted payload", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const payload = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat",
      };

      const wrap = createGiftWrappedMessage(
        32101,
        payload,
        senderPrivateKey,
        recipientPublicKey
      );

      expect(wrap.kind).toBe(1059);
      expect(wrap).toHaveProperty("id");
      expect(wrap).toHaveProperty("sig");
    });

    it("includes additional tags in the rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const payload = { test: "data" };
      const additionalTags = [
        ["e", "parent-id", "", "root"],
        ["t", "reservation"],
      ];

      const wrap = createGiftWrappedMessage(
        32101,
        payload,
        senderPrivateKey,
        recipientPublicKey,
        additionalTags
      );

      const rumor = unwrapEvent(wrap, recipientPrivateKey);

      expect(rumor.tags).toContainEqual(["e", "parent-id", "", "root"]);
      expect(rumor.tags).toContainEqual(["t", "reservation"]);
    });
  });

  describe("unwrapAndDecrypt", () => {
    it("unwraps and decrypts a gift-wrapped message", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const payload = {
        party_size: 4,
        iso_time: "2025-10-20T20:00:00-07:00",
        notes: "Anniversary dinner",
      };

      const wrap = createGiftWrappedMessage(
        32101,
        payload,
        senderPrivateKey,
        recipientPublicKey
      );

      const { rumor, payload: decryptedPayload } = unwrapAndDecrypt<typeof payload>(
        wrap,
        recipientPrivateKey
      );

      expect(rumor.kind).toBe(32101);
      expect(rumor.pubkey).toBe(senderPublicKey);
      expect(decryptedPayload).toEqual(payload);
    });
  });

  describe("type guards", () => {
    it("isGiftWrap identifies kind 1059 events", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const wrap = wrapEvent(
        { kind: 32101, content: "test", tags: [], created_at: 1000 },
        senderPrivateKey,
        recipientPublicKey
      );

      expect(isGiftWrap(wrap)).toBe(true);

      const regularEvent: Event = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
        pubkey: getPublicKey(senderPrivateKey),
        id: "test-id",
        sig: "test-sig",
      };

      expect(isGiftWrap(regularEvent)).toBe(false);
    });

    it("isSeal identifies kind 13 events", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const rumor = createRumor(
        { kind: 32101, content: "test", tags: [], created_at: 1000 },
        senderPrivateKey
      );

      const seal = createSeal(rumor, senderPrivateKey, recipientPublicKey);

      expect(isSeal(seal)).toBe(true);

      const regularEvent: Event = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
        pubkey: getPublicKey(senderPrivateKey),
        id: "test-id",
        sig: "test-sig",
      };

      expect(isSeal(regularEvent)).toBe(false);
    });
  });

  describe("integration with NIP-44", () => {
    it("full encryption and wrapping flow for reservation request", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      // Step 1: Concierge creates reservation request payload
      const requestPayload = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat if possible",
        contact: {
          name: "Alejandro",
          email: "alejandro@example.com",
        },
      };

      // Step 2: Encrypt the payload with NIP-44
      const encrypted = encryptMessage(
        JSON.stringify(requestPayload),
        conciergePrivateKey,
        restaurantPublicKey
      );

      // Step 3: Wrap in NIP-59 gift wrap
      const wrap = wrapEvent(
        {
          kind: 32101,
          content: encrypted,
          tags: [["p", restaurantPublicKey]],
          created_at: Math.floor(Date.now() / 1000),
        },
        conciergePrivateKey,
        restaurantPublicKey
      );

      // Step 4: Restaurant receives and unwraps
      const rumor = unwrapEvent(wrap, restaurantPrivateKey);

      expect(rumor.kind).toBe(32101);
      expect(rumor.pubkey).toBe(conciergePublicKey);

      // Step 5: Restaurant decrypts the content
      const decrypted = decryptMessage(rumor.content, restaurantPrivateKey, rumor.pubkey);
      const parsed = JSON.parse(decrypted);

      expect(parsed).toEqual(requestPayload);
    });

    it("convenience function handles encryption and wrapping", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      const requestPayload = {
        party_size: 4,
        iso_time: "2025-10-20T20:00:00-07:00",
      };

      // One-shot: encrypt and wrap
      const wrap = createGiftWrappedMessage(
        32101,
        requestPayload,
        conciergePrivateKey,
        restaurantPublicKey
      );

      // One-shot: unwrap and decrypt
      const { payload } = unwrapAndDecrypt<typeof requestPayload>(
        wrap,
        restaurantPrivateKey
      );

      expect(payload).toEqual(requestPayload);
    });

    it("bidirectional encrypted messaging (request and response)", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      // Concierge sends request
      const request = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const requestWrap = createGiftWrappedMessage(
        32101,
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const { payload: receivedRequest } = unwrapAndDecrypt(
        requestWrap,
        restaurantPrivateKey
      );

      expect(receivedRequest).toEqual(request);

      // Restaurant sends response
      const response = {
        status: "confirmed",
        iso_time: "2025-10-20T19:00:00-07:00",
        message: "See you then!",
      };

      const responseWrap = createGiftWrappedMessage(
        32102,
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const { payload: receivedResponse } = unwrapAndDecrypt(
        responseWrap,
        conciergePrivateKey
      );

      expect(receivedResponse).toEqual(response);
    });
  });
});

