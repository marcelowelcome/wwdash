import type { Config } from "tailwindcss";

const config: Config = {
    content: [
        "./pages/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    theme: {
        extend: {
            colors: {
                bg: "#0E0A14",
                surface: "#17101F",
                card: "#1E1530",
                border: "#2E2040",
                berry: "#7B2D52",
                rose: "#C2758A",
                gold: "#D4A35A",
                cream: "#F5EDE0",
                muted: "#6B5C7A",
                "status-red": "#E05252",
                "status-orange": "#E08C3A",
                "status-green": "#3DBF8A",
                "off-white": "#F8F4FF",
            },
            fontFamily: {
                sans: ["'Trebuchet MS'", "'Lucida Grande'", "sans-serif"],
                serif: ["Georgia", "serif"],
            },
        },
    },
    plugins: [],
};

export default config;
