/**
 * Hook for handling reservation response actions
 * 
 * Provides functions to accept, decline, or suggest alternative times
 * for reservation requests.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { buildReservationResponse } from "@/lib/reservationEvents";
import { publishToRelays } from "@/lib/relayPool";
import { wrapEvent } from "@/lib/nip59";
import { loadAndDecryptSecret } from "@/lib/secureStore";
import { skFromNsec } from "@/lib/nostrKeys";
import type { ReservationResponse } from "@/types/reservation";
import type { ReservationMessage } from "@/services/reservationService";
import { getThreadContext, buildReplyTags } from "@/lib/nip10";

export interface ReservationActionState {
  loading: boolean;
  error: string | null;
  success: boolean;
}

export interface AcceptOptions {
  table?: string;
  message?: string;
  holdExpiresAt?: string;
}

export interface DeclineOptions {
  message?: string;
}

export interface SuggestOptions {
  alternativeTime: string;
  message?: string;
}

export function useReservationActions() {
  const { signEvent } = useAuth();
  const relays = useRelays((state) => state.relays);
  const [state, setState] = useState<ReservationActionState>({
    loading: false,
    error: null,
    success: false,
  });

  const resetState = useCallback(() => {
    setState({ loading: false, error: null, success: false });
  }, []);

  const sendResponse = useCallback(
    async (
      request: ReservationMessage,
      response: ReservationResponse
    ): Promise<void> => {
      setState({ loading: true, error: null, success: false });

      try {
        // Load private key
        const nsec = await loadAndDecryptSecret();
        if (!nsec) {
          throw new Error("Unable to load private key");
        }
        const privateKey = skFromNsec(nsec);

        // Build reply tags for threading using the rumor (unwrapped request)
        // Cast rumor to Event type since it has id and tags which is all buildReplyTags needs
        const replyTags = buildReplyTags(
          request.rumor as any,
          [request.senderPubkey],
          relays[0]
        );

        // Build response event template
        const responseTemplate = buildReservationResponse(
          response,
          privateKey,
          request.senderPubkey,
          replyTags
        );

        // Wrap in gift wrap
        const giftWrap = wrapEvent(
          responseTemplate,
          privateKey,
          request.senderPubkey
        );

        // Sign with merchant's key
        // Note: wrapEvent already creates a signed event, but we need to ensure it's properly signed
        // The wrapEvent function handles this internally

        // Publish to relays
        await publishToRelays(giftWrap, relays);

        setState({ loading: false, error: null, success: true });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to send response";
        setState({ loading: false, error: message, success: false });
        throw error;
      }
    },
    [relays]
  );

  const acceptReservation = useCallback(
    async (
      request: ReservationMessage,
      options: AcceptOptions = {}
    ): Promise<void> => {
      const response: ReservationResponse = {
        status: "confirmed",
        iso_time: (request.payload as any).iso_time,
        table: options.table || null,
        message: options.message,
        hold_expires_at: options.holdExpiresAt || null,
      };

      await sendResponse(request, response);
    },
    [sendResponse]
  );

  const declineReservation = useCallback(
    async (
      request: ReservationMessage,
      options: DeclineOptions = {}
    ): Promise<void> => {
      const response: ReservationResponse = {
        status: "declined",
        iso_time: null,
        message: options.message,
      };

      await sendResponse(request, response);
    },
    [sendResponse]
  );

  const suggestAlternativeTime = useCallback(
    async (
      request: ReservationMessage,
      options: SuggestOptions
    ): Promise<void> => {
      const response: ReservationResponse = {
        status: "suggested",
        iso_time: options.alternativeTime,
        message: options.message,
      };

      await sendResponse(request, response);
    },
    [sendResponse]
  );

  return {
    state,
    resetState,
    acceptReservation,
    declineReservation,
    suggestAlternativeTime,
  };
}

