import type { Event, EventTemplate } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";
import type { BusinessProfile, BusinessType } from "@/types/profile";
import { skFromNsec } from "@/lib/nostrKeys";

interface BuildOptions {
  createdAt?: number;
  nsec?: string;
  geohash?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/**
 * Maps BusinessType (camelCase) to Schema.org URL format
 * e.g., "barOrPub" → "https://schema.org/BarOrPub"
 */
function businessTypeToSchemaOrgUrl(businessType: BusinessType): string {
  // Convert camelCase to PascalCase - just capitalize first letter
  const pascalCase = businessType.charAt(0).toUpperCase() + businessType.slice(1);
  return `https://schema.org/${pascalCase}`;
}

export function buildProfileEvent(profile: BusinessProfile, options: BuildOptions = {}): EventTemplate {
  const content: Record<string, string> = {};

  if (profile.name) content.name = profile.name;
  if (profile.displayName) content.display_name = profile.displayName;
  if (profile.about) content.about = profile.about;
  if (profile.website) content.website = profile.website;
  if (profile.picture) content.picture = profile.picture;
  if (profile.banner) content.banner = profile.banner;
  if (profile.nip05) content.nip05 = profile.nip05;

  const tags: string[][] = [
    ["l", businessTypeToSchemaOrgUrl(profile.businessType)],
    ["t", "production"]
  ];

  for (const category of profile.categories) {
    const trimmed = category.trim();
    if (trimmed) {
      tags.push(["t", trimmed]);
    }
  }

  if (profile.cuisine) {
    tags.push(["servesCuisine", profile.cuisine, "https://schema.org/servesCuisine"]);
  }

  if (profile.phone) {
    tags.push(["i", `phone:${profile.phone}`, ""]);
  }

  if (profile.email) {
    tags.push(["i", `email:mailto:${profile.email}`, "https://schema.org/email"]);
  }

  // Add postal address component tags
  if (profile.street) {
    tags.push(["i", `postalAddress:streetAddress:${profile.street}`, "https://schema.org/streetAddress"]);
  }
  if (profile.city) {
    tags.push(["i", `postalAddress:addressLocality:${profile.city}`, "https://schema.org/addressLocality"]);
  }
  if (profile.state) {
    tags.push(["i", `postalAddress:addressRegion:${profile.state}`, "https://schema.org/addressRegion"]);
  }
  if (profile.zip) {
    tags.push(["i", `postalAddress:postalCode:${profile.zip}`, "https://schema.org/postalCode"]);
  }
  // Always add country if we have any address components
  if (profile.street || profile.city || profile.state || profile.zip) {
    tags.push(["i", "postalAddress:addressCountry:US", "https://schema.org/addressCountry"]);
  }

  // Add geo tags if geocoding succeeded
  if (options.latitude != null && options.longitude != null) {
    tags.push(["i", `geo:latitude:${options.latitude}`, "https://schema.org/latitude"]);
    tags.push(["i", `geo:longitude:${options.longitude}`, "https://schema.org/longitude"]);
  }
  if (options.geohash) {
    const trimmedGeohash = options.geohash.trim();
    if (trimmedGeohash) {
      tags.push(["i", `geo:${trimmedGeohash}`, "https://geohash.org"]);
    }
  }

  // Add chamber membership tag if chamber is specified
  if (profile.chamber) {
    tags.push(["i", `com.synvya.chamber:${profile.chamber}`, ""]);
  }

  const event: EventTemplate = {
    kind: 0,
    created_at: options.createdAt ?? Math.floor(Date.now() / 1000),
    tags,
    content: JSON.stringify(content)
  };

  return event;
}

export function finalizeProfileEvent(profile: BusinessProfile, nsec: string, options: BuildOptions = {}): Event {
  const template = buildProfileEvent(profile, options);
  const sk = skFromNsec(nsec);
  return finalizeEvent(template, sk);
}
