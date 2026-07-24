import { useState, type FormEvent } from "react";
import { useAuth } from "../auth/AuthProvider";
import { supabase } from "../lib/supabaseClient";

export function HomePage() {
  const { profile, signOut, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [saving, setSaving] = useState(false);

  const saveDisplayName = async (e: FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    await supabase.from("profiles").update({ display_name: displayName }).eq("id", profile.id);
    await refreshProfile();
    setSaving(false);
  };

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "40px 20px" }}>
      <div
        className="grind-num"
        style={{ fontSize: 20, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 700, marginBottom: 24 }}
      >
        GRIND
      </div>

      <div
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: 18,
          padding: 24,
        }}
      >
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>Signed in as</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 20 }}>@{profile?.username ?? "..."}</div>

        <form onSubmit={saveDisplayName} style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <input
            placeholder="display name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            style={{
              flex: 1,
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              padding: "8px 10px",
              color: "var(--text)",
              fontSize: 13,
            }}
          />
          <button
            type="submit"
            disabled={saving}
            style={{
              background: "var(--ember)",
              color: "#12141c",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontWeight: 700,
              cursor: saving ? "default" : "pointer",
              fontSize: 13,
            }}
          >
            Save
          </button>
        </form>

        <div style={{ fontSize: 12, color: "var(--muted-2)" }}>
          Accounts and the database are wired up. Streak tracking and the Weekly Rhythm come next.
        </div>
      </div>

      <button
        onClick={signOut}
        style={{
          marginTop: 20,
          width: "100%",
          background: "none",
          border: "1px solid var(--border)",
          color: "var(--muted)",
          borderRadius: 10,
          padding: "12px 0",
          cursor: "pointer",
          fontSize: 13,
        }}
      >
        Log out
      </button>
    </div>
  );
}
