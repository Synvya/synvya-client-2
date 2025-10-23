import { NavLink } from "react-router-dom";
import { useAuth } from "@/state/useAuth";
import { useBusinessProfile } from "@/state/useBusinessProfile";
import { cn } from "@/lib/utils";

export function Header(): JSX.Element {
  const npub = useAuth((state) => state.npub);
  const businessType = useBusinessProfile((state) => state.businessType);

  return (
    <header className="border-b">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="text-lg font-semibold">Synvya Retail Onboarder</span>
          <nav className="flex items-center gap-3 text-sm">
            <NavLink
              to="/app/profile"
              className={({ isActive }) =>
                cn(
                  "transition-colors hover:text-primary",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              Profile
            </NavLink>
            {businessType === "restaurant" && (
              <NavLink
                to="/app/reservations"
                className={({ isActive }) =>
                  cn(
                    "transition-colors hover:text-primary",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                Reservations
              </NavLink>
            )}
            {import.meta.env.DEV && (
              <NavLink
                to="/app/test-harness"
                className={({ isActive }) =>
                  cn(
                    "transition-colors hover:text-primary",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )
                }
              >
                Test Harness
              </NavLink>
            )}
            <NavLink
              to="/app/settings"
              className={({ isActive }) =>
                cn(
                  "transition-colors hover:text-primary",
                  isActive ? "text-primary" : "text-muted-foreground"
                )
              }
            >
              Settings
            </NavLink>
          </nav>
        </div>
        <div className="text-xs text-muted-foreground">
          {npub ? (
            <span className="font-mono">{npub}</span>
          ) : (
            <span>Loading identity…</span>
          )}
        </div>
      </div>
    </header>
  );
}
