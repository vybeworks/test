import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { AuthScreen } from "./auth/AuthScreen";
import { HomePage } from "./pages/HomePage";

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

  return session ? <HomePage /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
