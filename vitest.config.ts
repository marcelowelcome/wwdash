import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
    test: {
        globals: true,
        // Unit tests (lib/) run in node; component tests use jsdom via inline config
        environment: "node",
        setupFiles: [],
    },
    resolve: {
        alias: {
            "@": path.resolve(__dirname, "."),
        },
    },
});
