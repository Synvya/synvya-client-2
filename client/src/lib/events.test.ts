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

  it("should include chamber tags when chamber is specified", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    expect(event.kind).toBe(0);
    expect(event.tags).toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["l", "snovalley", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
  });

  it("should support different chamber IDs", () => {
    const profileWithEastside: BusinessProfile = {
      ...baseProfile,
      chamber: "eastside"
    };

    const event = buildProfileEvent(profileWithEastside);

    expect(event.tags).toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["l", "eastside", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:eastside", ""]);
  });

  it("should include chamber tags along with other tags", () => {
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
    
    // Should also include chamber tags
    expect(event.tags).toContainEqual(["L", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["l", "snovalley", "com.synvya.chamber"]);
    expect(event.tags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
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

  it("should place chamber tags after location tags", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      location: "Seattle, WA, 98101",
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    const locationIndex = event.tags.findIndex(
      tag => tag[0] === "i" && tag[1].startsWith("location:")
    );
    const chamberLabelIndex = event.tags.findIndex(
      tag => tag[0] === "L" && tag[1] === "com.synvya.chamber"
    );

    expect(locationIndex).toBeGreaterThan(-1);
    expect(chamberLabelIndex).toBeGreaterThan(-1);
    expect(chamberLabelIndex).toBeGreaterThan(locationIndex);
  });

  it("should verify complete chamber tag structure", () => {
    const profileWithChamber: BusinessProfile = {
      ...baseProfile,
      chamber: "snovalley"
    };

    const event = buildProfileEvent(profileWithChamber);

    // Find all chamber-related tags
    const chamberTags = event.tags.filter(
      tag => 
        (tag[0] === "L" && tag[1] === "com.synvya.chamber") ||
        (tag[0] === "l" && tag[2] === "com.synvya.chamber") ||
        (tag[0] === "i" && tag[1].startsWith("com.synvya.chamber:"))
    );

    expect(chamberTags).toHaveLength(3);
    expect(chamberTags).toContainEqual(["L", "com.synvya.chamber"]);
    expect(chamberTags).toContainEqual(["l", "snovalley", "com.synvya.chamber"]);
    expect(chamberTags).toContainEqual(["i", "com.synvya.chamber:snovalley", ""]);
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
});

