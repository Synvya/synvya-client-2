import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ChamberState {
  chamberId: string | null;
  setChamberId: (id: string | null) => void;
  clearChamberId: () => void;
}

/**
 * Chamber membership state management
 * Stores chamber ID from query parameters for profile tagging
 */
export const useChamber = create<ChamberState>()(
  persist(
    (set) => ({
      chamberId: null,
      setChamberId: (id) => set({ chamberId: id }),
      clearChamberId: () => set({ chamberId: null })
    }),
    {
      name: "synvya-chamber-storage"
    }
  )
);

/**
 * Parse chamber ID from URL query parameters
 * Expected format: ?chamber=snovalley
 */
export function parseChamberFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  
  const params = new URLSearchParams(window.location.search);
  const chamber = params.get("chamber");
  
  return chamber && chamber.trim() ? chamber.trim().toLowerCase() : null;
}

/**
 * Initialize chamber state from URL on app load
 * Should be called once during app initialization
 */
export function initializeChamberFromUrl(): void {
  const chamberId = parseChamberFromUrl();
  if (chamberId) {
    useChamber.getState().setChamberId(chamberId);
  }
}

