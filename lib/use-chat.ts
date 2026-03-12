"use client";
import { useState, useEffect, useCallback, useRef } from "react";

const STORAGE_KEY = "ww-chat-history";
const MAX_STORED_MESSAGES = 50;
const MAX_API_MESSAGES = 10;

export interface ChatMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
}

function loadMessages(): ChatMessage[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return [];
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
    } catch { /* ignore */ }
    return [];
}

function saveMessages(msgs: ChatMessage[]) {
    try {
        const trimmed = msgs.slice(-MAX_STORED_MESSAGES);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch { /* ignore */ }
}

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isStreaming, setIsStreaming] = useState(false);
    const abortRef = useRef<AbortController | null>(null);
    const initializedRef = useRef(false);

    // Load from localStorage on mount
    useEffect(() => {
        if (!initializedRef.current) {
            setMessages(loadMessages());
            initializedRef.current = true;
        }
    }, []);

    // Persist on change
    useEffect(() => {
        if (initializedRef.current) {
            saveMessages(messages);
        }
    }, [messages]);

    const sendMessage = useCallback(async (text: string, context: string) => {
        const userMsg: ChatMessage = {
            id: `u-${Date.now()}`,
            role: "user",
            content: text.trim(),
            timestamp: Date.now(),
        };

        setMessages((prev) => {
            const next = [...prev, userMsg];

            // Start streaming in background
            const apiMessages = next
                .slice(-MAX_API_MESSAGES)
                .map((m) => ({ role: m.role, content: m.content }));

            const controller = new AbortController();
            abortRef.current = controller;
            setIsStreaming(true);

            const assistantId = `a-${Date.now()}`;
            const assistantMsg: ChatMessage = {
                id: assistantId,
                role: "assistant",
                content: "",
                timestamp: Date.now(),
            };

            // Add empty assistant message
            setMessages((p) => [...p, assistantMsg]);

            // Stream response
            (async () => {
                try {
                    const res = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ messages: apiMessages, context }),
                        signal: controller.signal,
                    });

                    if (!res.ok) {
                        const errText = await res.text();
                        setMessages((p) =>
                            p.map((m) =>
                                m.id === assistantId
                                    ? { ...m, content: `Erro: ${res.status} — ${errText}` }
                                    : m
                            )
                        );
                        setIsStreaming(false);
                        return;
                    }

                    const reader = res.body?.getReader();
                    if (!reader) {
                        setIsStreaming(false);
                        return;
                    }

                    const decoder = new TextDecoder();
                    let buffer = "";

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split("\n");
                        buffer = lines.pop() || "";

                        for (const line of lines) {
                            if (!line.startsWith("data: ")) continue;
                            const payload = line.slice(6).trim();
                            if (payload === "[DONE]") continue;

                            try {
                                const parsed = JSON.parse(payload);
                                if (parsed.text) {
                                    setMessages((p) =>
                                        p.map((m) =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + parsed.text }
                                                : m
                                        )
                                    );
                                }
                                if (parsed.error) {
                                    setMessages((p) =>
                                        p.map((m) =>
                                            m.id === assistantId
                                                ? { ...m, content: m.content + `\n\nErro: ${parsed.error}` }
                                                : m
                                        )
                                    );
                                }
                            } catch { /* skip malformed */ }
                        }
                    }
                } catch (err) {
                    if ((err as Error).name !== "AbortError") {
                        setMessages((p) =>
                            p.map((m) =>
                                m.id === assistantId
                                    ? { ...m, content: `Erro de conexão: ${String(err)}` }
                                    : m
                            )
                        );
                    }
                } finally {
                    setIsStreaming(false);
                }
            })();

            return next;
        });
    }, []);

    const clearHistory = useCallback(() => {
        abortRef.current?.abort();
        setMessages([]);
        setIsStreaming(false);
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }, []);

    const stopStreaming = useCallback(() => {
        abortRef.current?.abort();
        setIsStreaming(false);
    }, []);

    return { messages, sendMessage, isStreaming, clearHistory, stopStreaming };
}
