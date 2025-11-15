import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { useChamber } from "@/state/useChamber";
import type { BusinessProfile, BusinessType } from "@/types/profile";
import { buildProfileEvent } from "@/lib/events";
import { publishToRelays, getPool } from "@/lib/relayPool";
import { geocodeLocation } from "@/lib/geocode";
import { buildHandlerInfo, buildHandlerRecommendation, buildDeletionEvent, buildDmRelayEvent, SYNVYA_HANDLER_D_IDENTIFIER } from "@/lib/handlerEvents";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { uploadMedia } from "@/services/upload";
import type { Event } from "nostr-tools";
import { CheckCircle2, Image as ImageIcon, UploadCloud, Clock } from "lucide-react";
import { useBusinessProfile } from "@/state/useBusinessProfile";
import { OpeningHoursDialog } from "@/components/OpeningHoursDialog";
import type { OpeningHoursSpec } from "@/types/profile";

interface FormStatus {
  type: "idle" | "success" | "error";
  message: string | null;
  eventId?: string;
}

const businessTypes: { label: string; value: BusinessType }[] = [
  { label: "Bakery", value: "bakery" },
  { label: "Bar or Pub", value: "barOrPub" },
  { label: "Brewery", value: "brewery" },
  { label: "Cafe or Coffee Shop", value: "cafeOrCoffeeShop" },
  { label: "Distillery", value: "distillery" },
  { label: "Fast Food Restaurant", value: "fastFoodRestaurant" },
  { label: "Ice Cream Shop", value: "iceCreamShop" },
  { label: "Restaurant", value: "restaurant" },
  { label: "Winery", value: "winery" }
];

const allowedBusinessTypes = new Set<BusinessType>(businessTypes.map((item) => item.value));

/**
 * Maps Schema.org URL to BusinessType (camelCase)
 * e.g., "https://schema.org:BarOrPub" → "barOrPub"
 */
function schemaOrgUrlToBusinessType(url: string): BusinessType | null {
  if (!url.startsWith("https://schema.org:")) {
    return null;
  }
  const typeName = url.slice("https://schema.org:".length);
  // Convert PascalCase to camelCase
  const camelCase = typeName.charAt(0).toLowerCase() + typeName.slice(1);
  // Map to BusinessType
  const mapping: Record<string, BusinessType> = {
    "bakery": "bakery",
    "barOrPub": "barOrPub",
    "brewery": "brewery",
    "cafeOrCoffeeShop": "cafeOrCoffeeShop",
    "distillery": "distillery",
    "fastFoodRestaurant": "fastFoodRestaurant",
    "iceCreamShop": "iceCreamShop",
    "restaurant": "restaurant",
    "winery": "winery"
  };
  return mapping[camelCase] || null;
}

const usStates: { label: string; value: string }[] = [
  { label: "Alabama", value: "AL" },
  { label: "Alaska", value: "AK" },
  { label: "Arizona", value: "AZ" },
  { label: "Arkansas", value: "AR" },
  { label: "California", value: "CA" },
  { label: "Colorado", value: "CO" },
  { label: "Connecticut", value: "CT" },
  { label: "Delaware", value: "DE" },
  { label: "Florida", value: "FL" },
  { label: "Georgia", value: "GA" },
  { label: "Hawaii", value: "HI" },
  { label: "Idaho", value: "ID" },
  { label: "Illinois", value: "IL" },
  { label: "Indiana", value: "IN" },
  { label: "Iowa", value: "IA" },
  { label: "Kansas", value: "KS" },
  { label: "Kentucky", value: "KY" },
  { label: "Louisiana", value: "LA" },
  { label: "Maine", value: "ME" },
  { label: "Maryland", value: "MD" },
  { label: "Massachusetts", value: "MA" },
  { label: "Michigan", value: "MI" },
  { label: "Minnesota", value: "MN" },
  { label: "Mississippi", value: "MS" },
  { label: "Missouri", value: "MO" },
  { label: "Montana", value: "MT" },
  { label: "Nebraska", value: "NE" },
  { label: "Nevada", value: "NV" },
  { label: "New Hampshire", value: "NH" },
  { label: "New Jersey", value: "NJ" },
  { label: "New Mexico", value: "NM" },
  { label: "New York", value: "NY" },
  { label: "North Carolina", value: "NC" },
  { label: "North Dakota", value: "ND" },
  { label: "Ohio", value: "OH" },
  { label: "Oklahoma", value: "OK" },
  { label: "Oregon", value: "OR" },
  { label: "Pennsylvania", value: "PA" },
  { label: "Rhode Island", value: "RI" },
  { label: "South Carolina", value: "SC" },
  { label: "South Dakota", value: "SD" },
  { label: "Tennessee", value: "TN" },
  { label: "Texas", value: "TX" },
  { label: "Utah", value: "UT" },
  { label: "Vermont", value: "VT" },
  { label: "Virginia", value: "VA" },
  { label: "Washington", value: "WA" },
  { label: "West Virginia", value: "WV" },
  { label: "Wisconsin", value: "WI" },
  { label: "Wyoming", value: "WY" }
];

