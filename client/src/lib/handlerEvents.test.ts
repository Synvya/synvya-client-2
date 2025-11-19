/**
 * Tests for event builders
 */

import { describe, it, expect } from "vitest";
import {
  buildDeletionEvent,
  buildDmRelayEvent,
} from "./handlerEvents";

describe("handlerEvents", () => {
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
      const event = buildDeletionEvent([testEventId1], [0, 1]);

      const kTags = event.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(2);
      
      const kinds = kTags.map((tag) => tag[1]);
      expect(kinds).toContain("0");
      expect(kinds).toContain("1");
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

