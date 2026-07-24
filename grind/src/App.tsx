import { useState } from "react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthScreen } from "./auth/AuthScreen";
import { HomePage } from "./pages/HomePage";
import { RhythmPage } from "./pages/RhythmPage";

type Screen = "home" | "rhythm";

function AppShell() {
  const { signOut } = useAuth();
  const [screen, setScreen] = useState<Screen>("home");

  return (
    <div style={{ paddingBottom: 64 }}>
      {screen === "home" ? <HomePage /> : <RhythmPage />}

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
          <button onClick={() => setScreen("home")} style={tabStyle(screen === "home")}>
            Home
          </button>
          <button onClick={() => setScreen("rhythm")} style={tabStyle(screen === "rhythm")}>
            Rhythm
          </button>
          <button onClick={signOut} style={{ ...tabStyle(false), flex: "0 0 auto", padding: "14px 16px", color: "var(--muted-2)" }}>
            Log out
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
    fontSize: 13,
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