function createInitialProfile(): BusinessProfile {
  return {
    name: "",
    displayName: "",
    about: "",
    website: "",
    nip05: "",
    picture: "",
    banner: "",
    businessType: "restaurant",
    categories: [],
    phone: "",
    email: "",
    street: "",
    city: "",
    state: "",
    zip: "",
    location: ""
  };
}

function parseKind0ProfileEvent(event: Event): { patch: Partial<BusinessProfile>; categories: string[] } {
  const patch: Partial<BusinessProfile> = {};
  const categories: string[] = [];
  const openingHours: OpeningHoursSpec[] = [];
  let locationValue: string | undefined;

  try {
    const content = JSON.parse(event.content ?? "{}") as Record<string, unknown>;
    if (typeof content.name === "string") patch.name = content.name;
    if (typeof content.display_name === "string") patch.displayName = content.display_name;
    if (typeof content.about === "string") patch.about = content.about;
    if (typeof content.website === "string") patch.website = content.website;
    if (typeof content.nip05 === "string") patch.nip05 = content.nip05;
    if (typeof content.picture === "string") patch.picture = content.picture;
    if (typeof content.banner === "string") patch.banner = content.banner;
  } catch (error) {
    console.warn("Failed to parse profile content", error);
  }

  for (const tag of event.tags) {
    if (!Array.isArray(tag) || !tag.length) continue;

    if (tag[0] === "l" && typeof tag[1] === "string") {
      // Try new Schema.org format first
      const businessType = schemaOrgUrlToBusinessType(tag[1]);
      if (businessType) {
        patch.businessType = businessType;
      } else if (tag[2] === "com.synvya.merchant" && allowedBusinessTypes.has(tag[1] as BusinessType)) {
        // Fallback to old format for backward compatibility
        patch.businessType = tag[1] as BusinessType;
      }
    } else if (tag[0] === "t" && typeof tag[1] === "string" && tag[1] !== "production") {
      categories.push(tag[1]);
    } else if (tag[0] === "servesCuisine" && typeof tag[1] === "string") {
      patch.cuisine = tag[1];
    } else if (tag[0] === "acceptsReservations" && typeof tag[1] === "string") {
      if (tag[1] === "False") {
        patch.acceptsReservations = false;
      } else if (tag[1] === "https://dinedirect.app") {
        patch.acceptsReservations = true;
      }
    } else if (tag[0] === "openingHoursSpecification" && typeof tag[1] === "string" && typeof tag[2] === "string") {
      // Parse day range and time range
      const dayRange = tag[1];
      const timeRange = tag[2];
      const [startTime, endTime] = timeRange.split("-");
      
      if (startTime && endTime) {
        // Parse day range: "Tu-Th" or "Mo"
        const days: string[] = [];
        if (dayRange.includes("-")) {
          const [startDay, endDay] = dayRange.split("-");
          const dayOrder = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
          const startIndex = dayOrder.indexOf(startDay);
          const endIndex = dayOrder.indexOf(endDay);
          if (startIndex >= 0 && endIndex >= 0 && startIndex <= endIndex) {
            for (let i = startIndex; i <= endIndex; i++) {
              days.push(dayOrder[i]);
            }
          }
        } else {
          days.push(dayRange);
        }
        
        if (days.length > 0) {
          openingHours.push({ days, startTime, endTime });
        }
      }
    } else if (tag[0] === "i" && typeof tag[1] === "string") {
      if (tag[1].startsWith("telephone:")) {
        const phone = tag[1].slice("telephone:".length);
        if (phone) patch.phone = phone;
      } else if (tag[1].startsWith("phone:")) {
        // Backward compatibility: support old "phone:" format
        const phone = tag[1].slice("phone:".length);
        if (phone) patch.phone = phone;
      } else if (tag[1].startsWith("email:mailto:")) {
        const email = tag[1].slice("email:mailto:".length);
        if (email) patch.email = email;
      } else if (tag[1].startsWith("postalAddress:streetAddress:")) {
        patch.street = tag[1].slice("postalAddress:streetAddress:".length);
      } else if (tag[1].startsWith("postalAddress:addressLocality:")) {
        patch.city = tag[1].slice("postalAddress:addressLocality:".length);
      } else if (tag[1].startsWith("postalAddress:addressRegion:")) {
        patch.state = tag[1].slice("postalAddress:addressRegion:".length);
      } else if (tag[1].startsWith("postalAddress:postalCode:")) {
        patch.zip = tag[1].slice("postalAddress:postalCode:".length);
      } else if (tag[1].startsWith("location:")) {
        // Fallback to old format for backward compatibility
        locationValue = tag[1].slice("location:".length);
      }
    }
  }

  // Reconstruct location from postal address components if available
  if (patch.street || patch.city || patch.state || patch.zip) {
    const locationParts = [patch.street, patch.city, patch.state, patch.zip].filter(
      (value): value is string => Boolean(value)
    );
    if (locationParts.length >= 2) {
      patch.location = `${locationParts.join(", ")}, USA`;
    }
  } else if (locationValue) {
    // Fallback to old format
    patch.location = locationValue;
    const withoutCountry = locationValue.replace(/,?\s*USA$/i, "").trim();
    const parts = withoutCountry
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts[0]) patch.street = parts[0];
    if (parts[1]) patch.city = parts[1];
    if (parts[2]) patch.state = parts[2];
    if (parts[3]) patch.zip = parts[3];
  }

  if (categories.length) {
    patch.categories = categories;
  }

  if (openingHours.length > 0) {
    patch.openingHours = openingHours;
  }

  return { patch, categories };
}

