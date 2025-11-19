/**
 * Time Conversion Utilities for NIP-RP Reservation Protocol
 * 
 * Converts between ISO8601 datetime strings and Unix timestamps with IANA timezone identifiers.
 * NIP-RP requires Unix timestamps in tags along with separate IANA timezone identifiers.
 */

/**
 * Result of converting ISO8601 to Unix timestamp and timezone
 */
export interface UnixTimestampAndTzid {
  /** Unix timestamp in seconds */
  unixTimestamp: number;
  /** IANA Time Zone Database identifier (e.g., "America/Los_Angeles") */
  tzid: string;
}

/**
 * Converts an ISO8601 datetime string to a Unix timestamp and IANA timezone identifier.
 * 
 * @param iso8601 - ISO8601 datetime string (e.g., "2025-10-20T19:00:00-07:00")
 * @returns Object with Unix timestamp (seconds) and IANA timezone identifier
 * @throws Error if the ISO8601 string is invalid
 * 
 * @example
 * ```typescript
 * const result = iso8601ToUnixAndTzid("2025-10-20T19:00:00-07:00");
 * // Returns: { unixTimestamp: 1729458000, tzid: "America/Los_Angeles" }
 * ```
 */
export function iso8601ToUnixAndTzid(iso8601: string): UnixTimestampAndTzid {
  if (!iso8601 || typeof iso8601 !== "string") {
    throw new Error("ISO8601 string is required");
  }

  // Parse the ISO8601 string to a Date object
  const date = new Date(iso8601);
  
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ISO8601 datetime string: ${iso8601}`);
  }

  // Convert to Unix timestamp (seconds)
  const unixTimestamp = Math.floor(date.getTime() / 1000);

  // Extract timezone offset from ISO8601 string
  // Format: YYYY-MM-DDTHH:mm:ss±HH:MM or YYYY-MM-DDTHH:mm:ssZ
  const offsetMatch = iso8601.match(/([+-]\d{2}):(\d{2})|Z$/);
  
  if (!offsetMatch) {
    // If no explicit offset, use the system timezone
    const tzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return { unixTimestamp, tzid };
  }

  // Try to infer IANA timezone from offset
  // Note: This is approximate since multiple timezones can have the same offset
  // For better accuracy, the timezone should be provided explicitly
  const tzid = inferTzidFromOffset(iso8601, date);
  
  return { unixTimestamp, tzid };
}

/**
 * Converts a Unix timestamp and IANA timezone identifier to an ISO8601 datetime string.
 * 
 * @param unixTimestamp - Unix timestamp in seconds
 * @param tzid - IANA Time Zone Database identifier (e.g., "America/Los_Angeles")
 * @returns ISO8601 datetime string with timezone offset
 * @throws Error if the timezone identifier is invalid
 * 
 * @example
 * ```typescript
 * const iso8601 = unixAndTzidToIso8601(1729458000, "America/Los_Angeles");
 * // Returns: "2025-10-20T19:00:00-07:00"
 * ```
 */
export function unixAndTzidToIso8601(
  unixTimestamp: number,
  tzid: string
): string {
  if (typeof unixTimestamp !== "number" || isNaN(unixTimestamp)) {
    throw new Error("Unix timestamp must be a valid number");
  }

  if (!tzid || typeof tzid !== "string") {
    throw new Error("IANA timezone identifier (tzid) is required");
  }

  // Create a Date object from the Unix timestamp
  const date = new Date(unixTimestamp * 1000);

  // Format the date in the specified timezone
  // Use Intl.DateTimeFormat to format with the timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tzid,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // Format date components in the target timezone
  const parts = formatter.formatToParts(date);
  const year = parts.find(p => p.type === "year")?.value;
  const month = parts.find(p => p.type === "month")?.value;
  const day = parts.find(p => p.type === "day")?.value;
  const hour = parts.find(p => p.type === "hour")?.value;
  const minute = parts.find(p => p.type === "minute")?.value;
  const second = parts.find(p => p.type === "second")?.value;

  if (!year || !month || !day || !hour || !minute || !second) {
    throw new Error(`Failed to format date in timezone: ${tzid}`);
  }

  // Calculate timezone offset for this specific date/time
  // Method: Create an ISO string with the timezone-local components, then parse it
  // and compare with the actual UTC time to determine the offset
  
  // The formatted components represent the local time in the timezone
  // We need to find what offset would make this local time equal to the UTC time
  
  // Create a date string with the local time components (without timezone)
  const localDateStr = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  
  // Try different offsets to find the one that matches
  // We'll use a binary search or test common offsets
  // Actually, a better approach: use the fact that we know the UTC time (date.getTime())
  // and we know the local time components. We can calculate the offset directly.
  
  // Create a date by parsing the local time as if it were in the timezone
  // We can use Intl to help us, but a simpler approach:
  // Format the UTC time in the timezone to get what the local time should be
  // Then calculate the offset needed to make the local time match
  
  // Actually, the simplest: create an ISO string with a guessed offset, parse it,
  // and adjust until it matches. But that's inefficient.
  
  // Better: Use the UTC time and local time to calculate offset directly
  // UTC time is: date.getTime()
  // Local time components are: year, month, day, hour, minute, second in timezone
  
  // Create a date object representing the local time as if it were UTC
  const localAsUtc = new Date(`${localDateStr}Z`);
  
  // The difference between actual UTC and "local as UTC" gives us the offset
  // If local time is 19:00 and UTC is 02:00 (next day), offset is -07:00
  // offset = UTC - local (when local is treated as UTC)
  const offsetMs = date.getTime() - localAsUtc.getTime();
  const offsetMinutes = Math.round(offsetMs / (1000 * 60));
  
  // Format offset as ±HH:MM
  // Note: ISO8601 offset sign is opposite of what we might expect
  // +07:00 means UTC+7 (7 hours ahead), which means local time = UTC + 7
  // So if UTC is 02:00 and local is 19:00 (previous day), offset should be -07:00
  const offsetHours = Math.floor(Math.abs(offsetMinutes) / 60);
  const offsetMins = Math.abs(offsetMinutes) % 60;
  const offsetSign = offsetMinutes <= 0 ? "+" : "-"; // Inverted: negative offset means ahead of UTC
  const offsetString = `${offsetSign}${String(offsetHours).padStart(2, "0")}:${String(offsetMins).padStart(2, "0")}`;

  return `${year}-${month}-${day}T${hour}:${minute}:${second}${offsetString}`;
}

/**
 * Infers IANA timezone identifier from an ISO8601 string's offset.
 * 
 * This is an approximation since multiple timezones can have the same offset.
 * For better accuracy, the timezone should be provided explicitly.
 * 
 * @param iso8601 - ISO8601 datetime string
 * @param date - Parsed Date object
 * @returns IANA timezone identifier
 */
function inferTzidFromOffset(iso8601: string, date: Date): string {
  // Extract offset from ISO8601 string
  const offsetMatch = iso8601.match(/([+-]\d{2}):(\d{2})|Z$/);
  
  if (!offsetMatch) {
    // Fallback to system timezone
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  }

  if (offsetMatch[0] === "Z") {
    return "UTC";
  }

  // Calculate offset in minutes
  const offsetSign = offsetMatch[1][0] === "+" ? 1 : -1;
  const offsetHours = parseInt(offsetMatch[1].slice(1), 10);
  const offsetMinutes = parseInt(offsetMatch[2], 10);
  const totalOffsetMinutes = offsetSign * (offsetHours * 60 + offsetMinutes);

  // Try to use the system timezone if the offset matches
  const systemTzid = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const systemOffset = -date.getTimezoneOffset(); // getTimezoneOffset returns opposite sign
  
  // If the offset matches the system timezone, use it
  if (Math.abs(systemOffset - totalOffsetMinutes) < 60) {
    return systemTzid;
  }

  // Common US timezone mappings (approximate, doesn't account for DST changes)
  // This is a fallback - for production, consider using a timezone library
  const commonTimezones: Record<number, string[]> = {
    [-480]: ["America/Los_Angeles", "America/Vancouver", "America/Tijuana"], // PST/PDT
    [-420]: ["America/Denver", "America/Phoenix", "America/Edmonton"], // MST/MDT
    [-360]: ["America/Chicago", "America/Mexico_City", "America/Winnipeg"], // CST/CDT
    [-300]: ["America/New_York", "America/Toronto", "America/Montreal"], // EST/EDT
    [-240]: ["America/Halifax", "America/Santiago"], // AST
    [0]: ["UTC", "Europe/London", "Africa/Casablanca"], // UTC/GMT
    [60]: ["Europe/Paris", "Europe/Berlin", "Europe/Rome"], // CET
    [120]: ["Europe/Athens", "Africa/Cairo", "Europe/Helsinki"], // EET
    [330]: ["Asia/Kolkata"], // IST
    [480]: ["Asia/Shanghai", "Asia/Hong_Kong", "Asia/Singapore"], // CST
    [540]: ["Asia/Tokyo", "Asia/Seoul"], // JST/KST
  };

  // Find matching timezone(s) for this offset
  const matchingTimezones = commonTimezones[totalOffsetMinutes];
  if (matchingTimezones && matchingTimezones.length > 0) {
    // Return the first match (prefer US timezones for US offsets)
    return matchingTimezones[0];
  }

  // Fallback: construct a timezone name from offset
  // This is not ideal but provides a reasonable default
  const offsetHoursRounded = Math.round(totalOffsetMinutes / 60);
  if (offsetHoursRounded === 0) {
    return "UTC";
  }
  
  // For unknown offsets, try to use a generic timezone
  // In practice, the timezone should be provided explicitly
  return `Etc/GMT${offsetHoursRounded >= 0 ? "-" : "+"}${Math.abs(offsetHoursRounded)}`;
}

/**
 * Validates an IANA timezone identifier.
 * 
 * @param tzid - IANA timezone identifier to validate
 * @returns true if the timezone is valid, false otherwise
 * 
 * @example
 * ```typescript
 * isValidTzid("America/Los_Angeles"); // true
 * isValidTzid("Invalid/Timezone"); // false
 * ```
 */
export function isValidTzid(tzid: string): boolean {
  if (!tzid || typeof tzid !== "string") {
    return false;
  }

  try {
    // Try to format a date with this timezone
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: tzid,
    });
    formatter.format(new Date());
    return true;
  } catch {
    return false;
  }
}

