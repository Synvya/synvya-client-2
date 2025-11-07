/**
 * Hook for handling reservation response actions
 * 
 * Provides functions to accept, decline, or respond to modification requests
 * for reservation requests.
 */

import { useState, useCallback } from "react";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { useReservations } from "@/state/useReservations";
import { buildReservationResponse, buildReservationModificationResponse, buildReservationModificationRequest } from "@/lib/reservationEvents";
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
    iso_time?: string | null; // Optional override for iso_time (used when auto-replying to modification responses)
}

export interface DeclineOptions {
    message?: string;
}

export interface SendModificationRequestOptions {
    party_size: number;
    iso_time: string;
    notes?: string;
    contact?: {
        name?: string;
        phone?: string;
        email?: string;
    };
    constraints?: {
        earliest_iso_time?: string;
        latest_iso_time?: string;
    };
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

                // Find the original request's rumor ID for threading
                // Per NIP-17, all messages in a thread must reference the unsigned 9901 rumor ID
                // CRITICAL: Must use the rumor.id from the ORIGINAL 9901 request rumor, NOT gift wrap or seal IDs
                let rootRumorId: string;
                if (request.type === "request") {
                    // For requests, use the rumor ID directly (it's the thread root)
                    // This is the unsigned 9901 rumor ID that all subsequent messages must reference
                    if (request.rumor.kind !== 9901) {
                        console.error("[sendResponse] ❌ Expected request to be kind 9901", {
                            expectedKind: 9901,
                            actualKind: request.rumor.kind,
                            requestId: request.rumor.id,
                            requestType: request.type,
                        });
                        throw new Error(`Expected request rumor to be kind 9901, got ${request.rumor.kind}`);
                    }
                    rootRumorId = request.rumor.id;
                    console.log("[sendResponse] Using original 9901 request ID as thread root", {
                        threadRoot: rootRumorId,
                        requestKind: request.rumor.kind,
                        recipientPubkey: request.senderPubkey,
                    });
                } else {
                    // Extract root rumor ID from e tags (per NIP-17)
                    // The root e tag should point to the unsigned 9901 rumor ID
                    const rootTag = request.rumor.tags.find(tag => tag[0] === "e" && tag[3] === "root");
                    if (!rootTag) {
                        console.error("[sendResponse] ❌ No root tag found in request", {
                            requestId: request.rumor.id,
                            requestKind: request.rumor.kind,
                            requestType: request.type,
                            tags: request.rumor.tags,
                        });
                        throw new Error("Cannot find root rumor ID in message tags");
                    }
                    rootRumorId = rootTag[1];
                    console.log("[sendResponse] Extracted thread root from request tags", {
                        threadRoot: rootRumorId,
                        requestId: request.rumor.id,
                        requestKind: request.rumor.kind,
                        requestType: request.type,
                    });
                }

                // Build thread tag - MUST reference the unsigned 9901 rumor ID per NIP-17
                // The unsigned 9901 event ID threads all subsequent messages together
                const threadTag: string[][] = [
                    ["e", rootRumorId, "", "root"]
                ];
                
                console.log("[sendResponse] Sending reservation response", {
                    responseStatus: response.status,
                    threadRoot: rootRumorId,
                    recipientPubkey: request.senderPubkey,
                    threadTag,
                });

                // IMPORTANT: Implement "Self CC" per NIP-17 pattern
                // Create ONE rumor template (same content, same tags, same p tag)
                // The p tag points to the original recipient (agent), not ourselves
                // Encryption happens at the seal/gift wrap layer, not the rumor layer
                const responseTemplate = buildReservationResponse(
                    response,
                    privateKey,
                    request.senderPubkey,  // p tag points to original recipient (agent)
                    threadTag
                );

                // Create the rumor from the template (for local storage)
                const rumor = createRumor(responseTemplate, privateKey);

                // Wrap the SAME rumor in TWO gift wraps with DIFFERENT encryption:
                // 1. Gift wrap TO agent (encrypted for agent to read)
                // 2. Gift wrap TO self (encrypted for merchant to read - Self CC)
                const giftWrapToRecipient = wrapEvent(
                    responseTemplate,
                    privateKey,
                    request.senderPubkey  // Addressed to agent
                );
                
                const giftWrapToSelf = wrapEvent(
                    responseTemplate,
                    privateKey,
                    pubkey!  // Addressed to self (merchant)
                );

                // Publish BOTH gift wraps to relays
                // This ensures merchant can retrieve their own messages across devices
                await Promise.all([
                    publishToRelays(giftWrapToRecipient, relays),
                    publishToRelays(giftWrapToSelf, relays),
                ]);

        // DON'T add message immediately - let it come back from relay subscription
        // This prevents duplicates from Self CC pattern
        // The relay subscription will receive the Self CC message and add it via addMessage

