"use client";

import { useEffect, useRef } from "react";

/**
 * Shared dialog/modal accessibility hook:
 * - Closes on Escape
 * - Locks body scroll while open
 * - Traps Tab focus within the dialog
 * - Returns focus to the previously active element on close
 *
 * Usage: attach the returned ref to the dialog container.
 */
export function useDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const containerRef = useRef<HTMLDivElement>(null);
    const previouslyFocused = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        previouslyFocused.current = document.activeElement as HTMLElement | null;
        const body = document.body;
        const previousOverflow = body.style.overflow;
        body.style.overflow = "hidden";

        const focusableSelector = [
            "a[href]",
            "button:not([disabled])",
            "textarea:not([disabled])",
            "input:not([disabled])",
            "select:not([disabled])",
            "[tabindex]:not([tabindex='-1'])",
        ].join(",");

        const getFocusable = (): HTMLElement[] => {
            if (!containerRef.current) return [];
            return Array.from(
                containerRef.current.querySelectorAll<HTMLElement>(focusableSelector),
            ).filter((el) => !el.hasAttribute("aria-hidden"));
        };

        // Move focus inside the dialog when it opens
        const raf = requestAnimationFrame(() => {
            const focusables = getFocusable();
            if (focusables.length > 0) {
                focusables[0].focus();
            } else if (containerRef.current) {
                containerRef.current.focus();
            }
        });

        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
                return;
            }
            if (e.key !== "Tab") return;
            const focusables = getFocusable();
            if (focusables.length === 0) {
                e.preventDefault();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && active === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", handleKey);

        return () => {
            cancelAnimationFrame(raf);
            document.removeEventListener("keydown", handleKey);
            body.style.overflow = previousOverflow;
            // Restore focus to the trigger
            if (previouslyFocused.current && document.contains(previouslyFocused.current)) {
                previouslyFocused.current.focus();
            }
        };
    }, [isOpen, onClose]);

    return containerRef;
}
