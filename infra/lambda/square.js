import { createHash, webcrypto } from "node:crypto";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import WebSocket from "ws";
import { SimplePool } from "nostr-tools";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = WebSocket;
}

if (typeof globalThis.crypto === "undefined") {
  globalThis.crypto = webcrypto;
}

const profileRelays = (process.env.NOSTR_RELAYS || "wss://relay.damus.io,wss://relay.snort.social,wss://nos.lol")
  .split(",")
  .map((relay) => relay.trim())
  .filter(Boolean);

const nostrPool = profileRelays.length ? new SimplePool() : null;
import ngeohash from "ngeohash";

const dynamo = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const squareConnectionsTable = process.env.SQUARE_CONNECTIONS_TABLE;
const squarePrimaryKey = process.env.SQUARE_PRIMARY_KEY || "pubkey";
const squareEnv = (process.env.SQUARE_ENV || "sandbox").toLowerCase();
const squareAppId = process.env.SQUARE_APPLICATION_ID;
const squareClientSecret = process.env.SQUARE_CLIENT_SECRET;
const squareRedirectUri = process.env.SQUARE_REDIRECT_URI;
const squareVersion = process.env.SQUARE_VERSION || "2025-01-23";
const geocodeEndpoint =
  process.env.GEOCODE_ENDPOINT || "https://nominatim.openstreetmap.org/search";
const geocodeUserAgent =
  process.env.GEOCODE_USER_AGENT || "SynvyaSquareIntegration/1.0 (contact@synvya.com)";
const geocodeContactEmail = process.env.GEOCODE_CONTACT_EMAIL || "contact@synvya.com";
const fallbackGeocodeEndpoint =
  process.env.FALLBACK_GEOCODE_ENDPOINT || "https://geocode.maps.co/search";
const geohashPrecision =
  Number.parseInt(process.env.GEOHASH_PRECISION ?? "", 10) || 9;

const geocodeCache = new Map();

function extractLocationFromKind0(event) {
  if (!event) return null;
  for (const tag of event.tags || []) {
    if (Array.isArray(tag) && tag.length >= 2 && tag[0] === "i" && typeof tag[1] === "string") {
      if (tag[1].toLowerCase().startsWith("location:")) {
        const value = tag[1].slice("location:".length).trim();
        if (value) return value;
      }
    }
  }
  if (event.content) {
    try {
      const parsed = JSON.parse(event.content);
      const value = parsed?.location;
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    } catch (error) {
      console.warn("Failed to parse kind 0 content for location", error);
    }
  }
  return null;
}

async function fetchProfileLocationFromRelays(pubkey) {
  if (!nostrPool || !profileRelays.length) {
    return null;
  }
  try {
    const timeoutMs = Number.parseInt(process.env.PROFILE_FETCH_TIMEOUT_MS ?? "2000", 10);
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    const getPromise = nostrPool
      .get(profileRelays, {
        kinds: [0],
        authors: [pubkey]
      })
      .catch((error) => {
        console.warn("Failed to fetch kind 0 profile", { pubkey, error: error?.message || error });
        return null;
      });
    const event = await Promise.race([getPromise, timeoutPromise]);
    if (!event) {
      console.warn("No kind 0 profile found on configured relays", { pubkey, relays: profileRelays });
      return null;
    }
    const derived = extractLocationFromKind0(event);
    if (!derived) {
      console.warn("Kind 0 profile missing location tag", { pubkey, event });
    }
    return derived;
  } catch (error) {
    console.warn("Failed to load kind 0 profile from relays", { pubkey, error: error?.message || error });
    return null;
  }
  finally {
    try {
      nostrPool?.close(profileRelays);
    } catch {
      // ignore
    }
  }
}

function isCompleteAddress(location) {
  if (!location) return false;
  const parts = location
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part.toUpperCase() !== "USA");
  return parts.length >= 4;
}

function jsonResponse(statusCode, body, headers = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": process.env.CORS_ALLOW_ORIGIN || "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST",
      ...headers
    },
    body: JSON.stringify(body)
  };
}

function withErrorHandling(fn) {
  return async (event) => {
    try {
      return await fn(event);
    } catch (error) {
      console.error("Error handling request", error);
      const message = error instanceof Error ? error.message : "Unexpected error";
      return jsonResponse(500, { error: message });
    }
  };
}

