// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock MetricHelper to avoid pulling in metrics-definitions
vi.mock("../MetricHelper", () => ({
    MetricHelper: ({ metricKey }: { metricKey: string }) => (
        <span data-testid="metric-helper">{metricKey}</span>
    ),
}));

import { KpiCard } from "../KpiCard";

describe("KpiCard", () => {
    it("renders label and value", () => {
        render(<KpiCard label="Taxa de Conversão" value="42%" status="green" />);
        expect(screen.getByText("Taxa de Conversão")).toBeInTheDocument();
        expect(screen.getByText("42%")).toBeInTheDocument();
    });

    it("renders numeric value", () => {
        render(<KpiCard label="Leads" value={150} status="orange" />);
        expect(screen.getByText("150")).toBeInTheDocument();
    });

    it("renders sub text when provided", () => {
        render(
            <KpiCard label="Receita" value="R$ 100k" status="green" sub="vs. R$ 80k mês anterior" />
        );
        expect(screen.getByText("vs. R$ 80k mês anterior")).toBeInTheDocument();
    });

    it("does not render sub text when not provided", () => {
        const { container } = render(
            <KpiCard label="Leads" value={10} status="red" />
        );
        // The sub div should not exist — only label, value, and status icon divs
        const texts = container.querySelectorAll("div");
        const textContents = Array.from(texts).map((el) => el.textContent);
        expect(textContents.join("")).not.toContain("undefined");
    });

    it("renders delta when provided", () => {
        render(
            <KpiCard label="Ticket" value="R$ 50k" status="green" delta="+12% vs. mês anterior" />
        );
        expect(screen.getByText("+12% vs. mês anterior")).toBeInTheDocument();
    });

    it("does not render delta when not provided", () => {
        render(<KpiCard label="Ticket" value="R$ 50k" status="green" />);
        expect(screen.queryByText(/vs\./)).not.toBeInTheDocument();
    });

    it("renders MetricHelper when metricKey is provided", () => {
        render(
            <KpiCard label="Conversão" value="30%" status="green" metricKey="conv_rate" />
        );
        expect(screen.getByTestId("metric-helper")).toBeInTheDocument();
        expect(screen.getByTestId("metric-helper")).toHaveTextContent("conv_rate");
    });

    it("does not render MetricHelper when metricKey is absent", () => {
        render(<KpiCard label="Leads" value={10} status="red" />);
        expect(screen.queryByTestId("metric-helper")).not.toBeInTheDocument();
    });

    it("renders status icon for each status type", () => {
        // green -> ●, orange -> ◐, red -> ○
        const { rerender } = render(
            <KpiCard label="Test" value="1" status="green" />
        );
        expect(screen.getByText("●")).toBeInTheDocument();

        rerender(<KpiCard label="Test" value="1" status="orange" />);
        expect(screen.getByText("◐")).toBeInTheDocument();

        rerender(<KpiCard label="Test" value="1" status="red" />);
        expect(screen.getByText("○")).toBeInTheDocument();
    });
});
