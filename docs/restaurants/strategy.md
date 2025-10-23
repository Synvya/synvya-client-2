# Synvya Reservation Messaging Strategy

## Overview

Synvya enables AI agents and local businesses to communicate and transact directly over **Nostr** using open, standardized event flows.  
The first use case is **restaurant reservations**, implemented as a structured, encrypted conversation between the **Synvya AI Concierge** and the **Synvya Business Client**.

This design avoids fragmented API integrations and builds a **universal agent-to-business communication rail** — secure, composable, and AI-native.

---

## Core Principles

1. **Conversation, Not Availability**
   - Restaurants rarely publish live availability.
   - The “availability” emerges through messaging negotiation.
   - Focus on a natural, conversational protocol that AI agents can handle autonomously.

2. **Mandatory Privacy**
   - All reservation messages **must use NIP-59 Gift Wrap** for metadata privacy.
   - This ensures that only sender and recipient can decrypt message contents.

3. **Event Kind Definitions**
   - App-specific kinds (in the **30000–30999** range) are assigned as:
     - `kind:32101` — `reservation.request`
     - `kind:32102` — `reservation.response`
   - Calendar messages (NIP-52) are also exchanged via NIP-59 wrapping.

4. **NIP References**
   - **NIP-01:** Core protocol + Addressable Events
   - **NIP-09:** Event Deletion
   - **NIP-10:** Threaded conversations (`root` and `reply` markers)
   - **NIP-13:** Proof of Work (light anti-spam)
   - **NIP-40:** Expiration timestamps
   - **NIP-44:** Versioned encryption (for rumor payloads)
   - **NIP-52:** Calendar events
   - **NIP-59:** Gift Wrap (mandatory for all inter-party messages)
   - **NIP-89:** Application Handlers (for capability discovery)

---

## Handler Discovery (NIP-89)

Before AI agents can send reservation requests, they must **discover which restaurants support reservations**. This is accomplished using **NIP-89 Application Handlers**, which provide a standardized way for applications to announce their capabilities.

### Three-Event Pattern

When a restaurant with `businessType === "restaurant"` publishes their profile, three additional events are automatically published:

1. **Handler Information (kind 31990)**
   - Declares support for `kind:32101` (reservation.request) and `kind:32102` (reservation.response)
   - Tagged with `["d", "synvya-restaurants-v1.0"]` for identification
   - Content is empty (refer to kind 0 profile for restaurant metadata)

2. **Handler Recommendation for 32101 (kind 31989)**
   - Recommends the restaurant's 31990 handler for processing reservation requests
   - Tagged with `["d", "32101"]`
   - Includes `["a", "31990:<restaurant_pubkey>:synvya-restaurants-v1.0", "<relay_url>", "all"]`

3. **Handler Recommendation for 32102 (kind 31989)**
   - Recommends the restaurant's 31990 handler for processing reservation responses
   - Tagged with `["d", "32102"]`
   - Includes same `a` tag format as above

### Publishing Lifecycle

- **Created:** Handler events are published automatically when a restaurant publishes their profile
- **Deleted:** Handler events are removed via NIP-09 deletion events (kind 5) when the business changes from "restaurant" to another type
- **Updated:** Republishing the profile republishes the handler events (replaceable events)

### AI Agent Discovery Flow

```typescript
// Step 1: Find all restaurants by querying kind 0 profiles
const restaurants = await pool.querySync(relays, {
  kinds: [0],
  "#l": ["restaurant"],
  "#L": ["business.type"]
});

// Step 2: Check which restaurants handle reservations
const restaurantPubkeys = restaurants.map(e => e.pubkey);
const recommendations = await pool.querySync(relays, {
  kinds: [31989],
  authors: restaurantPubkeys,
  "#d": ["32101"]  // Looking for reservation.request handlers
});

// Step 3: (Optional) Fetch detailed handler information
for (const rec of recommendations) {
  const aTag = rec.tags.find(t => t[0] === "a" && t[1].startsWith("31990:"));
  if (aTag) {
    const [kind, pubkey, dTag] = aTag[1].split(":");
    const handlerInfo = await pool.get(relays, {
      kinds: [31990],
      authors: [pubkey],
      "#d": [dTag]
    });
    // handlerInfo contains k tags listing supported event kinds
  }
}
```

