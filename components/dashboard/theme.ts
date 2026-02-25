import { type Status } from "@/lib/schemas";

// ─── PALETTE ───────────────────────────────────────────────────────────────────
export const T = {
    bg: "#0E0A14",
    surface: "#17101F",
    card: "#1E1530",
    border: "#2E2040",
    berry: "#7B2D52",
    rose: "#C2758A",
    gold: "#D4A35A",
    cream: "#F5EDE0",
    muted: "#6B5C7A",
    red: "#E05252",
    orange: "#E08C3A",
    green: "#3DBF8A",
    white: "#F8F4FF",
};

export const statusColor = (s: Status | string): string =>
    ({ green: T.green, orange: T.orange, red: T.red }[s] ?? T.muted);

export const statusIcon = (s: Status | string): string =>
    ({ green: "●", orange: "◐", red: "○" }[s] ?? "○");