export function BusinessProfileForm(): JSX.Element {
  const signEvent = useAuth((state) => state.signEvent);
  const pubkey = useAuth((state) => state.pubkey);
  const authStatus = useAuth((state) => state.status);
  const relays = useRelays((state) => state.relays);
  const chamberId = useChamber((state) => state.chamberId);
  const setProfileLocation = useBusinessProfile((state) => state.setLocation);
  const setProfileBusinessType = useBusinessProfile((state) => state.setBusinessType);
  const [profile, setProfile] = useState<BusinessProfile>(createInitialProfile);
  const [categoriesInput, setCategoriesInput] = useState("");
  const [cuisineInput, setCuisineInput] = useState("");
  const [status, setStatus] = useState<FormStatus>({ type: "idle", message: null });
  const [publishing, setPublishing] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<{ picture: File | null; banner: File | null }>({
    picture: null,
    banner: null
  });
  const [previewUrls, setPreviewUrls] = useState<{ picture: string | null; banner: string | null }>({
    picture: null,
    banner: null
  });
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [openingHoursDialogOpen, setOpeningHoursDialogOpen] = useState(false);
  const pictureInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRef = useRef<HTMLInputElement | null>(null);
  const loadingProfileRef = useRef(false);
  const originalBusinessTypeRef = useRef<BusinessType | null>(null);

  const derivedCategories = useMemo(() => {
    if (!categoriesInput) return [];
    return categoriesInput
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
  }, [categoriesInput]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus({ type: "idle", message: null });

    const nip05 = profile.name ? `${profile.name}@synvya.com` : "";

    const payload: BusinessProfile = {
      ...profile,
      nip05,
      categories: derivedCategories,
      cuisine: cuisineInput?.trim() || undefined,
      phone: profile.phone?.trim() || undefined,
      email: profile.email?.trim() || undefined,
      street: profile.street?.trim() || undefined,
      city: profile.city?.trim() || undefined,
      state: profile.state?.trim() || undefined,
      zip: profile.zip?.trim() || undefined,
      chamber: chamberId || undefined
    };

    if (!relays.length) {
      setStatus({ type: "error", message: "Add at least one relay before publishing" });
      return;
    }

    let pictureUrl = profile.picture;
    let bannerUrl = profile.banner;

    try {
      setPublishing(true);

      // Check if changing FROM restaurant TO another type - delete handler events
      const wasRestaurant = originalBusinessTypeRef.current === "restaurant";
      const isStillRestaurant = payload.businessType === "restaurant";
      
      if (wasRestaurant && !isStillRestaurant && pubkey) {
        try {
          const pool = getPool();
          
          // Query for existing handler events
          const [handlerInfo, recommendation9901, recommendation9902] = await Promise.all([
            pool.get(relays, {
              kinds: [31990],
              authors: [pubkey],
              "#d": [SYNVYA_HANDLER_D_IDENTIFIER]
            }),
            pool.get(relays, {
              kinds: [31989],
              authors: [pubkey],
              "#d": ["9901"]
            }),
            pool.get(relays, {
              kinds: [31989],
              authors: [pubkey],
              "#d": ["9902"]
            })
          ]);
          
          // Collect event IDs to delete
          const eventIdsToDelete: string[] = [];
          const kindsToDelete: number[] = [];
          
          if (handlerInfo) {
            eventIdsToDelete.push(handlerInfo.id);
            if (!kindsToDelete.includes(31990)) kindsToDelete.push(31990);
          }
          if (recommendation9901) {
            eventIdsToDelete.push(recommendation9901.id);
            if (!kindsToDelete.includes(31989)) kindsToDelete.push(31989);
          }
          if (recommendation9902) {
            eventIdsToDelete.push(recommendation9902.id);
            if (!kindsToDelete.includes(31989)) kindsToDelete.push(31989);
          }
          
          // Publish deletion event if any handler events were found
          if (eventIdsToDelete.length > 0) {
            const deletionTemplate = buildDeletionEvent(eventIdsToDelete, kindsToDelete);
            const deletionEvent = await signEvent(deletionTemplate);
            await publishToRelays(deletionEvent, relays);
            console.log(`Deleted ${eventIdsToDelete.length} handler event(s)`);
          } else {
            console.log("No handler events found to delete");
          }
        } catch (error) {
          console.warn("Failed to delete handler events:", error);
          // Don't fail the whole operation if deletion fails
        }
      }

      if (pendingFiles.picture) {
        pictureUrl = await uploadMedia(pendingFiles.picture, "picture");
      }

      if (pendingFiles.banner) {
        bannerUrl = await uploadMedia(pendingFiles.banner, "banner");
      }

      const locationParts = [payload.street, payload.city, payload.state, payload.zip].filter(
        (value): value is string => Boolean(value)
      );
      const fullLocation = locationParts.length >= 2 ? `${locationParts.join(", ")}, USA` : undefined;

      const finalPayload: BusinessProfile = {
        ...payload,
        picture: pictureUrl,
        banner: bannerUrl,
        location: fullLocation
      };
      setProfileLocation(fullLocation ?? null);

      // Geocode location to get geohash, latitude, and longitude
      let geohash: string | null = null;
      let latitude: number | null = null;
      let longitude: number | null = null;
      if (fullLocation) {
        try {
          const geocodeResult = await geocodeLocation(fullLocation);
          geohash = geocodeResult.geohash;
          latitude = geocodeResult.latitude;
          longitude = geocodeResult.longitude;
        } catch (error) {
          console.warn("Failed to geocode location", error);
          // Continue without geo data if geocoding fails
        }
      }

      const template = buildProfileEvent(finalPayload, { geohash, latitude, longitude });
      const signed = await signEvent(template);
      await publishToRelays(signed, relays);

      // If this is a restaurant, publish NIP-89 handler events and NIP-17 DM relay event
      let handlerEventsPublished = false;
      if (finalPayload.businessType === "restaurant" && pubkey) {
        try {
          const firstRelay = relays[0] || "wss://relay.damus.io";
          
          // Build and sign all handler events (1 handler info + 4 recommendations)
          const handlerInfoTemplate = buildHandlerInfo(pubkey);
          const handlerInfo = await signEvent(handlerInfoTemplate);
          
          const recommendation9901Template = buildHandlerRecommendation(pubkey, "9901", firstRelay);
          const recommendation9901 = await signEvent(recommendation9901Template);
          
          const recommendation9902Template = buildHandlerRecommendation(pubkey, "9902", firstRelay);
          const recommendation9902 = await signEvent(recommendation9902Template);
          
          const recommendation9903Template = buildHandlerRecommendation(pubkey, "9903", firstRelay);
          const recommendation9903 = await signEvent(recommendation9903Template);
          
          const recommendation9904Template = buildHandlerRecommendation(pubkey, "9904", firstRelay);
          const recommendation9904 = await signEvent(recommendation9904Template);
          
          // Build and sign DM relay event (kind 10050) as per NIP-17
          const dmRelayTemplate = buildDmRelayEvent(relays);
          const dmRelayEvent = await signEvent(dmRelayTemplate);
          
          // Publish all events in parallel (1 handler info + 4 recommendations + 1 DM relay)
          await Promise.all([
            publishToRelays(handlerInfo, relays),
            publishToRelays(recommendation9901, relays),
            publishToRelays(recommendation9902, relays),
            publishToRelays(recommendation9903, relays),
            publishToRelays(recommendation9904, relays),
            publishToRelays(dmRelayEvent, relays)
          ]);
          
          handlerEventsPublished = true;
        } catch (error) {
          console.warn("Failed to publish handler events:", error);
          // Don't fail the whole operation if handler events fail
        }
      }

      setProfile((prev) => ({
        ...prev,
        picture: pictureUrl,
        banner: bannerUrl,
        phone: payload.phone ?? "",
        email: payload.email ?? "",
        cuisine: payload.cuisine ?? "",
        street: payload.street ?? "",
        city: payload.city ?? "",
        state: payload.state ?? "",
        zip: payload.zip ?? "",
        location: fullLocation ?? "",
        categories: derivedCategories,
        nip05
      }));

      // Update original business type for future change detection
      originalBusinessTypeRef.current = finalPayload.businessType;
      setProfileBusinessType(finalPayload.businessType);

      setPendingFiles({ picture: null, banner: null });
      setPreviewUrls((prev) => {
        if (prev.picture) URL.revokeObjectURL(prev.picture);
        if (prev.banner) URL.revokeObjectURL(prev.banner);
        return { picture: null, banner: null };
      });

      const successMessage = handlerEventsPublished
        ? "Profile published with reservation support enabled"
        : "Profile published to relays";
      setStatus({ type: "success", message: successMessage, eventId: signed.id });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to publish profile";
      setStatus({ type: "error", message });
    } finally {
      setPublishing(false);
    }
  };

  const updateField = <K extends keyof BusinessProfile>(field: K, value: BusinessProfile[K]) => {
    setProfile((prev) => ({ ...prev, [field]: value }));
  };

  const handleNameChange = (value: string) => {
    setProfile((prev) => ({
      ...prev,
      name: value,
      nip05: value ? `${value}@synvya.com` : ""
    }));
  };

  const handleFileSelect = (file: File, kind: keyof typeof pendingFiles) => {
    setPendingFiles((prev) => ({ ...prev, [kind]: file }));
    setPreviewUrls((prev) => {
      const nextUrl = URL.createObjectURL(file);
      if (prev[kind]) {
        URL.revokeObjectURL(prev[kind]!);
      }
      return { ...prev, [kind]: nextUrl };
    });
    setStatus({ type: "idle", message: null });
  };

  useEffect(() => {
    return () => {
      if (previewUrls.picture) URL.revokeObjectURL(previewUrls.picture);
      if (previewUrls.banner) URL.revokeObjectURL(previewUrls.banner);
    };
  }, [previewUrls.picture, previewUrls.banner]);

  useEffect(() => {
    if (profileLoaded || loadingProfileRef.current) {
      return;
    }

    if (authStatus !== "ready" || !pubkey || !relays.length) {
      return;
    }

    let cancelled = false;
    const pool = getPool();
    loadingProfileRef.current = true;

    (async () => {
      try {
        const event = await pool.get(relays, {
          kinds: [0],
          authors: [pubkey]
        });

        if (!event || cancelled) {
          return;
        }

        const { patch, categories } = parseKind0ProfileEvent(event);

        setProfileLocation(patch.location ?? null);
        setProfileBusinessType(patch.businessType ?? null);

        if (cancelled) {
          return;
        }

        setProfile((prev) => ({
          ...prev,
          ...patch,
          categories: patch.categories ?? prev.categories,
          phone: patch.phone ?? prev.phone,
          email: patch.email ?? prev.email,
          street: patch.street ?? prev.street,
          city: patch.city ?? prev.city,
          state: patch.state ?? prev.state,
          zip: patch.zip ?? prev.zip,
          location: patch.location ?? prev.location
        }));

        // Store the original business type to detect changes
        if (patch.businessType) {
          originalBusinessTypeRef.current = patch.businessType;
        }

        if (categories.length) {
          setCategoriesInput(categories.join(", "));
        }

        if (patch.cuisine) {
          setCuisineInput(patch.cuisine);
        }
      } catch (error) {
        console.warn("Failed to load existing profile", error);
      } finally {
        if (!cancelled) {
          loadingProfileRef.current = false;
          setProfileLoaded(true);
        }
      }
    })();

    return () => {
      cancelled = true;
      loadingProfileRef.current = false;
    };
  }, [authStatus, profileLoaded, pubkey, relays]);

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <section className="grid gap-6 rounded-lg border bg-card p-6 shadow-sm">
        <header>
          <h2 className="text-lg font-semibold">Business profile</h2>
          <p className="text-sm text-muted-foreground">The business profile AI shopping assistants will see.</p>
        </header>

        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="handle">Handle</Label>
            <Input
              id="handle"
              required
              placeholder="myshop"
              value={profile.name}
              onChange={(event) => handleNameChange(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Lowercase handle without spaces.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="displayName">Display name</Label>
            <Input
              id="displayName"
              placeholder="My Shop"
              value={profile.displayName}
              onChange={(event) => updateField("displayName", event.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="about">About</Label>
            <Textarea
              id="about"
              placeholder="Tell customers about your business"
              value={profile.about}
              onChange={(event) => updateField("about", event.target.value)}
              rows={4}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                type="url"
                placeholder="https://myshop.com"
                value={profile.website}
                onChange={(event) => updateField("website", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                placeholder="(555) 123-4567"
                value={profile.phone ?? ""}
                onChange={(event) => updateField("phone", event.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="contact@your-restaurant.com"
                value={profile.email ?? ""}
                onChange={(event) => updateField("email", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="street">Street</Label>
              <Input
                id="street"
                placeholder="123 Main St"
                value={profile.street ?? ""}
                onChange={(event) => updateField("street", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                placeholder="San Francisco"
                value={profile.city ?? ""}
                onChange={(event) => updateField("city", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="state">State</Label>
              <select
                id="state"
                className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
                value={profile.state ?? ""}
                onChange={(event) => updateField("state", event.target.value)}
              >
                <option value="">Select a state</option>
                {usStates.map((state) => (
                  <option key={state.value} value={state.value}>
                    {state.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="zip">Zip code</Label>
              <Input
                id="zip"
                placeholder="98052"
                value={profile.zip ?? ""}
                onChange={(event) => updateField("zip", event.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="businessType">Business type</Label>
            <select
              id="businessType"
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm"
              value={profile.businessType}
              onChange={(event) => updateField("businessType", event.target.value as BusinessType)}
            >
              {businessTypes.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Required tag that categorizes the business for AI discovery.</p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="acceptsReservations"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300"
              checked={profile.acceptsReservations ?? false}
              onChange={(event) => updateField("acceptsReservations", event.target.checked)}
            />
            <Label htmlFor="acceptsReservations" className="cursor-pointer">
              Accepts Reservations
            </Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="categories">Categories</Label>
            <Input
              id="categories"
              placeholder="bakery, local, sweets"
              value={categoriesInput}
              onChange={(event) => setCategoriesInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma separated values.</p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cuisine">Cuisine</Label>
            <Input
              id="cuisine"
              placeholder="Italian, Seafood"
              value={cuisineInput}
              onChange={(event) => setCuisineInput(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Comma separated values.</p>
          </div>
          <div className="grid gap-2">
            <Label>Opening Hours</Label>
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpeningHoursDialogOpen(true)}
              className="justify-start"
            >
              <Clock className="mr-2 h-4 w-4" />
              {profile.openingHours && profile.openingHours.length > 0
                ? profile.openingHours
                    .map((spec) => {
                      const dayRange =
                        spec.days.length === 1
                          ? spec.days[0]
                          : `${spec.days[0]}-${spec.days[spec.days.length - 1]}`;
                      return `${dayRange} ${spec.startTime}-${spec.endTime}`;
                    })
                    .join(", ")
                : "Set opening hours"}
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-6 rounded-lg border bg-card p-6 shadow-sm">
        <header className="flex items-center gap-3">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Media</h3>
            <p className="text-sm text-muted-foreground">Upload a profile picture and banner.</p>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="picture">Profile picture</Label>
            <div className="flex items-center gap-3">
              <Input
                id="picture"
                readOnly
                value={pendingFiles.picture ? pendingFiles.picture.name : profile.picture}
                placeholder="Select an image…"
              />
              <input
                ref={pictureInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleFileSelect(file, "picture");
                    event.target.value = "";
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={publishing}
                onClick={() => pictureInputRef.current?.click()}
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                {pendingFiles.picture ? "Change" : "Upload"}
              </Button>
            </div>
            {(pendingFiles.picture ? previewUrls.picture : profile.picture) && (
              <img
                src={(pendingFiles.picture ? previewUrls.picture : profile.picture) ?? undefined}
                alt="Profile preview"
                className="h-32 w-32 rounded-md object-cover"
              />
            )}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="banner">Banner</Label>
            <div className="flex items-center gap-3">
              <Input
                id="banner"
                readOnly
                value={pendingFiles.banner ? pendingFiles.banner.name : profile.banner}
                placeholder="Select an image…"
              />
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) {
                    handleFileSelect(file, "banner");
                    event.target.value = "";
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                disabled={publishing}
                onClick={() => bannerInputRef.current?.click()}
              >
                <UploadCloud className="mr-2 h-4 w-4" />
                {pendingFiles.banner ? "Change" : "Upload"}
              </Button>
            </div>
            {(pendingFiles.banner ? previewUrls.banner : profile.banner) && (
              <img
                src={(pendingFiles.banner ? previewUrls.banner : profile.banner) ?? undefined}
                alt="Banner preview"
                className="h-32 w-full rounded-md object-cover"
              />
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-4 rounded-lg border bg-card p-6 shadow-sm">
        <header className="flex items-center gap-3">
          <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
          <div>
            <h3 className="text-lg font-semibold">Publish</h3>
            <p className="text-sm text-muted-foreground">Publish your profile to make it discoverable by AI shopping assistants.</p>
          </div>
        </header>

        <Button type="submit" disabled={publishing}>
          {publishing ? "Publishing…" : "Publish Profile"}
        </Button>

        {status.message && (
          <div
            className={`rounded-md border p-3 text-sm ${
              status.type === "success" ? "border-green-200 bg-green-100 text-green-700" : "border-destructive/40 bg-destructive/10 text-destructive"
            }`}
          >
            <p>{status.message}</p>
            {status.eventId && status.type === "success" ? (
              <p className="mt-1 font-mono text-xs text-muted-foreground">Event ID: {status.eventId}</p>
            ) : null}
          </div>
        )}
      </section>

      <OpeningHoursDialog
        open={openingHoursDialogOpen}
        onOpenChange={setOpeningHoursDialogOpen}
        openingHours={profile.openingHours ?? []}
        onSave={(hours) => updateField("openingHours", hours)}
      />
    </form>
  );
}
