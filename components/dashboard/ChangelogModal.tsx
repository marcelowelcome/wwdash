"use client";
import { T } from "./theme";
import { VERSION_HISTORY } from "@/lib/versions";

interface ChangelogModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function ChangelogModal({ isOpen, onClose }: ChangelogModalProps) {
    if (!isOpen) return null;

    return (
        <div style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            background: "rgba(0,0,0,0.7)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px"
        }} onClick={onClose}>
            <div
                style={{
                    background: T.surface,
                    border: `1px solid ${T.border}`,
                    borderRadius: 16,
                    width: "100%",
                    maxWidth: 600,
                    maxHeight: "80vh",
                    overflow: "hidden",
                    display: "flex",
                    flexDirection: "column",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.5)"
                }}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    padding: "20px 24px",
                    borderBottom: `1px solid ${T.border}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: T.card
                }}>
                    <div>
                        <h2 style={{ fontSize: 18, fontWeight: 800, color: T.white, margin: 0 }}>Histórico de Versões</h2>
                        <p style={{ fontSize: 12, color: T.muted, margin: "4px 0 0 0" }}>Update logs and project evolution</p>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: T.muted,
                            fontSize: 24,
                            cursor: "pointer",
                            padding: "4px"
                        }}
                    >
                        ×
                    </button>
                </div>

                {/* Content */}
                <div style={{
                    padding: "24px",
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: 32
                }}>
                    {VERSION_HISTORY.map((v, idx) => (
                        <div key={v.version} style={{ position: "relative" }}>
                            {/* Timeline line */}
                            {idx !== VERSION_HISTORY.length - 1 && (
                                <div style={{
                                    position: "absolute",
                                    left: 7,
                                    top: 24,
                                    bottom: -40,
                                    width: 1,
                                    background: T.border
                                }} />
                            )}

                            <div style={{ display: "flex", gap: 16 }}>
                                {/* Version circle */}
                                <div style={{
                                    width: 16,
                                    height: 16,
                                    borderRadius: "50%",
                                    background: idx === 0 ? T.gold : T.berry,
                                    border: `4px solid ${T.surface}`,
                                    zIndex: 1,
                                    marginTop: 4,
                                    boxShadow: idx === 0 ? `0 0 10px ${T.gold}44` : 'none'
                                }} />

                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                        <div style={{ fontSize: 14, fontWeight: 800, color: T.white }}>
                                            v{v.version}
                                            {idx === 0 && (
                                                <span style={{
                                                    fontSize: 10,
                                                    background: T.gold,
                                                    color: T.bg,
                                                    padding: "2px 6px",
                                                    borderRadius: 4,
                                                    marginLeft: 8,
                                                    fontWeight: 900
                                                }}>LATEST</span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: 11, color: T.muted }}>{v.date}</div>
                                    </div>

                                    <div style={{ fontSize: 13, color: T.rose, fontWeight: 600, marginBottom: 12 }}>
                                        {v.description}
                                    </div>

                                    <ul style={{
                                        margin: 0,
                                        paddingLeft: 18,
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 6
                                    }}>
                                        {v.changes.map((change, cIdx) => (
                                            <li key={cIdx} style={{ fontSize: 12, color: T.cream, lineHeight: 1.5 }}>
                                                {change}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div style={{
                    padding: "16px 24px",
                    borderTop: `1px solid ${T.border}`,
                    background: T.card,
                    textAlign: "right"
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: T.berry,
                            border: "none",
                            borderRadius: 8,
                            padding: "8px 20px",
                            color: T.white,
                            fontSize: 12,
                            fontWeight: 700,
                            cursor: "pointer"
                        }}
                    >
                        Entendido
                    </button>
                </div>
            </div>
        </div>
    );
}
