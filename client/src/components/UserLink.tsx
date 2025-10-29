/**
 * UserLink Component
 * 
 * Displays a user's display name from their kind:0 profile as a link to their Primal profile.
 * Falls back to abbreviated hex public key if profile is not available.
 */

import { useUserProfile } from "@/hooks/useUserProfile";

interface UserLinkProps {
  pubkey: string;
  className?: string;
}

export function UserLink({ pubkey, className = "" }: UserLinkProps): JSX.Element {
  const { profile, loading } = useUserProfile(pubkey);

  // Primal profile URL
  const primalUrl = `https://www.primal.net/p/${pubkey}`;

  // Display name: prefer display_name, then name, then abbreviated hex
  const displayName = profile?.display_name || profile?.name;
  const fallbackName = `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;

  if (loading) {
    return (
      <span className={`text-muted-foreground ${className}`}>
        Loading...
      </span>
    );
  }

  return (
    <a
      href={primalUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`text-primary hover:underline ${className}`}
      title={`View ${displayName || fallbackName}'s profile on Primal`}
    >
      {displayName || fallbackName}
    </a>
  );
}

