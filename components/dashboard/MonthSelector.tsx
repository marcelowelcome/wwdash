"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronLeft, ChevronRight, Calendar, X } from "lucide-react";
import { T } from "./theme";
import { MONTHS } from "@/lib/funnel-utils";

interface MonthSelectorProps {
    selectedYear: number;
    selectedMonth: number;
    onChange: (year: number, month: number) => void;
    onDateRangeChange?: (startDate: Date, endDate: Date) => void;
    dateRange?: { start: Date; end: Date } | null;
}

export function MonthSelector({
    selectedYear,
    selectedMonth,
    onChange,
    onDateRangeChange,
    dateRange,
}: MonthSelectorProps) {
    const [showPicker, setShowPicker] = useState(false);
    const [pickerYear, setPickerYear] = useState(selectedYear);
    const [startDate, setStartDate] = useState<string>("");
    const [endDate, setEndDate] = useState<string>("");
    const pickerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
                setShowPicker(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    const handlePrev = () => {
        if (selectedMonth === 1) {
            onChange(selectedYear - 1, 12);
        } else {
            onChange(selectedYear, selectedMonth - 1);
        }
    };

    const handleNext = () => {
        if (selectedMonth === 12) {
            onChange(selectedYear + 1, 1);
        } else {
            onChange(selectedYear, selectedMonth + 1);
        }
    };

    const handleMonthSelect = (month: number) => {
        onChange(pickerYear, month);
        setShowPicker(false);
    };

    const handleApplyDateRange = () => {
        if (startDate && endDate && onDateRangeChange) {
            onDateRangeChange(new Date(startDate), new Date(endDate));
            setShowPicker(false);
        }
    };

    const handleClearDateRange = () => {
        setStartDate("");
        setEndDate("");
        if (onDateRangeChange) {
            // Signal to clear date range by calling onChange with current month
            onChange(selectedYear, selectedMonth);
        }
    };

    const monthName = MONTHS[selectedMonth - 1];
    const isCustomRange = dateRange !== null && dateRange !== undefined;

    const formatDateRange = () => {
        if (!dateRange) return `${monthName} ${selectedYear}`;
        const start = dateRange.start.toLocaleDateString("pt-BR");
        const end = dateRange.end.toLocaleDateString("pt-BR");
        return `${start} - ${end}`;
    };

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
                    onClick={() => setShowPicker(!showPicker)}
                    style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                    }}
                    title="Selecionar período"
                >
                    <Calendar size={16} color={isCustomRange ? T.green : T.gold} />
                </button>

                {!isCustomRange && (
                    <>
                        <button
                            onClick={handlePrev}
                            style={{
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 4,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                borderRadius: 4,
                            }}
                        >
                            <ChevronLeft size={18} color={T.muted} />
                        </button>
                    </>
                )}

                <span
                    style={{
                        minWidth: isCustomRange ? "auto" : 140,
                        textAlign: "center",
                        fontSize: isCustomRange ? 12 : 14,
                        fontWeight: 600,
                        color: T.white,
                    }}
                >
                    {formatDateRange()}
                </span>

                {!isCustomRange && (
                    <button
                        onClick={handleNext}
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 4,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            borderRadius: 4,
                        }}
                    >
                        <ChevronRight size={18} color={T.muted} />
                    </button>
                )}

                {isCustomRange && (
                    <button
                        onClick={handleClearDateRange}
                        style={{
                            background: "transparent",
                            border: "none",
                            cursor: "pointer",
                            padding: 2,
                            display: "flex",
                            alignItems: "center",
                        }}
                        title="Limpar período"
                    >
                        <X size={14} color={T.muted} />
                    </button>
                )}
            </div>

            {/* Picker Dropdown */}
            {showPicker && (
                <div
                    style={{
                        position: "absolute",
                        top: "100%",
                        right: 0,
                        marginTop: 8,
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 12,
                        padding: 16,
                        zIndex: 100,
                        minWidth: 280,
                        boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    }}
                >
                    {/* Month Grid */}
                    <div style={{ marginBottom: 16 }}>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                marginBottom: 12,
                            }}
                        >
                            <button
                                onClick={() => setPickerYear((y) => y - 1)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 4,
                                }}
                            >
                                <ChevronLeft size={16} color={T.muted} />
                            </button>
                            <span style={{ fontSize: 14, fontWeight: 600, color: T.white }}>
                                {pickerYear}
                            </span>
                            <button
                                onClick={() => setPickerYear((y) => y + 1)}
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    cursor: "pointer",
                                    padding: 4,
                                }}
                            >
                                <ChevronRight size={16} color={T.muted} />
                            </button>
                        </div>

                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gap: 6,
                            }}
                        >
                            {MONTHS.map((m, i) => {
                                const isSelected = pickerYear === selectedYear && i + 1 === selectedMonth && !isCustomRange;
                                return (
                                    <button
                                        key={m}
                                        onClick={() => handleMonthSelect(i + 1)}
                                        style={{
                                            padding: "8px 4px",
                                            fontSize: 11,
                                            fontWeight: 500,
                                            border: "none",
                                            borderRadius: 6,
                                            cursor: "pointer",
                                            background: isSelected ? T.gold : T.card,
                                            color: isSelected ? T.bg : T.white,
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        {m.slice(0, 3)}
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Divider */}
                    <div
                        style={{
                            height: 1,
                            background: T.border,
                            margin: "12px 0",
                        }}
                    />

                    {/* Custom Date Range */}
                    <div>
                        <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>
                            Período personalizado
                        </div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "6px 8px",
                                    fontSize: 11,
                                    background: T.card,
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 6,
                                    color: T.white,
                                    outline: "none",
                                }}
                            />
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                style={{
                                    flex: 1,
                                    padding: "6px 8px",
                                    fontSize: 11,
                                    background: T.card,
                                    border: `1px solid ${T.border}`,
                                    borderRadius: 6,
                                    color: T.white,
                                    outline: "none",
                                }}
                            />
                        </div>
                        <button
                            onClick={handleApplyDateRange}
                            disabled={!startDate || !endDate}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                fontSize: 12,
                                fontWeight: 600,
                                border: "none",
                                borderRadius: 6,
                                cursor: startDate && endDate ? "pointer" : "not-allowed",
                                background: startDate && endDate ? T.gold : T.card,
                                color: startDate && endDate ? T.bg : T.muted,
                                transition: "all 0.15s",
                            }}
                        >
                            Aplicar
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
