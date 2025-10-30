import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./app.css";
import { installNostrShim } from "@/lib/nostrShim";
import { useAuth } from "@/state/useAuth";
import { useRelays } from "@/state/useRelays";
import { initializeChamberFromUrl } from "@/state/useChamber";

installNostrShim({
  async getPublicKey() {
    const state = useAuth.getState();
    if (!state.pubkey) {
      await state.initialize();
    }
    const fresh = useAuth.getState();
    if (!fresh.pubkey) {
      throw new Error("Public key unavailable");
    }
    return fresh.pubkey;
  },
  async signEvent(event) {
    const state = useAuth.getState();
    if (state.status === "idle" || state.status === "error") {
      await state.initialize();
    }
    return state.signEvent(event);
  },
  async getRelays() {
    const snapshot = useRelays.getState();
    return Object.fromEntries(snapshot.relays.map((relay) => [relay, { read: true, write: true }]));
  }
});

void useAuth.getState().initialize();
initializeChamberFromUrl();

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

const root = createRoot(container);

root.render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);
