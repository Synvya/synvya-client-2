/**
 * Zustand store for managing reservation messages
 */

import { create } from "zustand";
import type { ReservationMessage } from "@/services/reservationService";
import {
  createReservationSubscription,
  type ReservationSubscription,
} from "@/services/reservationService";

export interface ReservationState {
  messages: ReservationMessage[];
  subscription: ReservationSubscription | null;
  isConnected: boolean;
  error: string | null;
  
  // Actions
  addMessage: (message: ReservationMessage) => void;
  startListening: (privateKey: Uint8Array, publicKey: string, relays: string[]) => void;
  stopListening: () => void;
  setError: (error: string | null) => void;
  clearMessages: () => void;
  markAsRead: (messageId: string) => void;
}

export const useReservations = create<ReservationState>((set, get) => ({
  messages: [],
  subscription: null,
  isConnected: false,
  error: null,

  addMessage: (message) => {
    set((state) => ({
      messages: [message, ...state.messages], // Newest first
    }));
  },

  startListening: (privateKey, publicKey, relays) => {
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
  },

  markAsRead: (messageId) => {
    // TODO: Implement read tracking
    // For now, this is a placeholder for future functionality
    console.debug("Mark as read:", messageId);
  },
}));

