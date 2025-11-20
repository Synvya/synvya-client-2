import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useMemberOf, parseMemberOfFromUrl, initializeMemberOfFromUrl } from "./useMemberOf";

describe("useMemberOf", () => {
  beforeEach(() => {
    // Reset state before each test
    useMemberOf.getState().clearDomain();
  });

  it("should initialize with null domain", () => {
    const state = useMemberOf.getState();
    expect(state.domain).toBeNull();
  });

  it("should set domain", () => {
    const { setDomain } = useMemberOf.getState();
    setDomain("snovalley.org");
    
    const state = useMemberOf.getState();
    expect(state.domain).toBe("snovalley.org");
  });

  it("should clear domain", () => {
    const { setDomain, clearDomain } = useMemberOf.getState();
    
    setDomain("snovalley.org");
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
    
    clearDomain();
    expect(useMemberOf.getState().domain).toBeNull();
  });

  it("should handle different organization domains", () => {
    const { setDomain } = useMemberOf.getState();
    
    setDomain("snovalley.org");
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
    
    setDomain("eastsidechamber.org");
    expect(useMemberOf.getState().domain).toBe("eastsidechamber.org");
    
    setDomain("seattlechamber.org");
    expect(useMemberOf.getState().domain).toBe("seattlechamber.org");
  });

  it("should persist domain across state reads", () => {
    const { setDomain } = useMemberOf.getState();
    setDomain("snovalley.org");
    
    // Read from multiple calls
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
  });
});

describe("parseMemberOfFromUrl", () => {
  beforeEach(() => {
    // Clean up any existing window mock
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Clean up window mock after each test
    vi.unstubAllGlobals();
  });

  it("should parse memberOf from URL query parameter", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=snovalley.org"
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBe("snovalley.org");
  });

  it("should return null when memberOf parameter is missing", () => {
    vi.stubGlobal("window", {
      location: {
        search: ""
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBeNull();
  });

  it("should return null when memberOf parameter is empty", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf="
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBeNull();
  });

  it("should trim whitespace from memberOf parameter", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=  snovalley.org  "
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBe("snovalley.org");
  });

  it("should remove protocol from memberOf parameter if present", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=https://snovalley.org"
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBe("snovalley.org");
  });

  it("should remove trailing slash from memberOf parameter", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=snovalley.org/"
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBe("snovalley.org");
  });

  it("should handle memberOf parameter with other query parameters", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?other=value&memberOf=snovalley.org&another=param"
      }
    });

    const result = parseMemberOfFromUrl();
    expect(result).toBe("snovalley.org");
  });

  it("should return null when window is undefined (SSR)", () => {
    vi.unstubAllGlobals();
    // @ts-expect-error - intentionally removing window for SSR test
    delete globalThis.window;

    const result = parseMemberOfFromUrl();
    expect(result).toBeNull();
  });

  it("should handle different organization domains", () => {
    const testCases = ["snovalley.org", "eastsidechamber.org", "seattlechamber.org", "bellevue.org"];

    for (const domain of testCases) {
      vi.stubGlobal("window", {
        location: {
          search: `?memberOf=${domain}`
        }
      });

      const result = parseMemberOfFromUrl();
      expect(result).toBe(domain);
    }
  });
});

describe("initializeMemberOfFromUrl", () => {
  beforeEach(() => {
    // Reset state and clean up window mock before each test
    useMemberOf.getState().clearDomain();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Clean up window mock after each test
    vi.unstubAllGlobals();
  });

  it("should initialize domain from URL", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=snovalley.org"
      }
    });

    initializeMemberOfFromUrl();
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
  });

  it("should not set domain when parameter is missing", () => {
    vi.stubGlobal("window", {
      location: {
        search: ""
      }
    });

    initializeMemberOfFromUrl();
    expect(useMemberOf.getState().domain).toBeNull();
  });

  it("should not set domain when parameter is empty", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf="
      }
    });

    initializeMemberOfFromUrl();
    expect(useMemberOf.getState().domain).toBeNull();
  });

  it("should normalize memberOf domain (trim and remove protocol)", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=https://snovalley.org/"
      }
    });

    initializeMemberOfFromUrl();
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
  });

  it("should overwrite existing domain when URL has new value", () => {
    // Set initial domain
    useMemberOf.getState().setDomain("eastsidechamber.org");
    expect(useMemberOf.getState().domain).toBe("eastsidechamber.org");

    // Initialize from URL with different value
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=snovalley.org"
      }
    });

    initializeMemberOfFromUrl();
    expect(useMemberOf.getState().domain).toBe("snovalley.org");
  });

  it("should handle multiple calls without duplicating state", () => {
    vi.stubGlobal("window", {
      location: {
        search: "?memberOf=snovalley.org"
      }
    });

    initializeMemberOfFromUrl();
    initializeMemberOfFromUrl();
    initializeMemberOfFromUrl();

    expect(useMemberOf.getState().domain).toBe("snovalley.org");
  });
});

