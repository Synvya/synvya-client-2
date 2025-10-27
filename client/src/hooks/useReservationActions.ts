/**
 * Hook for handling reservation response actions
 * 
 * Provides functions to accept, decline, or suggest alternative times
 * for reservation requests.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { useReservations } from "@/state/useReservations";
import { buildReservationResponse } from "@/lib/reservationEvents";
import { publishToRelays } from "@/lib/relayPool";
import { wrapEvent, createRumor } from "@/lib/nip59";
import { loadAndDecryptSecret } from "@/lib/secureStore";
import { skFromNsec } from "@/lib/nostrKeys";
import type { ReservationResponse } from "@/types/reservation";
import type { ReservationMessage } from "@/services/reservationService";

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
    const { signEvent, pubkey } = useAuth();
    const relays = useRelays((state) => state.relays);
    const addMessage = useReservations((state) => state.addMessage);
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

                // Build thread tag manually - MUST reference the gift wrap ID
                // Do NOT use buildReplyTags() because gift wraps don't have e tags,
                // causing incorrect thread matching
                const threadTag: string[][] = [
                    ["e", request.giftWrap.id, "", "root"]
                ];

                // Build response event template
                const responseTemplate = buildReservationResponse(
                    response,
                    privateKey,
                    request.senderPubkey,
                    threadTag
                );

                // Create rumor from the template (adds ID and proper structure)
                const rumor = createRumor(responseTemplate, privateKey);

                // IMPORTANT: Implement "Self CC" per NIP-17 pattern
                // Create TWO gift wraps: one to recipient, one to self
                // This allows merchant to retrieve their own responses from relays
                const giftWrapToRecipient = wrapEvent(
                    responseTemplate,
                    privateKey,
                    request.senderPubkey  // To agent
                );
                
                const giftWrapToSelf = wrapEvent(
                    responseTemplate,
                    privateKey,
                    pubkey!  // To self (merchant)
                );

                // Publish BOTH gift wraps to relays
                // This ensures merchant can retrieve their own messages across devices
                await Promise.all([
                    publishToRelays(giftWrapToRecipient, relays),
                    publishToRelays(giftWrapToSelf, relays),
                ]);

        // Add response to local state immediately for instant UI feedback
        // Note: With Self CC implemented, this message will also come back
        // from the relay subscription, but we add it now for responsiveness
        if (pubkey) {
          const responseMessage: ReservationMessage = {
            rumor: rumor,
            type: "response",
            payload: response,
            senderPubkey: pubkey, // We're the sender
            giftWrap: giftWrapToSelf, // Use self-addressed wrap for consistency
          };
          addMessage(responseMessage);
        }

                setState({ loading: false, error: null, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to send response";
                setState({ loading: false, error: message, success: false });
                throw error;
            }
        },
        [relays, addMessage, pubkey]
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

