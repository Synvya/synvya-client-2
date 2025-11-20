import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MemberOfState {
  domain: string | null;
  setDomain: (domain: string | null) => void;
  clearDomain: () => void;
}

/**
 * MemberOf organization domain state management
 * Stores organization domain from query parameters for profile tagging
 */
export const useMemberOf = create<MemberOfState>()(
  persist(
    (set) => ({
      domain: null,
      setDomain: (domain) => set({ domain }),
      clearDomain: () => set({ domain: null })
    }),
    {
      name: "synvya-memberof-storage"
    }
  )
);

/**
 * Parse memberOf domain from URL query parameters
 * Expected format: ?memberOf=snovalley.org
 * Returns the domain (e.g., "snovalley.org") without protocol
 */
export function parseMemberOfFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  
  const params = new URLSearchParams(window.location.search);
  const memberOf = params.get("memberOf");
  
  if (!memberOf || !memberOf.trim()) return null;
  
  const domain = memberOf.trim();
  // Remove protocol if present (e.g., "https://snovalley.org" → "snovalley.org")
  return domain.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Initialize memberOf domain state from URL on app load
 * Should be called once during app initialization
 */
export function initializeMemberOfFromUrl(): void {
  const domain = parseMemberOfFromUrl();
  if (domain) {
    useMemberOf.getState().setDomain(domain);
  }
}

