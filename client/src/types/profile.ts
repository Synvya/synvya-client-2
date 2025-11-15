export type BusinessType =
  | "bakery"
  | "barOrPub"
  | "brewery"
  | "cafeOrCoffeeShop"
  | "distillery"
  | "fastFoodRestaurant"
  | "iceCreamShop"
  | "restaurant"
  | "winery";

export interface OpeningHoursSpec {
  days: string[]; // ["Mo", "Tu", "We", "Th", "Fr"] or ["Sa", "Su"]
  startTime: string; // "11:00"
  endTime: string; // "21:00"
}

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
  cuisine?: string;
  phone?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string; // ISO 3166-1 alpha-2 country code (e.g., "US")
  location?: string;
  chamber?: string;
  acceptsReservations?: boolean;
  openingHours?: OpeningHoursSpec[];
}

export interface PublishResult {
  ok: boolean;
  message: string;
  eventId?: string;
}
