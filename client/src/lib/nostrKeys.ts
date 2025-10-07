import { finalizeEvent, generateSecretKey, getPublicKey, nip19 } from "nostr-tools";
import type { Event, EventTemplate } from "nostr-tools";

export interface GeneratedKeypair {
  sk: Uint8Array;
  pk: string;
  npub: string;
  nsec: string;
}

export function generateKeypair(): GeneratedKeypair {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);
  const nsec = nip19.nsecEncode(sk);

  return { sk, pk, npub, nsec };
}

export function skFromNsec(nsec: string): Uint8Array {
  const decoded = nip19.decode(nsec);
  if (decoded.type !== "nsec") {
    throw new Error("Invalid nsec value");
  }

  const sk = decoded.data;
  if (sk instanceof Uint8Array) {
    return sk;
  }

  return new Uint8Array(sk as ArrayBufferLike);
}

export function publicKeyFromNsec(nsec: string): string {
  const sk = skFromNsec(nsec);
  return getPublicKey(sk);
}

export function npubFromPk(pk: string): string {
  return nip19.npubEncode(pk);
}

export function deriveFromNsec(nsec: string): GeneratedKeypair {
  const sk = skFromNsec(nsec);
  const pk = getPublicKey(sk);
  const npub = nip19.npubEncode(pk);
  return { sk, pk, npub, nsec };
}

export function signEventWithNsec(event: EventTemplate, nsec: string): Event {
  const sk = skFromNsec(nsec);
  return finalizeEvent(event, sk);
}