function requiredEnv(name, value) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function extractPubkey(record) {
  if (!record) {
    throw new Error("Missing record for pubkey extraction");
  }
  const value = record.pubkey ?? record[squarePrimaryKey];
  if (!value) {
    throw new Error("Record missing pubkey field");
  }
  return value;
}

function resolveSquareBase() {
  return squareEnv === "production"
    ? "https://connect.squareup.com"
    : "https://connect.squareupsandbox.com";
}

function computeFingerprint(event) {
  const stableTags = (event.tags || [])
    .filter((tag) => Array.isArray(tag) && tag.length)
    .filter((tag) => tag[0] !== "published_at")
    .map((tag) => {
      const [name = "", value = "", extra = ""] = tag;
      return [name, value, extra];
    })
    .sort((a, b) => {
      if (a[0] === b[0]) {
        return (a[1] || "").localeCompare(b[1] || "");
      }
      return (a[0] || "").localeCompare(b[0] || "");
    });

  const minimal = {
    content: event.content,
    tags: stableTags
  };
  return createHash("sha256").update(JSON.stringify(minimal)).digest("hex");
}

function parseJson(body) {
  if (!body) return {};
  try {
    return JSON.parse(body);
  } catch {
    return {};
  }
}

function slug(itemId, variationId) {
  const src = `square:${itemId}:${variationId || "default"}`;
  const h = createHash("sha256").update(src).digest("hex").slice(0, 16);
  return `sq-${h}`;
}

function precisionWithinBounds(value) {
  if (!Number.isInteger(value)) return 9;
  return Math.min(Math.max(value, 1), 12);
}

function buildAddressVariants(location) {
  const base = location.trim();
  const variants = new Set();
  if (base) variants.add(base);

  const parts = base
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length >= 3) {
    variants.add(parts.slice(1).join(", "));
    variants.add(parts.slice(-3).join(", "));
  }

  if (parts.length) {
    variants.add(parts.join(" "));
  }
  return Array.from(variants);
}

async function queryGeocoder(endpoint, address) {
  if (!endpoint) return null;
  try {
    const url = new URL(endpoint);
    url.searchParams.set("q", address);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "0");
    if (geocodeContactEmail) {
      url.searchParams.set("email", geocodeContactEmail);
    }

    const response = await fetch(url.toString(), {
      headers: {
        "User-Agent": geocodeUserAgent,
        Accept: "application/json"
      }
    });
    if (!response.ok) {
      console.warn("Geocode request failed", {
        endpoint,
        status: response.status,
        address
      });
      return null;
    }
    const payload = await response.json().catch(() => null);
    const entry = Array.isArray(payload) ? payload[0] : null;
    if (!entry) {
      console.warn("Geocode returned empty results", { endpoint, address });
      return null;
    }
    const lat = entry?.lat ? Number.parseFloat(entry.lat) : Number.NaN;
    const lon = entry?.lon ? Number.parseFloat(entry.lon) : Number.NaN;
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      console.warn("Geocode returned invalid coordinates", { endpoint, address, entry });
      return null;
    }
    return { latitude: lat, longitude: lon };
  } catch (error) {
    console.warn("Geocode fetch error", {
      endpoint,
      address,
      error: error instanceof Error ? error.message : error
    });
    return null;
  }
}

async function geocodeLocation(location) {
  if (!location) return { geohash: null, latitude: null, longitude: null };
  const trimmed = location.trim();
  if (!trimmed) {
    return { geohash: null, latitude: null, longitude: null };
  }
  const cacheKey = trimmed.toLowerCase();
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey);
  }

  const variants = buildAddressVariants(trimmed);
  try {
    for (const variant of variants) {
      const primary = await queryGeocoder(geocodeEndpoint, variant);
      if (primary) {
        const safePrecision = precisionWithinBounds(geohashPrecision);
        const geohash = ngeohash.encode(primary.latitude, primary.longitude, safePrecision);
        const result = { geohash, latitude: primary.latitude, longitude: primary.longitude };
        geocodeCache.set(cacheKey, result);
        return result;
      }
    }

    if (fallbackGeocodeEndpoint) {
      for (const variant of variants) {
        const fallback = await queryGeocoder(fallbackGeocodeEndpoint, variant);
        if (fallback) {
          const safePrecision = precisionWithinBounds(geohashPrecision);
          const geohash = ngeohash.encode(fallback.latitude, fallback.longitude, safePrecision);
          const result = { geohash, latitude: fallback.latitude, longitude: fallback.longitude };
          geocodeCache.set(cacheKey, result);
          return result;
        }
      }
    }

    console.warn("Unable to geocode address after attempts", { location: trimmed });
    geocodeCache.set(cacheKey, { geohash: null, latitude: null, longitude: null });
    return { geohash: null, latitude: null, longitude: null };
  } catch (error) {
    console.warn("Failed to geocode location", {
      location: trimmed,
      error: error instanceof Error ? error.message : error
    });
    geocodeCache.set(cacheKey, { geohash: null, latitude: null, longitude: null });
    return { geohash: null, latitude: null, longitude: null };
  }
}

