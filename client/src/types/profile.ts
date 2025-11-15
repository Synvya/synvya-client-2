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
  location?: string;
  chamber?: string;
}

export interface PublishResult {
  ok: boolean;
  message: string;
  eventId?: string;
}
