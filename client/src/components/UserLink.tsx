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
  /** Optional contact name from reservation request that takes precedence over profile name */
  contactName?: string;
}

export function UserLink({ pubkey, className = "", contactName }: UserLinkProps): JSX.Element {
  const { profile, loading } = useUserProfile(pubkey);

  // Primal profile URL
  const primalUrl = `https://www.primal.net/p/${pubkey}`;

  // Display name priority: contactName > profile.display_name > profile.name > abbreviated hex
  const displayName = contactName || profile?.display_name || profile?.name;
  const fallbackName = `${pubkey.slice(0, 8)}...${pubkey.slice(-8)}`;

  if (loading && !contactName) {
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

