/**
 * Types for Synvya Reservation Messages (NIP-9901/9902/9903/9904)
 * 
 * These types match the JSON schemas defined in https://github.com/Synvya/nip-rr/tree/main/schemas
 */

/**
 * Contact information for a reservation guest
 */
export interface ReservationContact {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Constraints and preferences for reservation negotiation
 */
export interface ReservationConstraints {
  earliest_iso_time?: string;
  latest_iso_time?: string;
}

/**
 * Reservation request payload (kind 9901)
 */
export interface ReservationRequest {
  /** Number of guests (1-20) */
  party_size: number;
  /** Requested time in ISO8601 format with timezone */
  iso_time: string;
  /** Optional notes or special requests */
  notes?: string;
  /** Optional contact information */
  contact?: ReservationContact;
  /** Optional constraints for negotiation */
  constraints?: ReservationConstraints;
}

/**
 * Status of a reservation response
 */
export type ReservationStatus = 
  | "confirmed"
  | "declined" 
  | "cancelled";

/**
 * Reservation response payload (kind 9902)
 */
export interface ReservationResponse {
  /** Status of the reservation */
  status: ReservationStatus;
  /** Proposed or confirmed time (null for declined/cancelled) */
  iso_time: string | null;
  /** Optional message to the requester */
  message?: string;
  /** Optional table identifier */
  table?: string | null;
}

/**
 * Reservation modification request payload (kind 9903)
 * 
 * Sent by user/agent in response to a restaurant's "suggested" response (9902).
 * Allows user to accept or counter-propose the suggested time.
 */
export interface ReservationModificationRequest {
  /** Number of guests (1-20) */
  party_size: number;
  /** Requested time in ISO8601 format with timezone */
  iso_time: string;
  /** Optional notes or special requests */
  notes?: string;
  /** Optional contact information */
  contact?: ReservationContact;
  /** Optional constraints for negotiation */
  constraints?: ReservationConstraints;
}

/**
 * Status of a reservation modification response
 */
export type ReservationModificationStatus = 
  | "confirmed"
  | "declined";

/**
 * Reservation modification response payload (kind 9904)
 * 
 * Sent by restaurant in response to a user's modification request (9903).
 */
export interface ReservationModificationResponse {
  /** Status of the modification */
  status: ReservationModificationStatus;
  /** Proposed or confirmed time (null for declined) */
  iso_time: string | null;
  /** Optional message to the requester */
  message?: string;
}

/**
 * Validation error details
 */
export interface ValidationError {
  field?: string;
  message: string;
  value?: unknown;
}

/**
 * Result of validation
 */
export interface ValidationResult {
  valid: boolean;
  errors?: ValidationError[];
}

