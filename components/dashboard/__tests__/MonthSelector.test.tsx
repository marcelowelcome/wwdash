// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock lucide-react icons
vi.mock("lucide-react", () => ({
    ChevronLeft: (props: Record<string, unknown>) => <span data-testid="chevron-left" {...props} />,
    ChevronRight: (props: Record<string, unknown>) => <span data-testid="chevron-right" {...props} />,
    Calendar: (props: Record<string, unknown>) => <span data-testid="calendar" {...props} />,
}));

import { MonthSelector } from "../MonthSelector";

describe("MonthSelector", () => {
    it("renders the current month and year", () => {
        render(
            <MonthSelector selectedYear={2026} selectedMonth={3} onChange={() => {}} />
        );
        expect(screen.getByText("Março 2026")).toBeInTheDocument();
    });

    it("renders January correctly", () => {
        render(
            <MonthSelector selectedYear={2025} selectedMonth={1} onChange={() => {}} />
        );
        expect(screen.getByText("Janeiro 2025")).toBeInTheDocument();
    });

    it("renders December correctly", () => {
        render(
            <MonthSelector selectedYear={2025} selectedMonth={12} onChange={() => {}} />
        );
        expect(screen.getByText("Dezembro 2025")).toBeInTheDocument();
    });

    it("calls onChange with previous month on left click", () => {
        const onChange = vi.fn();
        render(
            <MonthSelector selectedYear={2026} selectedMonth={5} onChange={onChange} />
        );

        // The prev button contains the ChevronLeft icon
        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[0]); // first button = prev

        expect(onChange).toHaveBeenCalledWith(2026, 4);
    });

    it("calls onChange with next month on right click", () => {
        const onChange = vi.fn();
        render(
            <MonthSelector selectedYear={2026} selectedMonth={5} onChange={onChange} />
        );

        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[1]); // second button = next

        expect(onChange).toHaveBeenCalledWith(2026, 6);
    });

    it("wraps to previous year when going back from January", () => {
        const onChange = vi.fn();
        render(
            <MonthSelector selectedYear={2026} selectedMonth={1} onChange={onChange} />
        );

        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[0]);

        expect(onChange).toHaveBeenCalledWith(2025, 12);
    });

    it("wraps to next year when going forward from December", () => {
        const onChange = vi.fn();
        render(
            <MonthSelector selectedYear={2025} selectedMonth={12} onChange={onChange} />
        );

        const buttons = screen.getAllByRole("button");
        fireEvent.click(buttons[1]);

        expect(onChange).toHaveBeenCalledWith(2026, 1);
    });

    it("renders navigation buttons", () => {
        render(
            <MonthSelector selectedYear={2026} selectedMonth={6} onChange={() => {}} />
        );
        const buttons = screen.getAllByRole("button");
        expect(buttons).toHaveLength(2);
    });
});
