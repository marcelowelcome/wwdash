// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { TabErrorBoundary } from "../ErrorBoundary";

// Suppress console.error for error boundary tests
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
    consoleErrorSpy.mockRestore();
});

function ThrowError({ message = "test error" }: { message?: string }) {
    throw new Error(message);
    return null;
}

function GoodChild() {
    return <div>child content</div>;
}

describe("TabErrorBoundary", () => {
    it("renders children when no error occurs", () => {
        render(
            <TabErrorBoundary>
                <GoodChild />
            </TabErrorBoundary>
        );
        expect(screen.getByText("child content")).toBeInTheDocument();
    });

    it("shows fallback UI when a child throws", () => {
        render(
            <TabErrorBoundary>
                <ThrowError />
            </TabErrorBoundary>
        );
        expect(screen.getByText("test error")).toBeInTheDocument();
        expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    });

    it("shows the tab label in the error message", () => {
        render(
            <TabErrorBoundary tabLabel="Visão Geral">
                <ThrowError />
            </TabErrorBoundary>
        );
        expect(
            screen.getByText(/Erro ao renderizar "Visão Geral"/)
        ).toBeInTheDocument();
    });

    it("shows generic message when no tabLabel is provided", () => {
        render(
            <TabErrorBoundary>
                <ThrowError />
            </TabErrorBoundary>
        );
        expect(screen.getByText("Erro ao renderizar")).toBeInTheDocument();
    });

    it("resets the boundary when 'Tentar novamente' is clicked", () => {
        let shouldThrow = true;

        function MaybeThrow() {
            if (shouldThrow) {
                throw new Error("conditional error");
            }
            return <div>recovered</div>;
        }

        render(
            <TabErrorBoundary>
                <MaybeThrow />
            </TabErrorBoundary>
        );

        expect(screen.getByText("conditional error")).toBeInTheDocument();

        // Fix the child before clicking retry
        shouldThrow = false;

        fireEvent.click(screen.getByText("Tentar novamente"));

        expect(screen.getByText("recovered")).toBeInTheDocument();
        expect(screen.queryByText("Tentar novamente")).not.toBeInTheDocument();
    });

    it("displays the error message from the thrown error", () => {
        render(
            <TabErrorBoundary>
                <ThrowError message="Something went wrong" />
            </TabErrorBoundary>
        );
        expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    });
});