function buildEvents(catalog, profileLocation, profileGeoHash) {
  const catById = new Map((catalog.categories || []).map((c) => [c.id, c.name]));
  const imgById = new Map((catalog.images || []).map((i) => [i.id, i.url]));
  const locationTagValue =
    typeof profileLocation === "string" && profileLocation.trim() ? profileLocation.trim() : null;
  const geohashTagValue =
    typeof profileGeoHash === "string" && profileGeoHash.trim() ? profileGeoHash.trim() : null;

  const events = [];
  for (const item of catalog.items || []) {
    const variations =
      item.variations && item.variations.length
        ? item.variations
        : [{ id: "default", name: "Default", price_money: null }];

    for (const variation of variations) {
      const titleSuffix = variation.name || "Default";
      const content = `**${item.name} – ${titleSuffix}**

${item.description || ""}

SKU: ${variation.sku || "N/A"}`.trim();

      const tags = [];
      tags.push(["d", slug(item.id, variation.id)]);
      tags.push(["title", `${item.name} (${titleSuffix})`]);
      if (item.description) {
        const summary =
          item.description.length > 140 ? `${item.description.slice(0, 140)}…` : item.description;
        tags.push(["summary", summary]);
      }
      if (locationTagValue) {
        tags.push(["location", locationTagValue]);
      }
      if (geohashTagValue) {
        tags.push(["g", geohashTagValue]);
      }
      for (const imageId of item.imageIds || []) {
        const url = imgById.get(imageId);
        if (url) {
          tags.push(["image", url, ""]);
        }
      }
      if (variation.price_money?.amount && variation.price_money.currency) {
        tags.push([
          "price",
          String(variation.price_money.amount / 100),
          variation.price_money.currency
        ]);
      }

      const createdAt = Math.floor(Date.now() / 1000);
      tags.push(["published_at", String(createdAt)]);

      const categoryNames = new Set();
      for (const cid of item.categoryIds || []) {
        const name = catById.get(cid)?.trim();
        if (name) {
          categoryNames.add(name.toLowerCase());
        }
      }
     for (const name of categoryNames) {
       tags.push(["t", name]);
     }

      if (process.env.DEBUG_SQUARE_SYNC === "true") {
        console.debug(
          "Prepared NIP-99 template",
          JSON.stringify({
            itemId: item.id,
            variationId: variation.id,
            categories: Array.from(categoryNames),
            tags
          })
        );
      }

      events.push({
        kind: 30402,
        created_at: createdAt,
        content,
        tags
      });
    }
  }
  return events;
}

async function fetchSquare(path, { method = "GET", headers = {}, accessToken, body } = {}) {
  const base = resolveSquareBase();
  const url = `${base}${path}`;
  const requestHeaders = {
    "Content-Type": "application/json",
    "Square-Version": squareVersion,
    ...headers
  };
  if (accessToken) {
    requestHeaders.Authorization = `Bearer ${accessToken}`;
  }
  const response = await fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(json?.errors?.[0]?.detail || `Square request failed: ${response.status}`);
    error.details = json;
    throw error;
  }
  return json;
}

async function exchangeAuthorizationCode({ code, codeVerifier }) {
  requiredEnv("SQUARE_APPLICATION_ID", squareAppId);
  requiredEnv("SQUARE_REDIRECT_URI", squareRedirectUri);
  const payload = {
    client_id: squareAppId,
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: squareRedirectUri
  };
  if (squareClientSecret) {
    payload.client_secret = squareClientSecret;
  }
  return fetchSquare("/oauth2/token", { method: "POST", body: payload });
}

