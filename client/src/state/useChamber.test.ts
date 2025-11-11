import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useChamber, parseChamberFromUrl, initializeChamberFromUrl } from "./useChamber";

describe("useChamber", () => {
  beforeEach(() => {
    // Reset state before each test
    useChamber.getState().clearChamberId();
  });

  it("should initialize with null chamberId", () => {
    const state = useChamber.getState();
    expect(state.chamberId).toBeNull();
  });

  it("should set chamber ID", () => {
    const { setChamberId } = useChamber.getState();
    setChamberId("snovalley");
    
    const state = useChamber.getState();
    expect(state.chamberId).toBe("snovalley");
  });

  it("should clear chamber ID", () => {
    const { setChamberId, clearChamberId } = useChamber.getState();
    
    setChamberId("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
    
    clearChamberId();
    expect(useChamber.getState().chamberId).toBeNull();
  });

  it("should handle different chamber IDs", () => {
    const { setChamberId } = useChamber.getState();
    
    setChamberId("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
    
    setChamberId("eastside");
    expect(useChamber.getState().chamberId).toBe("eastside");
    
    setChamberId("seattle");
    expect(useChamber.getState().chamberId).toBe("seattle");
  });

  it("should persist chamber ID across state reads", () => {
    const { setChamberId } = useChamber.getState();
    setChamberId("snovalley");
    
    // Read from multiple calls
    expect(useChamber.getState().chamberId).toBe("snovalley");
    expect(useChamber.getState().chamberId).toBe("snovalley");
  });
});

describe("parseChamberFromUrl", () => {
  beforeEach(() => {
    // Clean up any existing window mock
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Clean up window mock after each test
    vi.unstubAllGlobals();
  });

  it("should parse chamber from URL query parameter", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=snovalley"
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBe("snovalley");
  });

  it("should return null when chamber parameter is missing", () => {
    vi.stubGlobal("window", {
      location: {
        search: ""
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBeNull();
  });

  it("should return null when chamber parameter is empty", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber="
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBeNull();
  });

  it("should trim whitespace from chamber parameter", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=  snovalley  "
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBe("snovalley");
  });

  it("should convert chamber parameter to lowercase", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=SnoValley"
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBe("snovalley");
  });

  it("should handle chamber parameter with other query parameters", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?other=value&chamber=snovalley&another=param"
      }
    });

    const result = parseChamberFromUrl();
    expect(result).toBe("snovalley");
  });

  it("should return null when window is undefined (SSR)", () => {
    vi.unstubAllGlobals();
    // @ts-expect-error - intentionally removing window for SSR test
    delete globalThis.window;

    const result = parseChamberFromUrl();
    expect(result).toBeNull();
  });

  it("should handle different chamber IDs", () => {
    const testCases = ["snovalley", "eastside", "seattle", "bellevue"];

    for (const chamberId of testCases) {
      vi.stubGlobal("window", {
        location: {
          search: `?chamber=${chamberId}`
        }
      });

      const result = parseChamberFromUrl();
      expect(result).toBe(chamberId.toLowerCase());
    }
  });
});

describe("initializeChamberFromUrl", () => {
  beforeEach(() => {
    // Reset state and clean up window mock before each test
    useChamber.getState().clearChamberId();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Clean up window mock after each test
    vi.unstubAllGlobals();
  });

  it("should initialize chamber ID from URL", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=snovalley"
      }
    });

    initializeChamberFromUrl();
    expect(useChamber.getState().chamberId).toBe("snovalley");
  });

  it("should not set chamber ID when parameter is missing", () => {
    vi.stubGlobal("window", {
      location: {
        search: ""
      }
    });

    initializeChamberFromUrl();
    expect(useChamber.getState().chamberId).toBeNull();
  });

  it("should not set chamber ID when parameter is empty", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber="
      }
    });

    initializeChamberFromUrl();
    expect(useChamber.getState().chamberId).toBeNull();
  });

  it("should normalize chamber ID (trim and lowercase)", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=  SnoValley  "
      }
    });

    initializeChamberFromUrl();
    expect(useChamber.getState().chamberId).toBe("snovalley");
  });

  it("should overwrite existing chamber ID when URL has new value", () => {
    // Set initial chamber ID
    useChamber.getState().setChamberId("eastside");
    expect(useChamber.getState().chamberId).toBe("eastside");

    // Initialize from URL with different value
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=snovalley"
      }
    });

    initializeChamberFromUrl();
    expect(useChamber.getState().chamberId).toBe("snovalley");
  });

  it("should handle multiple calls without duplicating state", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?chamber=snovalley"
      }
    });

    initializeChamberFromUrl();
    initializeChamberFromUrl();
    initializeChamberFromUrl();

    expect(useChamber.getState().chamberId).toBe("snovalley");
  });
});

