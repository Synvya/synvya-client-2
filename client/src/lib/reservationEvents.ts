/**
 * Reservation Event Builders and Parsers
 * 
 * Handles creation and parsing of reservation messages (kinds 9901/9902/9903/9904)
 * with JSON schema validation.
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { Event, EventTemplate, UnsignedEvent } from "nostr-tools";
import { getEventHash, getPublicKey } from "nostr-tools";
import type {
  ReservationRequest,
  ReservationResponse,
  ReservationModificationRequest,
  ReservationModificationResponse,
  ValidationResult,
  ValidationError,
} from "@/types/reservation";
// Note: Encryption/decryption handled by NIP-59 seal/gift wrap layers
// Rumor content is plain text JSON per NIP-59 spec

// Import JSON schemas
import requestSchema from "@/schemas/reservation.request.schema.json";
import responseSchema from "@/schemas/reservation.response.schema.json";
import modificationRequestSchema from "@/schemas/reservation.modification.request.schema.json";
import modificationResponseSchema from "@/schemas/reservation.modification.response.schema.json";

// Initialize AJV with formats support
const ajv = new Ajv({ allErrors: true, validateSchema: false });
addFormats(ajv);

// Extract payload schemas from the allOf structure
// The payload schema is in the second allOf clause's contentSchema
const extractPayloadSchema = (fullSchema: any) => {
  return fullSchema.allOf[1].properties.content.contentSchema;
};

// Compile schemas for full rumor event validation
const validateRequestEvent = ajv.compile(requestSchema);
const validateResponseEvent = ajv.compile(responseSchema);
const validateModificationRequestEvent = ajv.compile(modificationRequestSchema);
const validateModificationResponseEvent = ajv.compile(modificationResponseSchema);

// Compile payload schemas
const payloadRequestSchema = extractPayloadSchema(requestSchema);
const payloadResponseSchema = extractPayloadSchema(responseSchema);
const payloadModificationRequestSchema = extractPayloadSchema(modificationRequestSchema);
const payloadModificationResponseSchema = extractPayloadSchema(modificationResponseSchema);

const validateRequestPayload = ajv.compile(payloadRequestSchema);
const validateResponsePayload = ajv.compile(payloadResponseSchema);
const validateModificationRequestPayload = ajv.compile(payloadModificationRequestSchema);
const validateModificationResponsePayload = ajv.compile(payloadModificationResponseSchema);

/**
 * Validates a reservation request payload against the JSON schema.
 * 
 * @param payload - The request payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationRequest({
 *   party_size: 2,
 *   iso_time: "2025-10-20T19:00:00-07:00"
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateReservationRequest(payload: unknown): ValidationResult {
  const valid = validateRequestPayload(payload);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateRequestPayload.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a full rumor event (kind 9901) including structure and content.
 * 
 * @param rumor - The rumor event to validate
 * @returns Validation result with errors if invalid
 */
