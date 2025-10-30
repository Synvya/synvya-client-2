/**
 * Tests for Reservation Events
 */

import { describe, it, expect } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  validateReservationRequest,
  validateReservationResponse,
  buildReservationRequest,
  buildReservationResponse,
  parseReservationRequest,
  parseReservationResponse,
} from "./reservationEvents";
import type { ReservationRequest, ReservationResponse } from "@/types/reservation";
import { unwrapAndDecrypt, wrapEvent } from "./nip59";

describe("reservationEvents", () => {
  describe("validateReservationRequest", () => {
    it("validates a valid request", () => {
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("validates request with all optional fields", () => {
      const request: ReservationRequest = {
        party_size: 4,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat if possible",
        contact: {
          name: "John Doe",
          phone: "+1-555-0100",
          email: "john@example.com",
        },
        constraints: {
          earliest_iso_time: "2025-10-20T18:30:00-07:00",
          latest_iso_time: "2025-10-20T20:00:00-07:00",
          outdoor_ok: true,
          accessibility_required: false,
        },
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(true);
    });

    it("rejects request missing required fields", () => {
      const request = {
        party_size: 2,
        // missing iso_time
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBeGreaterThan(0);
    });

    it("rejects request with invalid party_size", () => {
      const request = {
        party_size: 0, // Invalid: must be >= 1
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with party_size > 20", () => {
      const request = {
        party_size: 25, // Invalid: must be <= 20
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with invalid email", () => {
      const request = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        contact: {
          email: "not-an-email",
        },
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });

    it("rejects request with notes too long", () => {
      const request = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "x".repeat(2001), // Max 2000
      };

      const result = validateReservationRequest(request);

      expect(result.valid).toBe(false);
    });
  });

  describe("validateReservationResponse", () => {
    it("validates confirmed response", () => {
      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:00:00-07:00",
        message: "See you at 7pm!",
        table: "A4",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("validates suggested response", () => {
      const response: ReservationResponse = {
        status: "suggested",
        iso_time: "2025-10-20T19:30:00-07:00",
        message: "7pm is full, how about 7:30?",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("validates declined response", () => {
      const response: ReservationResponse = {
        status: "declined",
        message: "Sorry, we're fully booked",
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(true);
    });

    it("rejects response missing required status", () => {
      const response = {
        iso_time: "2025-10-20T19:00:00-07:00",
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

    it("rejects confirmed response without iso_time", () => {
      const response = {
        status: "confirmed",
        // missing required iso_time for confirmed status
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(false);
    });

    it("rejects suggested response without iso_time", () => {
      const response = {
        status: "suggested",
        // missing required iso_time for suggested status
      };

      const result = validateReservationResponse(response);

      expect(result.valid).toBe(false);
    });
  });

  describe("buildReservationRequest", () => {
    it("builds encrypted event template", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      expect(template.kind).toBe(9901);
      expect(template.content).toBeTruthy();
      expect(template.tags).toContainEqual(["p", recipientPublicKey]);
      expect(template.created_at).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    });

    it("includes additional tags", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const additionalTags = [
        ["e", "parent-event-id", "", "root"],
      ];

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey,
        additionalTags
      );

      expect(template.tags).toContainEqual(["e", "parent-event-id", "", "root"]);
    });

    it("throws error for invalid request", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const invalidRequest = {
        party_size: 0, // Invalid
        iso_time: "2025-10-20T19:00:00-07:00",
      } as ReservationRequest;

      expect(() =>
        buildReservationRequest(invalidRequest, senderPrivateKey, recipientPublicKey)
      ).toThrow(/Invalid reservation request/);
    });
  });

  describe("buildReservationResponse", () => {
    it("builds encrypted event template", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:00:00-07:00",
        table: "A4",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey
      );

      expect(template.kind).toBe(9902);
      expect(template.content).toBeTruthy();
      expect(template.tags).toContainEqual(["p", recipientPublicKey]);
    });

    it("throws error for invalid response", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPublicKey = getPublicKey(generateSecretKey());

      const invalidResponse = {
        status: "invalid-status",
      } as unknown as ReservationResponse;

      expect(() =>
        buildReservationResponse(invalidResponse, senderPrivateKey, recipientPublicKey)
      ).toThrow(/Invalid reservation response/);
    });
  });

  describe("parseReservationRequest", () => {
    it("parses and decrypts request from rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const request: ReservationRequest = {
        party_size: 4,
        iso_time: "2025-10-20T20:00:00-07:00",
        notes: "Anniversary dinner",
      };

      const template = buildReservationRequest(
        request,
        senderPrivateKey,
        recipientPublicKey
      );

      // Create a pseudo-rumor
      const rumor = {
        kind: 9901,
        content: template.content,
        pubkey: senderPublicKey,
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
    it("parses and decrypts response from rumor", () => {
      const senderPrivateKey = generateSecretKey();
      const recipientPrivateKey = generateSecretKey();
      const senderPublicKey = getPublicKey(senderPrivateKey);
      const recipientPublicKey = getPublicKey(recipientPrivateKey);

      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T20:00:00-07:00",
        table: "12",
        message: "Confirmed!",
      };

      const template = buildReservationResponse(
        response,
        senderPrivateKey,
        recipientPublicKey
      );

      const rumor = {
        kind: 9902,
        content: template.content,
        pubkey: senderPublicKey,
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

      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat if possible",
        contact: {
          name: "John",
          email: "john@example.com",
        },
      };

      // Build and wrap
      const template = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      const giftWrap = wrapEvent(template, conciergePrivateKey, restaurantPublicKey);

      // Unwrap and parse
      const { rumor } = unwrapAndDecrypt(giftWrap, restaurantPrivateKey);
      const parsed = parseReservationRequest(rumor, restaurantPrivateKey);

      expect(parsed).toEqual(request);
    });

    it("full response workflow: build → wrap → unwrap → parse", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const response: ReservationResponse = {
        status: "suggested",
        iso_time: "2025-10-20T19:30:00-07:00",
        message: "7pm is full, but 7:30 works!",
      };

      // Build and wrap
      const template = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const giftWrap = wrapEvent(template, restaurantPrivateKey, conciergePublicKey);

      // Unwrap and parse
      const { rumor } = unwrapAndDecrypt(giftWrap, conciergePrivateKey);
      const parsed = parseReservationResponse(rumor, conciergePrivateKey);

      expect(parsed).toEqual(response);
    });

    it("handles declined reservation", () => {
      const restaurantPrivateKey = generateSecretKey();
      const conciergePrivateKey = generateSecretKey();
      const conciergePublicKey = getPublicKey(conciergePrivateKey);

      const response: ReservationResponse = {
        status: "declined",
        message: "Sorry, fully booked that evening",
      };

      const template = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const giftWrap = wrapEvent(template, restaurantPrivateKey, conciergePublicKey);
      const { rumor } = unwrapAndDecrypt(giftWrap, conciergePrivateKey);
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
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
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

      const { rumor: requestRumor } = unwrapAndDecrypt(requestWrap, restaurantPrivateKey);
      const parsedRequest = parseReservationRequest(requestRumor, restaurantPrivateKey);

      expect(parsedRequest.party_size).toBe(2);

      // Step 2: Restaurant suggests different time
      const suggestion: ReservationResponse = {
        status: "suggested",
        iso_time: "2025-10-20T19:30:00-07:00",
        message: "7pm is full, how about 7:30?",
      };

      const suggestionTemplate = buildReservationResponse(
        suggestion,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const suggestionWrap = wrapEvent(
        suggestionTemplate,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const { rumor: suggestionRumor } = unwrapAndDecrypt(
        suggestionWrap,
        conciergePrivateKey
      );
      const parsedSuggestion = parseReservationResponse(
        suggestionRumor,
        conciergePrivateKey
      );

      expect(parsedSuggestion.status).toBe("suggested");
      expect(parsedSuggestion.iso_time).toBe("2025-10-20T19:30:00-07:00");

      // Step 3: Restaurant confirms
      const confirmation: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:30:00-07:00",
        table: "A5",
        message: "Confirmed for 7:30pm!",
      };

      const confirmTemplate = buildReservationResponse(
        confirmation,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const confirmWrap = wrapEvent(
        confirmTemplate,
        restaurantPrivateKey,
        conciergePublicKey
      );

      const { rumor: confirmRumor } = unwrapAndDecrypt(confirmWrap, conciergePrivateKey);
      const parsedConfirm = parseReservationResponse(confirmRumor, conciergePrivateKey);

      expect(parsedConfirm.status).toBe("confirmed");
      expect(parsedConfirm.table).toBe("A5");
    });
  });
});

