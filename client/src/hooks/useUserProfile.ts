/**
 * Hook to fetch and cache user profiles (kind:0 events)
 */

import { useState, useEffect } from "react";
import { getPool } from "@/lib/relayPool";
import { useRelays } from "@/state/useRelays";
import type { Event } from "nostr-tools";

interface UserProfile {
  name?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  nip05?: string;
}

interface UseUserProfileResult {
  profile: UserProfile | null;
  loading: boolean;
  error: Error | null;
}

// Cache to avoid refetching the same profiles
const profileCache = new Map<string, UserProfile>();

/**
 * Fetch and cache a user's kind:0 profile event
 */
export function useUserProfile(pubkey: string): UseUserProfileResult {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const relays = useRelays((state) => state.relays);

  useEffect(() => {
    // Check cache first
    if (profileCache.has(pubkey)) {
      setProfile(profileCache.get(pubkey)!);
      setLoading(false);
      return;
    }

    if (!pubkey || !relays.length) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const fetchProfile = async () => {
      try {
        setLoading(true);
        setError(null);

        const pool = getPool();
        
        // Fetch the most recent kind:0 event for this pubkey
        const events = await pool.querySync(relays, {
          kinds: [0],
          authors: [pubkey],
          limit: 1,
        });

        if (cancelled) return;

        if (events && events.length > 0) {
          const event = events[0];
          try {
            const profileData = JSON.parse(event.content) as UserProfile;
            profileCache.set(pubkey, profileData);
            setProfile(profileData);
          } catch (parseError) {
            console.error("Failed to parse profile content:", parseError);
            setError(new Error("Invalid profile data"));
          }
        } else {
          // No profile found
          setProfile(null);
        }
      } catch (err) {
        if (!cancelled) {
          const error = err instanceof Error ? err : new Error("Failed to fetch profile");
          setError(error);
          console.error("Error fetching user profile:", error);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      cancelled = true;
    };
  }, [pubkey, relays]);

  return { profile, loading, error };
}

/**
 * Clear the profile cache (useful for testing or when forcing a refresh)
 */
export function clearProfileCache(): void {
  profileCache.clear();
}