export function validateReservationRequestRumor(rumor: UnsignedEvent & { id?: string }): ValidationResult {
  // Ensure id is present - calculate if missing
  // But only if rumor has all required fields for hash calculation
  let rumorWithId: UnsignedEvent & { id: string };
  if (rumor.id) {
    rumorWithId = rumor as UnsignedEvent & { id: string };
  } else if (rumor.pubkey && rumor.kind && rumor.content !== undefined && rumor.created_at !== undefined && rumor.tags) {
    rumorWithId = { ...rumor, id: getEventHash(rumor) };
  } else {
    // Can't calculate hash, but schema validation will catch missing fields
    rumorWithId = { ...rumor, id: "" };
  }
  
  const valid = validateRequestEvent(rumorWithId);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateRequestEvent.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a reservation response payload against the JSON schema.
 * 
 * @param payload - The response payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationResponse({
 *   status: "confirmed",
 *   iso_time: "2025-10-20T19:00:00-07:00"
 * });
 * ```
 */
export function validateReservationResponse(payload: unknown): ValidationResult {
  const valid = validateResponsePayload(payload);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateResponsePayload.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a full rumor event (kind 9902) including structure and content.
 * 
 * @param rumor - The rumor event to validate
 * @returns Validation result with errors if invalid
 */
export function validateReservationResponseRumor(rumor: UnsignedEvent & { id?: string }): ValidationResult {
  // Ensure id is present - calculate if missing
  const rumorWithId = rumor.id ? rumor : { ...rumor, id: getEventHash(rumor) };
  
  const valid = validateResponseEvent(rumorWithId);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateResponseEvent.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Creates a rumor event for a reservation request (kind 9901).
 * 
 * The rumor contains plain text JSON content. Encryption happens at the seal
 * (kind 13) and gift wrap (kind 1059) layers via NIP-59 wrapping.
 * 
 * @param request - The reservation request payload
 * @param senderPrivateKey - Sender's private key (used for rumor ID generation)
 * @param recipientPublicKey - Recipient's public key (for p tag)
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const rumor = buildReservationRequest(
 *   {
 *     party_size: 2,
 *     iso_time: "2025-10-20T19:00:00-07:00",
 *     notes: "Window seat"
 *   },
 *   myPrivateKey,
 *   restaurantPublicKey
 * );
 * 
 * // Wrap and send
 * const giftWrap = wrapEvent(rumor, myPrivateKey, restaurantPublicKey);
 * await publishToRelays(giftWrap, relays);
 * ```
 */
export function buildReservationRequest(
  request: ReservationRequest,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  additionalTags: string[][] = []
): EventTemplate {
  // Validate payload
  const payloadValidation = validateReservationRequest(request);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation request payload: ${errorMessages}`);
  }

  // Build event template with plain text JSON content
  // Encryption happens at seal/gift wrap layers via NIP-59
  const template: EventTemplate = {
    kind: 9901,
    content: JSON.stringify(request),
    tags: [
      ["p", recipientPublicKey],
      ...additionalTags,
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  // Create full unsigned event to get ID and validate full event structure
  const pubkey = getPublicKey(senderPrivateKey);
  const unsignedEvent: UnsignedEvent = {
    ...template,
    pubkey,
  };
  const rumorEvent: UnsignedEvent & { id: string } = {
    ...unsignedEvent,
    id: getEventHash(unsignedEvent),
  };

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationRequestRumor(rumorEvent);
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation request rumor event: ${errorMessages}`);
  }

  return template;
}

/**
 * Creates a rumor event for a reservation response (kind 9902).
 * 
 * The rumor contains plain text JSON content. Encryption happens at the seal
 * (kind 13) and gift wrap (kind 1059) layers via NIP-59 wrapping.
 * 
 * IMPORTANT: When responding to a reservation request, the `e` tag in additionalTags
 * MUST reference the UNSIGNED 9901 RUMOR ID of the original request, per NIP-17.
 * This is the ID of the unsigned kind 9901 event before it was sealed and gift-wrapped.
 * 
 * @param response - The reservation response payload
 * @param senderPrivateKey - Sender's private key (used for rumor ID generation)
 * @param recipientPublicKey - Recipient's public key (for p tag)
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 *                        MUST include `["e", unsigned9901RumorId, "", "root"]` for threading
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * // CORRECT: Use the unsigned 9901 rumor ID from the original request
 * const rumor = buildReservationResponse(
 *   {
 *     status: "confirmed",
 *     iso_time: "2025-10-20T19:00:00-07:00",
 *     message: "See you then!"
 *   },
 *   myPrivateKey,
 *   conciergePublicKey,
 *   [["e", request.rumor.id, "", "root"]]  // Use unsigned rumor ID, not gift wrap ID
 * );
 * ```
 */
export function buildReservationResponse(
  response: ReservationResponse,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  additionalTags: string[][] = []
): EventTemplate {
  // Validate payload
  const payloadValidation = validateReservationResponse(response);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation response payload: ${errorMessages}`);
  }

  // Build event template with plain text JSON content
  // Encryption happens at seal/gift wrap layers via NIP-59
  const template: EventTemplate = {
    kind: 9902,
    content: JSON.stringify(response),
    tags: [
      ["p", recipientPublicKey],
      ...additionalTags,
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  // Create full unsigned event to get ID and validate full event structure
  const pubkey = getPublicKey(senderPrivateKey);
  const unsignedEvent: UnsignedEvent = {
    ...template,
    pubkey,
  };
  const rumorEvent: UnsignedEvent & { id: string } = {
    ...unsignedEvent,
    id: getEventHash(unsignedEvent),
  };

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationResponseRumor(rumorEvent);
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation response rumor event: ${errorMessages}`);
  }

  return template;
}

