import { describe, it, expect } from "vitest";
import { buildProfileEvent } from "./events";
import type { BusinessProfile } from "@/types/profile";

describe("buildProfileEvent", () => {
  const baseProfile: BusinessProfile = {
    name: "testshop",
    displayName: "Test Shop",
    about: "A test shop",
    website: "https://testshop.com",
    nip05: "testshop@synvya.com",
    picture: "https://example.com/pic.jpg",
    banner: "https://example.com/banner.jpg",
    businessType: "retail",
    categories: ["test", "shop"]
  };

  it("should build profile event without chamber", () => {
    const event = buildProfileEvent(baseProfile);

    expect(event.kind).toBe(0);
    expect(event.tags).toContainEqual(["L", "com.synvya.merchant"]);
    expect(event.tags).toContainEqual(["l", "retail", "com.synvya.merchant"]);
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
      location: "123 Main St, Seattle, WA, 98101, USA",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    // Should include all standard tags
    expect(event.tags).toContainEqual(["L", "com.synvya.merchant"]);
    expect(event.tags).toContainEqual(["l", "retail", "com.synvya.merchant"]);
    expect(event.tags).toContainEqual(["t", "production"]);
    expect(event.tags).toContainEqual(["i", "phone:(555) 123-4567", ""]);
    expect(event.tags).toContainEqual(["i", "location:123 Main St, Seattle, WA, 98101, USA", ""]);
    
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

  it("should place chamber tag after location tag", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      location: "Seattle, WA, 98101",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    const locationIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1].startsWith("location:")
    );
    const chamberTagIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1].startsWith("com.synvya.chamber:")
    );

    expect(locationIndex).toBeGreaterThan(-1);
    expect(chamberTagIndex).toBeGreaterThan(-1);
    expect(chamberTagIndex).toBeGreaterThan(locationIndex);
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

  it("should include geohash tag when geohash is provided", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation, { geohash: "c23q6sydb" });

    expect(event.tags).toContainEqual(["g", "c23q6sydb"]);
  });

  it("should not include geohash tag when geohash is not provided", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation);

    expect(event.tags).not.toContainEqual(["g", expect.any(String)]);
    expect(event.tags.some(tag => tag[0] === "g")).toBe(false);
  });

  it("should not include geohash tag when geohash is null", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation, { geohash: null });

    expect(event.tags).not.toContainEqual(["g", expect.any(String)]);
    expect(event.tags.some(tag => tag[0] === "g")).toBe(false);
  });

  it("should not include geohash tag when geohash is empty string", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation, { geohash: "" });

    expect(event.tags).not.toContainEqual(["g", expect.any(String)]);
    expect(event.tags.some(tag => tag[0] === "g")).toBe(false);
  });

  it("should trim geohash before adding tag", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation, { geohash: "  c23q6sydb  " });

    expect(event.tags).toContainEqual(["g", "c23q6sydb"]);
  });

  it("should place geohash tag after location tag", () => {
    const profileWithLocation: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA"
    };

    const event = buildProfileEvent(profileWithLocation, { geohash: "c23q6sydb" });

    const locationIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1].startsWith("location:")
    );
    const geohashIndex = event.tags.findIndex(
      tag => tag[0] === "g"
    );

    expect(locationIndex).toBeGreaterThan(-1);
    expect(geohashIndex).toBeGreaterThan(-1);
    expect(geohashIndex).toBeGreaterThan(locationIndex);
  });

  it("should include geohash tag along with location and chamber tag", () => {
    const profileWithAll: BusinessProfile = {
      ...baseProfile,
      location: "123 Main St, Seattle, WA, 98101, USA",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithAll, { geohash: "c23q6sydb" });

    expect(event.tags).toContainEqual(["i", "location:123 Main St, Seattle, WA, 98101, USA", ""]);
    expect(event.tags).toContainEqual(["g", "c23q6sydb"]);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
    // Should NOT contain namespace tags
    expect(event.tags).not.toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags.some(tag => tag[0] === "l" && tag[2] === "com.synvya.chamber")).toBe(false);
  });

<<<<<<< HEAD
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
>>>>>>> 4b878c8 (Add email field and update email tag format to Schema.org standard)
  });
});