async function refreshAccessToken(record) {
  if (!record?.refreshToken) {
    return record;
  }
  if (!record.expiresAt) {
    return record;
  }
  const expiresAt = new Date(record.expiresAt).getTime();
  if (Number.isNaN(expiresAt) || expiresAt - Date.now() > 5 * 60 * 1000) {
    return record;
  }
  const payload = {
    client_id: squareAppId,
    grant_type: "refresh_token",
    refresh_token: record.refreshToken
  };
  if (squareClientSecret) {
    payload.client_secret = squareClientSecret;
  }
  const refreshed = await fetchSquare("/oauth2/token", { method: "POST", body: payload });
  await dynamo.send(
    new UpdateCommand({
      TableName: squareConnectionsTable,
      Key: { [squarePrimaryKey]: extractPubkey(record) },
      UpdateExpression:
        "SET accessToken = :at, refreshToken = :rt, expiresAt = :exp, scopes = :sc, updatedAt = :u",
      ExpressionAttributeValues: {
        ":at": refreshed.access_token,
        ":rt": refreshed.refresh_token || record.refreshToken,
        ":exp": refreshed.expires_at || null,
        ":sc":
          refreshed.scope
            ? refreshed.scope.split(" ")
            : Array.isArray(refreshed.scopes)
              ? refreshed.scopes
              : record.scopes || [],
        ":u": new Date().toISOString()
      }
    })
  );
  return {
    ...record,
    accessToken: refreshed.access_token,
    refreshToken: refreshed.refresh_token || record.refreshToken,
    expiresAt: refreshed.expires_at || null,
    scopes: refreshed.scope
      ? refreshed.scope.split(" ")
      : Array.isArray(refreshed.scopes)
        ? refreshed.scopes
        : record.scopes || []
  };
}

