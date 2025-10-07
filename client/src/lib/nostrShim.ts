import type { Event as NostrEvent, EventTemplate } from "nostr-tools";

interface ShimOptions {
  getPublicKey: () => Promise<string>;
  signEvent: (event: EventTemplate) => Promise<NostrEvent>;
  getRelays: () => Promise<Record<string, { read: boolean; write: boolean }>>;
}

export function installNostrShim(options: ShimOptions): void {
  if (typeof window === "undefined") {
    return;
  }

  const shim = {
    getPublicKey: options.getPublicKey,
    signEvent: options.signEvent,
    getRelays: options.getRelays
  } satisfies NonNullable<typeof window.nostr>;

  window.nostr = shim;
}
