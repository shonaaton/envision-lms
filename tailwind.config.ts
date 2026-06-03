import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#5a1372",
          50: "#f5edf8",
          100: "#e8d4f0",
          200: "#d0a8e1",
          300: "#b27cd2",
          400: "#8a3fae",
          500: "#5a1372",
          600: "#4a0f5e",
          700: "#3a0c4a",
          800: "#2a0936",
          900: "#1a0622",
        },
        accent: {
          DEFAULT: "#fde75a",
          50: "#fffbe5",
          100: "#fef5b8",
          200: "#fdef8b",
          300: "#fdeb6f",
          400: "#fde75a",
          500: "#e8cf2a",
          600: "#b5a01f",
        },
        ink: {
          DEFAULT: "#0a0a0a",
          900: "#0a0a0a",
          800: "#151515",
          700: "#1f1f1f",
          600: "#2a2a2a",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Bangers", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
export default config;
