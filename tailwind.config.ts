import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // === Palette Climat & Confort Moreau ===
        primary: {
          DEFAULT: "#2F4A5A",
          50: "#EBF0F3",
          100: "#C3D3DC",
          200: "#9BB6C4",
          300: "#7399AD",
          400: "#4B7C95",
          500: "#2F4A5A",
          600: "#263D4B",
          700: "#1D303B",
          800: "#14222C",
          900: "#0A151C",
        },
        secondary: {
          DEFAULT: "#39D2C0",
          50: "#E8FAF8",
          100: "#BCF1EC",
          200: "#90E8E0",
          300: "#64DED4",
          400: "#39D2C0",
          500: "#2AB5A5",
          600: "#1F8A7D",
          700: "#155E56",
          800: "#0A332E",
          900: "#001007",
        },
        tertiary: {
          DEFAULT: "#EE8B60",
          50: "#FEF3EC",
          100: "#FBD9C5",
          200: "#F8BE9D",
          300: "#F5A376",
          400: "#EE8B60",
          500: "#E87040",
          600: "#D05523",
          700: "#A0401A",
          800: "#702C11",
          900: "#401808",
        },
        alternate: "#E0E3E7",
        "primary-text": "#14181B",
        "secondary-text": "#57636C",
        "primary-bg": "#F1F4F8",
        "secondary-bg": "#FFFFFF",
        success: "#249689",
        warning: "#F9CF58",
        error: "#FF5963",
        info: "#FFFFFF",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "sans-serif"],
        display: ["var(--font-inter-tight)", "sans-serif"],
      },
      boxShadow: {
        card: "0 2px 8px 0 rgba(47,74,90,0.08)",
        "card-hover": "0 6px 20px 0 rgba(47,74,90,0.14)",
        sidebar: "2px 0 16px 0 rgba(47,74,90,0.06)",
      },
      borderRadius: {
        DEFAULT: "8px",
        card: "12px",
        badge: "20px",
      },
      animation: {
        "fade-in": "fadeIn 0.4s ease-out",
        "slide-up": "slideUp 0.4s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
      },
    },
  },
  plugins: [],
};
export default config;
