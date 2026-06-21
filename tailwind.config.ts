import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        surface: "#0f1117",
        panel: "#161b27",
        border: "#1e2535",
        accent: "#3b82f6",
        green: { DEFAULT: "#22c55e", dim: "#166534" },
        red: { DEFAULT: "#ef4444", dim: "#7f1d1d" },
        muted: "#6b7280",
        label: "#9ca3af",
      },
      fontFamily: {
        mono: ["'JetBrains Mono'", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
