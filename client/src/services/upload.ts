import { signEventWithNsec } from "@/lib/nostrKeys";

const REMOTE_UPLOAD_ENDPOINT = "https://nostr.build/api/v2/upload";
const WELL_KNOWN_PATH = "/.well-known/nostr/nip96.json";

type HttpMethod = "POST" | "PUT";

interface UploadTarget {
  requestUrl: string;
  signingUrl: string;
  methods: HttpMethod[];
}

interface UploadConfig {
  fileField: string;
  targets: UploadTarget[];
}

type MediaKind = "picture" | "banner";

function getUploadSecret(): string {
  const secret = import.meta.env.VITE_UPLOAD_NSEC;
  if (!secret) {
    throw new Error("VITE_UPLOAD_NSEC is not configured");
  }
  return secret.trim();
}

function getProxyUrl(): string | undefined {
  const raw = import.meta.env.VITE_UPLOAD_PROXY_URL;
  if (!raw) return undefined;
  return raw.endsWith("/") ? `${raw.slice(0, -1)}` : raw;
}

const REMOTE_ORIGIN = new URL(REMOTE_UPLOAD_ENDPOINT).origin;

function toAbsoluteUrl(path: string, apiBase?: string): string {
  try {
    if (/^https?:/i.test(path)) {
      return path;
    }

    const base = apiBase ?? REMOTE_UPLOAD_ENDPOINT;
    return new URL(path, base).toString();
  } catch (error) {
    console.warn("Failed to resolve upload endpoint", path, error);
    return new URL(path, REMOTE_UPLOAD_ENDPOINT).toString();
  }
}

function toRequestUrl(absolute: string): string {
  if (import.meta.env.DEV) {
    const url = new URL(absolute);
    return `/nostr-build${url.pathname}${url.search}`;
  }
  return absolute;
}

function createTarget(url: string, methods: HttpMethod[]): UploadTarget {
  const signingUrl = url;
  const requestUrl = toRequestUrl(url);
  return { requestUrl, signingUrl, methods };
}

function buildFallbackConfig(): UploadConfig {
  const fallbackMethods: HttpMethod[] = ["POST", "PUT"];
  const targets = [
    createTarget(REMOTE_UPLOAD_ENDPOINT, fallbackMethods),
    createTarget(`${REMOTE_UPLOAD_ENDPOINT}/`, fallbackMethods),
    createTarget("https://nostr.build/api/v2/upload/files", fallbackMethods),
    createTarget("https://nostr.build/api/v2/media", fallbackMethods),
    createTarget("https://nostr.build/api/v2/media/upload", fallbackMethods)
  ];

  const uniqueTargets = new Map<string, UploadTarget>();
  for (const target of targets) {
    if (!uniqueTargets.has(target.signingUrl)) {
      uniqueTargets.set(target.signingUrl, target);
    }
  }

  return {
    fileField: "file",
    targets: Array.from(uniqueTargets.values())
  };
}

async function hashArrayBuffer(buffer: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const bytes = new Uint8Array(digest);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function encodeFormData(formData: FormData): Promise<{ body: ArrayBuffer; contentType: string }> {
  const response = new Response(formData);
  const contentType = response.headers.get("content-type") ?? "multipart/form-data";
  const body = await response.arrayBuffer();
  return { body, contentType };
}

function normalizeMethods(value: unknown): HttpMethod[] | undefined {
  if (Array.isArray(value)) {
    const normalized = value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.toUpperCase())
      .filter((item): item is HttpMethod => item === "POST" || item === "PUT");
    return normalized.length ? normalized : undefined;
  }

  if (typeof value === "string") {
    const upper = value.toUpperCase();
    if (upper === "POST" || upper === "PUT") {
      return [upper];
    }
  }

  return undefined;
}

function looksLikeEndpointKey(key: string): boolean {
  const lower = key.toLowerCase();
  return (
    lower.includes("endpoint") ||
    (lower.includes("url") && !lower.includes("well-known")) ||
    lower.endsWith("path") ||
    lower.includes("upload")
  );
}

function looksLikeEndpointValue(value: string): boolean {
  if (!value) return false;
  const lowered = value.toLowerCase();
  if (lowered.includes(".well-known/nostr/nip96")) {
    return false;
  }

  const isUrl = /^https?:/i.test(value) || value.startsWith("/");
  if (!isUrl) {
    return false;
  }

  return (
    lowered.includes("/api/") ||
    lowered.includes("nip96") ||
    lowered.includes("/upload") ||
    lowered.endsWith("/upload")
  );
}

