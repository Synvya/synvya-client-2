/**
 * Integration Tests for 4-Message Reservation Protocol Flow
 * 
 * Tests the complete reservation negotiation flow:
 * 1. reservation.request (9901)
 * 2. reservation.response (9902)
 * 3. reservation.modification.request (9903)
 * 4. reservation.modification.response (9904)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools";
import {
  buildReservationRequest,
  buildReservationResponse,
  buildReservationModificationRequest,
  buildReservationModificationResponse,
  parseReservationRequest,
  parseReservationResponse,
  parseReservationModificationRequest,
  parseReservationModificationResponse,
} from "@/lib/reservationEvents";
import { wrapEvent, unwrapAndDecrypt, createRumor } from "@/lib/nip59";
import { buildHandlerInfo, buildHandlerRecommendation } from "@/lib/handlerEvents";
import type {
  ReservationRequest,
  ReservationResponse,
  ReservationModificationRequest,
  ReservationModificationResponse,
} from "@/types/reservation";

describe("Reservation Flow Integration Tests", () => {
  let conciergePrivateKey: Uint8Array;
  let restaurantPrivateKey: Uint8Array;
  let conciergePublicKey: string;
  let restaurantPublicKey: string;

  beforeEach(() => {
    conciergePrivateKey = generateSecretKey();
    restaurantPrivateKey = generateSecretKey();
    conciergePublicKey = getPublicKey(conciergePrivateKey);
    restaurantPublicKey = getPublicKey(restaurantPrivateKey);
  });

  describe("Complete 4-Message Flow", () => {
    it("should handle complete flow: request → response → modification-request → modification-response", () => {
      // Step 1: Concierge sends initial reservation request (9901)
      const initialRequest: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
        notes: "Window seat preferred",
      };

      const requestTemplate = buildReservationRequest(
        initialRequest,
        conciergePrivateKey,
        restaurantPublicKey
      );
      // Create unsigned rumor to get its ID (per NIP-17)
      const requestRumor = createRumor(requestTemplate, conciergePrivateKey);
      const rootRumorId = requestRumor.id;

      const requestWrap = wrapEvent(requestTemplate, conciergePrivateKey, restaurantPublicKey);
      const { rumor: unwrappedRequestRumor } = unwrapAndDecrypt(requestWrap, restaurantPrivateKey);
      const parsedRequest = parseReservationRequest(unwrappedRequestRumor, restaurantPrivateKey);

      expect(parsedRequest.party_size).toBe(2);
      expect(parsedRequest.iso_time).toBe("2025-10-20T19:00:00-07:00");

      // Step 2: Restaurant responds with alternative time (9902 with confirmed status)
      const suggestion: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:30:00-07:00",
        message: "7pm is full, how about 7:30?",
      };

      const suggestionTemplate = buildReservationResponse(
        suggestion,
        restaurantPrivateKey,
        conciergePublicKey,
        [["e", rootRumorId, "", "root"]]  // Use unsigned 9901 rumor ID per NIP-17
      );
      // Create unsigned rumor to get its ID
      const suggestionRumor = createRumor(suggestionTemplate, restaurantPrivateKey);
      const suggestionRumorId = suggestionRumor.id;

      expect(suggestionTemplate.kind).toBe(9902);

      const suggestionWrap = wrapEvent(
        suggestionTemplate,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const { rumor: unwrappedSuggestionRumor } = unwrapAndDecrypt(suggestionWrap, conciergePrivateKey);
      const parsedSuggestion = parseReservationResponse(unwrappedSuggestionRumor, conciergePrivateKey);

      expect(parsedSuggestion.status).toBe("confirmed");
      expect(parsedSuggestion.iso_time).toBe("2025-10-20T19:30:00-07:00");

      // Step 3: Concierge accepts with modification request (9903)
      const modificationRequest: ReservationModificationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:30:00-07:00",
        notes: "7:30pm works for us",
      };

      // Add threading tags referencing unsigned rumor IDs per NIP-17
      const modRequestTemplate = buildReservationModificationRequest(
        modificationRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        [
          ["e", rootRumorId, "", "root"],           // Unsigned 9901 rumor ID
          ["e", suggestionRumorId, "", "reply"],   // Unsigned 9902 rumor ID
        ]
      );
      const modRequestRumor = createRumor(modRequestTemplate, conciergePrivateKey);
      const modRequestRumorId = modRequestRumor.id;
      expect(modRequestTemplate.kind).toBe(9903);

      // Verify threading tags reference original request
      const modRequestTags = modRequestTemplate.tags.filter((tag) => tag[0] === "e");
      expect(modRequestTags.length).toBeGreaterThan(0);

      const modRequestWrap = wrapEvent(
        modRequestTemplate,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const { rumor: unwrappedModRequestRumor } = unwrapAndDecrypt(modRequestWrap, restaurantPrivateKey);
      const parsedModRequest = parseReservationModificationRequest(
        unwrappedModRequestRumor,
        restaurantPrivateKey
      );

      expect(parsedModRequest.party_size).toBe(2);
      expect(parsedModRequest.iso_time).toBe("2025-10-20T19:30:00-07:00");

      // Step 4: Restaurant confirms modification (9904)
      const confirmation: ReservationModificationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:30:00-07:00",
        message: "Confirmed! See you at 7:30pm",
      };

      // Add threading tags referencing root and modification request (using unsigned rumor IDs)
      const confirmTemplate = buildReservationModificationResponse(
        confirmation,
        restaurantPrivateKey,
        conciergePublicKey,
        [
          ["e", rootRumorId, "", "root"],           // Unsigned 9901 rumor ID
          ["e", modRequestRumorId, "", "reply"],   // Unsigned 9903 rumor ID
        ]
      );
      expect(confirmTemplate.kind).toBe(9904);

      // Verify threading tags reference modification request
      const confirmTags = confirmTemplate.tags.filter((tag) => tag[0] === "e");
      expect(confirmTags.length).toBeGreaterThan(0);

      const confirmWrap = wrapEvent(confirmTemplate, restaurantPrivateKey, conciergePublicKey);
      const { rumor: confirmRumor } = unwrapAndDecrypt(confirmWrap, conciergePrivateKey);
      const parsedConfirm = parseReservationModificationResponse(confirmRumor, conciergePrivateKey);

      expect(parsedConfirm.status).toBe("confirmed");
      expect(parsedConfirm.iso_time).toBe("2025-10-20T19:30:00-07:00");
    });
  });

  describe("Thread Tracking", () => {
    it("should maintain thread integrity across all 4 message types", () => {
      // Initial request
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      const requestTemplate = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );
      // Create unsigned rumor to get its ID (per NIP-17)
      const requestRumor = createRumor(requestTemplate, conciergePrivateKey);
      const rootRumorId = requestRumor.id;

      const requestWrap = wrapEvent(requestTemplate, conciergePrivateKey, restaurantPublicKey);
      const rootEventId = rootRumorId;

      // Response with threading to root (using unsigned 9901 rumor ID)
      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:30:00-07:00",
      };

      const responseTemplate = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey,
        [["e", rootRumorId, "", "root"]]  // Use unsigned 9901 rumor ID per NIP-17
      );
      const responseRumor = createRumor(responseTemplate, restaurantPrivateKey);
      const responseRumorId = responseRumor.id;
      const responseWrap = wrapEvent(responseTemplate, restaurantPrivateKey, conciergePublicKey);

      // Verify response references root
      const responseRootTags = responseTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "root"
      );
      expect(responseRootTags.length).toBe(1);
      expect(responseRootTags[0][1]).toBe(rootRumorId);

      // Modification request with threading (using unsigned rumor IDs)
      const modRequest: ReservationModificationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:30:00-07:00",
      };

      const modRequestTemplate = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        [
          ["e", rootRumorId, "", "root"],           // Unsigned 9901 rumor ID
          ["e", responseRumorId, "", "reply"],     // Unsigned 9902 rumor ID
        ]
      );
      const modRequestRumor = createRumor(modRequestTemplate, conciergePrivateKey);
      const modRequestRumorId = modRequestRumor.id;
      const modRequestWrap = wrapEvent(modRequestTemplate, conciergePrivateKey, restaurantPublicKey);

      // Verify modification request references root and response
      const modRequestRootTags = modRequestTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "root"
      );
      const modRequestReplyTags = modRequestTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "reply"
      );
      expect(modRequestRootTags.length).toBe(1);
      expect(modRequestRootTags[0][1]).toBe(rootRumorId);
      expect(modRequestReplyTags.length).toBeGreaterThan(0);

      // Modification response with threading (using unsigned rumor IDs)
      const modResponse: ReservationModificationResponse = {
        status: "confirmed",
        iso_time: "2025-10-20T19:30:00-07:00",
      };

      const modResponseTemplate = buildReservationModificationResponse(
        modResponse,
        restaurantPrivateKey,
        conciergePublicKey,
        [
          ["e", rootRumorId, "", "root"],           // Unsigned 9901 rumor ID
          ["e", modRequestRumorId, "", "reply"],    // Unsigned 9903 rumor ID
        ]
      );
      const modResponseWrap = wrapEvent(modResponseTemplate, restaurantPrivateKey, conciergePublicKey);

      // Verify modification response references root and modification request
      const modResponseRootTags = modResponseTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "root"
      );
      const modResponseReplyTags = modResponseTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "reply"
      );
      expect(modResponseRootTags.length).toBe(1);
      expect(modResponseRootTags[0][1]).toBe(rootRumorId);
      expect(modResponseReplyTags.length).toBeGreaterThan(0);
    });
  });

  describe("NIP-17 Self CC Pattern", () => {
    it("should support Self CC for all message types", () => {
      // Test that we can create both recipient and self-addressed versions
      const request: ReservationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:00:00-07:00",
      };

      // Create request to recipient
      const requestToRecipient = buildReservationRequest(
        request,
        conciergePrivateKey,
        restaurantPublicKey
      );

      // Create request to self (Self CC)
      const requestToSelf = buildReservationRequest(
        request,
        conciergePrivateKey,
        conciergePublicKey
      );

      expect(requestToRecipient.kind).toBe(9901);
      expect(requestToSelf.kind).toBe(9901);

      // Both should have same content but different encryption targets
      const recipientWrap = wrapEvent(requestToRecipient, conciergePrivateKey, restaurantPublicKey);
      const selfWrap = wrapEvent(requestToSelf, conciergePrivateKey, conciergePublicKey);

      expect(recipientWrap.tags).toContainEqual(["p", restaurantPublicKey]);
      expect(selfWrap.tags).toContainEqual(["p", conciergePublicKey]);

      // Same pattern for modification request
      const modRequest: ReservationModificationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:30:00-07:00",
      };

      const modRequestToRecipient = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const modRequestToSelf = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        conciergePublicKey
      );

      expect(modRequestToRecipient.kind).toBe(9903);
      expect(modRequestToSelf.kind).toBe(9903);
    });
  });

  describe("NIP-89 Handler Discovery", () => {
    it("should advertise support for all 4 kinds in handler info", () => {
      const handlerInfo = buildHandlerInfo(restaurantPublicKey);

      expect(handlerInfo.kind).toBe(31990);

      const kTags = handlerInfo.tags.filter((tag) => tag[0] === "k");
      expect(kTags).toHaveLength(4);

      const kinds = kTags.map((tag) => tag[1]);
      expect(kinds).toContain("9901");
      expect(kinds).toContain("9902");
      expect(kinds).toContain("9903");
      expect(kinds).toContain("9904");
    });

    it("should publish handler recommendations for all 4 kinds", () => {
      const relayUrl = "wss://relay.damus.io";

      const rec9901 = buildHandlerRecommendation(restaurantPublicKey, "9901", relayUrl);
      const rec9902 = buildHandlerRecommendation(restaurantPublicKey, "9902", relayUrl);
      const rec9903 = buildHandlerRecommendation(restaurantPublicKey, "9903", relayUrl);
      const rec9904 = buildHandlerRecommendation(restaurantPublicKey, "9904", relayUrl);

      expect(rec9901.kind).toBe(31989);
      expect(rec9902.kind).toBe(31989);
      expect(rec9903.kind).toBe(31989);
      expect(rec9904.kind).toBe(31989);

      // Verify d tags match event kinds
      expect(rec9901.tags.find((t) => t[0] === "d")?.[1]).toBe("9901");
      expect(rec9902.tags.find((t) => t[0] === "d")?.[1]).toBe("9902");
      expect(rec9903.tags.find((t) => t[0] === "d")?.[1]).toBe("9903");
      expect(rec9904.tags.find((t) => t[0] === "d")?.[1]).toBe("9904");
    });
  });

  describe("Error Handling", () => {
    it("should handle declined modification requests", () => {
      const modificationRequest: ReservationModificationRequest = {
        party_size: 2,
        iso_time: "2025-10-20T19:30:00-07:00",
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
      const { rumor: modRequestRumor } = unwrapAndDecrypt(modRequestWrap, restaurantPrivateKey);

      // Restaurant declines modification
      const decline: ReservationModificationResponse = {
        status: "declined",
        iso_time: null,
        message: "That time is no longer available",
      };

      const declineTemplate = buildReservationModificationResponse(
        decline,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const declineWrap = wrapEvent(declineTemplate, restaurantPrivateKey, conciergePublicKey);
      const { rumor: declineRumor } = unwrapAndDecrypt(declineWrap, conciergePrivateKey);
      const parsedDecline = parseReservationModificationResponse(declineRumor, conciergePrivateKey);

      expect(parsedDecline.status).toBe("declined");
      expect(parsedDecline.message).toBe("That time is no longer available");
    });
  });
});

