/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Warm parchment background, ink-on-paper feel (FT / institutional)
        bg: "#f5f3ec",
        panel: "#ffffff",
        panel2: "#efece3",
        line: "#dcd8cc",
        rule: "#0a1628",
        // Deep navy ink — primary text and brand
        fg: "#0a1628",
        ink: "#0a1628",
        dim: "#4b5563",
        muted: "#6b6f76",
        // Muted gold for data highlights (restrained, not flashy)
        accent: "#9a6f1f",
        accent2: "#1a3d6b",
        positive: "#1a5f3f",
        danger: "#9b1c1c",
      },
      fontFamily: {
        head: ["Geist", "system-ui", "sans-serif"],
        mono: ["Geist Mono", "ui-monospace", "monospace"],
        body: ["Geist", "system-ui", "sans-serif"],
        serif: ["Instrument Serif", "Georgia", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
      },
    },
  },
  plugins: [],
};
