/**
 * Tests for Reservation Service
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import type { Event } from "nostr-tools";
import {
  ReservationSubscription,
  startReservationSubscription,
  createReservationSubscription,
  type ReservationMessage,
} from "./reservationService";
import { wrapEvent } from "@/lib/nip59";
import { buildReservationRequest, buildReservationResponse } from "@/lib/reservationEvents";
import type { ReservationRequest, ReservationResponse } from "@/types/reservation";
import { getPool } from "@/lib/relayPool";

// Mock the relay pool
vi.mock("@/lib/relayPool", () => ({
  getPool: vi.fn(),
}));

describe("reservationService", () => {
  let mockSubscription: {
    close: (reason?: string) => void;
  };

  let mockPool: any;

  beforeEach(() => {
    mockSubscription = {
      close: vi.fn(),
    };

    mockPool = {
      subscribeMany: vi.fn(() => mockSubscription),
    };

    vi.mocked(getPool).mockReturnValue(mockPool);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("ReservationSubscription", () => {
    it("creates subscription with config", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      expect(subscription).toBeInstanceOf(ReservationSubscription);
      expect(subscription.active).toBe(false);
    });

    it("starts subscription to relays", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = new ReservationSubscription({
        relays: ["wss://relay1.com", "wss://relay2.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      subscription.start();

      expect(mockPool.subscribeMany).toHaveBeenCalledWith(
        ["wss://relay1.com", "wss://relay2.com"],
        {
          kinds: [1059],
          "#p": [publicKey],
        },
        expect.objectContaining({
          onevent: expect.any(Function),
          oneose: expect.any(Function),
        })
      );
    });

    it("doesn't start twice if already active", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      subscription.start();
      subscription.start(); // Try to start again

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "Reservation subscription already active"
      );
      expect(mockPool.subscribeMany).toHaveBeenCalledTimes(1);

      consoleWarnSpy.mockRestore();
    });

    it("stops subscription", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      subscription.start();
      expect(subscription.active).toBe(true); // Active after start
      expect(subscription.ready).toBe(false); // Not ready until oneose

      subscription.stop();

      expect(mockSubscription.close).toHaveBeenCalled();
      expect(subscription.active).toBe(false);
      expect(subscription.ready).toBe(false);
    });

    it("calls onReady when subscription becomes ready", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);
      const onReady = vi.fn();

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
        onReady,
      });

      subscription.start();
      expect(subscription.active).toBe(true);
      expect(subscription.ready).toBe(false);

      // Get the options passed to subscribeMany
      const options = mockPool.subscribeMany.mock.calls[0][2];

      // Simulate end of stored events
      options.oneose();

      expect(onReady).toHaveBeenCalled();
      expect(subscription.ready).toBe(true);
    });

    it("processes incoming reservation request", () => {
      const merchantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const merchantPublicKey = getPublicKey(merchantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const onMessage = vi.fn();

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: merchantPrivateKey,
        publicKey: merchantPublicKey,
        onMessage,
      });

      subscription.start();

      // Create a reservation request
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat",
      };

      const requestTemplate = buildReservationRequest(
        request,
        conciergePrivateKey,
        merchantPublicKey
      );

      const giftWrap = wrapEvent(requestTemplate, conciergePrivateKey, merchantPublicKey);

      // Get the onevent callback
      const options = mockPool.subscribeMany.mock.calls[0][2];
      options.onevent(giftWrap);

      // Verify onMessage was called
      expect(onMessage).toHaveBeenCalled();

      const message: ReservationMessage = onMessage.mock.calls[0][0];
      expect(message.type).toBe("request");
      expect(message.payload).toEqual(request);
      expect(message.senderPubkey).toBe(conciergePublicKey);
      expect(message.giftWrap).toBe(giftWrap);
    });

    it("processes incoming reservation response", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const onMessage = vi.fn();

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: conciergePrivateKey, // Concierge receiving response
        publicKey: conciergePublicKey,
        onMessage,
      });

      subscription.start();

      // Create a reservation response
      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:00:00-07:00",
        table: "A4",
      };

      const responseTemplate = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const giftWrap = wrapEvent(responseTemplate, restaurantPrivateKey, conciergePublicKey);

      // Trigger event
      const options = mockPool.subscribeMany.mock.calls[0][2];
      options.onevent(giftWrap);

      expect(onMessage).toHaveBeenCalled();

      const message: ReservationMessage = onMessage.mock.calls[0][0];
      expect(message.type).toBe("response");
      expect(message.payload).toEqual(response);
      expect(message.senderPubkey).toBe(restaurantPublicKey);
    });

    it("silently ignores invalid MAC errors (expected with Self CC)", () => {
      const merchantPrivateKey = generateSecretKey();
      const merchantPublicKey = getPublicKey(merchantPrivateKey);
      const wrongPrivateKey = generateSecretKey(); // Wrong key

      const onMessage = vi.fn();
      const onError = vi.fn();

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: wrongPrivateKey, // Using wrong key will cause MAC error
        publicKey: merchantPublicKey,
        onMessage,
        onError,
      });

      subscription.start();

      // Create a valid gift wrap encrypted for someone else
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const template = buildReservationRequest(
        request,
        generateSecretKey(),
        merchantPublicKey
      );

      const giftWrap = wrapEvent(template, generateSecretKey(), merchantPublicKey);

      // Trigger event
      const options = mockPool.subscribeMany.mock.calls[0][2];
      options.onevent(giftWrap);

      // Should silently ignore invalid MAC errors (not call onError or onMessage)
      expect(onMessage).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled(); // Changed: no longer calls onError for MAC errors
    });

    it("ignores gift wraps with unexpected kinds", () => {
      const merchantPrivateKey = generateSecretKey();
      const senderPrivateKey = generateSecretKey();
      const merchantPublicKey = getPublicKey(merchantPrivateKey);

      const onMessage = vi.fn();
      const consoleDebugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: merchantPrivateKey,
        publicKey: merchantPublicKey,
        onMessage,
      });

      subscription.start();

      // Create a gift wrap with a different kind (not 32101 or 32102)
      const otherEvent = wrapEvent(
        {
          kind: 1, // Regular note, not a reservation
          content: "Just a message",
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        },
        senderPrivateKey,
        merchantPublicKey
      );

      const options = mockPool.subscribeMany.mock.calls[0][2];
      options.onevent(otherEvent);

      // Should not call onMessage
      expect(onMessage).not.toHaveBeenCalled();
      expect(consoleDebugSpy).toHaveBeenCalledWith(
        expect.stringContaining("unexpected kind")
      );

      consoleDebugSpy.mockRestore();
    });
  });

  describe("startReservationSubscription", () => {
    it("creates and starts subscription", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = startReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      expect(subscription).toBeInstanceOf(ReservationSubscription);
      expect(mockPool.subscribeMany).toHaveBeenCalled();
    });
  });

  describe("createReservationSubscription", () => {
    it("creates subscription without starting", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = createReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      expect(subscription).toBeInstanceOf(ReservationSubscription);
      expect(mockPool.subscribeMany).not.toHaveBeenCalled();
      expect(subscription.active).toBe(false);
    });

    it("can be started manually", () => {
      const privateKey = generateSecretKey();
      const publicKey = getPublicKey(privateKey);

      const subscription = createReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey,
        publicKey,
        onMessage: vi.fn(),
      });

      subscription.start();

      expect(mockPool.subscribeMany).toHaveBeenCalled();
    });
  });

  describe("integration scenarios", () => {
    it("handles multiple messages in sequence", () => {
      const merchantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const merchantPublicKey = getPublicKey(merchantPrivateKey);
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const messages: ReservationMessage[] = [];

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: merchantPrivateKey,
        publicKey: merchantPublicKey,
        onMessage: (msg) => messages.push(msg),
      });

      subscription.start();

      const options = mockPool.subscribeMany.mock.calls[0][2];

      // Message 1: Initial request
      const request1: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };
      const wrap1 = wrapEvent(
        buildReservationRequest(request1, conciergePrivateKey, merchantPublicKey),
        conciergePrivateKey,
        merchantPublicKey
      );
      options.onevent(wrap1);

      // Message 2: Another request
      const request2: ReservationRequest = {
        party_size: 4,
        iso_time: "2025-10-21T20:00:00-07:00",
      };
      const wrap2 = wrapEvent(
        buildReservationRequest(request2, conciergePrivateKey, merchantPublicKey),
        conciergePrivateKey,
        merchantPublicKey
      );
      options.onevent(wrap2);

      expect(messages).toHaveLength(2);
      expect(messages[0].type).toBe("request");
      expect((messages[0].payload as ReservationRequest).party_size).toBe(2);
      expect(messages[1].type).toBe("request");
      expect((messages[1].payload as ReservationRequest).party_size).toBe(4);
    });

    it("continues processing after an error", () => {
      const merchantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const merchantPublicKey = getPublicKey(merchantPrivateKey);

      const messages: ReservationMessage[] = [];
      const errors: Error[] = [];

      const subscription = new ReservationSubscription({
        relays: ["wss://relay.example.com"],
        privateKey: merchantPrivateKey,
        publicKey: merchantPublicKey,
        onMessage: (msg) => messages.push(msg),
        onError: (err) => errors.push(err),
      });

      subscription.start();

      const options = mockPool.subscribeMany.mock.calls[0][2];

      // Good message
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };
      const wrap1 = wrapEvent(
        buildReservationRequest(request, conciergePrivateKey, merchantPublicKey),
        conciergePrivateKey,
        merchantPublicKey
      );
      options.onevent(wrap1);

      // Bad message (create a malformed event)
      const badWrap: Event = {
        kind: 1059,
        content: "invalid-encrypted-content",
        tags: [["p", merchantPublicKey]],
        created_at: Math.floor(Date.now() / 1000),
        pubkey: getPublicKey(generateSecretKey()),
        id: "bad-id",
        sig: "bad-sig",
      };
      options.onevent(badWrap);

      // Another good message
      const wrap3 = wrapEvent(
        buildReservationRequest(request, conciergePrivateKey, merchantPublicKey),
        conciergePrivateKey,
        merchantPublicKey
      );
      options.onevent(wrap3);

      // Should have 2 good messages and 1 error
      expect(messages).toHaveLength(2);
      expect(errors).toHaveLength(1);
    });
  });
});

