"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { DayPicker, type DateRange } from "react-day-picker";
import { ptBR } from "react-day-picker/locale";
import "react-day-picker/style.css";
import { T } from "./theme";
import { MONTHS } from "@/lib/funnel-utils";

export interface DateRangeValue {
    from: Date;
    to: Date;
}

interface MonthSelectorProps {
    selectedYear: number;
    selectedMonth: number;
    dateRange?: DateRangeValue | null;
    onChange: (year: number, month: number, range?: DateRangeValue | null) => void;
}

export function MonthSelector({ selectedYear, selectedMonth, dateRange, onChange }: MonthSelectorProps) {
    const [pickerOpen, setPickerOpen] = useState(false);
    const [range, setRange] = useState<DateRange | undefined>(
        dateRange ? { from: dateRange.from, to: dateRange.to } : undefined
    );
    const pickerRef = useRef<HTMLDivElement>(null);

    // Sync internal range with prop
    useEffect(() => {
        setRange(dateRange ? { from: dateRange.from, to: dateRange.to } : undefined);
    }, [dateRange]);

    // Close on outside click
    useEffect(() => {
        if (!pickerOpen) return;
        const handler = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setPickerOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [pickerOpen]);

    const handlePrev = () => {
        if (selectedMonth === 1) {
            onChange(selectedYear - 1, 12, null);
        } else {
            onChange(selectedYear, selectedMonth - 1, null);
        }
    };

    const handleNext = () => {
        if (selectedMonth === 12) {
            onChange(selectedYear + 1, 1, null);
        } else {
            onChange(selectedYear, selectedMonth + 1, null);
        }
    };

    const [clickCount, setClickCount] = useState(0);

    const handleRangeSelect = (selected: DateRange | undefined) => {
        setRange(selected);
        const newCount = clickCount + 1;
        setClickCount(newCount);

        // Only close after the second click (range complete)
        if (newCount >= 2 && selected?.from && selected?.to) {
            onChange(
                selected.from.getFullYear(),
                selected.from.getMonth() + 1,
                { from: selected.from, to: selected.to }
            );
            setPickerOpen(false);
            setClickCount(0);
        }
    };

    const handleFullMonth = () => {
        onChange(selectedYear, selectedMonth, null);
        setRange(undefined);
        setPickerOpen(false);
    };

    const handleToday = () => {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        onChange(now.getFullYear(), now.getMonth() + 1, { from: today, to: today });
        setRange({ from: today, to: today });
        setPickerOpen(false);
    };

    const monthName = MONTHS[selectedMonth - 1];
    const now = new Date();

    // Display label
    const fmt = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3)}`;
    let displayLabel: string;
    if (dateRange) {
        const sameDay = dateRange.from.getTime() === dateRange.to.getTime();
        displayLabel = sameDay
            ? `${fmt(dateRange.from)} ${dateRange.from.getFullYear()}`
            : `${fmt(dateRange.from)} - ${fmt(dateRange.to)} ${dateRange.to.getFullYear()}`;
    } else {
        displayLabel = `${monthName} ${selectedYear}`;
    }

    return (
        <div style={{ position: "relative" }} ref={pickerRef}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    background: T.card,
                    border: `1px solid ${T.border}`,
                    borderRadius: 10,
                    padding: "8px 16px",
                }}
            >
                <button
                    onClick={() => { setPickerOpen((v) => !v); setClickCount(0); }}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center" }}
                    title="Selecionar período"
                >
                    <Calendar size={16} color={T.gold} />
                </button>
                <button
                    onClick={handlePrev}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", borderRadius: 4 }}
                >
                    <ChevronLeft size={18} color={T.muted} />
                </button>
                <span style={{ minWidth: 160, textAlign: "center", fontSize: 13, fontWeight: 600, color: T.white, whiteSpace: "nowrap" }}>
                    {displayLabel}
                </span>
                <button
                    onClick={handleNext}
                    style={{ background: "transparent", border: "none", cursor: "pointer", padding: 4, display: "flex", alignItems: "center", borderRadius: 4 }}
                >
                    <ChevronRight size={18} color={T.muted} />
                </button>
            </div>

            {/* Date Range Picker Dropdown */}
            {pickerOpen && (
                <div
                    style={{
                        position: "absolute",
                        top: "calc(100% + 8px)",
                        right: 0,
                        zIndex: 50,
                        background: T.card,
                        border: `1px solid ${T.border}`,
                        borderRadius: 12,
                        padding: 16,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
                    }}
                >
                    <style>{`
                        .rdp-root {
                            --rdp-accent-color: ${T.gold};
                            --rdp-accent-background-color: ${T.gold}30;
                            --rdp-range_middle-background-color: ${T.gold}15;
                            --rdp-range_middle-color: ${T.cream};
                            --rdp-outside-opacity: 0.3;
                            --rdp-day-height: 32px;
                            --rdp-day-width: 32px;
                            font-family: inherit;
                            color: ${T.cream};
                        }
                        .rdp-month_caption { font-size: 13px; font-weight: 700; color: ${T.white}; }
                        .rdp-weekday { font-size: 10px; color: ${T.muted}; font-weight: 600; }
                        .rdp-day button { font-size: 12px; color: ${T.cream}; border-radius: 6px; }
                        .rdp-day button:hover { background: ${T.border}; }
                        .rdp-selected .rdp-day_button { background: ${T.gold}30; color: ${T.gold}; font-weight: 700; }
                        .rdp-today .rdp-day_button { border: 1px solid ${T.gold}; }
                        .rdp-range_middle .rdp-day_button { background: ${T.gold}15; color: ${T.cream}; }
                        .rdp-disabled .rdp-day_button { color: ${T.border}; cursor: default; }
                        .rdp-chevron { fill: ${T.muted}; }
                        .rdp-button_next:hover .rdp-chevron,
                        .rdp-button_previous:hover .rdp-chevron { fill: ${T.cream}; }
                        .rdp-nav { gap: 4px; }
                    `}</style>

                    <DayPicker
                        mode="range"
                        locale={ptBR}
                        selected={range}
                        onSelect={handleRangeSelect}
                        defaultMonth={new Date(selectedYear, selectedMonth - 1)}
                        disabled={{ after: now }}
                        weekStartsOn={0}
                        showOutsideDays
                    />

                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                        <button
                            onClick={handleToday}
                            style={{
                                flex: 1,
                                background: "transparent",
                                border: `1px solid ${T.border}`,
                                borderRadius: 6,
                                padding: "6px 0",
                                fontSize: 11,
                                fontWeight: 600,
                                color: T.gold,
                                cursor: "pointer",
                            }}
                        >
                            Hoje
                        </button>
                        <button
                            onClick={handleFullMonth}
                            style={{
                                flex: 1,
                                background: "transparent",
                                border: `1px solid ${T.border}`,
                                borderRadius: 6,
                                padding: "6px 0",
                                fontSize: 11,
                                fontWeight: 600,
                                color: T.gold,
                                cursor: "pointer",
                            }}
                        >
                            Mês inteiro
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
