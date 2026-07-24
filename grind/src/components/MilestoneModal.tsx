export function MilestoneModal({ days, onClose }: { days: number; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(18,20,28,0.85)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
        cursor: "pointer",
      }}
    >
      <div style={{ textAlign: "center", animation: "popIn 0.4s ease-out" }}>
        <div style={{ position: "relative", display: "inline-block" }}>
          <div
            style={{
              position: "absolute",
              inset: 0,
              border: "2px solid var(--ember-bright)",
              borderRadius: "50%",
              animation: "ringPulse 1.4s ease-out infinite",
            }}
          />
          <div style={{ fontSize: 56, position: "relative" }}>✨</div>
        </div>
        <div className="grind-num" style={{ fontSize: 42, fontWeight: 700, color: "var(--ember-bright)", marginTop: 12 }}>
          {days} DAYS
        </div>
        <div style={{ color: "var(--text)", fontSize: 15, marginTop: 4 }}>badge unlocked · +50 XP</div>
        <div style={{ color: "var(--muted-2)", fontSize: 12, marginTop: 16 }}>tap anywhere to continue</div>
      </div>
    </div>
  );
}