let cachedConfigPromise: Promise<UploadConfig> | null = null;

async function getUploadConfig(): Promise<UploadConfig> {
  if (!cachedConfigPromise) {
    cachedConfigPromise = fetchUploadConfig();
  }
  return cachedConfigPromise;
}

async function fetchUploadConfig(): Promise<UploadConfig> {
  const wellKnownUrl = import.meta.env.DEV ? `/nostr-build${WELL_KNOWN_PATH}` : `${REMOTE_ORIGIN}${WELL_KNOWN_PATH}`;

  try {
    const response = await fetch(wellKnownUrl, {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to load NIP-96 config (${response.status})`);
    }

    const raw = (await response.json()) as Record<string, unknown>;
    const parsed = parseNip96Config(raw);

    if (!parsed.targets.length) {
      throw new Error("NIP-96 config missing upload targets");
    }

    return parsed;
  } catch (error) {
    console.warn("Falling back to static nostr.build upload targets", error);
    return buildFallbackConfig();
  }
}

function parseNip96Config(raw: Record<string, unknown>): UploadConfig {
  let apiBase = typeof raw.api_url === "string" ? raw.api_url : undefined;
  let fileField = extractFileField(raw) ?? "file";
  const endpointMethods = new Map<string, Set<HttpMethod>>();

  const recordEndpoint = (value: string | undefined, methods?: HttpMethod[]) => {
    if (!value || !looksLikeEndpointValue(value)) {
      return;
    }
    const absolute = toAbsoluteUrl(value, apiBase);
    const existing = endpointMethods.get(absolute) ?? new Set<HttpMethod>();
    const toAdd = (methods && methods.length ? methods : ["POST"]) as HttpMethod[];
    for (const method of toAdd) {
      existing.add(method);
    }
    endpointMethods.set(absolute, existing);
  };

  const traverse = (node: unknown, inheritedMethods?: HttpMethod[]): void => {
    if (!node) return;

    if (Array.isArray(node)) {
      const methodsFromArray = normalizeMethods(node) ?? inheritedMethods;
      for (const item of node) {
        if (typeof item === "string") {
          if (looksLikeEndpointValue(item)) {
            recordEndpoint(item, methodsFromArray);
          }
        } else if (item && typeof item === "object") {
          traverse(item, methodsFromArray);
        }
      }
      return;
    }

    if (typeof node !== "object") {
      return;
    }

    const obj = node as Record<string, unknown>;

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (!fileField && typeof value === "string" && (lowerKey.includes("file_field") || lowerKey.includes("form_field"))) {
        fileField = value;
      }
      if (/api_url|base_url/.test(lowerKey) && typeof value === "string") {
        apiBase = value;
      }
    }

    let methodsForThis = inheritedMethods;
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      if (lowerKey.includes("method")) {
        const candidate = normalizeMethods(value);
        if (candidate && candidate.length) {
          methodsForThis = candidate;
          break;
        }
      }
    }

    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();

      if (typeof value === "string") {
        if (looksLikeEndpointKey(lowerKey) && looksLikeEndpointValue(value)) {
          recordEndpoint(value, methodsForThis);
        }
      } else if (Array.isArray(value)) {
        const arrayMethods = lowerKey.includes("method") ? normalizeMethods(value) ?? methodsForThis : methodsForThis;

        if (looksLikeEndpointKey(lowerKey)) {
          for (const item of value) {
            if (typeof item === "string" && looksLikeEndpointValue(item)) {
              recordEndpoint(item, arrayMethods);
            }
          }
        } else if (!lowerKey.includes("method")) {
          traverse(value, arrayMethods);
        }
      } else if (value && typeof value === "object") {
        traverse(value, methodsForThis);
      }
    }
  };

  traverse(raw, undefined);

  const targets = Array.from(endpointMethods.entries()).map(([url, methods]) => {
    const methodList = Array.from(methods.values());
    return createTarget(url, methodList.length ? methodList : ["POST"]);
  });

  return {
    fileField,
    targets: targets.length ? targets : buildFallbackConfig().targets
  };
}

function extractFileField(raw: Record<string, unknown>): string | undefined {
  const queue: unknown[] = [raw];
  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;
    if (Array.isArray(current)) {
      for (const item of current) {
        queue.push(item);
      }
      continue;
    }
    if (typeof current !== "object") continue;
    const obj = current as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
      const lower = key.toLowerCase();
      if (typeof value === "string" && (lower.includes("file_field") || lower.includes("form_field"))) {
        return value;
      }
      if (typeof value === "object") {
        queue.push(value);
      }
    }
  }
  return undefined;
}

function buildAuthorizationHeader(
  url: string,
  method: string,
  payloadHash: string | null,
  nsec: string,
  contentType?: string
): string {
  const tags: string[][] = [
    ["u", url],
    ["method", method.toUpperCase()]
  ];

  if (payloadHash) {
    tags.push(["payload", payloadHash]);
  }

  if (contentType) {
    tags.push(["content-type", contentType]);
  }

  const event = signEventWithNsec(
    {
      kind: 27235,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ""
    },
    nsec
  );

  const encoded = btoa(JSON.stringify(event));
  return `Nostr ${encoded}`;
}

interface UploadResponse {
  url: string;
}

function extractUrl(data: unknown): string {
  if (!data || typeof data !== "object") {
    throw new Error("Upload failed: invalid response");
  }

  const obj = data as Record<string, unknown>;
  if (typeof obj.url === "string") {
    return obj.url;
  }

  if (typeof obj.location === "string") {
    return obj.location;
  }

  if (typeof obj.download_url === "string") {
    return obj.download_url;
  }

  const dataField = obj.data;
  if (dataField && typeof dataField === "object") {
    const nested = dataField as Record<string, unknown>;
    if (typeof nested.url === "string") {
      return nested.url;
    }
    const files = nested.files;
    if (Array.isArray(files) && files.length > 0) {
      const first = files[0] as Record<string, unknown>;
      if (typeof first.url === "string") {
        return first.url;
      }
    }
  }

  const nip94 = obj.nip94_event;
  if (nip94 && typeof nip94 === "object") {
    const tags = (nip94 as Record<string, unknown>).tags;
    if (Array.isArray(tags)) {
      for (const entry of tags) {
        if (Array.isArray(entry) && entry.length >= 2 && entry[0] === "url" && typeof entry[1] === "string") {
          return entry[1];
        }
      }
    }
  }

  const metadata = obj.metadata;
  if (metadata && typeof metadata === "object") {
    const meta = metadata as Record<string, unknown>;
    if (typeof meta.url === "string") {
      return meta.url;
    }
    if (typeof meta.thumbnail === "string") {
      return meta.thumbnail;
    }
  }

  throw new Error("Upload failed: missing URL in response");
}

async function uploadViaProxy(file: File, _kind: MediaKind): Promise<string> {
  const proxy = getProxyUrl();
  if (!proxy) {
    throw new Error("Upload proxy URL is not configured");
  }
  const endpoint = `${proxy}/media/upload`;
  const { fileField } = await getUploadConfig();
  const formData = new FormData();
  formData.append(fileField, file);

  const response = await fetch(endpoint, {
    method: "POST",
    body: formData,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error(`Proxy upload failed (${response.status})`);
  }

  const json = (await response.json()) as UploadResponse | Record<string, unknown>;
  return extractUrl(json);
}

async function uploadDirect(file: File, _kind: MediaKind): Promise<string> {
  const nsec = getUploadSecret();
  const { fileField, targets } = await getUploadConfig();
  const formData = new FormData();
  formData.append(fileField, file);

  const { body, contentType } = await encodeFormData(formData);

  let lastError: Error | null = null;
  const payloadHash = await hashArrayBuffer(body);

  for (const target of targets) {
    for (const method of target.methods) {
      try {
        const authorization = buildAuthorizationHeader(target.signingUrl, method, payloadHash, nsec, contentType);
        const response = await fetch(target.requestUrl, {
          method,
          body: body.slice(0),
          headers: {
            Authorization: authorization,
            "Content-Type": contentType,
            Accept: "application/json"
          }
        });

        if (!response.ok) {
          const failureText = await response.text();
          const error = new Error(`Upload failed (${response.status}): ${failureText.slice(0, 180)}`);
          if (response.status === 404 || response.status === 405) {
            lastError = error;
            continue;
          }
          throw error;
        }

        const json = (await response.json()) as UploadResponse | Record<string, unknown>;
        return extractUrl(json);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }
  }

  throw lastError ?? new Error("Upload failed");
}

export async function uploadMedia(file: File, kind: MediaKind): Promise<string> {
  const proxy = getProxyUrl();

  if (proxy && import.meta.env.PROD) {
    return uploadViaProxy(file, kind);
  }

  return uploadDirect(file, kind);
}