/**
 * Parses a reservation request from a rumor event.
 * 
 * The rumor content is plain text JSON (decryption happened at seal/gift wrap layers).
 * Validates the full rumor event structure (including id, pubkey, tags, etc.) and content.
 * 
 * @param rumor - The unwrapped rumor event (kind 9901)
 * @param recipientPrivateKey - Recipient's private key (unused, kept for API compatibility)
 * @returns Parsed and validated reservation request
 * @throws Error if parsing or validation fails
 * 
 * @example
 * ```typescript
 * // After unwrapping gift wrap
 * const rumor = unwrapEvent(giftWrap, myPrivateKey);
 * const request = parseReservationRequest(rumor, myPrivateKey);
 * 
 * console.log(`Party size: ${request.party_size}`);
 * console.log(`Time: ${request.iso_time}`);
 * ```
 */
export function parseReservationRequest(
  rumor: Event | { kind: number; content: string; pubkey: string },
  recipientPrivateKey: Uint8Array
): ReservationRequest {
  if (rumor.kind !== 9901) {
    throw new Error(`Expected kind 9901, got ${rumor.kind}`);
  }

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationRequestRumor(rumor as UnsignedEvent & { id?: string });
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation request rumor event: ${errorMessages}`);
  }

  // Parse plain text JSON content
  // Decryption happened at seal/gift wrap layers via NIP-59
  const payload = JSON.parse(rumor.content);

  // Validate payload
  const payloadValidation = validateReservationRequest(payload);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation request payload: ${errorMessages}`);
  }

  return payload as ReservationRequest;
}

/**
 * Parses a reservation response from a rumor event.
 * 
 * The rumor content is plain text JSON (decryption happened at seal/gift wrap layers).
 * Validates the full rumor event structure (including id, pubkey, tags, etc.) and content.
 * 
 * @param rumor - The unwrapped rumor event (kind 9902)
 * @param recipientPrivateKey - Recipient's private key (unused, kept for API compatibility)
 * @returns Parsed and validated reservation response
 * @throws Error if parsing or validation fails
 * 
 * @example
 * ```typescript
 * const rumor = unwrapEvent(giftWrap, myPrivateKey);
 * const response = parseReservationResponse(rumor, myPrivateKey);
 * 
 * console.log(`Status: ${response.status}`);
 * ```
 */
export function parseReservationResponse(
  rumor: Event | { kind: number; content: string; pubkey: string },
  recipientPrivateKey: Uint8Array
): ReservationResponse {
  if (rumor.kind !== 9902) {
    throw new Error(`Expected kind 9902, got ${rumor.kind}`);
  }

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationResponseRumor(rumor as UnsignedEvent & { id?: string });
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation response rumor event: ${errorMessages}`);
  }

  // Parse plain text JSON content
  // Decryption happened at seal/gift wrap layers via NIP-59
  const payload = JSON.parse(rumor.content);

  // Validate payload
  const payloadValidation = validateReservationResponse(payload);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation response payload: ${errorMessages}`);
  }

  return payload as ReservationResponse;
}

/**
 * Validates a reservation modification request payload against the JSON schema.
 * 
 * @param payload - The modification request payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationModificationRequest({
 *   party_size: 2,
 *   iso_time: "2025-10-20T19:30:00-07:00"
 * });
 * 
 * if (!result.valid) {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export function validateReservationModificationRequest(payload: unknown): ValidationResult {
  const valid = validateModificationRequestPayload(payload);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateModificationRequestPayload.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a full rumor event (kind 9903) including structure and content.
 * 
 * @param rumor - The rumor event to validate
 * @returns Validation result with errors if invalid
 */
