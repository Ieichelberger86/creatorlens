import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "#0A0A0B",
          elevated: "#111113",
          subtle: "#161618",
        },
        border: {
          DEFAULT: "#1F1F23",
          subtle: "#2A2A2E",
        },
        fg: {
          DEFAULT: "#FAFAFA",
          muted: "#A1A1AA",
          subtle: "#71717A",
        },
        accent: {
          DEFAULT: "#8B5CF6",
          hover: "#7C3AED",
          subtle: "#2E1F4F",
        },
        success: "#84CC16",
        danger: "#EF4444",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "monospace"],
        display: ["var(--font-space-grotesk)", "system-ui", "sans-serif"],
      },
      fontSize: {
        "display-2xl": ["5rem", { lineHeight: "1", letterSpacing: "-0.04em" }],
        "display-xl": ["4rem", { lineHeight: "1.05", letterSpacing: "-0.035em" }],
        "display-lg": ["3rem", { lineHeight: "1.1", letterSpacing: "-0.03em" }],
      },
      animation: {
        "fade-in": "fadeIn 0.6s ease-out",
        "fade-in-up": "fadeInUp 0.6s ease-out",
        "glow": "glow 3s ease-in-out infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        glow: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
