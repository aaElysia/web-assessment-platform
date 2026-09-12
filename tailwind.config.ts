import type { Config } from "tailwindcss";

// 设计令牌：颜色语义通过 CSS 变量驱动（见 globals.css），便于后续统一换肤。
// 维度色（dim/ai）为预留给结果可视化（雷达图/柱状图）的配色，提前定义避免散落硬编码。
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--color-bg) / <alpha-value>)",
        surface: "rgb(var(--color-surface) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--color-primary) / <alpha-value>)",
          dark: "rgb(var(--color-primary-dark) / <alpha-value>)",
        },
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        line: "rgb(var(--color-border) / <alpha-value>)",
        success: "rgb(var(--color-success) / <alpha-value>)",
        danger: "rgb(var(--color-danger) / <alpha-value>)",
        warning: "rgb(var(--color-warning) / <alpha-value>)",
        dimension: {
          O: "#8b5cf6", // Openness 开放性
          C: "#3b82f6", // Conscientiousness 尽责性
          E: "#f59e0b", // Extraversion 外向性
          A: "#10b981", // Agreeableness 宜人性
          N: "#f43f5e", // Neuroticism 神经质
        },
        ai: {
          PU: "#0ea5e9", // Perceived Usefulness
          TR: "#6366f1", // Trust
          WA: "#10b981", // Willingness to Adopt
          LA: "#f59e0b", // Learning Attitude
          CN: "#ef4444", // Concerns
        },
      },
      borderRadius: {
        "2xl": "1rem",
      },
      fontFamily: {
        sans: [
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "PingFang SC",
          "Microsoft YaHei",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};

export default config;
