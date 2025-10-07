import { create } from "zustand";

function parseDefaultRelays(): string[] {
  const raw = import.meta.env.VITE_DEFAULT_RELAYS;
  if (!raw) {
    return [
      "wss://relay.damus.io",
      "wss://relay.snort.social",
      "wss://nos.lol"
    ];
  }

  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

interface RelayState {
  relays: string[];
  addRelay: (relay: string) => void;
  removeRelay: (relay: string) => void;
  resetRelays: () => void;
}

export const useRelays = create<RelayState>((set) => ({
  relays: parseDefaultRelays(),
  addRelay: (relay) =>
    set((state) => {
      const candidate = relay.trim();
      if (!candidate || state.relays.includes(candidate)) {
        return state;
      }
      return { relays: [...state.relays, candidate] };
    }),
  removeRelay: (relay) =>
    set((state) => ({
      relays: state.relays.filter((item) => item !== relay)
    })),
  resetRelays: () => set({ relays: parseDefaultRelays() })
}));
