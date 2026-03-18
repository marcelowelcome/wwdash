// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

// Mock MetricHelper
vi.mock("../MetricHelper", () => ({
    MetricHelper: ({ metricKey }: { metricKey: string }) => (
        <span data-testid="metric-helper">{metricKey}</span>
    ),
}));

import { SectionTitle } from "../SectionTitle";

describe("SectionTitle", () => {
    it("renders children text", () => {
        render(<SectionTitle>Resumo Mensal</SectionTitle>);
        expect(screen.getByText("Resumo Mensal")).toBeInTheDocument();
    });

    it("renders a tag when provided", () => {
        render(<SectionTitle tag="OK">Pipeline</SectionTitle>);
        expect(screen.getByText("OK")).toBeInTheDocument();
    });

    it("does not render a tag when not provided", () => {
        render(<SectionTitle>Pipeline</SectionTitle>);
        // Only the title text should appear, no extra span for tag
        expect(screen.queryByText("OK")).not.toBeInTheDocument();
    });

    it("renders MetricHelper when metricKey is provided", () => {
        render(<SectionTitle metricKey="pipeline_total">Pipeline</SectionTitle>);
        expect(screen.getByTestId("metric-helper")).toHaveTextContent("pipeline_total");
    });

    it("does not render MetricHelper when metricKey is absent", () => {
        render(<SectionTitle>Pipeline</SectionTitle>);
        expect(screen.queryByTestId("metric-helper")).not.toBeInTheDocument();
    });

    it("applies red background to tags containing 'CRITICO'", () => {
        render(<SectionTitle tag="CRÍTICO">Test</SectionTitle>);
        const tag = screen.getByText("CRÍTICO");
        // T.red = #E05252
        expect(tag.style.background).toBe("rgb(224, 82, 82)");
    });

    it("applies orange background to tags containing 'ATENCAO'", () => {
        render(<SectionTitle tag="ATENÇÃO">Test</SectionTitle>);
        const tag = screen.getByText("ATENÇÃO");
        // T.orange = #E08C3A
        expect(tag.style.background).toBe("rgb(224, 140, 58)");
    });

    it("applies green background to other tags", () => {
        render(<SectionTitle tag="BOM">Test</SectionTitle>);
        const tag = screen.getByText("BOM");
        // T.green = #3DBF8A
        expect(tag.style.background).toBe("rgb(61, 191, 138)");
    });
});
