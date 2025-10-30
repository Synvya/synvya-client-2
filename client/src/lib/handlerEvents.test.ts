/**
 * Tests for NIP-89 handler event builders
 */

import { describe, it, expect } from "vitest";
import {
  buildHandlerInfo,
  buildHandlerRecommendation,
  buildDeletionEvent,
  buildDmRelayEvent,
  SYNVYA_HANDLER_D_IDENTIFIER,
} from "./handlerEvents";

describe("handlerEvents", () => {
  const testPubkey = "5934469ecbac6d964c967e1c7ca30df9e320c4b6945d5c867da55e6ed99dcddc";
  const testRelay = "wss://relay.damus.io";

  describe("buildHandlerInfo", () => {
    it("builds a valid kind 31990 event template", () => {
      const event = buildHandlerInfo(testPubkey);

      expect(event.kind).toBe(31990);
      expect(event.content).toBe("");
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    it("includes the correct d-identifier tag", () => {
      const event = buildHandlerInfo(testPubkey);

      const dTag = event.tags.find((tag) => tag[0] === "d");
      expect(dTag).toBeDefined();
      expect(dTag?.[1]).toBe(SYNVYA_HANDLER_D_IDENTIFIER);
    });

    it("includes k tags for both reservation event kinds", () => {
      const event = buildHandlerInfo(testPubkey);

      const kTags = event.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(2);
      
      const kinds = kTags.map((tag) => tag[1]);
      expect(kinds).toContain("32101");
      expect(kinds).toContain("32102");
    });

    it("has empty content", () => {
      const event = buildHandlerInfo(testPubkey);
      expect(event.content).toBe("");
    });

    it("creates a timestamp close to current time", () => {
      const before = Math.floor(Date.now() / 1000);
      const event = buildHandlerInfo(testPubkey);
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });
  });

  describe("buildHandlerRecommendation", () => {
    it("builds a valid kind 31989 event template for kind 32101", () => {
      const event = buildHandlerRecommendation(testPubkey, "32101", testRelay);

      expect(event.kind).toBe(31989);
      expect(event.content).toBe("");
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    it("builds a valid kind 31989 event template for kind 32102", () => {
      const event = buildHandlerRecommendation(testPubkey, "32102", testRelay);

      expect(event.kind).toBe(31989);
      expect(event.content).toBe("");
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    it("includes the correct d tag for event kind 32101", () => {
      const event = buildHandlerRecommendation(testPubkey, "32101", testRelay);

      const dTag = event.tags.find((tag) => tag[0] === "d");
      expect(dTag).toBeDefined();
      expect(dTag?.[1]).toBe("32101");
    });

    it("includes the correct d tag for event kind 32102", () => {
      const event = buildHandlerRecommendation(testPubkey, "32102", testRelay);

      const dTag = event.tags.find((tag) => tag[0] === "d");
      expect(dTag).toBeDefined();
      expect(dTag?.[1]).toBe("32102");
    });

    it("includes a correctly formatted a tag", () => {
      const event = buildHandlerRecommendation(testPubkey, "32101", testRelay);

      const aTag = event.tags.find((tag) => tag[0] === "a");
      expect(aTag).toBeDefined();
      expect(aTag?.[1]).toBe(`31990:${testPubkey}:${SYNVYA_HANDLER_D_IDENTIFIER}`);
      expect(aTag?.[2]).toBe(testRelay);
      expect(aTag?.[3]).toBe("all");
    });

    it("uses the provided relay URL in the a tag", () => {
      const customRelay = "wss://custom-relay.example.com";
      const event = buildHandlerRecommendation(testPubkey, "32101", customRelay);

      const aTag = event.tags.find((tag) => tag[0] === "a");
      expect(aTag?.[2]).toBe(customRelay);
    });

    it("has empty content", () => {
      const event = buildHandlerRecommendation(testPubkey, "32101", testRelay);
      expect(event.content).toBe("");
    });

    it("creates a timestamp close to current time", () => {
      const before = Math.floor(Date.now() / 1000);
      const event = buildHandlerRecommendation(testPubkey, "32101", testRelay);
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });

    it("generates different events for different pubkeys", () => {
      const pubkey1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
      const pubkey2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

      const event1 = buildHandlerRecommendation(pubkey1, "32101", testRelay);
      const event2 = buildHandlerRecommendation(pubkey2, "32101", testRelay);

      const aTag1 = event1.tags.find((tag) => tag[0] === "a");
      const aTag2 = event2.tags.find((tag) => tag[0] === "a");

      expect(aTag1?.[1]).toContain(pubkey1);
      expect(aTag2?.[1]).toContain(pubkey2);
      expect(aTag1?.[1]).not.toBe(aTag2?.[1]);
    });
  });

  describe("SYNVYA_HANDLER_D_IDENTIFIER", () => {
    it("is a non-empty string", () => {
      expect(SYNVYA_HANDLER_D_IDENTIFIER).toBeTruthy();
      expect(typeof SYNVYA_HANDLER_D_IDENTIFIER).toBe("string");
    });

    it("has the expected value", () => {
      expect(SYNVYA_HANDLER_D_IDENTIFIER).toBe("synvya-restaurants-v1.0");
    });
  });

  describe("buildDmRelayEvent", () => {
    const testRelays = [
      "wss://relay.damus.io",
      "wss://relay.snort.social",
      "wss://nos.lol"
    ];

    it("builds a valid kind 10050 event template", () => {
      const event = buildDmRelayEvent(testRelays);

      expect(event.kind).toBe(10050);
      expect(event.content).toBe("");
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    it("includes relay tags for each relay URL", () => {
      const event = buildDmRelayEvent(testRelays);

      const relayTags = event.tags.filter((tag) => tag[0] === "relay");
      expect(relayTags).toHaveLength(3);
      expect(relayTags[0][1]).toBe(testRelays[0]);
      expect(relayTags[1][1]).toBe(testRelays[1]);
      expect(relayTags[2][1]).toBe(testRelays[2]);
    });

    it("handles single relay URL", () => {
      const singleRelay = ["wss://relay.damus.io"];
      const event = buildDmRelayEvent(singleRelay);

      const relayTags = event.tags.filter((tag) => tag[0] === "relay");
      expect(relayTags).toHaveLength(1);
      expect(relayTags[0][1]).toBe(singleRelay[0]);
    });

    it("handles empty relay array", () => {
      const event = buildDmRelayEvent([]);

      const relayTags = event.tags.filter((tag) => tag[0] === "relay");
      expect(relayTags).toHaveLength(0);
    });

    it("handles multiple relay URLs", () => {
      const manyRelays = [
        "wss://relay.damus.io",
        "wss://relay.snort.social",
        "wss://nos.lol",
        "wss://relay.nostr.band",
        "wss://purplepag.es"
      ];
      const event = buildDmRelayEvent(manyRelays);

      const relayTags = event.tags.filter((tag) => tag[0] === "relay");
      expect(relayTags).toHaveLength(5);
      manyRelays.forEach((relay, index) => {
        expect(relayTags[index][1]).toBe(relay);
      });
    });

    it("has empty content", () => {
      const event = buildDmRelayEvent(testRelays);
      expect(event.content).toBe("");
    });

    it("creates a timestamp close to current time", () => {
      const before = Math.floor(Date.now() / 1000);
      const event = buildDmRelayEvent(testRelays);
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });
  });

  describe("buildDeletionEvent", () => {
    const testEventId1 = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const testEventId2 = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

    it("builds a valid kind 5 event template", () => {
      const event = buildDeletionEvent([testEventId1]);

      expect(event.kind).toBe(5);
      expect(event.content).toBe("");
      expect(event.created_at).toBeGreaterThan(0);
      expect(event.tags).toBeDefined();
    });

    it("includes e tags for each event ID to delete", () => {
      const event = buildDeletionEvent([testEventId1, testEventId2]);

      const eTags = event.tags.filter((tag) => tag[0] === "e");
      expect(eTags).toHaveLength(2);
      expect(eTags[0][1]).toBe(testEventId1);
      expect(eTags[1][1]).toBe(testEventId2);
    });

    it("includes k tags when event kinds are provided", () => {
      const event = buildDeletionEvent([testEventId1], [31989, 31990]);

      const kTags = event.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(2);
      
      const kinds = kTags.map((tag) => tag[1]);
      expect(kinds).toContain("31989");
      expect(kinds).toContain("31990");
    });

    it("does not include k tags when kinds are not provided", () => {
      const event = buildDeletionEvent([testEventId1]);

      const kTags = event.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(0);
    });

    it("does not include k tags when empty kinds array is provided", () => {
      const event = buildDeletionEvent([testEventId1], []);

      const kTags = event.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(0);
    });

    it("handles single event ID", () => {
      const event = buildDeletionEvent([testEventId1]);

      const eTags = event.tags.filter((tag) => tag[0] === "e");
      expect(eTags).toHaveLength(1);
      expect(eTags[0][1]).toBe(testEventId1);
    });

    it("handles multiple event IDs", () => {
      const eventIds = [testEventId1, testEventId2, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"];
      const event = buildDeletionEvent(eventIds);

      const eTags = event.tags.filter((tag) => tag[0] === "e");
      expect(eTags).toHaveLength(3);
    });

    it("has empty content", () => {
      const event = buildDeletionEvent([testEventId1]);
      expect(event.content).toBe("");
    });

    it("creates a timestamp close to current time", () => {
      const before = Math.floor(Date.now() / 1000);
      const event = buildDeletionEvent([testEventId1]);
      const after = Math.floor(Date.now() / 1000);

      expect(event.created_at).toBeGreaterThanOrEqual(before);
      expect(event.created_at).toBeLessThanOrEqual(after);
    });
  });
});

