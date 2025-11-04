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
import { buildReservationResponse, buildReservationModificationResponse } from "@/lib/reservationEvents";
import { publishToRelays } from "@/lib/relayPool";
import { wrapEvent, createRumor } from "@/lib/nip59";
import { loadAndDecryptSecret } from "@/lib/secureStore";
import { skFromNsec } from "@/lib/nostrKeys";
import type { 
    ReservationResponse, 
    ReservationModificationResponse,
    ReservationModificationRequest
} from "@/types/reservation";
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

                // Build thread tag - MUST reference the unsigned 9901 rumor ID per NIP-17
                // The unsigned 9901 event ID threads all subsequent messages together
                const threadTag: string[][] = [
                    ["e", request.rumor.id, "", "root"]
                ];

                // IMPORTANT: Implement "Self CC" per NIP-17 pattern
                // Create TWO separate response templates with DIFFERENT encryption:
                // 1. Response TO agent (encrypted for agent to read)
                // 2. Response TO self (encrypted for merchant to read - Self CC)
                
                const responseToAgent = buildReservationResponse(
                    response,
                    privateKey,
                    request.senderPubkey,  // Encrypt TO agent
                    threadTag
                );
                
                const responseToSelf = buildReservationResponse(
                    response,
                    privateKey,
                    pubkey!,  // Encrypt TO merchant (self)
                    threadTag
                );

                // Create rumor from the Self CC template (for local storage)
                const rumor = createRumor(responseToSelf, privateKey);

                // Wrap both responses in gift wraps
                const giftWrapToRecipient = wrapEvent(
                    responseToAgent,
                    privateKey,
                    request.senderPubkey  // Addressed to agent
                );
                
                const giftWrapToSelf = wrapEvent(
                    responseToSelf,
                    privateKey,
                    pubkey!  // Addressed to self (merchant)
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

    const sendModificationResponse = useCallback(
        async (
            modificationRequest: ReservationMessage,
            response: ReservationModificationResponse
        ): Promise<void> => {
            setState({ loading: true, error: null, success: false });

            try {
                // Load private key
                const nsec = await loadAndDecryptSecret();
                if (!nsec) {
                    throw new Error("Unable to load private key");
                }
                const privateKey = skFromNsec(nsec);

                // Build thread tags per NIP-17:
                // - Root: unsigned 9901 rumor ID (extracted from modification request's tags)
                // - Reply: unsigned 9903 rumor ID (the modification request itself)
                const rootTags = modificationRequest.rumor.tags
                    .filter(tag => tag[0] === "e" && tag[3] === "root")
                    .map(tag => ["e", tag[1], tag[2] || "", "root"]);
                
                const threadTag: string[][] = [
                    ["e", modificationRequest.rumor.id, "", "reply"],
                    ...rootTags
                ];

                // IMPORTANT: Implement "Self CC" per NIP-17 pattern
                const responseToAgent = buildReservationModificationResponse(
                    response,
                    privateKey,
                    modificationRequest.senderPubkey,
                    threadTag
                );
                
                const responseToSelf = buildReservationModificationResponse(
                    response,
                    privateKey,
                    pubkey!,
                    threadTag
                );

                // Create rumor from the Self CC template (for local storage)
                const rumor = createRumor(responseToSelf, privateKey);

                // Wrap both responses in gift wraps
                const giftWrapToRecipient = wrapEvent(
                    responseToAgent,
                    privateKey,
                    modificationRequest.senderPubkey
                );
                
                const giftWrapToSelf = wrapEvent(
                    responseToSelf,
                    privateKey,
                    pubkey!
                );

                // Publish BOTH gift wraps to relays
                await Promise.all([
                    publishToRelays(giftWrapToRecipient, relays),
                    publishToRelays(giftWrapToSelf, relays),
                ]);

                // Add response to local state immediately
                if (pubkey) {
                    const responseMessage: ReservationMessage = {
                        rumor: rumor,
                        type: "modification-response",
                        payload: response,
                        senderPubkey: pubkey,
                        giftWrap: giftWrapToSelf,
                    };
                    addMessage(responseMessage);
                }

                setState({ loading: false, error: null, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to send modification response";
                setState({ loading: false, error: message, success: false });
                throw error;
            }
        },
        [relays, addMessage, pubkey]
    );

    const acceptModification = useCallback(
        async (
            modificationRequest: ReservationMessage,
            options: AcceptOptions = {}
        ): Promise<void> => {
            const modificationPayload = modificationRequest.payload as ReservationModificationRequest;
            const response: ReservationModificationResponse = {
                status: "confirmed",
                iso_time: modificationPayload.iso_time,
                table: options.table || null,
                message: options.message,
                hold_expires_at: options.holdExpiresAt || null,
            };

            await sendModificationResponse(modificationRequest, response);
        },
        [sendModificationResponse]
    );

    const declineModification = useCallback(
        async (
            modificationRequest: ReservationMessage,
            options: DeclineOptions = {}
        ): Promise<void> => {
            const response: ReservationModificationResponse = {
                status: "declined",
                iso_time: null,
                message: options.message,
            };

            await sendModificationResponse(modificationRequest, response);
        },
        [sendModificationResponse]
    );

    return {
        state,
        resetState,
        acceptReservation,
        declineReservation,
        suggestAlternativeTime,
        acceptModification,
        declineModification,
    };
}

