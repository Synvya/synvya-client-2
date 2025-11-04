NIP-RR
======

Restaurant Reservation Protocol
-------------------------------

`draft` `optional`

This NIP defines a protocol to manage restaurant reservations via Nostr. The protocol uses 4 different messages, each with its own kind, that are sent unsigned, sealed, and gift wrapped between the parties to maintain privacy.

## Overview

The Restaurant Reservation Protocol uses four event kinds to support a complete negotiation flow.

- `kind:9901` - `reservation.request`: Initial message sent  by the customer to make a reservation request
- `kind:9902` - `reservation.response`: Message sent by the restaurant or the customer to finalize the exchange of messages. Must include the firm status for the reservation of `confirmed`, `declined`, or `cancelled`
- `kind:9903` - `reservation.modification.request`: Message sent to modify a firm reservation or a reservation under negotiation
- `kind:9904` - `reservation.modification.response`: Message sent in response to a `reservation.modification.request`


Clients must support `kind:9901` and `kind:9902` messages. Support for `kind:9903` and `kind:9904` is optional but strongly recommended.

## Kind Definitions

### Reservation Request - Kind:9901

**Rumor Event Structure:**
```jsonc
{
  "id": "<32-byte hex of unsigned event hash>",
  "pubkey": "<sender-pubkey>",
  "created_at": <unix timestamp>,
  "kind": 9901,
  "tags": [
    ["p", "<restaurant-pubkey>", "<relay-url>"]
    // Additional tags MAY be included
  ],
  "content": "<content-in-plain-text>"
  // Note: No signature field - this is an unsigned rumor
}
```

**Content Structure:**
```jsonc
{
  "party_size": <integer 1-20>,
  "iso_time": "<ISO8601 datetime with timezone>",
  "notes": "<optional string, max 2000 chars>",
  "contact": {
    "name": "<optional string, max 200 chars>",
    "phone": "<optional string, max 64 chars>",
    "email": "<optional email>"
  },
  "constraints": {
    "earliest_iso_time": "<optional ISO8601 datetime>",
    "latest_iso_time": "<optional ISO8601 datetime>",
  }
}
```

**Required Fields:**
- `party_size`: Integer between 1 and 20
- `iso_time`: ISO8601 datetime string with timezone offset

**Optional Fields:**
- `notes`: Additional notes or special requests (max 2000 characters)
- `contact`: Contact information object
- `constraints`: Preferences for negotiation

---

### Reservation Response - Kind:9902

**Rumor Event Structure:**
```jsonc
{
  "id": "<32-byte hex of unsigned event hash>",
  "pubkey": "<sender-pubkey>",
  "created_at": <unix timestamp>,
  "kind": 9902,
  "tags": [
    ["p", "<recipient-pubkey>", "<relay-url>"],
    ["e", "<unsigned-9901-rumor-id>", "", "root"]
    // Additional tags MAY be included
  ],
  "content": "<content-in-plain-text>"
  // Note: No signature field - this is an unsigned rumor
}
```

**Content Structure:**
```jsonc
{
  "status": "<confirmed|declined|cancelled>",
  "iso_time": "<ISO8601 datetime with timezone> | null",
  "message": "<optional string, max 2000 chars>",
  "table": "<optional string | null>",
}
```

**Required Fields:**
- `status`: One of `"confirmed"`, `"declined"`, or `"cancelled"`
- `iso_time`: ISO8601 datetime string with timezone offset

**Optional Fields:**
- `message`: Human-readable message to the customer
- `table`: Table identifier (e.g., "A5", "12", "Patio 3")

**Threading:**
- MUST include an `e` tag with `["e", "<unsigned-9901-rumor-id>", "", "root"]` referencing the unsigned rumor ID of the original request (kind:9901).

---

### Reservation Modification Request - Kind:9903

**Rumor Event Structure:**
```jsonc
{
  "id": "<32-byte hex of unsigned event hash>",
  "pubkey": "<sender-pubkey>",
  "created_at": <unix timestamp>,
  "kind": 9903,
  "tags": [
    ["p", "<recipient-pubkey>", "<relay-url>"],
    ["e", "<unsigned-9901-rumor-id>", "", "root"],
    // Additional tags MAY be included
  ],
  "content": "<content-in-plain-text>"
  // Note: No signature field - this is an unsigned rumor
}
```

