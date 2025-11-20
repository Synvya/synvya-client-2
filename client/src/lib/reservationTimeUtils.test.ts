/**
 * Tests for Time Conversion Utilities
 */

import { describe, it, expect } from "vitest";
import {
  iso8601ToUnixAndTzid,
  unixAndTzidToIso8601,
  isValidTzid,
  type UnixTimestampAndTzid,
} from "./reservationTimeUtils";

describe("reservationTimeUtils", () => {
  describe("iso8601ToUnixAndTzid", () => {
    it("converts ISO8601 with timezone offset to Unix timestamp and tzid", () => {
      const iso8601 = "2025-10-20T19:00:00-07:00";
      const result = iso8601ToUnixAndTzid(iso8601);

      expect(result.unixTimestamp).toBeGreaterThan(0);
      expect(result.tzid).toBeTruthy();
      expect(typeof result.tzid).toBe("string");
    });

    it("converts ISO8601 with UTC timezone (Z)", () => {
      const iso8601 = "2025-10-20T19:00:00Z";
      const result = iso8601ToUnixAndTzid(iso8601);

      expect(result.unixTimestamp).toBeGreaterThan(0);
      expect(result.tzid).toBe("UTC");
    });

    it("converts ISO8601 with positive timezone offset", () => {
      const iso8601 = "2025-10-20T19:00:00+09:00";
      const result = iso8601ToUnixAndTzid(iso8601);

      expect(result.unixTimestamp).toBeGreaterThan(0);
      expect(result.tzid).toBeTruthy();
    });

    it("throws error for invalid ISO8601 string", () => {
      expect(() => {
        iso8601ToUnixAndTzid("invalid-date");
      }).toThrow("Invalid ISO8601 datetime string");
    });

    it("throws error for empty string", () => {
      expect(() => {
        iso8601ToUnixAndTzid("");
      }).toThrow("ISO8601 string is required");
    });

    it("throws error for non-string input", () => {
      expect(() => {
        iso8601ToUnixAndTzid(null as unknown as string);
      }).toThrow("ISO8601 string is required");
    });

    it("produces correct Unix timestamp for known date", () => {
      // 2025-10-20T19:00:00-07:00 should be a specific Unix timestamp
      const iso8601 = "2025-10-20T19:00:00-07:00";
      const result = iso8601ToUnixAndTzid(iso8601);
      
      // Verify by converting back
      const date = new Date(iso8601);
      const expectedTimestamp = Math.floor(date.getTime() / 1000);
      
      expect(result.unixTimestamp).toBe(expectedTimestamp);
    });
  });

  describe("unixAndTzidToIso8601", () => {
    it("converts Unix timestamp and tzid to ISO8601", () => {
      const unixTimestamp = 1729458000; // 2025-10-20T19:00:00-07:00 (approximately)
      const tzid = "America/Los_Angeles";
      
      const result = unixAndTzidToIso8601(unixTimestamp, tzid);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      expect(result).toContain("T");
      expect(result).toMatch(/[+-]\d{2}:\d{2}$/);
    });

    it("converts UTC timezone correctly", () => {
      const unixTimestamp = 1729458000;
      const tzid = "UTC";
      
      const result = unixAndTzidToIso8601(unixTimestamp, tzid);

      expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+Z]/);
    });

    it("handles different timezones correctly", () => {
      const unixTimestamp = 1729458000;
      const timezones = [
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "Europe/London",
        "Asia/Tokyo",
      ];

      for (const tzid of timezones) {
        const result = unixAndTzidToIso8601(unixTimestamp, tzid);
        expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
      }
    });

    it("round-trip conversion preserves time", () => {
      const originalIso8601 = "2025-10-20T19:00:00-07:00";
      const { unixTimestamp, tzid } = iso8601ToUnixAndTzid(originalIso8601);
      
      const converted = unixAndTzidToIso8601(unixTimestamp, tzid);
      
      // Parse both and compare the actual moments in time
      const originalDate = new Date(originalIso8601);
      const convertedDate = new Date(converted);
      
      // They should represent the same moment (within 1 minute due to rounding)
      const diffMs = Math.abs(originalDate.getTime() - convertedDate.getTime());
      expect(diffMs).toBeLessThan(60 * 1000); // Less than 1 minute difference
    });

    it("throws error for invalid Unix timestamp", () => {
      expect(() => {
        unixAndTzidToIso8601(NaN, "America/Los_Angeles");
      }).toThrow("Unix timestamp must be a valid number");
    });

    it("throws error for invalid tzid", () => {
      expect(() => {
        unixAndTzidToIso8601(1729458000, "");
      }).toThrow("IANA timezone identifier (tzid) is required");
    });

    it("throws error for non-string tzid", () => {
      expect(() => {
        unixAndTzidToIso8601(1729458000, null as unknown as string);
      }).toThrow("IANA timezone identifier (tzid) is required");
    });
  });

  describe("isValidTzid", () => {
    it("validates common IANA timezone identifiers", () => {
      const validTimezones = [
        "America/Los_Angeles",
        "America/New_York",
        "America/Chicago",
        "Europe/London",
        "Asia/Tokyo",
        "UTC",
        "America/Denver",
      ];

      for (const tzid of validTimezones) {
        expect(isValidTzid(tzid)).toBe(true);
      }
    });

    it("rejects invalid timezone identifiers", () => {
      const invalidTimezones = [
        "Invalid/Timezone",
        "NotATimezone",
        "",
        "America/InvalidCity",
      ];

      for (const tzid of invalidTimezones) {
        expect(isValidTzid(tzid)).toBe(false);
      }
    });

    it("rejects non-string input", () => {
      expect(isValidTzid(null as unknown as string)).toBe(false);
      expect(isValidTzid(123 as unknown as string)).toBe(false);
      expect(isValidTzid(undefined as unknown as string)).toBe(false);
    });
  });

  describe("round-trip conversions", () => {
    it("converts ISO8601 to Unix timestamp correctly (timestamp is always accurate)", () => {
      const testCases = [
        "2025-10-20T19:00:00-07:00",
        "2025-10-20T19:00:00+00:00",
        "2025-10-20T19:00:00Z",
        "2025-10-20T19:00:00+09:00",
        "2025-10-20T19:00:00-05:00",
      ];

      for (const originalIso8601 of testCases) {
        const { unixTimestamp } = iso8601ToUnixAndTzid(originalIso8601);
        const originalDate = new Date(originalIso8601);
        const expectedTimestamp = Math.floor(originalDate.getTime() / 1000);
        
        // The Unix timestamp should always be accurate regardless of timezone inference
        expect(unixTimestamp).toBe(expectedTimestamp);
      }
    });

    it("round-trips correctly with explicit UTC timezone", () => {
      const testCases = [
        "2025-10-20T19:00:00Z",
        "2025-10-20T00:00:00Z",
        "2025-10-20T23:59:59Z",
        "2025-10-20T12:00:00Z",
      ];

      for (const originalIso8601 of testCases) {
        const { unixTimestamp } = iso8601ToUnixAndTzid(originalIso8601);
        // Use explicit UTC timezone for round-trip
        const converted = unixAndTzidToIso8601(unixTimestamp, "UTC");
        
        const originalDate = new Date(originalIso8601);
        const convertedDate = new Date(converted);
        
        // They should represent the same moment (within 1 minute for rounding)
        const diffMs = Math.abs(originalDate.getTime() - convertedDate.getTime());
        expect(diffMs).toBeLessThan(60 * 1000);
      }
    });

    it("round-trips correctly with explicit known timezones", () => {
      // Test with explicit timezones to avoid inference issues
      const testCases: Array<{ iso8601: string; tzid: string }> = [
        { iso8601: "2025-10-20T19:00:00-07:00", tzid: "America/Los_Angeles" },
        { iso8601: "2025-10-20T19:00:00-05:00", tzid: "America/New_York" },
        { iso8601: "2025-10-20T19:00:00+09:00", tzid: "Asia/Tokyo" },
      ];

      for (const { iso8601, tzid } of testCases) {
        const { unixTimestamp } = iso8601ToUnixAndTzid(iso8601);
        // Use explicit timezone for round-trip
        const converted = unixAndTzidToIso8601(unixTimestamp, tzid);
        
        const originalDate = new Date(iso8601);
        const convertedDate = new Date(converted);
        
        // They should represent the same moment (within 1 minute for rounding)
        const diffMs = Math.abs(originalDate.getTime() - convertedDate.getTime());
        expect(diffMs).toBeLessThan(60 * 1000);
      }
    });

    it("handles edge cases around midnight with explicit UTC", () => {
      const testCases = [
        "2025-10-20T00:00:00Z",
        "2025-10-20T23:59:59Z",
        "2025-10-21T00:00:00Z",
      ];

      for (const originalIso8601 of testCases) {
        const { unixTimestamp } = iso8601ToUnixAndTzid(originalIso8601);
        const converted = unixAndTzidToIso8601(unixTimestamp, "UTC");
        
        const originalDate = new Date(originalIso8601);
        const convertedDate = new Date(converted);
        
        const diffMs = Math.abs(originalDate.getTime() - convertedDate.getTime());
        expect(diffMs).toBeLessThan(60 * 1000);
      }
    });
  });
});

