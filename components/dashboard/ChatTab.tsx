"use client";
import { useState, useRef, useEffect } from "react";
import { T } from "./theme";
import { type ChatMessage } from "@/lib/use-chat";

interface ChatTabProps {
    messages: ChatMessage[];
    sendMessage: (text: string, context: string) => Promise<void>;
    isStreaming: boolean;
    clearHistory: () => void;
    stopStreaming: () => void;
    context: string;
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
    const isUser = msg.role === "user";
    return (
        <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start", marginBottom: 12 }}>
            <div
                style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: isUser ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: isUser ? T.berry : T.card,
                    border: `1px solid ${isUser ? T.berry : T.border}`,
                    color: T.cream,
                    fontSize: 13,
                    lineHeight: 1.6,
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

export function ChatTab({ messages, sendMessage, isStreaming, clearHistory, stopStreaming, context }: ChatTabProps) {
    const [input, setInput] = useState("");
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Auto-scroll on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input on mount
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

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

    return (
        <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 180px)", minHeight: 400 }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                    <h2 style={{ fontSize: 18, fontWeight: 700, color: T.white, margin: 0 }}>
                        Chat com IA
                    </h2>
                    <p style={{ fontSize: 11, color: T.muted, margin: "4px 0 0" }}>
                        Pergunte sobre os dados do dashboard em linguagem natural
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    {isStreaming && (
                        <button
                            onClick={stopStreaming}
                            style={{
                                background: T.red,
                                border: "none",
                                borderRadius: 6,
                                padding: "6px 12px",
                                color: T.white,
                                fontSize: 11,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Parar
                        </button>
                    )}
                    {messages.length > 0 && (
                        <button
                            onClick={clearHistory}
                            style={{
                                background: T.card,
                                border: `1px solid ${T.border}`,
                                borderRadius: 6,
                                padding: "6px 12px",
                                color: T.muted,
                                fontSize: 11,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            Limpar histórico
                        </button>
                    )}
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                style={{
                    flex: 1,
                    overflowY: "auto",
                    background: T.bg,
                    border: `1px solid ${T.border}`,
                    borderRadius: 12,
                    padding: 16,
                    marginBottom: 12,
                }}
            >
                {messages.length === 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12 }}>
                        <div style={{ fontSize: 36, opacity: 0.4 }}>💬</div>
                        <p style={{ color: T.muted, fontSize: 13, textAlign: "center", maxWidth: 360, lineHeight: 1.6 }}>
                            Faça perguntas sobre os dados do dashboard.<br />
                            Ex: "Qual a taxa de conversão atual do closer?" ou "Quais são os principais motivos de perda?"
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => <MessageBubble key={msg.id} msg={msg} />)
                )}
                {isStreaming && messages[messages.length - 1]?.role === "assistant" && messages[messages.length - 1]?.content && (
                    <div style={{ fontSize: 10, color: T.muted, textAlign: "center", marginTop: 4 }}>
                        Gerando resposta…
                    </div>
                )}
            </div>

            {/* Input */}
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Digite sua pergunta…"
                    rows={2}
                    style={{
                        flex: 1,
                        background: T.card,
                        border: `1px solid ${T.border}`,
                        borderRadius: 10,
                        padding: "10px 14px",
                        color: T.cream,
                        fontSize: 13,
                        fontFamily: "inherit",
                        resize: "none",
                        outline: "none",
                        lineHeight: 1.5,
                    }}
                />
                <button
                    onClick={handleSend}
                    disabled={!input.trim() || isStreaming}
                    style={{
                        background: input.trim() && !isStreaming ? T.gold : T.border,
                        border: "none",
                        borderRadius: 10,
                        padding: "10px 20px",
                        color: input.trim() && !isStreaming ? T.bg : T.muted,
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: input.trim() && !isStreaming ? "pointer" : "not-allowed",
                        fontFamily: "inherit",
                        minHeight: 44,
                    }}
                >
                    Enviar
                </button>
            </div>
        </div>
    );
}
