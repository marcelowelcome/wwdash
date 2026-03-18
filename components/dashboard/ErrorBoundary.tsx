"use client";

import { Component, type ReactNode } from "react";
import { T } from "./theme";

interface Props {
    children: ReactNode;
    /** Label shown in the error fallback (e.g. "Visão Geral") */
    tabLabel?: string;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * Error Boundary for dashboard tabs.
 * Catches render errors in child components and shows a recovery UI
 * instead of crashing the entire dashboard.
 */
export class TabErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, info: React.ErrorInfo) {
        console.error(`[TabErrorBoundary${this.props.tabLabel ? ` — ${this.props.tabLabel}` : ""}]`, error, info.componentStack);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div style={{
                    background: T.card,
                    border: `1px solid ${T.red}33`,
                    borderRadius: 12,
                    padding: "32px 24px",
                    textAlign: "center",
                    margin: "24px 0",
                }}>
                    <div style={{ fontSize: 28, marginBottom: 12 }}>⚠️</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.red, marginBottom: 8 }}>
                        Erro ao renderizar{this.props.tabLabel ? ` "${this.props.tabLabel}"` : ""}
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginBottom: 16, maxWidth: 480, margin: "0 auto 16px" }}>
                        {this.state.error?.message || "Erro desconhecido"}
                    </div>
                    <button
                        onClick={() => this.setState({ hasError: false, error: null })}
                        style={{
                            background: T.berry,
                            border: "none",
                            borderRadius: 8,
                            padding: "8px 20px",
                            color: T.white,
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "inherit",
                            fontWeight: 600,
                        }}
                    >
                        Tentar novamente
                    </button>
                </div>
            );
        }

        return this.props.children;
    }
}