export function validateReservationModificationRequestRumor(rumor: UnsignedEvent & { id?: string }): ValidationResult {
  // Ensure id is present - calculate if missing
  const rumorWithId = rumor.id ? rumor : { ...rumor, id: getEventHash(rumor) };
  
  const valid = validateModificationRequestEvent(rumorWithId);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateModificationRequestEvent.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a reservation modification response payload against the JSON schema.
 * 
 * @param payload - The modification response payload to validate
 * @returns Validation result with errors if invalid
 * 
 * @example
 * ```typescript
 * const result = validateReservationModificationResponse({
 *   status: "confirmed",
 *   iso_time: "2025-10-20T19:30:00-07:00"
 * });
 * ```
 */
export function validateReservationModificationResponse(payload: unknown): ValidationResult {
  const valid = validateModificationResponsePayload(payload);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateModificationResponsePayload.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Validates a full rumor event (kind 9904) including structure and content.
 * 
 * @param rumor - The rumor event to validate
 * @returns Validation result with errors if invalid
 */
export function validateReservationModificationResponseRumor(rumor: UnsignedEvent & { id?: string }): ValidationResult {
  // Ensure id is present - calculate if missing
  const rumorWithId = rumor.id ? rumor : { ...rumor, id: getEventHash(rumor) };
  
  const valid = validateModificationResponseEvent(rumorWithId);

  if (valid) {
    return { valid: true };
  }

  const errors: ValidationError[] = (validateModificationResponseEvent.errors || []).map((err) => ({
    field: err.instancePath || err.params?.missingProperty,
    message: err.message || "Validation failed",
    value: err.data,
  }));

  return { valid: false, errors };
}

/**
 * Creates a rumor event for a reservation modification request (kind 9903).
 * 
 * The rumor contains plain text JSON content. Encryption happens at the seal
 * (kind 13) and gift wrap (kind 1059) layers via NIP-59 wrapping.
 * 
 * IMPORTANT: When sending a modification request, the `e` tag in additionalTags
 * MUST reference the UNSIGNED RUMOR ID per NIP-RR:
 * - Root: unsigned 9901 rumor ID (the original request)
 * 
 * @param request - The reservation modification request payload
 * @param senderPrivateKey - Sender's private key (used for rumor ID generation)
 * @param recipientPublicKey - Recipient's public key (for p tag)
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 *                        MUST include `["e", unsigned9901RumorId, "", "root"]` for threading
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const rumor = buildReservationModificationRequest(
 *   {
 *     party_size: 2,
 *     iso_time: "2025-10-20T19:30:00-07:00",
 *     notes: "This time works for us"
 *   },
 *   myPrivateKey,
 *   restaurantPublicKey,
 *   [["e", originalRequest.rumor.id, "", "root"]]
 * );
 * ```
 */
export function buildReservationModificationRequest(
  request: ReservationModificationRequest,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  additionalTags: string[][] = []
): EventTemplate {
  // Validate payload
  const payloadValidation = validateReservationModificationRequest(request);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation modification request payload: ${errorMessages}`);
  }

  // Build event template with plain text JSON content
  // Encryption happens at seal/gift wrap layers via NIP-59
  const template: EventTemplate = {
    kind: 9903,
    content: JSON.stringify(request),
    tags: [
      ["p", recipientPublicKey],
      ...additionalTags,
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  // Create full unsigned event to get ID and validate full event structure
  const pubkey = getPublicKey(senderPrivateKey);
  const unsignedEvent: UnsignedEvent = {
    ...template,
    pubkey,
  };
  const rumorEvent: UnsignedEvent & { id: string } = {
    ...unsignedEvent,
    id: getEventHash(unsignedEvent),
  };

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationModificationRequestRumor(rumorEvent);
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation modification request rumor event: ${errorMessages}`);
  }

  return template;
}

/**
 * Creates a rumor event for a reservation modification response (kind 9904).
 * 
 * The rumor contains plain text JSON content. Encryption happens at the seal
 * (kind 13) and gift wrap (kind 1059) layers via NIP-59 wrapping.
 * 
 * IMPORTANT: When responding to a modification request, the `e` tag in additionalTags
 * MUST reference the UNSIGNED RUMOR ID per NIP-RR:
 * - Root: unsigned 9901 rumor ID (the original request)
 * 
 * @param response - The reservation modification response payload
 * @param senderPrivateKey - Sender's private key (used for rumor ID generation)
 * @param recipientPublicKey - Recipient's public key (for p tag)
 * @param additionalTags - Optional additional tags (e.g., thread markers)
 *                        MUST include `["e", unsigned9901RumorId, "", "root"]` for threading
 * @returns Event template ready to be wrapped with NIP-59
 * @throws Error if validation fails
 * 
 * @example
 * ```typescript
 * const rumor = buildReservationModificationResponse(
 *   {
 *     status: "confirmed",
 *     iso_time: "2025-10-20T19:30:00-07:00",
 *     message: "See you then!"
 *   },
 *   myPrivateKey,
 *   userPublicKey,
 *   [["e", originalRequest.rumor.id, "", "root"]]
 * );
 * ```
 */
