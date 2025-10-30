import type { Event, EventTemplate } from "nostr-tools";
import { finalizeEvent } from "nostr-tools";
import type { BusinessProfile } from "@/types/profile";
import { skFromNsec } from "@/lib/nostrKeys";

interface BuildOptions {
  createdAt?: number;
  nsec?: string;
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
    ["L", "business.type"],
    ["l", profile.businessType, "business.type"],
    ["t", "production"]
  ];

  for (const category of profile.categories) {
    const trimmed = category.trim();
    if (trimmed) {
      tags.push(["t", trimmed]);
    }
  }

  if (profile.phone) {
    tags.push(["i", `phone:${profile.phone}`, ""]);
  }

  if (profile.location) {
    const trimmedLocation = profile.location.trim();
    const locationValue = trimmedLocation.toUpperCase().endsWith("USA")
      ? trimmedLocation
      : `${trimmedLocation}${trimmedLocation ? ", " : ""}USA`;
    tags.push(["i", `location:${locationValue}`, ""]);
  }

  // Add chamber membership tags if chamber is specified
  if (profile.chamber) {
    tags.push(
      ["L", "com.synvya.chamber"],
      ["l", profile.chamber, "com.synvya.chamber"],
      ["i", `com.synvya.chamber:${profile.chamber}`, ""]
    );
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
