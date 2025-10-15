import { create } from "zustand";

interface BusinessProfileState {
  location: string | null;
  setLocation: (value: string | null) => void;
}

export const useBusinessProfile = create<BusinessProfileState>((set) => ({
  location: null,
  setLocation: (value) => set({ location: value ? value.trim() || null : null })
}));

export function getProfileLocationSnapshot(): string | null {
  return useBusinessProfile.getState().location;
}
