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
  "pubkey": "<senderPublicKey>",
  "created_at": <unix timestamp>,
  "kind": 9901,
  "tags": [
    ["p", "<restaurantPublicKey>", "<relayUrl>"]
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
  "pubkey": "<senderPublicKey>",
  "created_at": <unix timestamp>,
  "kind": 9902,
  "tags": [
    ["p", "<recipientPublicKey>", "<relay-url>"],
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
  "pubkey": "<senderPubKey>",
  "created_at": <unix timestamp>,
  "kind": 9903,
  "tags": [
    ["p", "<recipientPublicKey>", "<relay-url>"],
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
  "pubkey": "<senderPublicKey>",
  "created_at": <unix timestamp>,
  "kind": 9904,
  "tags": [
    ["p", "<recipientPublicKey>", "<relay-url>"],
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

## Restaurant Discovery 

Restaurants MUST advertise their capability to handle reservation messages using [NIP-89](https://github.com/nostr-protocol/nips/blob/master/89.md) Application Handlers.

### Handler Information Event (kind:31990)

Restaurants MUST publish a `kind:31990` handler information event that declares support for all reservation message kinds:

```jsonc
{
  "kind": 31990,
  "pubkey": "<restaurantPublicKey>",
  "tags": [
    ["d", "synvya-restaurants-v1.0"],
    ["k", "9901"],
    ["k", "9902"],
    ["k", "9903"],
    ["k", "9904"]
  ],
  "content": ""
}
```

- The `d` tag MUST use the identifier `"synvya-restaurants-v1.0"`
- The `k` tags MUST include all four supported kinds: `9901`, `9902`, `9903`, and `9904`
- The `content` field MAY be empty (clients will use the restaurant's `kind:0` profile for display)

### Handler Recommendation Events (kind:31989)

Restaurants MUST publish four `kind:31989` handler recommendation events, one for each supported event kind:

**For kind:9901 (reservation.request):**
```jsonc
{
  "kind": 31989,
  "pubkey": "<restaurantPublicKey>",
  "tags": [
    ["d", "9901"],
    ["a", "31990:<restaurantPublicKey>:synvya-restaurants-v1.0", "<relayUrl>", "all"]
  ],
  "content": ""
}
```

**For kind:9902 (reservation.response):**
```jsonc
{
  "kind": 31989,
  "pubkey": "<restaurantPublicKey>",
  "tags": [
    ["d", "9902"],
    ["a", "31990:<restaurantPublicKey>:synvya-restaurants-v1.0", "<relayUrl>", "all"]
  ],
  "content": ""
}
```

**For kind:9903 (reservation.modification.request):**
```jsonc
{
  "kind": 31989,
  "pubkey": "<restaurantPublicKey>",
  "tags": [
    ["d", "9903"],
    ["a", "31990:<restaurantPublicKey>:synvya-restaurants-v1.0", "<relayUrl>", "all"]
  ],
  "content": ""
}
```

**For kind:9904 (reservation.modification.response):**
```jsonc
{
  "kind": 31989,
  "pubkey": "<restaurantPublicKey>",
  "tags": [
    ["d", "9904"],
    ["a", "31990:<restaurantPublicKey>:synvya-restaurants-v1.0", "<relayUrl>", "all"]
  ],
  "content": ""
}
```

- Each `kind:31989` event MUST have a `d` tag with the event kind it recommends (`"9901"`, `"9902"`, `"9903"`, or `"9904"`)
- Each `kind:31989` event MUST include an `a` tag referencing the restaurant's `kind:31990` handler information event
- The `a` tag format MUST be: `"31990:<restaurantPublicKey>:synvya-restaurants-v1.0"`
- The second value of the `a` tag SHOULD be a relay URL hint for finding the handler
- The third value of the `a` tag SHOULD be `"all"` to indicate the recommendation applies to all platforms

### Publishing Requirements

- Restaurants MUST publish the `kind:31990` handler information event when first setting up their reservation system
- Restaurants MUST publish all four `kind:31989` recommendation events when first setting up their reservation system
- Restaurants SHOULD republish these events whenever their handler configuration changes or when updating their business profile
- All handler events MUST be published to the same relays where reservation messages are expected to be received

### Client Discovery

Clients discovering restaurants that support reservations SHOULD:

1. Query for `kind:31989` events with `#d` filters for `["9901"]`, `["9902"]`, `["9903"]`, and `["9904"]`
2. Extract the `a` tag values from recommendation events to find handler information events
3. Query for the corresponding `kind:31990` handler information events using the `a` tag coordinates
4. Verify that the handler information event includes all four `k` tags (`9901`, `9902`, `9903`, `9904`) before considering the restaurant as fully supporting the protocol

### Namespace discovery (Optional)
Restaurants that do not support NIP-RR but want to still be found in basic searches should publish a label ```restaurant``` within the namespace ```com.synvya.merchant```.

Include the following tags in the ```kind:0``` event for the restaurant:
```jsonc
{
  "id": "<32-byte hex of unsigned event hash>",
  "pubkey": "<restaurantPublicKey>",
  "created_at": <unix timestamp>,
  "kind": 0,
  "tags": [
    ["L", "com.synvya.merchant"],
    ["l", "restaurant", "com.synvya.merchant"]
    // Additional tags MAY be included
  ],
  "content": "<content-in-plain-text>"
  // additional fields
  "sig": "<signed by restaurantPrivateKey>"  
}
```