### Benefits

- **Decentralized Discovery:** No central registry or API required
- **Standards-Compliant:** Uses official NIP-89 for application handlers
- **Explicit Opt-In:** Restaurants choose to enable reservation support
- **Efficient Queries:** AI agents can filter capabilities before sending requests
- **Composable:** Same pattern can extend to orders, payments, and other capabilities

---

## Message Construction (NIP-59 Protocol)

### Reservation Request

1. **Create a rumor**
   - Unsigned event of `kind:32101` containing the reservation request payload.
   - Payload encrypted with **NIP-44**.

2. **Seal the rumor**
   - Create a `kind:13` **seal event** that wraps the rumor.

3. **Gift wrap**
   - Create a `kind:1059` **gift wrap event** that contains the seal and is addressed to the restaurant (`p` tag = restaurant pubkey).

### Reservation Response

1. **Create a rumor**
   - Unsigned event of `kind:32102` containing the reservation response payload.

2. **Seal the rumor**
   - Create a `kind:13` seal event containing the rumor.

3. **Gift wrap**
   - Create a `kind:1059` gift wrap event addressed to the **AI Concierge**.

### Calendar Event Exchange

- The same **Rumor → Seal → Gift Wrap** structure is used for:
  - Reservation confirmation (`kind:31923`, NIP-52)
  - RSVP (`kind:31925`)
  - Calendar updates (`kind:31924`)

All are encrypted and exchanged as NIP-59 gift-wrapped payloads.

---

## Replaceable Events

Addressable (replaceable) events now use the **`a` tag** per NIP-01:

```
["a", "<kind integer>:<32-bytes lowercase hex of a pubkey>:", <optional relay URL>]
```

Do **not** use the deprecated `d` tag for addressable identification.

---

## End-to-End Flow Summary

1. **AI Concierge → Restaurant**
   - Sends `reservation.request` (`kind:32101`) wrapped via NIP-59.

2. **Restaurant ↔ Concierge**
   - Exchanges `reservation.response` (`kind:32102`) via NIP-59, threaded with NIP-10.

3. **Restaurant → Concierge**
   - Sends confirmed **NIP-52 calendar event** (`kind:31923`), wrapped via NIP-59.

4. **Concierge → Restaurant**
   - Sends RSVP (`kind:31925`), wrapped via NIP-59.

5. **Restaurant**
   - Stores the confirmed reservation in its calendar (`kind:31924`).

---

## Security and Scalability

| Concern | Solution |
|----------|-----------|
| Metadata privacy | Mandatory NIP-59 gift wrap |
| Content encryption | NIP-44 |
| Spam prevention | NIP-13 Proof of Work |
| Event referencing | NIP-10 threading + NIP-01 addressable |
| Future composability | Extend same model for `order.request` and `order.response` |

---

## Relay Strategy

### Development
- Use public test relays for development and testing
- Recommended relays:
  - `wss://relay.damus.io`
  - `wss://nos.lol`
  - `wss://relay.nostr.band`
- Configure relays in client settings
- Test harness publishes to configured relays

### Production
- Businesses should configure their preferred relays
- Multiple relay support for redundancy
- AI agents should:
  1. Check business profile for relay hints (future: NIP-65)
  2. Use common public relays as fallback
  3. Subscribe to multiple relays simultaneously
  4. Handle relay failures gracefully with timeout/retry logic

### Relay Selection Criteria
- **Uptime**: Choose relays with high availability
- **Performance**: Low latency and fast response times
- **Privacy**: Consider relay policies on data retention
- **Geographic proximity**: Reduce latency for regional businesses

### Future: NIP-65 Relay Lists
- Businesses publish preferred relay lists
- AI agents query NIP-65 relay metadata
- Dynamic relay discovery and failover
- Better message delivery guarantees

---

## Vision

This protocol creates a **message-based commerce fabric** — every booking, order, or payment begins as a secure message over Nostr.  
The restaurant reservation loop is the first end-to-end proof of AI-driven commerce.

---