async function fetchNormalizedCatalog(record) {
  const { merchantId, accessToken } = record;
  if (!merchantId) {
    throw new Error("Missing merchant ID");
  }
  requiredEnv("SQUARE_APPLICATION_ID", squareAppId);
  if (!accessToken) {
    throw new Error("Missing Square access token");
  }

  const locationsResponse = await fetchSquare("/v2/locations", { accessToken });
  const fetchedLocations =
    locationsResponse.locations?.filter((loc) => typeof loc?.id === "string" && loc.id) || [];
  const normalizedLocations = fetchedLocations.map((loc) => ({
    id: loc.id,
    name: loc.name || loc.address?.address_line_1 || "Location"
  }));
  const locations =
    normalizedLocations.length > 0
      ? normalizedLocations
      : Array.isArray(record.locations)
        ? record.locations
        : [];

  const objects = [];
  let cursor;
  do {
    const params = new URLSearchParams();
    params.set("types", "ITEM,ITEM_VARIATION,CATEGORY,IMAGE");
    params.set("include_related_objects", "true");
    if (cursor) {
      params.set("cursor", cursor);
    }
    const response = await fetchSquare(`/v2/catalog/list?${params.toString()}`, {
      accessToken
    });
    cursor = response.cursor;
    if (Array.isArray(response.objects)) {
      objects.push(...response.objects);
    }
  } while (cursor);

  const categories = [];
  const images = [];
  const variationsById = new Map();

  const categoryStubByItemId = new Map();
  const reportingCategoryByItemId = new Map();

  for (const object of objects) {
    if (!object || typeof object !== "object") continue;
    switch (object.type) {
      case "CATEGORY": {
        const data = object.category_data;
        if (data && data.name) {
          categories.push({ id: object.id, name: data.name });
        }
        break;
      }
      case "IMAGE": {
        const data = object.image_data;
        if (data && data.url) {
          images.push({ id: object.id, url: data.url });
        }
        break;
      }
      case "ITEM_VARIATION": {
        const data = object.item_variation_data;
        if (data) {
          variationsById.set(object.id, {
            id: object.id,
            name: data.name || "Default",
            sku: data.sku || null,
            price_money: data.price_money || null
          });
        }
        break;
      }
      case "ITEM": {
        const data = object.item_data;
        if (data) {
          if (Array.isArray(data.categories)) {
            categoryStubByItemId.set(object.id, data.categories);
          }
          if (data.reporting_category?.id) {
            reportingCategoryByItemId.set(object.id, data.reporting_category.id);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const items = [];
  for (const object of objects) {
    if (object.type !== "ITEM") continue;
    const data = object.item_data;
    if (!data) continue;
    const variations = [];
    if (Array.isArray(data.variations)) {
      for (const variation of data.variations) {
        const ref = variationsById.get(variation.id);
        if (ref) {
          variations.push(ref);
        } else {
          const vData = variation.item_variation_data || {};
          variations.push({
            id: variation.id,
            name: vData.name || "Default",
            sku: vData.sku || null,
            price_money: vData.price_money || null
          });
        }
      }
    }
    const categoryIds = new Set();
    const stubList = categoryStubByItemId.get(object.id);
    if (Array.isArray(stubList)) {
      for (const stub of stubList) {
        const id = stub?.id;
        if (typeof id === "string" && id) {
          categoryIds.add(id);
        }
      }
    }
    const reportingCategory = reportingCategoryByItemId.get(object.id);
    if (reportingCategory) {
      categoryIds.add(reportingCategory);
    }

    const collectedCategoryIds = Array.from(categoryIds);

    items.push({
      id: object.id,
      name: data.name || "Untitled Item",
      description: data.description || "",
      categoryIds: collectedCategoryIds,
      imageIds: Array.isArray(data.image_ids) ? data.image_ids : [],
      variations
    });

    if (process.env.DEBUG_SQUARE_SYNC === "true") {
      console.debug(
        "Square item categories",
        JSON.stringify({
          id: object.id,
          name: data.name,
          categoryIds: collectedCategoryIds
        })
      );
    }
  }

  return {
    merchant_id: merchantId,
    items,
    categories,
    images,
    locations
  };
}

async function performSync(record, options) {
  const refreshed = await refreshAccessToken(record);
  const catalog = await fetchNormalizedCatalog(refreshed);
  const requestedLocationRaw = options?.profileLocation;
  const hasRequestedLocation =
    typeof requestedLocationRaw === "string" && requestedLocationRaw.trim().length > 0;
  const requestedLocation = hasRequestedLocation ? requestedLocationRaw.trim() : null;
  const existingLocation =
    typeof record.profileLocation === "string" && record.profileLocation.trim()
      ? record.profileLocation.trim()
      : null;
  const pubkeyValue = extractPubkey(refreshed);

  let profileLocation = hasRequestedLocation ? requestedLocation : existingLocation;
  let locationSource = hasRequestedLocation ? "request" : existingLocation ? "stored" : null;

  if (!profileLocation) {
    const fromRelays = await fetchProfileLocationFromRelays(pubkeyValue);
    if (fromRelays) {
      profileLocation = fromRelays.trim();
      locationSource = "kind0";
    }
  }

  const locationChanged =
    profileLocation && profileLocation !== existingLocation ? true : hasRequestedLocation && !profileLocation && existingLocation ? true : false;
  const existingGeoHash =
    typeof record.profileGeoHash === "string" && record.profileGeoHash.trim()
      ? record.profileGeoHash.trim()
      : null;

  let profileGeoHash = existingGeoHash;
  const locationHasFullAddress = profileLocation ? isCompleteAddress(profileLocation) : false;
  if (locationHasFullAddress) {
    if (locationChanged || !existingGeoHash) {
      const { geohash } = await geocodeLocation(profileLocation);
      profileGeoHash = geohash || null;
    }
  } else if (locationChanged && existingGeoHash) {
    profileGeoHash = null;
  }

  const events = buildEvents(catalog, profileLocation, profileGeoHash);

  const previous = record.publishedFingerprints || {};
  const fingerprints = { ...previous };
  const toPublish = [];

  for (const event of events) {
    const dTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "d")?.[1];
    if (!dTag) continue;
    const fingerprint = computeFingerprint(event);
    if (previous[dTag] && previous[dTag] === fingerprint) {
      continue;
    }
    toPublish.push({
      kind: event.kind,
      created_at: event.created_at,
      content: event.content,
      tags: event.tags
    });
    fingerprints[dTag] = fingerprint;
  }

  const expressionValues = {
    ":sync": new Date().toISOString(),
    ":count": toPublish.length,
    ":fp": fingerprints,
    ":u": new Date().toISOString(),
    ":loc": catalog.locations
  };
  const removeExpressions = [];
  let updateExpression =
    "SET lastSyncAt = :sync, lastPublishCount = :count, publishedFingerprints = :fp, updatedAt = :u, locations = :loc";
  if (profileLocation) {
    updateExpression += ", profileLocation = :profileLocation";
    expressionValues[":profileLocation"] = profileLocation;
  } else if (locationChanged && existingLocation) {
    removeExpressions.push("profileLocation");
  }
  if (profileGeoHash) {
    updateExpression += ", profileGeoHash = :profileGeoHash";
    expressionValues[":profileGeoHash"] = profileGeoHash;
  } else if ((locationChanged && existingGeoHash) || (!profileGeoHash && existingGeoHash && !profileLocation)) {
    removeExpressions.push("profileGeoHash");
  }
  const finalExpression =
    removeExpressions.length > 0 ? `${updateExpression} REMOVE ${removeExpressions.join(", ")}` : updateExpression;
  await dynamo.send(
    new UpdateCommand({
      TableName: squareConnectionsTable,
      Key: { [squarePrimaryKey]: extractPubkey(refreshed) },
      UpdateExpression: finalExpression,
      ExpressionAttributeValues: expressionValues
    })
  );

  return {
    totalEvents: events.length,
    pendingCount: toPublish.length,
    events: toPublish
  };
}

async function loadConnection(pubkey) {
  if (!pubkey) {
    throw new Error("Missing pubkey");
  }
  const result = await dynamo.send(
    new GetCommand({
      TableName: squareConnectionsTable,
      Key: { [squarePrimaryKey]: pubkey }
    })
  );
  if (!result.Item) {
    return null;
  }
  if (!result.Item.pubkey) {
    result.Item.pubkey = result.Item[squarePrimaryKey];
  }
  return result.Item;
}

async function handleStatus(event) {
  const pubkey = event.queryStringParameters?.pubkey;
  if (!pubkey) {
    return jsonResponse(400, { error: "pubkey query parameter required" });
  }
  const record = await loadConnection(pubkey);
  if (!record) {
    return jsonResponse(200, { connected: false });
  }
  return jsonResponse(200, {
    connected: true,
    merchantId: record.merchantId,
    merchantName: record.merchantName || null,
    locations: record.locations || [],
    scopes: record.scopes || [],
    connectedAt: record.connectedAt || null,
    lastSyncAt: record.lastSyncAt || null,
    lastPublishCount: record.lastPublishCount || 0,
    profileLocation: record.profileLocation || null,
    profileGeoHash: record.profileGeoHash || null
  });
}

async function handleExchange(event) {
  if (event.requestContext.http.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  const body = parseJson(event.body);
  const { code, codeVerifier, pubkey } = body;
  if (!code || !codeVerifier || !pubkey) {
    return jsonResponse(400, { error: "code, codeVerifier, and pubkey are required" });
  }
  const rawProfileLocation =
    typeof body.profileLocation === "string" ? body.profileLocation.trim() : null;
  const profileLocation = rawProfileLocation && rawProfileLocation.length ? rawProfileLocation : null;

  const token = await exchangeAuthorizationCode({ code, codeVerifier });

  const [locationsResp, merchantResp] = await Promise.all([
    fetchSquare("/v2/locations", { accessToken: token.access_token }),
    fetchSquare(`/v2/merchants/${token.merchant_id}`, { accessToken: token.access_token })
  ]);

  const locations =
    locationsResp.locations?.map((loc) => ({
      id: loc.id,
      name: loc.name || loc.address?.address_line_1 || "Location"
    })) || [];

  const merchant = merchantResp.merchant || {};
  const merchantName =
    merchant.business_name ||
    merchant.company_name ||
    merchant.id ||
    token.merchant_id;

  const item = {
    [squarePrimaryKey]: pubkey,
    pubkey,
    merchantId: token.merchant_id,
    merchantName,
    accessToken: token.access_token,
    refreshToken: token.refresh_token || null,
    expiresAt: token.expires_at || null,
    scopes: token.scope ? token.scope.split(" ") : Array.isArray(token.scopes) ? token.scopes : [],
    connectedAt: new Date().toISOString(),
    locations,
    lastSyncAt: null,
    lastPublishCount: 0,
    publishedFingerprints: {}
  };
  if (profileLocation) {
    item.profileLocation = profileLocation;
  }

  await dynamo.send(
    new PutCommand({
      TableName: squareConnectionsTable,
      Item: item
    })
  );

  const result = await performSync({ ...item, pubkey }, { profileLocation });

  return jsonResponse(200, {
    connected: true,
    merchantId: item.merchantId,
    merchantName: item.merchantName,
    locations: item.locations,
    initialSync: result
  });
}

async function performPreview(record, options) {
  const refreshed = await refreshAccessToken(record);
  const catalog = await fetchNormalizedCatalog(refreshed);
  const requestedLocationRaw = options?.profileLocation;
  const hasRequestedLocation =
    typeof requestedLocationRaw === "string" && requestedLocationRaw.trim().length > 0;
  const requestedLocation = hasRequestedLocation ? requestedLocationRaw.trim() : null;
  const existingLocation =
    typeof record.profileLocation === "string" && record.profileLocation.trim()
      ? record.profileLocation.trim()
      : null;
  const pubkeyValue = extractPubkey(refreshed);

  let profileLocation = hasRequestedLocation ? requestedLocation : existingLocation;

  if (!profileLocation) {
    const fromRelays = await fetchProfileLocationFromRelays(pubkeyValue);
    if (fromRelays) {
      profileLocation = fromRelays.trim();
    }
  }

  const existingGeoHash =
    typeof record.profileGeoHash === "string" && record.profileGeoHash.trim()
      ? record.profileGeoHash.trim()
      : null;

  let profileGeoHash = existingGeoHash;
  const locationHasFullAddress = profileLocation ? isCompleteAddress(profileLocation) : false;
  if (locationHasFullAddress) {
    if (!existingGeoHash) {
      const { geohash } = await geocodeLocation(profileLocation);
      profileGeoHash = geohash || null;
    }
  }

  const events = buildEvents(catalog, profileLocation, profileGeoHash);

  const previous = record.publishedFingerprints || {};
  const toPublish = [];

  for (const event of events) {
    const dTag = event.tags.find((tag) => Array.isArray(tag) && tag[0] === "d")?.[1];
    if (!dTag) continue;
    const fingerprint = computeFingerprint(event);
    if (previous[dTag] && previous[dTag] === fingerprint) {
      continue;
    }
    toPublish.push({
      kind: event.kind,
      created_at: event.created_at,
      content: event.content,
      tags: event.tags
    });
  }

  return {
    totalEvents: events.length,
    pendingCount: toPublish.length,
    events: toPublish
  };
}

async function handlePreview(event) {
  if (event.requestContext.http.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  const body = parseJson(event.body);
  const { pubkey } = body;
  if (!pubkey) {
    return jsonResponse(400, { error: "pubkey is required" });
  }
  const rawProfileLocation =
    typeof body.profileLocation === "string" ? body.profileLocation.trim() : null;
  const profileLocation = rawProfileLocation && rawProfileLocation.length ? rawProfileLocation : null;
  const record = await loadConnection(pubkey);
  if (!record) {
    return jsonResponse(404, { error: "Square connection not found" });
  }
  const result = await performPreview({ ...record, pubkey }, { profileLocation });
  return jsonResponse(200, {
    merchantId: record.merchantId,
    pendingCount: result.pendingCount,
    totalEvents: result.totalEvents,
    events: result.events
  });
}

async function handlePublish(event) {
  if (event.requestContext.http.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" });
  }
  const body = parseJson(event.body);
  const { pubkey } = body;
  if (!pubkey) {
    return jsonResponse(400, { error: "pubkey is required" });
  }
  const rawProfileLocation =
    typeof body.profileLocation === "string" ? body.profileLocation.trim() : null;
  const profileLocation = rawProfileLocation && rawProfileLocation.length ? rawProfileLocation : null;
  const record = await loadConnection(pubkey);
  if (!record) {
    return jsonResponse(404, { error: "Square connection not found" });
  }
  const result = await performSync({ ...record, pubkey }, { profileLocation });
  return jsonResponse(200, {
    merchantId: record.merchantId,
    pendingCount: result.pendingCount,
    totalEvents: result.totalEvents,
    events: result.events
  });
}

export const handler = withErrorHandling(async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return jsonResponse(200, { ok: true });
  }
  const path = event.requestContext.http.path || "";
  if (path.endsWith("/square/status")) {
    return handleStatus(event);
  }
  if (path.endsWith("/square/oauth/exchange")) {
    return handleExchange(event);
  }
  if (path.endsWith("/square/preview")) {
    return handlePreview(event);
  }
  if (path.endsWith("/square/publish")) {
    return handlePublish(event);
  }
  return jsonResponse(404, { error: "Not found" });
});
