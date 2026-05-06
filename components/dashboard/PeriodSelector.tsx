"use client";

import { useEffect, useRef, useState } from "react";
import { T } from "./theme";
import {
    PRESET_CATALOG,
    type PeriodPresetId,
    type PeriodSelection,
    resolvePeriod,
} from "@/lib/period-selection";

interface PeriodSelectorProps {
    value: PeriodSelection;
    onChange: (selection: PeriodSelection) => void;
}

/**
 * Trigger button no header + popover GA-style com presets em coluna esquerda
 * e área principal mostrando o range resolvido. Quando o preset é "custom",
 * a área principal vira um par de date inputs.
 */
export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
    const [open, setOpen] = useState(false);
    const [draft, setDraft] = useState<PeriodSelection>(value);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Resync local draft sempre que o valor externo mudar (ou quando reabrir).
    useEffect(() => {
        if (open) setDraft(value);
    }, [open, value]);

    // Close on outside click + Esc.
    useEffect(() => {
        if (!open) return;
        function handleClick(e: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleKey(e: KeyboardEvent) {
            if (e.key === "Escape") setOpen(false);
        }
        document.addEventListener("mousedown", handleClick);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("mousedown", handleClick);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    const resolved = resolvePeriod(value);

    function applyPreset(preset: PeriodPresetId) {
        if (preset === "custom") {
            // Pre-seed custom com o range atualmente resolvido (em BRT).
            const r = resolvePeriod(draft);
            const startBrt = isoToBrt(r.start, "start");
            const endBrt = isoToBrt(r.end, "end");
            const next: PeriodSelection = {
                preset: "custom",
                customStart: startBrt,
                customEnd: endBrt,
            };
            setDraft(next);
            return;
        }
        const next: PeriodSelection = { preset };
        setDraft(next);
        onChange(next);
        setOpen(false);
    }

    function applyCustom() {
        if (!draft.customStart || !draft.customEnd) return;
        if (draft.customEnd < draft.customStart) return;
        onChange(draft);
        setOpen(false);
    }

    const draftResolved = resolvePeriod(draft);

    return (
        <div
            ref={containerRef}
            style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}
        >
            <span style={{ fontSize: 9, color: T.muted, marginRight: 2 }}>Janela:</span>
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="dialog"
                aria-expanded={open}
                style={{
                    background: `${T.gold}20`,
                    color: T.gold,
                    border: `1px solid ${T.gold}55`,
                    borderRadius: 4,
                    padding: "4px 12px",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                {resolved.label}
                <span style={{ fontSize: 8, opacity: 0.7 }}>▾</span>
            </button>

            {open && (
                <div
                    role="dialog"
                    aria-label="Selecionar período"
                    style={{
                        position: "absolute",
                        top: "calc(100% + 6px)",
                        right: 0,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                        display: "flex",
                        zIndex: 1000,
                        minWidth: 460,
                    }}
                >
                    {/* Coluna de presets */}
                    <div
                        style={{
                            borderRight: `1px solid ${T.border}`,
                            padding: 4,
                            minWidth: 180,
                            maxHeight: 400,
                            overflowY: "auto",
                        }}
                    >
                        {PRESET_CATALOG.map((p) => {
                            const isActive = draft.preset === p.id;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => applyPreset(p.id)}
                                    style={{
                                        display: "block",
                                        width: "100%",
                                        textAlign: "left",
                                        padding: "8px 12px",
                                        background: isActive ? `${T.gold}18` : "transparent",
                                        color: isActive ? T.gold : T.cream,
                                        border: "none",
                                        borderRadius: 4,
                                        fontSize: 12,
                                        fontWeight: isActive ? 600 : 400,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                    }}
                                    onMouseEnter={(e) => {
                                        if (!isActive) e.currentTarget.style.background = `${T.gold}10`;
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isActive) e.currentTarget.style.background = "transparent";
                                    }}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Painel direito: preview ou custom inputs */}
                    <div
                        style={{
                            padding: 16,
                            minWidth: 260,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        {draft.preset === "custom" ? (
                            <>
                                <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>
                                    PERÍODO PERSONALIZADO
                                </div>
                                <DateField
                                    label="Início"
                                    value={draft.customStart || ""}
                                    onChange={(v) => setDraft({ ...draft, customStart: v })}
                                />
                                <DateField
                                    label="Fim"
                                    value={draft.customEnd || ""}
                                    onChange={(v) => setDraft({ ...draft, customEnd: v })}
                                />
                                <div style={{ fontSize: 10, color: T.muted, marginTop: 4 }}>
                                    {draft.customStart && draft.customEnd && draft.customEnd >= draft.customStart
                                        ? `${draftResolved.daysBack} dias`
                                        : "Selecione um intervalo válido"}
                                </div>
                                <div style={{ display: "flex", gap: 8, marginTop: "auto" }}>
                                    <button
                                        type="button"
                                        onClick={() => setOpen(false)}
                                        style={btnSecondary}
                                    >
                                        Cancelar
                                    </button>
                                    <button
                                        type="button"
                                        onClick={applyCustom}
                                        disabled={
                                            !draft.customStart ||
                                            !draft.customEnd ||
                                            draft.customEnd < draft.customStart
                                        }
                                        style={btnPrimary}
                                    >
                                        Aplicar
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: 10, color: T.muted, fontWeight: 600 }}>
                                    PERÍODO SELECIONADO
                                </div>
                                <div style={{ fontSize: 14, color: T.cream, fontWeight: 600 }}>
                                    {draftResolved.label}
                                </div>
                                <div style={{ fontSize: 11, color: T.muted, lineHeight: 1.6 }}>
                                    De <strong style={{ color: T.cream }}>{formatBrtForLabel(draftResolved.start)}</strong>
                                    <br />
                                    até <strong style={{ color: T.cream }}>{formatBrtForLabel(draftResolved.end)}</strong>
                                    <br />
                                    <span style={{ opacity: 0.7 }}>{draftResolved.daysBack} dias</span>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

function DateField({
    label,
    value,
    onChange,
}: {
    label: string;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ fontSize: 10, color: T.muted, fontWeight: 500 }}>{label}</span>
            <input
                type="date"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                style={{
                    background: T.bg,
                    color: T.cream,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    padding: "6px 10px",
                    fontSize: 12,
                    fontFamily: "inherit",
                    colorScheme: "dark",
                }}
            />
        </label>
    );
}

const btnSecondary: React.CSSProperties = {
    flex: 1,
    background: "transparent",
    color: T.muted,
    border: `1px solid ${T.border}`,
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
};

const btnPrimary: React.CSSProperties = {
    flex: 1,
    background: T.gold,
    color: T.bg,
    border: "none",
    borderRadius: 4,
    padding: "6px 10px",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
};

// Converte UTC Date → YYYY-MM-DD em BRT (compatível com <input type="date">).
function isoToBrt(utc: Date, kind: "start" | "end"): string {
    // BRT é UTC-3 (sem DST desde 2019). Para "start" (00:00 BRT = 03:00 UTC),
    // o calendar day BRT é a parte de data desse Date em UTC-3.
    const ms = utc.getTime() - 3 * 60 * 60 * 1000; // shift para BRT
    const d = new Date(ms);
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    void kind;
    return `${y}-${m}-${day}`;
}

function formatBrtForLabel(utc: Date): string {
    const brt = isoToBrt(utc, "start");
    const [y, m, d] = brt.split("-");
    return `${d}/${m}/${y}`;
}
