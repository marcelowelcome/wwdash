"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error("[GlobalError]", error);
    }, [error]);

    return (
        <div style={{ background: "#0E0A14", minHeight: "100vh", color: "#F8F4FF", fontFamily: "'Trebuchet MS', sans-serif", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
            <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: 18, marginBottom: 8 }}>Erro no Dashboard</h2>
            <p style={{ fontSize: 13, color: "#6B5C7A", marginBottom: 16, maxWidth: 480, textAlign: "center" }}>
                {error.message || "Erro desconhecido"}
            </p>
            {error.digest && (
                <p style={{ fontSize: 10, color: "#2E2040", marginBottom: 16 }}>Digest: {error.digest}</p>
            )}
            <button
                onClick={reset}
                style={{ background: "#7B2D52", border: "none", borderRadius: 8, padding: "10px 24px", color: "#F8F4FF", fontSize: 13, cursor: "pointer" }}
            >
                Tentar novamente
            </button>
        </div>
    );
}
