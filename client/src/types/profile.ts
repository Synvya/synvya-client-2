export type BusinessType =
  | "retail"
  | "restaurant"
  | "service"
  | "business"
  | "entertainment"
  | "other";

export interface BusinessProfile {
  name: string;
  displayName: string;
  about: string;
  website: string;
  nip05: string;
  picture: string;
  banner: string;
  businessType: BusinessType;
  categories: string[];
  phone?: string;
  street?: string;
  state?: string;
  zip?: string;
  location?: string;
}

export interface PublishResult {
  ok: boolean;
  message: string;
  eventId?: string;
}