**Content Structure:**
```jsonc
{
  "party_size": <integer 1-20>,
  "iso_time": "<ISO8601 datetime with timezone>",
  "notes": "<optional string, max 2000 chars>",
  "contact": {
    "name": "<optional string, max 200 chars>",
    "phone": "<optional string, max 64 chars>",
    "email": "<optional email>"
  },
  "constraints": {
    "earliest_iso_time": "<optional ISO8601 datetime>",
    "latest_iso_time": "<optional ISO8601 datetime>",
  }
}
```

**Required Fields:**
- `party_size`: Integer between 1 and 20
- `iso_time`: ISO8601 datetime string with timezone offset

**Optional Fields:**
- `notes`: Additional notes or special requests (max 2000 characters)
- `contact`: Contact information object
- `constraints`: Preferences for negotiation

**Threading:**
- MUST include an `e` tags with `["e", "<unsigned-9901-rumor-id>", "", "root"]` referencing the unsigned rumor ID of the original request.

---

### Reservation Modification Response - Kind:9904

**Rumor Event Structure:**
```jsonc
{
  "id": "<32-byte hex of unsigned event hash>",
  "pubkey": "<sender-pubkey>",
  "created_at": <unix timestamp>,
  "kind": 9904,
  "tags": [
    ["p", "<recipient-pubkey>", "<relay-url>"],
    ["e", "<unsigned-9901-rumor-id>", "", "root"],
    // Additional tags MAY be included
  ],
  "content": "<content-in-plain-text"
  // Note: No signature field - this is an unsigned rumor
}
```

**Content Structure:**
```jsonc
{
  "status": "<confirmed|declined>",
  "iso_time": "<ISO8601 datetime with timezone> | null",
  "message": "<optional string, max 2000 chars>",
}
```

**Required Fields:**
- `status`: One of `"confirmed"` or `"declined"`
- `iso_time`: ISO8601 datetime string with timezone offset

**Optional Fields:**
- `message`: Human-readable message to the customer


**Threading:**
- MUST include an `e` tags with `["e", "<unsigned-9901-rumor-id>", "", "root"]` referencing the unsigned rumor ID of the original request.

---

## Encryption, Wrapping, and Threading

All reservation messages MUST follow the [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md) Gift Wrap protocol:

1. **Create Rumor**: Build an unsigned event of the appropriate kind (9901, 9902, 9903, or 9904) with plain text content
2. **Create Seal**: Wrap the rumor in a `kind:13` seal event, encrypted with [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md)
3. **Create Gift Wrap**: Wrap the seal in a `kind:1059` gift wrap event, addressed to the recipient via `p` tag


**Gift Wrap**
```jsonc
{
  "id": "<usual hash>",
  "pubkey": randomPublicKey,
  "created_at": randomTimeUpTo2DaysInThePast(),
  "kind": 1059, // gift wrap
  "tags": [
    ["p", receiverPublicKey, "<relay-url>"] // receiver
  ],
  "content": nip44Encrypt(
    {
      "id": "<usual hash>",
      "pubkey": senderPublicKey,
      "created_at": randomTimeUpTo2DaysInThePast(),
      "kind": 13, // seal
      "tags": [], // no tags
      "content": nip44Encrypt(unsignedKind990x, senderPrivateKey, receiverPublicKey),
      "sig": "<signed by senderPrivateKey>"
    },
    randomPrivateKey, receiverPublicKey
  ),
  "sig": "<signed by randomPrivateKey>"
}
```

### Encryption Details