                setState({ loading: false, error: null, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to send response";
                setState({ loading: false, error: message, success: false });
                throw error;
            }
        },
        [relays, pubkey]
    );

    const acceptReservation = useCallback(
        async (
            request: ReservationMessage,
            options: AcceptOptions = {}
        ): Promise<void> => {
            const response: ReservationResponse = {
                status: "confirmed",
                iso_time: options.iso_time !== undefined ? options.iso_time : (request.payload as any).iso_time,
                table: options.table || null,
                message: options.message,
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


    const sendModificationRequest = useCallback(
        async (
            response: ReservationMessage,
            options: SendModificationRequestOptions
        ): Promise<void> => {
            setState({ loading: true, error: null, success: false });

            try {
                // Load private key
                const nsec = await loadAndDecryptSecret();
                if (!nsec) {
                    throw new Error("Unable to load private key");
                }
                const privateKey = skFromNsec(nsec);

                // Find the original request's rumor ID for threading
                // CRITICAL: Always use the unsigned 9901 rumor ID as the root
                // - If this is a request message (kind 9901), use its own rumor ID
                // - If this is a response/modification message, extract root from e tags
                let rootRumorId: string;
                if (response.type === "request") {
                    // This is the original 9901 request - use its rumor ID directly
                    if (response.rumor.kind !== 9901) {
                        console.error("[sendModificationRequest] ❌ Expected request to be kind 9901", {
                            expectedKind: 9901,
                            actualKind: response.rumor.kind,
                            requestId: response.rumor.id,
                            requestType: response.type,
                        });
                        throw new Error(`Expected request rumor to be kind 9901, got ${response.rumor.kind}`);
                    }
                    rootRumorId = response.rumor.id;
                    console.log("[sendModificationRequest] Using original 9901 request ID as thread root", {
                        threadRoot: rootRumorId,
                        requestKind: response.rumor.kind,
                        recipientPubkey: response.senderPubkey,
                    });
                } else {
                    // Extract root rumor ID from e tags (per NIP-17)
                    // The root e tag should point to the unsigned 9901 rumor ID
                    const rootTag = response.rumor.tags.find(tag => tag[0] === "e" && tag[3] === "root");
                    if (!rootTag) {
                        console.error("[sendModificationRequest] ❌ No root tag found in message", {
                            messageId: response.rumor.id,
                            messageKind: response.rumor.kind,
                            messageType: response.type,
                            tags: response.rumor.tags,
                        });
                        throw new Error("Cannot find root rumor ID in message tags");
                    }
                    rootRumorId = rootTag[1];
                    console.log("[sendModificationRequest] Extracted thread root from message tags", {
                        threadRoot: rootRumorId,
                        messageId: response.rumor.id,
                        messageKind: response.rumor.kind,
                        messageType: response.type,
                    });
                }

                // Build modification request payload
                const modificationRequest: ReservationModificationRequest = {
                    party_size: options.party_size,
                    iso_time: options.iso_time,
                    notes: options.notes,
                    contact: options.contact,
                    constraints: options.constraints,
                };

                // Build thread tags per NIP-17 and NIP-RR:
                // - Root: ALWAYS the unsigned 9901 rumor ID (the original request)
                // - Only use root tag, no reply tags per NIP-RR specification
                const threadTag: string[][] = [
                    ["e", rootRumorId, "", "root"]
                ];

                console.log("[sendModificationRequest] Sending modification request", {
                    threadRoot: rootRumorId,
                    recipientPubkey: response.senderPubkey,
                    threadTag,
                    payload: modificationRequest,
                });

                // IMPORTANT: Implement "Self CC" per NIP-17 pattern
                const requestToAgent = buildReservationModificationRequest(
                    modificationRequest,
                    privateKey,
                    response.senderPubkey,
                    threadTag
                );
                
                const requestToSelf = buildReservationModificationRequest(
                    modificationRequest,
                    privateKey,
                    pubkey!,
                    threadTag
                );

                // Create rumor from the Self CC template (for local storage)
                const rumor = createRumor(requestToSelf, privateKey);

                // Wrap both requests in gift wraps
                const giftWrapToRecipient = wrapEvent(
                    requestToAgent,
                    privateKey,
                    response.senderPubkey
                );
                
                const giftWrapToSelf = wrapEvent(
                    requestToSelf,
                    privateKey,
                    pubkey!
                );

                // Publish BOTH gift wraps to relays
                await Promise.all([
                    publishToRelays(giftWrapToRecipient, relays),
                    publishToRelays(giftWrapToSelf, relays),
                ]);

                // DON'T add message immediately - let it come back from relay subscription
                // This prevents duplicates from Self CC pattern
                // The relay subscription will receive the Self CC message and add it via addMessage

                setState({ loading: false, error: null, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to send modification request";
                setState({ loading: false, error: message, success: false });
                throw error;
            }
        },
        [relays, pubkey]
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
                // - Root: unsigned 9901 rumor ID (the original request)
                const rootTags = modificationRequest.rumor.tags
                    .filter(tag => tag[0] === "e" && tag[3] === "root")
                    .map(tag => ["e", tag[1], tag[2] || "", "root"]);
                
                if (rootTags.length === 0) {
                    console.error("[sendModificationResponse] ❌ No root tags found in modification request", {
                        modificationRequestId: modificationRequest.rumor.id,
                        modificationRequestKind: modificationRequest.rumor.kind,
                        tags: modificationRequest.rumor.tags,
                    });
                    throw new Error("Cannot find root rumor ID in modification request tags");
                }
                
                const threadTag: string[][] = [
                    ...rootTags
                ];

                console.log("[sendModificationResponse] Sending modification response", {
                    threadRoot: rootTags[0]?.[1],
                    recipientPubkey: modificationRequest.senderPubkey,
                    threadTag,
                    responseStatus: response.status,
                });

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

                // DON'T add message immediately - let it come back from relay subscription
                // This prevents duplicates from Self CC pattern
                // The relay subscription will receive the Self CC message and add it via addMessage

                setState({ loading: false, error: null, success: true });
            } catch (error) {
                const message =
                    error instanceof Error ? error.message : "Failed to send modification response";
                setState({ loading: false, error: message, success: false });
                throw error;
            }
        },
        [relays, pubkey]
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
                message: options.message,
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
        sendModificationRequest,
        acceptModification,
        declineModification,
    };
}

