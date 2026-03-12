/** @type {import('tailwindcss').Config} */

module.exports = {
  // NOTE: Update this to include the paths to all files that contain Nativewind classes.
  darkMode: "class",
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./App.tsx",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],

  presets: [require("nativewind/preset")],

  theme: {
    extend: {
      spacing: {
        xs: "8px",
        sm: "16px",
        md: "24px",
        lg: "32px",
        xl: "40px",
        xxl: "48px",
      },

      /*
      Font size mapping:

      h1      -> 32px -> Tailwind default: text-3xl
      h2      -> 24px -> Tailwind default: text-2xl
      h3      -> 18px -> Tailwind default: text-lg
      body    -> 14px -> Tailwind default: text-sm
      caption -> 12px -> Tailwind default: text-xs
      */
      fontSize: {
        xxs: "0.625rem",
        h1: ["32px", { fontWeight: "700" }],
        h2: ["24px", { fontWeight: "600" }],
        h3: ["18px", { fontWeight: "500" }],
        body: ["14px", { fontWeight: "400" }],
        caption: ["12px", { fontWeight: "300" }],
      },
      fontFamily: {
        spaceMono: [
          "SpaceMono-Regular",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        drukWide: ["DrukWide-Medium", "Inter_600SemiBold", "sans-serif"],
        inter: ["Inter_400Regular"],
        interMedium: ["Inter_500Medium"],
        interSemiBold: ["Inter_600SemiBold"],
        interBold: ["Inter_700Bold"],
      },

      colors: {
        /**
         * Grey Scale Values (Black to White)
         * HSL stands for Hue Saturation Lightness
         */
        hsl5: "hsl(0, 0% 5%)",
        hsl10: "hsl(0, 0%, 10%)",
        hsl13: "hsl(0, 0%, 13%)",
        hsl15: "hsl(0, 0%, 15%)",
        hsl20: "hsl(0, 0%, 20%)",
        hsl25: "hsl(0, 0%, 25%)",
        hsl30: "hsl(0, 0%, 30%)",
        hsl40: "hsl(0, 0%, 40%)",
        hsl50: "hsl(0, 0%, 50%)",
        hsl60: "hsl(0, 0%, 60%)",
        hsl70: "hsl(0, 0%, 70%)",
        hsl80: "hsl(0, 0%, 80%)",
        hsl85: "hsl(0, 0%, 85%)",
        hsl90: "hsl(0, 0%, 90%)",
        hsl95: "hsl(0, 0%, 95%)",
        hsl98: "hsl(0, 0%, 98%)",
        hsl100: "hsl(0, 0%, 100%)",

        //Design tokens colours
        primary: "#FF3F3F",
        primaryLight: "#5dade2",
        danger: "#572626",
        success: "#10b981",
        text: "#333333",
        textMuted: "#6b7280",
        background: "#ffffff",
        border: "#e5e7eb",
        // Custom icon colour
        iconDefault: "hsl(0 0% 30%)",

        //Primary text colour
        textdefault: "hsl(0, 0%, 20%)",

        /**
         * Food Remedy Primary Colour
         * RGB values (255, 63, 63)
         * Hex #FF3F3F
         */
        primary: "hsl(0, 100%, 62%)",
      },
    },
  },

  plugins: [],
};
