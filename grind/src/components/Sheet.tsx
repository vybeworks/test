import type { ReactNode } from "react";

export function Sheet({ onClose, children }: { onClose?: () => void; children: ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(13,15,22,0.9)",
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
        zIndex: 50,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="grind-card"
        style={{
          width: "100%",
          maxWidth: 480,
          borderRadius: "24px 24px 0 0",
          padding: "24px 20px 32px",
          animation: "popIn 0.3s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
