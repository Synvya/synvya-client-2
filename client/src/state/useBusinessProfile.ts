import { create } from "zustand";
import type { BusinessType } from "@/types/profile";

interface BusinessProfileState {
  location: string | null;
  businessType: BusinessType | null;
  setLocation: (value: string | null) => void;
  setBusinessType: (value: BusinessType | null) => void;
}

export const useBusinessProfile = create<BusinessProfileState>((set) => ({
  location: null,
  businessType: null,
  setLocation: (value) => set({ location: value ? value.trim() || null : null }),
  setBusinessType: (value) => set({ businessType: value })
}));

export function getProfileLocationSnapshot(): string | null {
  return useBusinessProfile.getState().location;
}

export function getBusinessTypeSnapshot(): BusinessType | null {
  return useBusinessProfile.getState().businessType;
}
