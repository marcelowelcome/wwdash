"use client";

import { useEffect, useState } from "react";

/**
 * Reports whether the user has requested reduced motion at the OS level.
 * Use to disable JS-driven animations (e.g. Recharts `isAnimationActive`)
 * that CSS `prefers-reduced-motion` cannot reach.
 */
export function useReducedMotion(): boolean {
    const [reduced, setReduced] = useState(false);

    useEffect(() => {
        if (typeof window === "undefined" || !window.matchMedia) return;
        const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
        setReduced(mq.matches);
        const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
        // Safari only supports addListener (deprecated); feature-detect:
        if (mq.addEventListener) {
            mq.addEventListener("change", handler);
            return () => mq.removeEventListener("change", handler);
        }
        mq.addListener(handler);
        return () => mq.removeListener(handler);
    }, []);

    return reduced;
}
