export interface SquareLocationSummary {
  id: string;
  name: string;
}

export interface SquareConnectionStatus {
  connected: boolean;
  merchantId?: string;
  merchantName?: string | null;
  locations?: SquareLocationSummary[];
  scopes?: string[];
  connectedAt?: string | null;
  lastSyncAt?: string | null;
  lastPublishCount?: number;
}

export interface SquareEventTemplate {
  kind: number;
  created_at: number;
  content: string;
  tags: string[][];
}

export interface SquareSyncResult {
  totalEvents: number;
  pendingCount: number;
  events: SquareEventTemplate[];
}

interface SquareExchangeResponse {
  connected: boolean;
  merchantId: string;
  merchantName?: string | null;
  locations?: SquareLocationSummary[];
  initialSync?: SquareSyncResult;
}

interface SquarePublishResponse extends SquareSyncResult {
  merchantId: string;
}

function getApiBaseUrl(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (!base) {
    throw new Error("Missing VITE_API_BASE_URL");
  }
  return base.replace(/\/+$/, "");
}

function buildQuery(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) {
      search.set(key, value);
    }
  }
  return search.toString();
}

async function handleResponse<T>(response: Response): Promise<T> {
  let json: unknown = null;
  try {
    json = await response.json();
  } catch {
    // Ignore JSON parsing errors; we'll throw a generic message below.
  }
  if (!response.ok) {
    const message =
      typeof json === "object" && json && "error" in json
        ? String((json as Record<string, unknown>).error)
        : `Request failed with status ${response.status}`;
    throw new Error(message);
  }
  return json as T;
}

export async function fetchSquareStatus(pubkey: string): Promise<SquareConnectionStatus> {
  const base = getApiBaseUrl();
  const query = buildQuery({ pubkey });
  const response = await fetch(`${base}/square/status?${query}`, {
    method: "GET",
    headers: {
      Accept: "application/json"
    }
  });
  return handleResponse<SquareConnectionStatus>(response);
}

export async function exchangeSquareCode(params: {
  code: string;
  codeVerifier: string;
  pubkey: string;
}): Promise<SquareExchangeResponse> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/square/oauth/exchange`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify(params)
  });
  return handleResponse<SquareExchangeResponse>(response);
}

export async function publishSquareCatalog(pubkey: string): Promise<SquarePublishResponse> {
  const base = getApiBaseUrl();
  const response = await fetch(`${base}/square/publish`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    body: JSON.stringify({ pubkey })
  });
  return handleResponse<SquarePublishResponse>(response);
}
