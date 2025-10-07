import type { Event as NostrEvent, EventTemplate } from "nostr-tools";

declare global {
  interface Window {
    nostr?: {
      getPublicKey: () => Promise<string>;
      signEvent: (event: EventTemplate) => Promise<NostrEvent>;
      getRelays: () => Promise<Record<string, { read: boolean; write: boolean }>>;
    };
  }
}

export {};
