import { useState, type CSSProperties, type FormEvent } from "react";
import { useAuth } from "./AuthProvider";

export function AuthScreen() {
  const { signUpWithEmail, signInWithEmail, signInWithGoogle } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    const message =
      mode === "signup"
        ? await signUpWithEmail(email, password, username)
        : await signInWithEmail(email, password);
    setBusy(false);
    if (message) {
      setError(message);
    } else if (mode === "signup") {
      setInfo("Check your email to confirm your account.");
    }
  };

  const google = async () => {
    setError(null);
    const message = await signInWithGoogle();
    if (message) setError(message);
  };

  return (
    <div
      style={{
        minHeight: "100svh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 380,
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: "32px 28px",
        }}
      >
        <div
          className="grind-num"
          style={{
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
            textAlign: "center",
            marginBottom: 4,
          }}
        >
          GRIND
        </div>
        <div style={{ textAlign: "center", color: "var(--muted)", fontSize: 13, marginBottom: 24 }}>
          {mode === "login" ? "Welcome back." : "Start your streak."}
        </div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {mode === "signup" && (
            <input
              placeholder="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={inputStyle}
            />
          )}
          <input
            type="email"
            placeholder="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={inputStyle}
          />
          <input
            type="password"
            placeholder="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            style={inputStyle}
          />

          {error && <div style={{ color: "var(--rose)", fontSize: 12 }}>{error}</div>}
          {info && <div style={{ color: "var(--teal)", fontSize: 12 }}>{info}</div>}

          <button
            type="submit"
            disabled={busy}
            style={{
              marginTop: 6,
              padding: "13px 0",
              borderRadius: 10,
              border: "none",
              fontWeight: 700,
              fontSize: 14,
              cursor: busy ? "default" : "pointer",
              background: "var(--ember)",
              color: "#12141c",
            }}
          >
            {busy ? "..." : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>

        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "18px 0" }}>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          <span style={{ fontSize: 11, color: "var(--muted-2)" }}>or</span>
          <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
        </div>

        <button
          onClick={google}
          type="button"
          style={{
            width: "100%",
            padding: "12px 0",
            borderRadius: 10,
            border: "1px solid var(--border)",
            background: "transparent",
            color: "var(--text)",
            fontWeight: 600,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Continue with Google
        </button>

        <button
          onClick={() => {
            setMode(mode === "login" ? "signup" : "login");
            setError(null);
            setInfo(null);
          }}
          type="button"
          style={{
            width: "100%",
            marginTop: 18,
            background: "none",
            border: "none",
            color: "var(--muted)",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "var(--surface-2)",
  border: "1px solid var(--border)",
  borderRadius: 8,
  padding: "10px 12px",
  color: "var(--text)",
  fontSize: 14,
};
