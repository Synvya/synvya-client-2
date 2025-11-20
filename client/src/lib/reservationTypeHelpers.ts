/**
 * Helper functions for converting between old and new reservation type formats
 * 
 * These are temporary helpers to support the migration to tag-based NIP-RP structure.
 * They will be removed once all code is updated to use the new structure directly.
 */

import { iso8601ToUnixAndTzid, unixAndTzidToIso8601 } from "./reservationTimeUtils";
import type {
  ReservationRequest,
  ReservationResponse,
  ReservationModificationRequest,
  ReservationModificationResponse,
} from "@/types/reservation";

/**
 * Convert old-style reservation request with ISO8601 to new format
 * @deprecated Temporary helper for migration
 */
export function convertOldRequestToNew(old: {
  party_size: number;
  iso_time: string;
  notes?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  constraints?: {
    earliest_iso_time?: string;
    latest_iso_time?: string;
  };
}): ReservationRequest {
  const { unixTimestamp, tzid } = iso8601ToUnixAndTzid(old.iso_time);
  
  const result: ReservationRequest = {
    party_size: old.party_size,
    time: unixTimestamp,
    tzid,
    message: old.notes,
  };

  if (old.contact?.name) {
    result.name = old.contact.name;
  }
  if (old.contact?.phone) {
    result.telephone = old.contact.phone.startsWith("tel:") 
      ? old.contact.phone 
      : `tel:${old.contact.phone}`;
  }
  if (old.contact?.email) {
    result.email = old.contact.email.startsWith("mailto:") 
      ? old.contact.email 
      : `mailto:${old.contact.email}`;
  }

  if (old.constraints?.earliest_iso_time) {
    const { unixTimestamp: earliest } = iso8601ToUnixAndTzid(old.constraints.earliest_iso_time);
    result.earliest_time = earliest;
  }
  if (old.constraints?.latest_iso_time) {
    const { unixTimestamp: latest } = iso8601ToUnixAndTzid(old.constraints.latest_iso_time);
    result.latest_time = latest;
  }

  return result;
}

/**
 * Convert new-style reservation request to old format (for backward compatibility)
 * @deprecated Temporary helper for migration
 */
export function convertNewRequestToOld(newReq: ReservationRequest): {
  party_size: number;
  iso_time: string;
  notes?: string;
  contact?: {
    name?: string;
    phone?: string;
    email?: string;
  };
  constraints?: {
    earliest_iso_time?: string;
    latest_iso_time?: string;
  };
} {
  const iso_time = unixAndTzidToIso8601(newReq.time, newReq.tzid);
  
  const result: any = {
    party_size: newReq.party_size,
    iso_time,
    notes: newReq.message,
  };

  if (newReq.name || newReq.telephone || newReq.email) {
    result.contact = {};
    if (newReq.name) result.contact.name = newReq.name;
    if (newReq.telephone) {
      result.contact.phone = newReq.telephone.replace(/^tel:/, "");
    }
    if (newReq.email) {
      result.contact.email = newReq.email.replace(/^mailto:/, "");
    }
  }

  if (newReq.earliest_time || newReq.latest_time) {
    result.constraints = {};
    if (newReq.earliest_time) {
      result.constraints.earliest_iso_time = unixAndTzidToIso8601(newReq.earliest_time, newReq.tzid);
    }
    if (newReq.latest_time) {
      result.constraints.latest_iso_time = unixAndTzidToIso8601(newReq.latest_time, newReq.tzid);
    }
  }

  return result;
}

/**
 * Convert old-style reservation response with ISO8601 to new format
 * @deprecated Temporary helper for migration
 */
export function convertOldResponseToNew(old: {
  status: "confirmed" | "declined" | "cancelled";
  iso_time: string | null;
  message?: string;
  table?: string | null;
}): ReservationResponse {
  const result: ReservationResponse = {
    status: old.status,
    time: null,
    message: old.message,
  };

  if (old.iso_time) {
    const { unixTimestamp, tzid } = iso8601ToUnixAndTzid(old.iso_time);
    result.time = unixTimestamp;
    result.tzid = tzid;
  }

  return result;
}

/**
 * Convert new-style reservation response to old format (for backward compatibility)
 * @deprecated Temporary helper for migration
 */
export function convertNewResponseToOld(newResp: ReservationResponse): {
  status: "confirmed" | "declined" | "cancelled";
  iso_time: string | null;
  message?: string;
  table?: string | null;
} {
  const result: any = {
    status: newResp.status,
    iso_time: null,
    message: newResp.message,
    table: null,
  };

  if (newResp.time !== null && newResp.tzid) {
    result.iso_time = unixAndTzidToIso8601(newResp.time, newResp.tzid);
  }

  return result;
}

