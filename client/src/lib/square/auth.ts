const CODE_VERIFIER_COOKIE = "square_code_verifier";
const STATE_STORAGE_KEY = "square_oauth_state";

function resolveSquareAuthorizeBase(): string {
  const env = (import.meta.env.VITE_SQUARE_ENV as string | undefined)?.toLowerCase();
  return env === "production"
    ? "https://connect.squareup.com/oauth2/authorize"
    : "https://connect.squareupsandbox.com/oauth2/authorize";
}

function setCookie(name: string, value: string, maxAgeSeconds: number): void {
  const segments = [
    `${name}=${value}`,
    "Path=/",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`
  ];
  document.cookie = segments.join("; ");
}

function readCookie(name: string): string | null {
  const cookies = document.cookie.split(";").map((cookie) => cookie.trim());
  for (const cookie of cookies) {
    if (!cookie) continue;
    const [key, ...rest] = cookie.split("=");
    if (key === name) {
      return rest.join("=") || "";
    }
  }
  return null;
}

function deleteCookie(name: string): void {
  document.cookie = `${name}=; Path=/; Max-Age=0; Secure; SameSite=Lax`;
}

export function consumeSquareCodeVerifier(): string | null {
  const value = readCookie(CODE_VERIFIER_COOKIE);
  deleteCookie(CODE_VERIFIER_COOKIE);
  return value;
}

export function clearSquareState(): void {
  sessionStorage.removeItem(STATE_STORAGE_KEY);
}

export function getSquareState(): string | null {
  return sessionStorage.getItem(STATE_STORAGE_KEY);
}

export interface BuildAuthorizeUrlResult {
  url: string;
  state: string;
}

export async function buildSquareAuthorizeUrl(): Promise<BuildAuthorizeUrlResult> {
  if (typeof window === "undefined") {
    throw new Error("Square OAuth can only run in the browser");
  }

  const base = resolveSquareAuthorizeBase();
  const clientId = import.meta.env.VITE_SQUARE_APPLICATION_ID as string | undefined;
  const redirectUri = import.meta.env.VITE_SQUARE_REDIRECT_URI as string | undefined;
  if (!clientId) {
    throw new Error("Missing VITE_SQUARE_APPLICATION_ID");
  }
  if (!redirectUri) {
    throw new Error("Missing VITE_SQUARE_REDIRECT_URI");
  }

  const random = crypto.getRandomValues(new Uint8Array(32));
  const codeVerifier = Array.from(random)
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");

  setCookie(CODE_VERIFIER_COOKIE, codeVerifier, 600);

  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const codeChallenge = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const scope = "ITEMS_READ MERCHANT_PROFILE_READ";
  const state = crypto.randomUUID();
  sessionStorage.setItem(STATE_STORAGE_KEY, state);

  const url = new URL(base);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", scope);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("session", "false");

  return { url: url.toString(), state };
}
