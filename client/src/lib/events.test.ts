import { describe, it, expect } from "vitest";
import { buildProfileEvent } from "./events";
import type { BusinessProfile, BusinessType, OpeningHoursSpec } from "@/types/profile";

describe("buildProfileEvent", () => {
  const baseProfile: BusinessProfile = {
    name: "testshop",
    displayName: "Test Shop",
    about: "A test shop",
    website: "https://testshop.com",
    nip05: "testshop@synvya.com",
    picture: "https://example.com/pic.jpg",
    banner: "https://example.com/banner.jpg",
    businessType: "restaurant",
    categories: ["test", "shop"]
  };

  it("should build profile event without chamber", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.kind).toBe(0);
    expect(event.tags).toContainEqual(["l", "https://schema.org/Restaurant"]);
    expect(event.tags).toContainEqual(["t", "production"]);
    expect(event.tags).toContainEqual(["t", "test"]);
    expect(event.tags).toContainEqual(["t", "shop"]);
    
    // Should NOT contain chamber tags
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
  });

  it("should include chamber tag when chamber is specified", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    expect(event.kind).toBe(0);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
    // Should NOT contain namespace tags
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

  it("should support different chamber IDs", () => {
    const profileWithEastside: BusinessProfile = {
      ...baseProfile,
      chamber: "eastside"
    };

    const event = buildProfileEvent(profileWithEastside);

    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:eastside", ""]);
    // Should NOT contain namespace tags
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

  it("should include chamber tag along with other tags", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      phone: "(555) 123-4567",
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    // Should include all standard tags
    expect(event.tags).toContainEqual(["l", "https://schema.org/Restaurant"]);
    expect(event.tags).toContainEqual(["t", "production"]);
    expect(event.tags).toContainEqual(["i", "phone:(555) 123-4567", ""]);
    expect(event.tags).toContainEqual(["i", "postalAddress:streetAddress:123 Main St", "https://schema.org/streetAddress"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressLocality:Seattle", "https://schema.org/addressLocality"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressRegion:WA", "https://schema.org/addressRegion"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:postalCode:98101", "https://schema.org/postalCode"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressCountry:US", "https://schema.org/addressCountry"]);
    
    // Should also include chamber tag (only the "i" tag, no namespace tags)
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

  it("should not add chamber tags when chamber is undefined", () => {
    const profileWithoutChamber: BusinessProfile = {
      ...baseProfile,
      chamber: undefined
    };

    const event = buildProfileEvent(profileWithoutChamber);

    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "i" && tag[1].startsWith("com.synvya.chamber:"))).toBe(false);
  });

  it("should not add chamber tags when chamber is empty string", () => {
    const profileWithEmptyChamber: BusinessProfile = {
      ...baseProfile,
      chamber: ""
    };

    const event = buildProfileEvent(profileWithEmptyChamber);

    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "i" && tag[1].startsWith("com.synvya.chamber:"))).toBe(false);
  });

  it("should place chamber tag after address tags", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    // Find last address index (ES2020 compatible - findLastIndex requires ES2023)
    let lastAddressIndex = -1;
    for (let i = event.tags.length - 1; i >= 0; i--) {
      const tag = event.tags[i];
      if (Array.isArray(tag) && tag[0] === "i" && typeof tag[1] === "string" && tag[1].startsWith("postalAddress:")) {
        lastAddressIndex = i;
        break;
      }
    }
    const chamberTagIndex = event.tags.findIndex(
      (tag: string[]) => tag[0] === "i" && tag[1]?.startsWith("com.synvya.chamber:")
    );

    expect(lastAddressIndex).toBeGreaterThan(-1);
    expect(chamberTagIndex).toBeGreaterThan(-1);
    expect(chamberTagIndex).toBeGreaterThan(lastAddressIndex);
  });

  it("should verify chamber tag structure", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    // Find all chamber-related tags (should only be the "i" tag)
    const chamberTags = event.tags.filter(
      tag => tag[0] === "i" && tag[1].startsWith("com.synvya.chamber:")
    );

    expect(chamberTags).toHaveLength(1);
    expect(chamberTags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
    
    // Verify no namespace tags are present
    expect(event.tags.some(tag => tag[0] === "L" && tag[1] === "com.synvya.chamber")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

  it("should preserve content structure with chamber", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    const content = JSON.parse(event.content);
    expect(content.name).toBe("testshop");
    expect(content.display_name).toBe("Test Shop");
    expect(content.about).toBe("A test shop");
    expect(content.website).toBe("https://testshop.com");
    expect(content.picture).toBe("https://example.com/pic.jpg");
    expect(content.banner).toBe("https://example.com/banner.jpg");
    expect(content.nip05).toBe("testshop@synvya.com");
    
    // Chamber should not be in content, only in tags
    expect(content.chamber).toBeUndefined();
  });

  it("should include geo tags when geohash, latitude, and longitude are provided", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithLocation, { 
      geohash: "c23q6sydb",
      latitude: 47.6062,
      longitude: -122.3321
    });

    expect(event.tags).toContainEqual(["i", "geo:latitude:47.6062", "https://schema.org/latitude"]);
    expect(event.tags).toContainEqual(["i", "geo:longitude:-122.3321", "https://schema.org/longitude"]);
    expect(event.tags).toContainEqual(["i", "geo:c23q6sydb", "https://geohash.org"]);
  });

  it("should not include geo tags when geo data is not provided", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithLocation);

    expect(event.tags.some(tag => tag[0] === "i" && tag[1]?.startsWith("geo:"))).toBe(false);
  });

  it("should not include geo tags when geo data is null", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithLocation, { 
      geohash: null,
      latitude: null,
      longitude: null
    });

    expect(event.tags.some(tag => tag[0] === "i" && tag[1]?.startsWith("geo:"))).toBe(false);
  });

  it("should trim geohash before adding tag", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithLocation, { 
      geohash: "  c23q6sydb  ",
      latitude: 47.6062,
      longitude: -122.3321
    });

    expect(event.tags).toContainEqual(["i", "geo:c23q6sydb", "https://geohash.org"]);
  });

  it("should place geo tags after address tags", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithLocation, { 
      geohash: "c23q6sydb",
      latitude: 47.6062,
      longitude: -122.3321
    });

    // Find last address index (ES2020 compatible - findLastIndex requires ES2023)
    let lastAddressIndex = -1;
    for (let i = event.tags.length - 1; i >= 0; i--) {
      const tag = event.tags[i];
      if (Array.isArray(tag) && tag[0] === "i" && typeof tag[1] === "string" && tag[1].startsWith("postalAddress:")) {
        lastAddressIndex = i;
        break;
      }
    }
    const firstGeoIndex = event.tags.findIndex(
      (tag: string[]) => tag[0] === "i" && tag[1]?.startsWith("geo:")
    );

    expect(lastAddressIndex).toBeGreaterThan(-1);
    expect(firstGeoIndex).toBeGreaterThan(-1);
    expect(firstGeoIndex).toBeGreaterThan(lastAddressIndex);
  });

  it("should include postal address component tags when address fields are provided", () => {
    const profileWithAddress: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101"
    };

    const event = buildProfileEvent(profileWithAddress);

    expect(event.tags).toContainEqual(["i", "postalAddress:streetAddress:123 Main St", "https://schema.org/streetAddress"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressLocality:Seattle", "https://schema.org/addressLocality"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressRegion:WA", "https://schema.org/addressRegion"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:postalCode:98101", "https://schema.org/postalCode"]);
    expect(event.tags).toContainEqual(["i", "postalAddress:addressCountry:US", "https://schema.org/addressCountry"]);
    // Should NOT contain old location tag
    expect(event.tags.some(tag => tag[0] === "i" && tag[1]?.startsWith("location:"))).toBe(false);
  });

  it("should include geo tags along with address and chamber tags", () => {
    const profileWithAll: BusinessProfile = {
      ...baseProfile,
      street: "123 Main St",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithAll, { 
      geohash: "c23q6sydb",
      latitude: 47.6062,
      longitude: -122.3321
    });

    expect(event.tags).toContainEqual(["i", "postalAddress:streetAddress:123 Main St", "https://schema.org/streetAddress"]);
    expect(event.tags).toContainEqual(["i", "geo:latitude:47.6062", "https://schema.org/latitude"]);
    expect(event.tags).toContainEqual(["i", "geo:longitude:-122.3321", "https://schema.org/longitude"]);
    expect(event.tags).toContainEqual(["i", "geo:c23q6sydb", "https://geohash.org"]);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
    // Should NOT contain namespace tags
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

  it("should include servesCuisine tag when cuisine is provided", () => {
    const profileWithCuisine: BusinessProfile = {
      ...baseProfile,
      cuisine: "Italian, Seafood"
    };

    const event = buildProfileEvent(profileWithCuisine);

    expect(event.tags).toContainEqual(["servesCuisine", "Italian, Seafood", "https://schema.org/servesCuisine"]);
  });

  it("should not include servesCuisine tag when cuisine is not provided", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.tags.some(tag => tag[0] === "servesCuisine")).toBe(false);
  });

  it("should not include servesCuisine tag when cuisine is undefined", () => {
    const profileWithoutCuisine: BusinessProfile = {
      ...baseProfile,
      cuisine: undefined
    };

    const event = buildProfileEvent(profileWithoutCuisine);

    expect(event.tags.some(tag => tag[0] === "servesCuisine")).toBe(false);
  });

  it("should place servesCuisine tag after categories", () => {
    const profileWithCuisine: BusinessProfile = {
      ...baseProfile,
      categories: ["test", "shop"],
      cuisine: "Italian"
    };

    const event = buildProfileEvent(profileWithCuisine);

    // Find last category index (ES2020 compatible - findLastIndex requires ES2023)
    let lastCategoryIndex = -1;
    for (let i = event.tags.length - 1; i >= 0; i--) {
      const tag = event.tags[i];
      if (Array.isArray(tag) && tag[0] === "t" && tag[1] !== "production") {
        lastCategoryIndex = i;
        break;
      }
    }
    const cuisineIndex = event.tags.findIndex(
      (tag: string[]) => tag[0] === "servesCuisine"
    );

    expect(lastCategoryIndex).toBeGreaterThan(-1);
    expect(cuisineIndex).toBeGreaterThan(-1);
    expect(cuisineIndex).toBeGreaterThan(lastCategoryIndex);
  });

  it("should include email tag when email is provided", () => {
    const profileWithEmail: BusinessProfile = {
      ...baseProfile,
      email: "contact@example.com"
    };

    const event = buildProfileEvent(profileWithEmail);

    expect(event.tags).toContainEqual(["i", "email:mailto:contact@example.com", "https://schema.org/email"]);
  });

  it("should not include email tag when email is not provided", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.tags.some(tag => tag[0] === "i" && tag[1]?.startsWith("email:mailto:"))).toBe(false);
  });

  it("should not include email tag when email is undefined", () => {
    const profileWithoutEmail: BusinessProfile = {
      ...baseProfile,
      email: undefined
    };

    const event = buildProfileEvent(profileWithoutEmail);

    expect(event.tags.some(tag => tag[0] === "i" && tag[1]?.startsWith("email:mailto:"))).toBe(false);
  });

  it("should place email tag after phone tag", () => {
    const profileWithContact: BusinessProfile = {
      ...baseProfile,
      phone: "(555) 123-4567",
      email: "contact@example.com"
    };

    const event = buildProfileEvent(profileWithContact);

    const phoneIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1]?.startsWith("phone:")
    );
    const emailIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1]?.startsWith("email:mailto:")
    );

    expect(phoneIndex).toBeGreaterThan(-1);
    expect(emailIndex).toBeGreaterThan(-1);
    expect(emailIndex).toBeGreaterThan(phoneIndex);
  });

  it("should use Schema.org URL format for business type", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.tags).toContainEqual(["l", "https://schema.org/Restaurant"]);
    expect(event.tags.some(tag => tag[0] === "L" && tag[1] === "com.synvya.merchant")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.merchant")).toBe(false);
  });

  it("should map all Food Establishment types to Schema.org URLs", () => {
    const types: Array<{ type: BusinessProfile["businessType"]; expected: string }> = [
      { type: "bakery", expected: "https://schema.org/Bakery" },
      { type: "barOrPub", expected: "https://schema.org/BarOrPub" },
      { type: "brewery", expected: "https://schema.org/Brewery" },
      { type: "cafeOrCoffeeShop", expected: "https://schema.org/CafeOrCoffeeShop" },
      { type: "distillery", expected: "https://schema.org/Distillery" },
      { type: "fastFoodRestaurant", expected: "https://schema.org/FastFoodRestaurant" },
      { type: "iceCreamShop", expected: "https://schema.org/IceCreamShop" },
      { type: "restaurant", expected: "https://schema.org/Restaurant" },
      { type: "winery", expected: "https://schema.org/Winery" }
    ];

    for (const { type, expected } of types) {
      const profile: BusinessProfile = {
        ...baseProfile,
        businessType: type
      };
      const event = buildProfileEvent(profile);
      expect(event.tags).toContainEqual(["l", expected]);
    }
  });

  it("should include acceptsReservations False tag when unchecked", () => {
    const profileWithReservations: BusinessProfile = {
      ...baseProfile,
      acceptsReservations: false
    };

    const event = buildProfileEvent(profileWithReservations);

    expect(event.tags).toContainEqual(["acceptsReservations", "False"]);
    expect(event.tags.some(tag => tag[0] === "acceptsReservations" && tag[1] === "https://dinedirect.app")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "i" && tag[1] === "nip:rp")).toBe(false);
  });

  it("should include acceptsReservations and nip:rp tags when checked", () => {
    const profileWithReservations: BusinessProfile = {
      ...baseProfile,
      acceptsReservations: true
    };

    const event = buildProfileEvent(profileWithReservations);

    expect(event.tags).toContainEqual(["acceptsReservations", "https://dinedirect.app"]);
    expect(event.tags).toContainEqual(["i", "nip:rp", "https://github.com/Synvya/reservation-protocol/blob/main/nostr-protocols/nips/rp.md"]);
    expect(event.tags.some(tag => tag[0] === "acceptsReservations" && tag[1] === "False")).toBe(false);
  });

  it("should not include acceptsReservations tags when undefined", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.tags.some(tag => tag[0] === "acceptsReservations")).toBe(false);
    expect(event.tags.some(tag => tag[0] === "i" && tag[1] === "nip:rp")).toBe(false);
  });

  it("should include openingHoursSpecification tags when opening hours are provided", () => {
    const openingHours: OpeningHoursSpec[] = [
      { days: ["Tu", "We", "Th"], startTime: "11:00", endTime: "21:00" },
      { days: ["Fr", "Sa"], startTime: "11:00", endTime: "00:00" },
      { days: ["Su"], startTime: "12:00", endTime: "21:00" }
    ];

    const profileWithHours: BusinessProfile = {
      ...baseProfile,
      openingHours
    };

    const event = buildProfileEvent(profileWithHours);

    expect(event.tags).toContainEqual(["openingHoursSpecification", "Tu-Th", "11:00-21:00"]);
    expect(event.tags).toContainEqual(["openingHoursSpecification", "Fr-Sa", "11:00-00:00"]);
    expect(event.tags).toContainEqual(["openingHoursSpecification", "Su", "12:00-21:00"]);
  });

  it("should not include openingHoursSpecification tags when opening hours are not provided", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.tags.some(tag => tag[0] === "openingHoursSpecification")).toBe(false);
  });

  it("should handle single day opening hours", () => {
    const openingHours: OpeningHoursSpec[] = [
      { days: ["Mo"], startTime: "09:00", endTime: "17:00" }
    ];

    const profileWithHours: BusinessProfile = {
      ...baseProfile,
      openingHours
    };

    const event = buildProfileEvent(profileWithHours);

    expect(event.tags).toContainEqual(["openingHoursSpecification", "Mo", "09:00-17:00"]);
  });
});

