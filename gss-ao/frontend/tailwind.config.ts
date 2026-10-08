import type { Config } from "tailwindcss";

/**
 * Thème « Marine & signal » : toutes les couleurs passent par des CSS variables (HSL)
 * définies dans app/globals.css pour `:root` (clair) et `.dark` (sombre, non activé).
 * Activer le mode sombre plus tard = ajouter la classe `dark` sur <html>.
 * Marine (`primary`) pour la structure ; orange `signal` pour ce qui doit attirer l'œil.
 */
const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: { center: true, padding: "2rem", screens: { "2xl": "1400px" } },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        signal: {
          DEFAULT: "hsl(var(--signal))",
          texte: "hsl(var(--signal-texte))",
          soft: "hsl(var(--signal-soft))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        subtle: {
          foreground: "hsl(var(--subtle-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          muted: "hsl(var(--sidebar-muted))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "12px",
        "2xl": "16px",
      },
      fontFamily: {
        sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "sans-serif"],
        display: ["IBM Plex Sans Condensed", "Arial Narrow", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        o1: "0 1px 2px rgba(16,32,58,.06), 0 1px 1px rgba(16,32,58,.04)",
        o2: "0 10px 28px -10px rgba(16,32,58,.22), 0 2px 5px rgba(16,32,58,.05)",
        o3: "0 24px 60px -20px rgba(10,20,40,.35)",
        halo: "0 0 0 3px rgba(11,37,69,.14)",
        enfonce: "inset 0 1px 2px rgba(16,32,58,.18)",
      },
      transitionTimingFunction: {
        doux: "cubic-bezier(.2,.7,.2,1)",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-up": {
          "0%": { transform: "translateY(100%)" },
          "100%": { transform: "translateY(0)" },
        },
        monter: {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "none" },
        },
        apparaitre: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "glisser-gauche": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "none" },
        },
        "glisser-droite": {
          from: { opacity: "0", transform: "translateX(-24px)" },
          to: { opacity: "1", transform: "none" },
        },
        "zoom-doux": {
          from: { opacity: "0", transform: "translateY(8px) scale(.97)" },
          to: { opacity: "1", transform: "none" },
        },
        remplir: {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        "remplir-hauteur": {
          from: { transform: "scaleY(0)" },
          to: { transform: "scaleY(1)" },
        },
        tracer: {
          to: { strokeDashoffset: "0" },
        },
        "pulse-signal": {
          "0%": { boxShadow: "0 0 0 0 rgba(241,90,34,.5)" },
          "70%": { boxShadow: "0 0 0 8px rgba(241,90,34,0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(241,90,34,0)" },
        },
        miroiter: {
          from: { transform: "translateX(-100%)" },
          to: { transform: "translateX(100%)" },
        },
        flotte: {
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both",
        "slide-up": "slide-up 0.8s cubic-bezier(0.16, 1, 0.3, 1) both",
        monter: "monter .45s cubic-bezier(.2,.7,.2,1) both",
        apparaitre: "apparaitre .3s cubic-bezier(.2,.7,.2,1) both",
        "glisser-gauche": "glisser-gauche .28s cubic-bezier(.2,.7,.2,1) both",
        "glisser-droite": "glisser-droite .28s cubic-bezier(.2,.7,.2,1) both",
        "zoom-doux": "zoom-doux .25s cubic-bezier(.2,.7,.2,1) both",
        remplir: "remplir 1.1s cubic-bezier(.2,.7,.2,1) both",
        "remplir-hauteur": "remplir-hauteur .6s cubic-bezier(.2,.7,.2,1) both",
        tracer: "tracer .6s cubic-bezier(.2,.7,.2,1) forwards",
        "pulse-signal": "pulse-signal 1.8s infinite",
        miroiter: "miroiter 1.4s ease-in-out infinite",
        flotte: "flotte 3s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
