"use client";
import { useState, useRef, useEffect } from "react";
import { T } from "./theme";
import { type ChatMessage } from "@/lib/use-chat";

interface ChatPopupProps {
    messages: ChatMessage[];
    sendMessage: (text: string, context: string) => Promise<void>;
    isStreaming: boolean;
    clearHistory: () => void;
    stopStreaming: () => void;
    context: string;
    currentTab: string;
    onOpenFullChat: () => void;
}

function PopupMessage({ msg }: { msg: ChatMessage }) {
    const isUser = msg.role === "user";
    return (
        <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 8 }}>
            <div
                style={{
                    maxWidth: "85%",
                    padding: "8px 11px",
                    borderRadius: isUser ? "10px 10px 3px 10px" : "10px 10px 10px 3px",
                    background: isUser ? T.berry : T.card,
                    border: `1px solid ${isUser ? T.berry : T.border}`,
                    color: T.cream,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                }}
            >
                {msg.content || (
                    <span style={{ color: T.muted, fontStyle: "italic" }}>Pensando…</span>
                )}
            </div>
        </div>
    );
}

export function ChatPopup({ messages, sendMessage, isStreaming, clearHistory, stopStreaming, context, currentTab, onOpenFullChat }: ChatPopupProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll
    useEffect(() => {
        if (isOpen && scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, isOpen]);

    // Focus on open
    useEffect(() => {
        if (isOpen) inputRef.current?.focus();
    }, [isOpen]);

    const handleSend = () => {
        const text = input.trim();
        if (!text || isStreaming) return;
        setInput("");
        sendMessage(text, context);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const TAB_LABELS: Record<string, string> = {
        overview: "Visão Geral",
        "funnel-metas": "Funil",
        sdr: "SDR",
        closer: "Closer",
        pipeline: "Pipeline",
        contratos: "Contratos",
        "perfil-score": "Perfil & Score",
        dictionary: "Dicionário",
    };

    // Floating button
    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                title="Chat com IA"
                style={{
                    position: "fixed",
                    bottom: 24,
                    right: 24,
                    width: 52,
                    height: 52,
                    borderRadius: "50%",
                    background: T.gold,
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 22,
                    boxShadow: `0 4px 20px ${T.gold}44`,
                    zIndex: 9999,
                    transition: "transform 0.15s",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
                onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
            >
                💬
            </button>
        );
    }

    // Chat panel
    return (
        <div
            style={{
                position: "fixed",
                bottom: 24,
                right: 24,
                width: 400,
                height: 520,
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: 16,
                display: "flex",
                flexDirection: "column",
                zIndex: 9999,
                boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
                overflow: "hidden",
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderBottom: `1px solid ${T.border}`,
                    background: T.card,
                }}
            >
                <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.white }}>Chat IA</div>
                    <div style={{ fontSize: 9, color: T.muted }}>
                        Contexto: {TAB_LABELS[currentTab] || currentTab}
                    </div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                        onClick={onOpenFullChat}
                        title="Abrir aba completa"
                        style={{
                            background: "transparent",
                            border: `1px solid ${T.border}`,
                            borderRadius: 4,
                            padding: "3px 8px",
                            color: T.gold,
                            fontSize: 9,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        Expandir ↗
                    </button>
                    <button
                        onClick={() => setIsOpen(false)}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: T.muted,
                            fontSize: 16,
                            cursor: "pointer",
                            padding: "0 4px",
                            lineHeight: 1,
                        }}
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: 12,
                }}
            >
                {messages.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 8 }}>
                        <div style={{ fontSize: 28, opacity: 0.4 }}>💬</div>
                        <p style={{ color: T.muted, fontSize: 11, textAlign: "center", lineHeight: 1.5, maxWidth: 280 }}>
                            Pergunte sobre os dados da aba {TAB_LABELS[currentTab] || "atual"}.
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => <PopupMessage key={msg.id} msg={msg} />)
                )}
                {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content && (
                    <div style={{ fontSize: 9, color: T.muted, textAlign: "center", marginTop: 2 }}>
                        Gerando…
                    </div>
                )}
            </div>

            {/* Actions bar */}
            {(isStreaming || messages.length > 0) && (
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0 12px 4px", gap: 6 }}>
                    {isStreaming && (
                        <button
                            onClick={stopStreaming}
                            style={{ background: "transparent", border: "none", color: T.red, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}
                        >
                            Parar
                        </button>
                    )}
                    {messages.length > 0 && !isStreaming && (
                        <button
                            onClick={clearHistory}
                            style={{ background: "transparent", border: "none", color: T.muted, fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}
                        >
                            Limpar
                        </button>
                    )}
                </div>
            )}

            {/* Input */}
            <div style={{ display: "flex", gap: 6, padding: "8px 12px 12px", borderTop: `1px solid ${T.border}` }}>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Sua pergunta…"
                    rows={1}
                    style={{
                        flex: 1,
                        background: T.bg,
                        border: `1px solid ${T.border}`,
                        borderRadius: 8,
                        padding: "8px 10px",
                        color: T.cream,
                        fontSize: 12,
                        fontFamily: "inherit",
                        resize: "none",
                        outline: "none",
                        lineHeight: 1.4,
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    style={{
                        background: input.trim() && !isStreaming ? T.gold : T.border,
                        border: "none",
                        borderRadius: 8,
                        padding: "8px 14px",
                        color: input.trim() && !isStreaming ? T.bg : T.muted,
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
                        fontFamily: "inherit",
                    }}
                >
                    ↑
                </button>
            </div>
        </div>
    );
}
