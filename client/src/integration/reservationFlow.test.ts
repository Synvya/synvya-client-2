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
import { generateSecretKey, getPublicKey, getEventHash } from "nostr-tools";
import type { UnsignedEvent } from "nostr-tools";
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
import { wrapEvent, unwrapEvent, createRumor } from "@/lib/nip59";
import type {
  ReservationRequest,
  ReservationResponse,
  ReservationModificationRequest,
  ReservationModificationResponse,
} from "@/types/reservation";
import { iso8601ToUnixAndTzid } from "@/lib/reservationTimeUtils";

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
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const initialRequest: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
        message: "Window seat preferred",
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
      const unwrappedRequestRumor = unwrapEvent(requestWrap, restaurantPrivateKey);
      const parsedRequest = parseReservationRequest(unwrappedRequestRumor, restaurantPrivateKey);

      expect(parsedRequest.party_size).toBe(2);
      expect(parsedRequest.time).toBe(unixTimestamp);

      // Step 2: Restaurant responds with alternative time (9902 with confirmed status)
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
        rootRumorId  // Use unsigned 9901 rumor ID per NIP-17
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
      const unwrappedSuggestionRumor = unwrapEvent(suggestionWrap, conciergePrivateKey);
      const parsedSuggestion = parseReservationResponse(unwrappedSuggestionRumor, conciergePrivateKey);

      expect(parsedSuggestion.status).toBe("confirmed");
      expect(parsedSuggestion.time).toBe(suggestionTime);

      // Step 3: Concierge accepts with modification request (9903)
      const modificationRequest: ReservationModificationRequest = {
        party_size: 2,
        time: suggestionTime,
        tzid: suggestionTzid,
        message: "7:30pm works for us",
      };

      // Root rumor ID is required for threading (references unsigned 9901 rumor ID per NIP-17)
      const modRequestTemplate = buildReservationModificationRequest(
        modificationRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        rootRumorId  // Unsigned 9901 rumor ID (required for threading)
      );
      const modRequestRumor = createRumor(modRequestTemplate, conciergePrivateKey);
      const modRequestRumorId = modRequestRumor.id;
      expect(modRequestTemplate.kind).toBe(9903);

      // Verify threading tags reference original request (root tag is required)
      const modRequestRootTags = modRequestTemplate.tags.filter((tag) => tag[0] === "e" && tag[3] === "root");
      expect(modRequestRootTags.length).toBe(1);
      expect(modRequestRootTags[0][1]).toBe(rootRumorId);

      const modRequestWrap = wrapEvent(
        modRequestTemplate,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const unwrappedModRequestRumor = unwrapEvent(modRequestWrap, restaurantPrivateKey);
      const parsedModRequest = parseReservationModificationRequest(
        unwrappedModRequestRumor,
        restaurantPrivateKey
      );

      expect(parsedModRequest.party_size).toBe(2);
      expect(parsedModRequest.time).toBe(suggestionTime);

      // Step 4: Restaurant confirms modification (9904)
      const confirmation: ReservationModificationResponse = {
        status: "confirmed",
        time: suggestionTime,
        tzid: suggestionTzid,
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
      const confirmRumor = unwrapEvent(confirmWrap, conciergePrivateKey);
      const parsedConfirm = parseReservationModificationResponse(confirmRumor, conciergePrivateKey);

      expect(parsedConfirm.status).toBe("confirmed");
      expect(parsedConfirm.time).toBe(suggestionTime);
    });
  });

  describe("Thread Tracking", () => {
    it("should maintain thread integrity across all 4 message types", () => {
      // Initial request
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
      // Create unsigned rumor to get its ID (per NIP-17)
      const requestRumor = createRumor(requestTemplate, conciergePrivateKey);
      const rootRumorId = requestRumor.id;

      const requestWrap = wrapEvent(requestTemplate, conciergePrivateKey, restaurantPublicKey);
      const rootEventId = rootRumorId;

      // Response with threading to root (using unsigned 9901 rumor ID)
      const { unixTimestamp: responseTime, tzid: responseTzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const response: ReservationResponse = {
        status: "confirmed",
        time: responseTime,
        tzid: responseTzid,
      };

      const responseTemplate = buildReservationResponse(
        response,
        restaurantPrivateKey,
        conciergePublicKey,
        rootRumorId  // Use unsigned 9901 rumor ID per NIP-17
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
        time: responseTime,
        tzid: responseTzid,
      };

      const modRequestTemplate = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        rootRumorId  // Unsigned 9901 rumor ID (required for threading)
      );
      const modRequestRumor = createRumor(modRequestTemplate, conciergePrivateKey);
      const modRequestRumorId = modRequestRumor.id;
      const modRequestWrap = wrapEvent(modRequestTemplate, conciergePrivateKey, restaurantPublicKey);

      // Verify modification request references root (per NIP-RP, only root tag is required)
      const modRequestRootTags = modRequestTemplate.tags.filter(
        (tag) => tag[0] === "e" && tag[3] === "root"
      );
      expect(modRequestRootTags.length).toBe(1);
      expect(modRequestRootTags[0][1]).toBe(rootRumorId);

      // Modification response with threading (using unsigned rumor IDs)
      const modResponse: ReservationModificationResponse = {
        status: "confirmed",
        time: responseTime,
        tzid: responseTzid,
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
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const request: ReservationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
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
      const { unixTimestamp: modTime, tzid: modTzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const modRequest: ReservationModificationRequest = {
        party_size: 2,
        time: modTime,
        tzid: modTzid,
      };

      // Get root rumor ID for threading
      const requestPubkey = getPublicKey(conciergePrivateKey);
      const requestUnsignedEvent: UnsignedEvent = {
        ...requestTemplate,
        pubkey: requestPubkey,
      };
      const rootRumorId = getEventHash(requestUnsignedEvent);

      const modRequestToRecipient = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        rootRumorId
      );
      const modRequestToSelf = buildReservationModificationRequest(
        modRequest,
        conciergePrivateKey,
        conciergePublicKey,
        rootRumorId
      );

      expect(modRequestToRecipient.kind).toBe(9903);
      expect(modRequestToSelf.kind).toBe(9903);
    });
  });

  describe("Error Handling", () => {
    it("should handle declined modification requests", () => {
      const conciergePrivateKey = generateSecretKey();
      const restaurantPrivateKey = generateSecretKey();
      const restaurantPublicKey = getPublicKey(restaurantPrivateKey);
      
      // Create a request to get rootRumorId
      const { unixTimestamp: requestTime, tzid: requestTzid } = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
      const initialRequest: ReservationRequest = {
        party_size: 2,
        time: requestTime,
        tzid: requestTzid,
      };
      const requestTemplate = buildReservationRequest(
        initialRequest,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const requestPubkey = getPublicKey(conciergePrivateKey);
      const requestUnsignedEvent: UnsignedEvent = {
        ...requestTemplate,
        pubkey: requestPubkey,
      };
      const rootRumorId = getEventHash(requestUnsignedEvent);

      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid("2025-10-20T19:30:00-07:00");
      const modificationRequest: ReservationModificationRequest = {
        party_size: 2,
        time: unixTimestamp,
        tzid,
      };

      const modRequestTemplate = buildReservationModificationRequest(
        modificationRequest,
        conciergePrivateKey,
        restaurantPublicKey,
        rootRumorId
      );
      const modRequestWrap = wrapEvent(
        modRequestTemplate,
        conciergePrivateKey,
        restaurantPublicKey
      );
      const modRequestRumor = unwrapEvent(modRequestWrap, restaurantPrivateKey);

      // Restaurant declines modification
      const decline: ReservationModificationResponse = {
        status: "declined",
        time: null,
        message: "That time is no longer available",
      };

      const declineTemplate = buildReservationModificationResponse(
        decline,
        restaurantPrivateKey,
        conciergePublicKey
      );
      const declineWrap = wrapEvent(declineTemplate, restaurantPrivateKey, conciergePublicKey);
      const declineRumor = unwrapEvent(declineWrap, conciergePrivateKey);
      const parsedDecline = parseReservationModificationResponse(declineRumor, conciergePrivateKey);

      expect(parsedDecline.status).toBe("declined");
      expect(parsedDecline.message).toBe("That time is no longer available");
    });
  });
});

