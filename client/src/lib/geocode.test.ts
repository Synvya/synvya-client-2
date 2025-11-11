import { describe, it, expect, vi, beforeEach } from "vitest";
import { geocodeLocation } from "./geocode";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("geocodeLocation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the module cache by re-importing (this clears the internal cache)
    // Since we can't directly access the cache, we'll use unique addresses for each test
  });

  it("should return null values for empty location", async () => {
    const result = await geocodeLocation(null);
    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("should return null values for empty string location", async () => {
    const result = await geocodeLocation("");
    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("should return null values for whitespace-only location", async () => {
    const result = await geocodeLocation("   ");
    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("should geocode a valid address and return geohash", async () => {
    const mockResponse = [
      {
        lat: "47.6062",
        lon: "-122.3321"
      }
    ];

    // Mock for all possible address variants
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await geocodeLocation("Test Address 1, Seattle, WA, 98101, USA");

    expect(result.geohash).toBeTruthy();
    expect(typeof result.geohash).toBe("string");
    expect(result.latitude).toBe(47.6062);
    expect(result.longitude).toBe(-122.3321);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("should use fallback geocoder if primary fails", async () => {
    const mockFallbackResponse = [
      {
        lat: "47.6062",
        lon: "-122.3321"
      }
    ];

    // Primary geocoder fails for all variants
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("nominatim.openstreetmap.org")) {
        return Promise.resolve({
          ok: false,
          status: 500
        });
      }
      // Fallback geocoder succeeds
      return Promise.resolve({
        ok: true,
        json: async () => mockFallbackResponse
      });
    });

    const result = await geocodeLocation("Test Address 2, Seattle, WA, 98101, USA");

    expect(result.geohash).toBeTruthy();
    expect(result.latitude).toBe(47.6062);
    expect(result.longitude).toBe(-122.3321);
    expect(mockFetch).toHaveBeenCalled();
  });

  it("should return null values if geocoding fails completely", async () => {
    // Both geocoders fail for all variants
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500
    });

    const result = await geocodeLocation("Test Invalid Address 3, Nowhere, ZZ, 00000, USA");

    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("should return null values if geocoder returns invalid coordinates", async () => {
    const mockResponse = [
      {
        lat: "invalid",
        lon: "invalid"
      }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const result = await geocodeLocation("Test Address 4, Seattle, WA");

    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });

  it("should cache geocoding results", async () => {
    const mockResponse = [
      {
        lat: "47.6062",
        lon: "-122.3321"
      }
    ];

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => mockResponse
    });

    const location = "Test Address 5, Seattle, WA, 98101, USA";
    const result1 = await geocodeLocation(location);
    const initialCallCount = mockFetch.mock.calls.length;
    const result2 = await geocodeLocation(location);

    // Should use cache on second call (may have multiple calls for variants on first call)
    expect(result1.geohash).toBe(result2.geohash);
    expect(result1.latitude).toBe(result2.latitude);
    expect(result1.longitude).toBe(result2.longitude);
    // Second call should not add more fetch calls (cached)
    expect(mockFetch.mock.calls.length).toBe(initialCallCount);
  });

  it("should handle fetch errors gracefully", async () => {
    mockFetch.mockRejectedValue(new Error("Network error"));

    const result = await geocodeLocation("Test Address 6, Seattle, WA");

    expect(result.geohash).toBeNull();
    expect(result.latitude).toBeNull();
    expect(result.longitude).toBeNull();
  });
});

