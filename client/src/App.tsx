import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { OnboardingGate } from "@/components/OnboardingGate";
import { Header } from "@/components/Header";
import { ProfilePage } from "@/pages/Profile";
import { SettingsPage } from "@/pages/Settings";
import { LandingPage } from "@/pages/Landing";
import { SquareCallbackPage } from "@/pages/SquareCallback";

function ProtectedApp(): JSX.Element {
  return (
    <OnboardingGate>
      <div className="flex min-h-screen flex-col">
        <Header />
        <main className="flex-1 bg-muted/30">
          <Outlet />
        </main>
      </div>
    </OnboardingGate>
  );
}

export function App(): JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/square/callback" element={<SquareCallbackPage />} />
      <Route path="/app" element={<ProtectedApp />}>
        <Route index element={<Navigate to="profile" replace />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="profile" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
