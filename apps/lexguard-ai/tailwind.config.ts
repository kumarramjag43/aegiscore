import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
        serif: ["ui-serif", "Georgia", "Cambria", "Times New Roman", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "Liberation Mono", "monospace"],
      },
      keyframes: {
        "pulse-line": { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.35" } },
        "slide-up": { "0%": { opacity: "0", transform: "translateY(6px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
        "ink-in": { "0%": { opacity: "0", transform: "scale(0.985)" }, "100%": { opacity: "1", transform: "scale(1)" } },
      },
      animation: {
        "pulse-line": "pulse-line 1.4s ease-in-out infinite",
        "slide-up": "slide-up 0.25s ease-out both",
        "ink-in": "ink-in 0.3s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;