- **Content Encryption**: The JSON payload MUST be encrypted using [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) version 2 encryption
- **Seal Encryption**: The serialized rumor JSON MUST be encrypted using [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) version 2 encryption with a conversation key derived from the sender's private key and recipient's public key
- **Gift Wrap Encryption**: The serialized seal JSON MUST be encrypted using [NIP-44](https://github.com/nostr-protocol/nips/blob/master/44.md) version 2 encryption with a conversation key derived from a random ephemeral private key and recipient's public key

### Self CC Pattern

Following [NIP-17](https://github.com/nostr-protocol/nips/blob/master/17.md), senders SHOULD publish gift wraps to both the recipient AND themselves (self-addressed). This ensures:
- Senders can retrieve their own messages across devices
- Full conversation history is recoverable with the sender's private key
- Each recipient gets a separately encrypted gift wrap

### Timestamp Randomization

Per [NIP-59](https://github.com/nostr-protocol/nips/blob/master/59.md), `created_at` timestamps SHOULD be randomized up to 2 days in the past for both seal and gift wrap events to prevent metadata correlation attacks.

### Threading

All messages in a reservation conversation after the original `reservation.request` `kind:9901` message MUST be threaded using the **unsigned rumor ID** of the original request as the root.

---

## Protocol Flow

### Simple Reservation Request 
1. Customer sends `reservation.request` `kind:9901` message to the restaurant
2. Restaurant responds with `reservation.response` `kind:9902` message with `"status":"confirmed"` or `"status":"declined"`
3. Message exchange ends

### Reservation Request With Restaurant Suggesting Alternative Time
1. Customer sends `reservation.request` `kind:9901` message to the restaurant
2. Restaurant sends with `reservation.modification.request` `kind:9903` message with proposed new time
3. Customer responds with `reservation.modification.response` `kind:9904` message with `"status":"confirmed"` or `"status":"declined"`
4. Restaurant responds with `reservation.response` `kind:9902` message with matching status `confirmed` or `declined`
5. Message exchange ends

### Succesful Reservation Modification by Customer
1. Customer sends `reservation.modification.request` `kind:9903` message with proposed new time
2. Restaurant sends `reservation.modification.response` `kind:9904` message with `"status":"confirmed"` to indicate availability for the new time
3. Customer sends `reservation.response` `kind:9902` message with status `confirmed`
4. Message exchange ends

Note: *This flow assumes that there is an existing confirmed reservation initiated by a `reservation.request` `kind:9901` message to the restaurant. All messages should include the `"e"` tag with the rumor ID of the original `reservation.request` message to match the modification to the original reservation.*

### Unsuccesful Reservation Modification by Customer
1. Customer sends `reservation.modification.request` `kind:9903` message with proposed new time
2. Restaurant sends `reservation.modification.response` `kind:9904` message with `"status":"declined"` to indicate lack of availability for the new time
3. Customer sends `reservation.response` `kind:9902` message with original time and status `"status":"confirmed"` to maintain original reservation or `"status":"cancelled"` to cancel the original reservation
4. Message exchange ends

Note: *This flow assumes that there is an existing confirmed reservation initiated by a `reservation.request` `kind:9901` message to the restaurant. All messages should include the `"e"` tag with the rumor ID of the original `reservation.request` message to match the modification to the original reservation.*

### Reservation Cancellation Initated by the Restaurant
1. Restaurant sends `reservation.response` `kind:9902` message with `"status":"cancelled"` to the customer. Including a message is highly encouraged. 
2. Message exchange ends

No further action is expected from the customer. 

Note: *This flow assumes that there is an existing confirmed reservation initiated by a `reservation.request` `kind:9901` message to the restaurant. All messages should include the `"e"` tag with the rumor ID of the original `reservation.request` message to match the modification to the original reservation.*

### Reservation Cancellation Initated by the Customer
1. Customer sends `reservation.response` `kind:9902` message with `"status":"cancelled"` to the restaurant. Including a message is highly encouraged. 
2. Message exchange ends

No further action is expected from the restaurant.

Note: *This flow assumes that there is an existing confirmed reservation initiated by a `reservation.request` `kind:9901` message to the restaurant. All messages should include the `"e"` tag with the rumor ID of the original `reservation.request` message to match the modification to the original reservation.*


---

## JSON Schema Validation

Clients MUST validate payloads against JSON schemas before processing:

- Kind 9901: Validate against `reservation.request.schema.json`
- Kind 9902: Validate against `reservation.response.schema.json`
- Kind 9903: Validate against `reservation.modification.request.schema.json`
- Kind 9904: Validate against `reservation.modification.response.schema.json`

Invalid payloads MUST be rejected and not processed further.
