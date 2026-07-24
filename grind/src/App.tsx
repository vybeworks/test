import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthScreen } from "./auth/AuthScreen";
import { HomePage } from "./pages/HomePage";
import { RhythmPage } from "./pages/RhythmPage";
import { PerformanceTrackingPage } from "./pages/PerformanceTrackingPage";
import { ReleaseToolkitPage } from "./pages/ReleaseToolkitPage";

type Screen = "home" | "rhythm" | "track" | "releases";

const TABS: { key: Screen; label: string }[] = [
  { key: "home", label: "Home" },
  { key: "rhythm", label: "Rhythm" },
  { key: "track", label: "Track" },
  { key: "releases", label: "Releases" },
];

function AppShell() {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div style={{ paddingBottom: 64 }}>
      {screen === "home" && <HomePage />}
      {screen === "rhythm" && <RhythmPage />}
      {screen === "track" && <PerformanceTrackingPage />}
      {screen === "releases" && <ReleaseToolkitPage />}

      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          background: "var(--surface)",
          borderTop: "1px solid var(--border)",
          zIndex: 40,
        }}
      >
        <div style={{ width: "100%", maxWidth: 480, display: "flex" }}>
          {TABS.map((tab) => (
            <button key={tab.key} onClick={() => setScreen(tab.key)} style={tabStyle(screen === tab.key)}>
              {tab.label}
            </button>
          ))}
          <button
            onClick={signOut}
            title="Log out"
            aria-label="Log out"
            style={{ ...tabStyle(false), flex: "0 0 auto", padding: "14px 14px", color: "var(--muted-2)", fontSize: 16 }}
          >
            ⏻
          </button>
        </div>
      </div>
    </div>
  );
}

function tabStyle(active: boolean) {
  return {
    flex: 1,
    padding: "14px 0",
    background: "none",
    border: "none",
    borderTop: active ? "2px solid var(--ember)" : "2px solid transparent",
    color: active ? "var(--ember)" : "var(--muted)",
    fontWeight: active ? (700 as const) : (500 as const),
    fontSize: 12,
    cursor: "pointer",
  };
}

function Gate() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100svh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--muted)",
          fontSize: 13,
        }}
      >
        Loading...
      </div>
    );
  }

  return session ? <AppShell /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
