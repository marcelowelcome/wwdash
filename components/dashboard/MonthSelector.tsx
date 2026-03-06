"use client";

import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { T } from "./theme";
import { MONTHS } from "@/lib/funnel-utils";

interface MonthSelectorProps {
    selectedYear: number;
    selectedMonth: number;
    onChange: (year: number, month: number) => void;
}

export function MonthSelector({ selectedYear, selectedMonth, onChange }: MonthSelectorProps) {
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

    const monthName = MONTHS[selectedMonth - 1];

    return (
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
            <Calendar size={16} color={T.gold} />
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
            <span
                style={{
                    minWidth: 140,
                    textAlign: "center",
                    fontSize: 14,
                    fontWeight: 600,
                    color: T.white,
                }}
            >
                {monthName} {selectedYear}
            </span>
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
        </div>
    );
}
