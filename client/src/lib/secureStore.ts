import { openDB } from "idb";

const DB_NAME = "synvya-secure-store";
const DB_VERSION = 1;
const KEY_STORE = "keys";
const SECRET_STORE = "secrets";
const DEVICE_KEY_ID = "device-key";
const SECRET_ID = "merchant-secret";

interface SecretEnvelope {
  iv: Uint8Array;
  ciphertext: ArrayBuffer;
  createdAt: number;
}

const dbPromise = openDB(DB_NAME, DB_VERSION, {
  upgrade(db) {
    if (!db.objectStoreNames.contains(KEY_STORE)) {
      db.createObjectStore(KEY_STORE);
    }
    if (!db.objectStoreNames.contains(SECRET_STORE)) {
      db.createObjectStore(SECRET_STORE);
    }
  }
});

export async function ensureDeviceKey(): Promise<CryptoKey> {
  const db = await dbPromise;
  const existing = (await db.get(KEY_STORE, DEVICE_KEY_ID)) as CryptoKey | undefined;
  if (existing) {
    return existing;
  }

  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );

  await db.put(KEY_STORE, key, DEVICE_KEY_ID);
  return key;
}

export async function saveEncryptedSecret(secret: string): Promise<void> {
  const key = await ensureDeviceKey();
  const db = await dbPromise;
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoder.encode(secret)
  );

  const envelope: SecretEnvelope = {
    iv,
    ciphertext,
    createdAt: Date.now()
  };

  await db.put(SECRET_STORE, envelope, SECRET_ID);
}

export async function loadAndDecryptSecret(): Promise<string | null> {
  const db = await dbPromise;
  const envelope = (await db.get(SECRET_STORE, SECRET_ID)) as SecretEnvelope | undefined;
  if (!envelope) {
    return null;
  }

  const key = await ensureDeviceKey();
  const ivCopy = new Uint8Array(envelope.iv);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivCopy },
    key,
    envelope.ciphertext
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function clearSecret(): Promise<void> {
  const db = await dbPromise;
  await db.delete(SECRET_STORE, SECRET_ID);
}

export async function hasStoredSecret(): Promise<boolean> {
  const db = await dbPromise;
  const envelope = await db.getKey(SECRET_STORE, SECRET_ID);
  return Boolean(envelope);
}
