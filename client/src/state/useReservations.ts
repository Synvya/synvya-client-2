/**
 * Zustand store for managing reservation messages
 */

import { create } from "zustand";
import type { ReservationMessage } from "@/services/reservationService";
import {
  createReservationSubscription,
  type ReservationSubscription,
} from "@/services/reservationService";
import { getThreadContext } from "@/lib/nip10";
import type { ReservationRequest } from "@/types/reservation";
import {
  loadPersistedReservationMessages,
  persistReservationMessages,
  mergeReservationMessages,
} from "@/lib/reservationPersistence";

/**
 * A conversation thread containing related messages
 */
export interface ConversationThread {
  /** Root event ID of the thread */
  rootEventId: string;
  /** All messages in this thread, sorted chronologically */
  messages: ReservationMessage[];
  /** The initial reservation request */
  initialRequest: ReservationMessage;
  /** Latest message in the thread */
  latestMessage: ReservationMessage;
  /** Timestamp of the latest message */
  latestTimestamp: number;
  /** Conversation partner's public key */
  partnerPubkey: string;
  /** Number of messages in thread */
  messageCount: number;
}

export interface ReservationState {
  messages: ReservationMessage[];
  subscription: ReservationSubscription | null;
  isConnected: boolean;
  error: string | null;
  isInitialized: boolean;
  
  // Actions
  addMessage: (message: ReservationMessage) => void;
  startListening: (privateKey: Uint8Array, publicKey: string, relays: string[]) => void;
  stopListening: () => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  markAsRead: (messageId: string) => void;
  loadPersistedMessages: () => void;
  
  // Computed/derived
  getThreads: () => ConversationThread[];
}

export const useReservations = create<ReservationState>((set, get) => ({
  messages: [],
  subscription: null,
  isConnected: false,
  error: null,
  isInitialized: false,

  loadPersistedMessages: () => {
    const persisted = loadPersistedReservationMessages();
    console.log(`[useReservations] Loading ${persisted.length} persisted messages`);
    set({ messages: persisted, isInitialized: true });
  },

  addMessage: (message) => {
    console.log("[useReservations] addMessage called with:", message.type, message.rumor.id);
    set((state) => {
      // Deduplicate: check if message with same rumor ID already exists
      const exists = state.messages.some(m => m.rumor.id === message.rumor.id);
      if (exists) {
        console.log("[useReservations] Message already exists, skipping");
        return state; // Don't add duplicate
      }
      const newMessages = [message, ...state.messages]; // Newest first
      
      console.log(`[useReservations] Adding message, total count: ${newMessages.length}`);
      console.log("[useReservations] About to persist messages...");
      
      // Persist to localStorage
      try {
        persistReservationMessages(newMessages);
        console.log("[useReservations] Persistence completed successfully");
      } catch (error) {
        console.error("[useReservations] Persistence failed:", error);
      }
      
      return {
        messages: newMessages,
      };
    });
  },

  startListening: (privateKey, publicKey, relays) => {
    // Load persisted messages if not already loaded
    if (!get().isInitialized) {
      get().loadPersistedMessages();
    }

    // Stop existing subscription if any
    const existing = get().subscription;
    if (existing) {
      existing.stop();
    }

    // Create and start new subscription
    const subscription = createReservationSubscription({
      relays,
      privateKey,
      publicKey,
      onMessage: (message) => {
        get().addMessage(message);
      },
      onError: (error) => {
        console.error("Reservation subscription error:", error);
        set({ error: error.message });
      },
      onReady: () => {
        set({ isConnected: true, error: null });
      },
    });

    subscription.start();

    set({
      subscription,
      isConnected: subscription.active,
      error: null,
    });
  },

  stopListening: () => {
    const subscription = get().subscription;
    if (subscription) {
      subscription.stop();
    }
    set({
      subscription: null,
      isConnected: false,
    });
  },

  setError: (error) => {
    set({ error });
  },

  clearMessages: () => {
    set({ messages: [] });
    // Clear from localStorage as well
    persistReservationMessages([]);
  },

  markAsRead: (messageId) => {
    // TODO: Implement read tracking
    // For now, this is a placeholder for future functionality
    console.debug("Mark as read:", messageId);
  },

  getThreads: () => {
    const messages = get().messages;
    if (!messages.length) return [];

    // Group messages by thread
    const threadMap = new Map<string, ReservationMessage[]>();

    for (const message of messages) {
      // Extract thread context from rumor tags
      const context = getThreadContext(message.rumor as any); // Rumor has tags, which is all getThreadContext needs
      
      // CRITICAL FIX: Use gift wrap ID for thread matching
      // - If this message has a root e tag, use that (it references another gift wrap ID)
      // - Otherwise, use THIS message's gift wrap ID (it's the thread root)
      // This ensures responses that tag the request's gift wrap ID match correctly
      const threadId = context.rootId || message.giftWrap.id;
      
      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, []);
      }
      threadMap.get(threadId)!.push(message);
    }

    // Convert to ConversationThread objects
    const threads: ConversationThread[] = [];
    
    for (const [rootEventId, threadMessages] of threadMap.entries()) {
      // Sort messages chronologically
      const sortedMessages = [...threadMessages].sort(
        (a, b) => a.rumor.created_at - b.rumor.created_at
      );

      // Find the initial request (first message with type "request")
      const initialRequest = sortedMessages.find(m => m.type === "request") || sortedMessages[0];
      const latestMessage = sortedMessages[sortedMessages.length - 1];

      // Determine conversation partner (the other party's pubkey)
      const partnerPubkey = latestMessage.senderPubkey;

      threads.push({
        rootEventId,
        messages: sortedMessages,
        initialRequest,
        latestMessage,
        latestTimestamp: latestMessage.rumor.created_at,
        partnerPubkey,
        messageCount: sortedMessages.length,
      });
    }

    // Sort threads by latest message timestamp (newest first)
    return threads.sort((a, b) => b.latestTimestamp - a.latestTimestamp);
  },
}));

