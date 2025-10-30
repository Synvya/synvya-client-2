/**
 * Tests for NIP-13 Proof of Work
 */

import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { EventTemplate } from "nostr-tools";
import {
  countLeadingZeroBits,
  getEventDifficulty,
  hasValidPoW,
  getPowTag,
  mineEvent,
  mineEventUnsigned,
  estimateMiningTime,
  validatePow,
} from "./nip13";

describe("nip13", () => {
  describe("countLeadingZeroBits", () => {
    it("counts leading zero bits correctly", () => {
      expect(countLeadingZeroBits("0000")).toBe(16);
      expect(countLeadingZeroBits("000f")).toBe(12);
      expect(countLeadingZeroBits("00ff")).toBe(8);
      expect(countLeadingZeroBits("0fff")).toBe(4);
      expect(countLeadingZeroBits("ffff")).toBe(0);
    });

    it("handles partial nibbles correctly", () => {
      expect(countLeadingZeroBits("1")).toBe(3); // 0001 = 3 leading zeros
      expect(countLeadingZeroBits("2")).toBe(2); // 0010 = 2 leading zeros
      expect(countLeadingZeroBits("3")).toBe(2); // 0011 = 2 leading zeros
      expect(countLeadingZeroBits("4")).toBe(1); // 0100 = 1 leading zero
      expect(countLeadingZeroBits("7")).toBe(1); // 0111 = 1 leading zero
      expect(countLeadingZeroBits("8")).toBe(0); // 1000 = 0 leading zeros
    });

    it("handles full event ID length strings", () => {
      const eventId = "000abc" + "f".repeat(58); // 64 char hex
      expect(countLeadingZeroBits(eventId)).toBe(12);
    });

    it("handles all zeros", () => {
      expect(countLeadingZeroBits("0".repeat(64))).toBe(256);
    });

    it("handles mixed case hex", () => {
      expect(countLeadingZeroBits("000A")).toBe(12);
      expect(countLeadingZeroBits("000a")).toBe(12);
    });
  });

  describe("getEventDifficulty", () => {
    it("calculates difficulty from event ID", () => {
      expect(getEventDifficulty("000" + "f".repeat(61))).toBe(12);
      expect(getEventDifficulty("00" + "f".repeat(62))).toBe(8);
      expect(getEventDifficulty("0" + "f".repeat(63))).toBe(4);
      expect(getEventDifficulty("f".repeat(64))).toBe(0);
    });
  });

  describe("hasValidPoW", () => {
    it("validates PoW difficulty correctly", () => {
      const eventId = "000abc" + "f".repeat(58); // 12 bits

      expect(hasValidPoW(eventId, 10)).toBe(true); // 12 >= 10
      expect(hasValidPoW(eventId, 12)).toBe(true); // 12 >= 12
      expect(hasValidPoW(eventId, 15)).toBe(false); // 12 < 15
    });

    it("handles zero difficulty", () => {
      const eventId = "f".repeat(64);
      expect(hasValidPoW(eventId, 0)).toBe(true);
    });
  });

  describe("getPowTag", () => {
    it("extracts nonce tag from event", () => {
      const event = {
        tags: [
          ["p", "pubkey123"],
          ["nonce", "12345", "20"],
          ["t", "test"],
        ],
      };

      const pow = getPowTag(event);

      expect(pow).toEqual({
        nonce: 12345,
        targetDifficulty: 20,
      });
    });

    it("returns null when no nonce tag present", () => {
      const event = {
        tags: [["p", "pubkey123"]],
      };

      expect(getPowTag(event)).toBeNull();
    });

    it("handles nonce tag without target difficulty", () => {
      const event = {
        tags: [["nonce", "12345"]],
      };

      const pow = getPowTag(event);

      expect(pow).toEqual({
        nonce: 12345,
        targetDifficulty: 0,
      });
    });

    it("handles invalid nonce values", () => {
      const event = {
        tags: [["nonce", "invalid", "abc"]],
      };

      const pow = getPowTag(event);

      expect(pow).toEqual({
        nonce: 0,
        targetDifficulty: 0,
      });
    });
  });

  describe("mineEvent", () => {
    it("mines event with low difficulty", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 9902,
        content: "test-content",
        tags: [["p", "recipient-pubkey"]],
        created_at: Math.floor(Date.now() / 1000),
      };

      const result = await mineEvent(template, privateKey, {
        targetDifficulty: 8, // Low difficulty for fast test
        maxIterations: 100_000,
      });

      expect(result.event).toHaveProperty("id");
      expect(result.event).toHaveProperty("sig");
      expect(result.difficulty).toBeGreaterThanOrEqual(8);
      expect(hasValidPoW(result.event.id, 8)).toBe(true);

      // Check nonce tag was added
      const nonceTag = result.event.tags.find((tag) => tag[0] === "nonce");
      expect(nonceTag).toBeTruthy();
      expect(parseInt(nonceTag![1])).toBe(result.nonce);
      expect(parseInt(nonceTag![2])).toBe(8);
    }, 10000); // 10 second timeout

    it("preserves existing tags", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [
          ["p", "pubkey123"],
          ["e", "event123", "", "root"],
        ],
        created_at: 1000,
      };

      const result = await mineEvent(template, privateKey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
      });

      expect(result.event.tags).toContainEqual(["p", "pubkey123"]);
      expect(result.event.tags).toContainEqual(["e", "event123", "", "root"]);
    }, 10000);

    it("throws error when difficulty not reached", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
      };

      await expect(
        mineEvent(template, privateKey, {
          targetDifficulty: 20, // High difficulty
          maxIterations: 10, // Very few iterations
        })
      ).rejects.toThrow(/Failed to mine event/);
    });

    it("calls progress callback", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
      };

      const progressCalls: Array<{ nonce: number; difficulty: number }> = [];

      await mineEvent(template, privateKey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
        onProgress: (nonce, difficulty) => {
          progressCalls.push({ nonce, difficulty });
        },
        progressInterval: 1000,
      });

      // Should have been called at least once
      expect(progressCalls.length).toBeGreaterThan(0);
    }, 10000);

    it("can start from custom nonce", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
      };

      const result = await mineEvent(template, privateKey, {
        targetDifficulty: 8,
        startNonce: 1000,
        maxIterations: 100_000,
      });

      expect(result.nonce).toBeGreaterThanOrEqual(1000);
    }, 10000);
  });

  describe("mineEventUnsigned", () => {
    it("mines unsigned event template", async () => {
      const privateKey = generateSecretKey();
      const pubkey = getPublicKey(privateKey);

      const template: EventTemplate = {
        kind: 9901,
        content: "encrypted-content",
        tags: [["p", "recipient"]],
        created_at: Math.floor(Date.now() / 1000),
      };

      const result = await mineEventUnsigned(template, pubkey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
      });

      expect(result.template).toHaveProperty("tags");
      expect(result.difficulty).toBeGreaterThanOrEqual(8);

      // Check nonce tag
      const nonceTag = result.template.tags.find((tag) => tag[0] === "nonce");
      expect(nonceTag).toBeTruthy();
      expect(parseInt(nonceTag![1])).toBe(result.nonce);
    }, 10000);

    it("returns template that can be used with wrapEvent", async () => {
      const privateKey = generateSecretKey();
      const pubkey = getPublicKey(privateKey);

      const template: EventTemplate = {
        kind: 9901,
        content: "test",
        tags: [["p", pubkey]],
        created_at: 1000,
      };

      const result = await mineEventUnsigned(template, pubkey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
      });

      // Template should be valid EventTemplate
      expect(result.template.kind).toBe(9901);
      expect(result.template.content).toBe("test");
      expect(result.template.created_at).toBe(1000);
      expect(result.template.tags.length).toBeGreaterThan(1); // Original + nonce
    }, 10000);
  });

  describe("estimateMiningTime", () => {
    it("estimates mining time for different difficulties", () => {
      const time10 = estimateMiningTime(10, 100_000);
      const time15 = estimateMiningTime(15, 100_000);
      const time20 = estimateMiningTime(20, 100_000);

      // Higher difficulty should take longer
      expect(time15).toBeGreaterThan(time10);
      expect(time20).toBeGreaterThan(time15);
    });

    it("scales with hash rate", () => {
      const timeSlow = estimateMiningTime(10, 10_000); // Slower
      const timeFast = estimateMiningTime(10, 100_000); // Faster

      expect(timeSlow).toBeGreaterThan(timeFast);
    });

    it("returns reasonable values for common difficulties", () => {
      // Difficulty 16 should be feasible
      const time16 = estimateMiningTime(16, 100_000);
      expect(time16).toBeLessThan(1); // Less than 1 second

      // Difficulty 20 should take a bit longer
      const time20 = estimateMiningTime(20, 100_000);
      expect(time20).toBeGreaterThan(1); // More than 1 second
      expect(time20).toBeLessThan(100); // But not crazy long
    });
  });

  describe("validatePow", () => {
    it("validates correct PoW", async () => {
      const privateKey = generateSecretKey();
      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
      };

      const mined = await mineEvent(template, privateKey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
      });

      expect(validatePow(mined.event)).toBe(true);
    }, 10000);

    it("rejects event without nonce tag", () => {
      const event = {
        id: "000abc" + "f".repeat(58),
        tags: [["p", "pubkey"]],
      };

      expect(validatePow(event)).toBe(false);
    });

    it("rejects event with insufficient difficulty", () => {
      const event = {
        id: "f".repeat(64), // No leading zeros
        tags: [["nonce", "12345", "20"]], // Claims 20 bits
      };

      expect(validatePow(event)).toBe(false);
    });

    it("accepts event exceeding target difficulty", () => {
      const event = {
        id: "000" + "f".repeat(61), // 12 bits
        tags: [["nonce", "12345", "10"]], // Claims 10 bits
      };

      expect(validatePow(event)).toBe(true);
    });
  });

  describe("integration scenarios", () => {
    it("mines PoW for reservation response", async () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(generateSecretKey());

      const responseTemplate: EventTemplate = {
        kind: 9902,
        content: "encrypted-response-content",
        tags: [
          ["p", conciergePublicKey],
          ["e", "request-event-id", "wss://relay.damus.io", "root"],
        ],
        created_at: Math.floor(Date.now() / 1000),
      };

      const mined = await mineEvent(responseTemplate, restaurantPrivateKey, {
        targetDifficulty: 8, // Low for test
        maxIterations: 100_000,
      });

      // Verify the event
      expect(mined.event.kind).toBe(9902);
      expect(mined.event.tags).toContainEqual([
        "e",
        "request-event-id",
        "wss://relay.damus.io",
        "root",
      ]);
      expect(hasValidPoW(mined.event.id, 8)).toBe(true);
      expect(validatePow(mined.event)).toBe(true);
    }, 10000);

    it("mines multiple events with different difficulties", async () => {
      const privateKey = generateSecretKey();

      const template: EventTemplate = {
        kind: 1,
        content: "test",
        tags: [],
        created_at: 1000,
      };

      const mined8 = await mineEvent(template, privateKey, {
        targetDifficulty: 8,
        maxIterations: 100_000,
      });

      const mined10 = await mineEvent(template, privateKey, {
        targetDifficulty: 10,
        maxIterations: 100_000,
      });

      expect(mined8.difficulty).toBeGreaterThanOrEqual(8);
      expect(mined10.difficulty).toBeGreaterThanOrEqual(10);

      // Higher difficulty likely took more iterations
      // (not guaranteed but statistically likely)
      expect(mined10.nonce).toBeGreaterThan(0);
    }, 15000);
  });
});