export function buildReservationModificationResponse(
  response: ReservationModificationResponse,
  senderPrivateKey: Uint8Array,
  recipientPublicKey: string,
  additionalTags: string[][] = []
): EventTemplate {
  // Validate payload
  const payloadValidation = validateReservationModificationResponse(response);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation modification response payload: ${errorMessages}`);
  }

  // Build event template with plain text JSON content
  // Encryption happens at seal/gift wrap layers via NIP-59
  const template: EventTemplate = {
    kind: 9904,
    content: JSON.stringify(response),
    tags: [
      ["p", recipientPublicKey],
      ...additionalTags,
    ],
    created_at: Math.floor(Date.now() / 1000),
  };

  // Create full unsigned event to get ID and validate full event structure
  const pubkey = getPublicKey(senderPrivateKey);
  const unsignedEvent: UnsignedEvent = {
    ...template,
    pubkey,
  };
  const rumorEvent: UnsignedEvent & { id: string } = {
    ...unsignedEvent,
    id: getEventHash(unsignedEvent),
  };

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationModificationResponseRumor(rumorEvent);
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation modification response rumor event: ${errorMessages}`);
  }

  return template;
}

/**
 * Parses a reservation modification request from a rumor event.
 * 
 * The rumor content is plain text JSON (decryption happened at seal/gift wrap layers).
 * Validates the full rumor event structure (including id, pubkey, tags, etc.) and content.
 * 
 * @param rumor - The unwrapped rumor event (kind 9903)
 * @param recipientPrivateKey - Recipient's private key (unused, kept for API compatibility)
 * @returns Parsed and validated reservation modification request
 * @throws Error if parsing or validation fails
 * 
 * @example
 * ```typescript
 * const rumor = unwrapEvent(giftWrap, myPrivateKey);
 * const request = parseReservationModificationRequest(rumor, myPrivateKey);
 * 
 * console.log(`Party size: ${request.party_size}`);
 * console.log(`Time: ${request.iso_time}`);
 * ```
 */
export function parseReservationModificationRequest(
  rumor: Event | { kind: number; content: string; pubkey: string },
  recipientPrivateKey: Uint8Array
): ReservationModificationRequest {
  if (rumor.kind !== 9903) {
    throw new Error(`Expected kind 9903, got ${rumor.kind}`);
  }

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationModificationRequestRumor(rumor as UnsignedEvent & { id?: string });
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation modification request rumor event: ${errorMessages}`);
  }

  // Parse plain text JSON content
  // Decryption happened at seal/gift wrap layers via NIP-59
  const payload = JSON.parse(rumor.content);

  // Validate payload
  const payloadValidation = validateReservationModificationRequest(payload);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation modification request payload: ${errorMessages}`);
  }

  return payload as ReservationModificationRequest;
}

/**
 * Parses a reservation modification response from a rumor event.
 * 
 * The rumor content is plain text JSON (decryption happened at seal/gift wrap layers).
 * Validates the full rumor event structure (including id, pubkey, tags, etc.) and content.
 * 
 * @param rumor - The unwrapped rumor event (kind 9904)
 * @param recipientPrivateKey - Recipient's private key (unused, kept for API compatibility)
 * @returns Parsed and validated reservation modification response
 * @throws Error if parsing or validation fails
 * 
 * @example
 * ```typescript
 * const rumor = unwrapEvent(giftWrap, myPrivateKey);
 * const response = parseReservationModificationResponse(rumor, myPrivateKey);
 * 
 * console.log(`Status: ${response.status}`);
 * ```
 */
export function parseReservationModificationResponse(
  rumor: Event | { kind: number; content: string; pubkey: string },
  recipientPrivateKey: Uint8Array
): ReservationModificationResponse {
  if (rumor.kind !== 9904) {
    throw new Error(`Expected kind 9904, got ${rumor.kind}`);
  }

  // Validate full rumor event structure (including id, pubkey, tags, etc.)
  const eventValidation = validateReservationModificationResponseRumor(rumor as UnsignedEvent & { id?: string });
  if (!eventValidation.valid) {
    const errorMessages = eventValidation.errors?.map(e => `${e.field}: ${e.message}`).join(", ");
    throw new Error(`Invalid reservation modification response rumor event: ${errorMessages}`);
  }

  // Parse plain text JSON content
  // Decryption happened at seal/gift wrap layers via NIP-59
  const payload = JSON.parse(rumor.content);

  // Validate payload
  const payloadValidation = validateReservationModificationResponse(payload);
  if (!payloadValidation.valid) {
    const errorMessages = payloadValidation.errors?.map(e => e.message).join(", ");
    throw new Error(`Invalid reservation modification response payload: ${errorMessages}`);
  }

  return payload as ReservationModificationResponse;
}

