/**
 * Tests for Reservation Events
 */

import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey, getEventHash } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
import {
  validateReservationRequest,
  validateReservationResponse,
  validateReservationModificationRequest,
  validateReservationModificationResponse,
  buildReservationRequest,
  buildReservationResponse,
  buildReservationModificationRequest,
  buildReservationModificationResponse,
  parseReservationRequest,
  parseReservationResponse,
  parseReservationModificationRequest,
  parseReservationModificationResponse,
} from "./reservationEvents";
import type { 
  ReservationRequest, 
  ReservationResponse,
  ReservationModificationRequest,
  ReservationModificationResponse
} from "@/types/reservation";
import { unwrapEvent, wrapEvent } from "./nip59";
import { iso8601ToUnixAndTzid } from "./reservationTimeUtils";

describe("reservationEvents", () => {
  describe("validateReservationRequest", () => {
    it("validates a valid request", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("validates request with all optional fields", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const { unixTimestamp: earliest } = iso8601ToUnixAndTzid("2025-10-20T18:30:00-07:00");
      const { unixTimestamp: latest } = iso8601ToUnixAndTzid("2025-10-20T20:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 4,
        time: unixTimestamp,
        tzid,
        message: "Window seat if possible",
        name: "John Doe",
        telephone: "tel:+1-555-0100",
        email: "mailto:john@example.com",
        earliest_time: earliest,
        latest_time: latest,
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(true);
    });

    it("rejects request missing required fields", () => {
      const request = {
        party_size: 2,
        // missing time and tzid
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("rejects request with invalid party_size", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request = {
        party_size: 0, // Invalid: must be >= 1
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with party_size > 20", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request = {
        party_size: 25, // Invalid: must be <= 20
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with invalid email", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        email: "not-an-email", // Should be mailto: URI
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with message too long", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "x".repeat(2001), // Max 2000
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });
  });

  describe("validateReservationResponse", () => {
    it("validates confirmed response", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "See you at 7pm!",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("validates cancelled response", () => {
      const response: ReservationResponse = {
        status: "cancelled",
        time: null,
        message: "Cancelled by customer",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("validates declined response", () => {
      const response: ReservationResponse = {
        status: "declined",
        time: null,
        message: "Sorry, we're fully booked",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("rejects response missing required status", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const response = {
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(false);
    });

    it("rejects response with invalid status", () => {
      const response = {
        status: "invalid-status",
      } as unknown as ReservationResponse;

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(false);
    });

    it("rejects confirmed response without time", () => {
      const response = {
        status: "confirmed",
        // missing required time for confirmed status
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(false);
    });
  });

  describe("buildReservationRequest", () => {
    it("builds event template with tag-based structure", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "Window seat",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      expect(template.kind).toBe(9901);
      expect(template.content).toBe("Window seat");
      expect(template.tags).toContainEqual(["p", recipientPublicKey]);
      expect(template.tags).toContainEqual(["party_size", "2"]);
      expect(template.tags).toContainEqual(["time", unixTimestamp.toString()]);
      expect(template.tags).toContainEqual(["tzid", tzid]);
      expect(template.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it("includes relay URL in p tag when provided", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const relayUrl = "wss://relay.example.com";
      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey,
        relayUrl
      );

      expect(template.tags).toContainEqual(["p", recipientPublicKey, relayUrl]);
    });

    it("includes optional fields in tags", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 4,
        time: unixTimestamp,
        tzid,
        name: "John Doe",
        telephone: "tel:+1234567890",
        email: "mailto:john@example.com",
        duration: 7200,
        earliest_time: unixTimestamp - 3600,
        latest_time: unixTimestamp + 3600,
        message: "Anniversary dinner",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      expect(template.tags).toContainEqual(["name", "John Doe"]);
      expect(template.tags).toContainEqual(["telephone", "tel:+1234567890"]);
      expect(template.tags).toContainEqual(["email", "mailto:john@example.com"]);
      expect(template.tags).toContainEqual(["duration", "7200"]);
      expect(template.tags).toContainEqual(["earliest_time", (unixTimestamp - 3600).toString()]);
      expect(template.tags).toContainEqual(["latest_time", (unixTimestamp + 3600).toString()]);
      expect(template.content).toBe("Anniversary dinner");
    });

    it("includes additional tags", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const additionalTags = [
        ["e", "parent-event-id", "", "root"],
      ];

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey,
        undefined,
        additionalTags
      );

      expect(template.tags).toContainEqual(["e", "parent-event-id", "", "root"]);
    });

    it("throws error for invalid request", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const invalidRequest: ReservationRequest = {
        party_size: 0, // Invalid
        time: unixTimestamp,
        tzid,
      };

      expect(() =>
        buildReservationRequest(invalidRequest, senderPrivateKey, recipientPublicKey)
      ).toThrow(/Invalid reservation request/);
    });
  });

  describe("buildReservationResponse", () => {
    it("builds event template with tag-based structure", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64); // Mock root rumor ID

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "See you then!",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      expect(template.kind).toBe(9902);
      expect(template.content).toBe("See you then!");
      expect(template.tags).toContainEqual(["p", recipientPublicKey]);
      expect(template.tags).toContainEqual(["e", rootRumorId, "", "root"]);
      expect(template.tags).toContainEqual(["status", "confirmed"]);
      expect(template.tags).toContainEqual(["time", unixTimestamp.toString()]);
      expect(template.tags).toContainEqual(["tzid", tzid]);
    });

    it("includes relay URL in p tag when provided", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
      };

      const relayUrl = "wss://relay.example.com";
      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId,
        relayUrl
      );

      expect(template.tags).toContainEqual(["p", recipientPublicKey, relayUrl]);
    });

    it("includes optional duration tag", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        duration: 7200,
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      expect(template.tags).toContainEqual(["duration", "7200"]);
    });

    it("handles declined status without time", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64);

      const response: ReservationResponse = {
        status: "declined",
        time: null,
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      expect(template.tags).toContainEqual(["status", "declined"]);
      expect(template.tags.find(t => t[0] === "time")).toBeUndefined();
      expect(template.tags.find(t => t[0] === "tzid")).toBeUndefined();
    });

    it("throws error for invalid response", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64);

      const invalidResponse = {
        status: "invalid-status",
      } as unknown as ReservationResponse;

      expect(() =>
        buildReservationResponse(invalidResponse, senderPrivateKey, recipientPublicKey, rootRumorId)
      ).toThrow(/Invalid reservation response/);
    });

    it("throws error when confirmed status missing time", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());
      const rootRumorId = "a".repeat(64);

      const invalidResponse: ReservationResponse = {
        status: "confirmed",
        time: null,
      };

      expect(() =>
        buildReservationResponse(invalidResponse, senderPrivateKey, recipientPublicKey, rootRumorId)
      ).toThrow(/time is required when status is confirmed/);
    });
  });

  describe("parseReservationRequest", () => {
    it("parses request from tag-based rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T20:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 4,
        time: unixTimestamp,
        tzid,
        message: "Anniversary dinner",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      // Create a pseudo-rumor with all required fields (including id for validation)
      const pubkey = getPublicKey(senderPrivateKey);
      const unsignedEvent: UnsignedEvent = {
        ...template,
        pubkey,
      };
      const rumor = {
        ...unsignedEvent,
        id: getEventHash(unsignedEvent),
      };

      const parsed = parseReservationRequest(rumor, recipientPrivateKey);

      expect(parsed).toEqual(request);
    });

    it("parses request with all optional fields", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T20:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        name: "Jane Smith",
        telephone: "tel:+1987654321",
        email: "mailto:jane@example.com",
        duration: 5400,
        earliest_time: unixTimestamp - 1800,
        latest_time: unixTimestamp + 1800,
        message: "Birthday celebration",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      const pubkey = getPublicKey(senderPrivateKey);
      const unsignedEvent: UnsignedEvent = {
        ...template,
        pubkey,
      };
      const rumor = {
        ...unsignedEvent,
        id: getEventHash(unsignedEvent),
      };

      const parsed = parseReservationRequest(rumor, recipientPrivateKey);

      expect(parsed).toEqual(request);
    });

    it("throws error for wrong kind", () => {
      const recipientPrivateKey = generateSecretKey();

      const wrongKindRumor = {
        kind: 1, // Wrong kind
        content: "test",
        pubkey: getPublicKey(generateSecretKey()),
      };

      expect(() =>
        parseReservationRequest(wrongKindRumor, recipientPrivateKey)
      ).toThrow(/Expected kind 9901/);
    });
  });

  describe("parseReservationResponse", () => {
    it("parses response from tag-based rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);
      const rootRumorId = "a".repeat(64);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T20:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "Confirmed!",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      const pubkey = getPublicKey(senderPrivateKey);
      const unsignedEvent: UnsignedEvent = {
        ...template,
        pubkey,
      };
      const rumor = {
        ...unsignedEvent,
        id: getEventHash(unsignedEvent),
      };

      const parsed = parseReservationResponse(rumor, recipientPrivateKey);

      expect(parsed).toEqual(response);
    });

    it("parses response with duration", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);
      const rootRumorId = "a".repeat(64);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T20:00:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        duration: 7200,
        message: "See you then!",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      const pubkey = getPublicKey(senderPrivateKey);
      const unsignedEvent: UnsignedEvent = {
        ...template,
        pubkey,
      };
      const rumor = {
        ...unsignedEvent,
        id: getEventHash(unsignedEvent),
      };

      const parsed = parseReservationResponse(rumor, recipientPrivateKey);

      expect(parsed).toEqual(response);
    });

    it("parses declined response without time", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);
      const rootRumorId = "a".repeat(64);

      const response: ReservationResponse = {
        status: "declined",
        time: null,
        message: "Sorry, we're fully booked.",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey,
        rootRumorId
      );

      const pubkey = getPublicKey(senderPrivateKey);
      const unsignedEvent: UnsignedEvent = {
        ...template,
        pubkey,
      };
      const rumor = {
        ...unsignedEvent,
        id: getEventHash(unsignedEvent),
      };

      const parsed = parseReservationResponse(rumor, recipientPrivateKey);

      expect(parsed).toEqual(response);
    });

    it("throws error for wrong kind", () => {
      const recipientPrivateKey = generateSecretKey();

      const wrongKindRumor = {
        kind: 9901, // Wrong kind (should be 9902)
        content: "test",
        pubkey: getPublicKey(generateSecretKey()),
      };

      expect(() =>
        parseReservationResponse(wrongKindRumor, recipientPrivateKey)
      ).toThrow(/Expected kind 9902/);
    });
  });

  describe("integration with NIP-59", () => {
    it("full request workflow: build → wrap → unwrap → parse", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "Window seat if possible",
        name: "John",
        email: "mailto:john@example.com",
      };

      // Build and wrap
      const template = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const giftWrap = wrapEvent(template, conciergePrivateKey, restaurantPublicKey);

      // Unwrap and parse
      const rumor = unwrapEvent(giftWrap, restaurantPrivateKey);
      const parsed = parseReservationRequest(rumor, restaurantPrivateKey);

      expect(parsed).toEqual(request);
    });

    it("full response workflow: build → wrap → unwrap → parse", () => {
      const restaurantPrivateKey = generateSecretKey();
      const rootRumorId = "a".repeat(64);
      const conciergePrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "7pm is full, but 7:30 works!",
      };

      // Build and wrap
      const template = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey,
        rootRumorId
      );

      const giftWrap = wrapEvent(template, restaurantPrivateKey, conciergePublicKey);

      // Unwrap and parse
      const rumor = unwrapEvent(giftWrap, conciergePrivateKey);
      const parsed = parseReservationResponse(rumor, conciergePrivateKey);

      expect(parsed).toEqual(response);
    });

    it("handles declined reservation", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);
      const rootRumorId = "a".repeat(64);

      const response: ReservationResponse = {
        status: "declined",
        time: null,
        message: "Sorry, fully booked that evening",
      };

      const template = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey,
        rootRumorId
      );

      const giftWrap = wrapEvent(template, restaurantPrivateKey, conciergePublicKey);
      const rumor = unwrapEvent(giftWrap, conciergePrivateKey);
      const parsed = parseReservationResponse(rumor, conciergePrivateKey);

      expect(parsed.status).toBe("declined");
      expect(parsed.message).toBe("Sorry, fully booked that evening");
    });

    it("bidirectional reservation negotiation", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      // Step 1: Concierge requests reservation
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const requestTemplate = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const requestWrap = wrapEvent(
        requestTemplate,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const requestRumor = unwrapEvent(requestWrap, restaurantPrivateKey);
      const parsedRequest = parseReservationRequest(requestRumor, restaurantPrivateKey);

      expect(parsedRequest.party_size).toBe(2);

      // Step 2: Restaurant confirms original time
      const confirmation: ReservationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "Confirmed!",
      };

      // Get the root rumor ID from the request
      const requestPubkey = getPublicKey(conciergePrivateKey);
      const requestUnsignedEvent: UnsignedEvent = {
        ...requestTemplate,
        pubkey: requestPubkey,
      };
      const requestRumorId = getEventHash(requestUnsignedEvent);

      const confirmTemplate = buildReservationResponse(
        confirmation,
        restaurantPrivateKey,
        conciergePublicKey,
        requestRumorId
      );

      const confirmWrap = wrapEvent(
        confirmTemplate,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const confirmRumor = unwrapEvent(confirmWrap, conciergePrivateKey);
      const parsedConfirm = parseReservationResponse(confirmRumor, conciergePrivateKey);

      expect(parsedConfirm.status).toBe("confirmed");
    });
  });

  describe("validateReservationModificationRequest", () => {
    it("validates a valid modification request", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const request: ReservationModificationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationModificationRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("rejects modification request missing required fields", () => {
      const request = {
        party_size: 2,
        // missing time and tzid
      };

      const result = validateReservationModificationRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
    });

    it("rejects modification request with invalid party_size", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const request = {
        party_size: 0,
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationModificationRequest(request);

      expect(result.valid).toBe(false);
    });
  });

  describe("validateReservationModificationResponse", () => {
    it("validates a valid modification response", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response: ReservationModificationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationModificationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("rejects modification response missing status", () => {
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response = {
        time: unixTimestamp,
        tzid,
      };

      const result = validateReservationModificationResponse(response);

      expect(result.valid).toBe(false);
    });
  });

  describe("buildReservationModificationRequest", () => {
    it("builds a valid modification request event", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const request: ReservationModificationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "This time works for us",
      };

      const template = buildReservationModificationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      expect(template.kind).toBe(9903);
      expect(template.content).toBeTruthy();
      expect(template.tags).toContainEqual(["p", restaurantPublicKey]);
    });

    it("throws error for invalid modification request", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const request: ReservationModificationRequest = {
        party_size: 0, // Invalid
        time: unixTimestamp,
        tzid,
      };

      expect(() => {
        buildReservationModificationRequest(
          request,
          conciergePrivateKey,
          restaurantPublicKey
        );
      }).toThrow();
    });
  });

  describe("buildReservationModificationResponse", () => {
    it("builds a valid modification response event", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response: ReservationModificationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "Perfect!",
      };

      const template = buildReservationModificationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      expect(template.kind).toBe(9904);
      expect(template.content).toBeTruthy();
      expect(template.tags).toContainEqual(["p", conciergePublicKey]);
    });

    it("throws error for invalid modification response", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(generateSecretKey());

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response = {
        // missing status
        time: unixTimestamp,
        tzid,
      };

      expect(() => {
        buildReservationModificationResponse(
          response as ReservationModificationResponse,
          restaurantPrivateKey,
          conciergePublicKey
        );
      }).toThrow();
    });
  });

  describe("parseReservationModificationRequest", () => {
    it("parses a valid modification request", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const request: ReservationModificationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "Works for us",
      };

      const template = buildReservationModificationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const giftWrap = wrapEvent(template, conciergePrivateKey, restaurantPublicKey);
      const rumor = unwrapEvent(giftWrap, restaurantPrivateKey);
      const parsed = parseReservationModificationRequest(rumor, restaurantPrivateKey);

      expect(parsed).toEqual(request);
    });

    it("throws error for wrong kind", () => {
      const restaurantPrivateKey = generateSecretKey();
      const wrongKindEvent = {
        kind: 9901,
        content: "encrypted",
        pubkey: "test",
      };

      expect(() => {
        parseReservationModificationRequest(wrongKindEvent as any, restaurantPrivateKey);
      }).toThrow("Expected kind 9903");
    });
  });

  describe("parseReservationModificationResponse", () => {
    it("parses a valid modification response", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response: ReservationModificationResponse = {
        status: "confirmed",
        time: unixTimestamp,
        tzid,
        message: "See you then!",
      };

      const template = buildReservationModificationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const giftWrap = wrapEvent(template, restaurantPrivateKey, conciergePublicKey);
      const rumor = unwrapEvent(giftWrap, conciergePrivateKey);
      const parsed = parseReservationModificationResponse(rumor, conciergePrivateKey);

      expect(parsed).toEqual(response);
    });

    it("throws error for wrong kind", () => {
      const conciergePrivateKey = generateSecretKey();
      const wrongKindEvent = {
        kind: 9902,
        content: "encrypted",
        pubkey: "test",
      };

      expect(() => {
        parseReservationModificationResponse(wrongKindEvent as any, conciergePrivateKey);
      }).toThrow("Expected kind 9904");
    });
  });

  describe("full modification workflow", () => {
    it("complete flow: request → response → modification-request → modification-response", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);

      // Step 1: Initial request
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const requestTemplate = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const requestWrap = wrapEvent(requestTemplate, conciergePrivateKey, restaurantPublicKey);
      const requestRumor = unwrapEvent(requestWrap, restaurantPrivateKey);
      
      // Get the root rumor ID from the request
      const requestPubkey = getPublicKey(conciergePrivateKey);
      const requestUnsignedEvent: UnsignedEvent = {
        ...requestTemplate,
        pubkey: requestPubkey,
      };
      const rootRumorId = getEventHash(requestUnsignedEvent);

      // Step 2: Restaurant responds with a suggested time (using 9902)
      const { unixTimestamp: suggestionTime, tzid: suggestionTzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const suggestion: ReservationResponse = {
        status: "confirmed",
        time: suggestionTime,
        tzid: suggestionTzid,
        message: "7pm is full, how about 7:30?",
      };

      const suggestionTemplate = buildReservationResponse(
        suggestion,
        restaurantPrivateKey,
        conciergePublicKey,
        rootRumorId
      );
      const suggestionWrap = wrapEvent(
        suggestionTemplate,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const suggestionRumor = unwrapEvent(suggestionWrap, conciergePrivateKey);

      // Step 3: User sends modification request (9903) accepting the suggested time
      const modificationRequest: ReservationModificationRequest = {
        party_size: 2,
        time: suggestionTime,
        tzid: suggestionTzid,
        message: "7:30pm works for us",
      };

      const modRequestTemplate = buildReservationModificationRequest(
        modificationRequest,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const modRequestWrap = wrapEvent(
        modRequestTemplate,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const modRequestRumor = unwrapEvent(modRequestWrap, restaurantPrivateKey);
      const parsedModRequest = parseReservationModificationRequest(
        modRequestRumor,
        restaurantPrivateKey
      );

      expect(parsedModRequest.party_size).toBe(2);
      expect(parsedModRequest.time).toBe(suggestionTime);

      // Step 4: Restaurant confirms modification
      const confirmation: ReservationModificationResponse = {
        status: "confirmed",
        time: suggestionTime,
        tzid: suggestionTzid,
        message: "Confirmed!",
      };

      const confirmTemplate = buildReservationModificationResponse(
        confirmation,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const confirmWrap = wrapEvent(confirmTemplate, restaurantPrivateKey, conciergePublicKey);
      const confirmRumor = unwrapEvent(confirmWrap, conciergePrivateKey);
      const parsedConfirm = parseReservationModificationResponse(confirmRumor, conciergePrivateKey);

      expect(parsedConfirm.status).toBe("confirmed");
      expect(parsedConfirm.time).toBe(suggestionTime);
    });
  });
});

