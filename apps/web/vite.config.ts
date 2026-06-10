import path from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    tailwindcss(),
    tanstackRouter({ autoCodeSplitting: true }),
    react(),
  ],
  envDir: path.resolve(__dirname, "../.."),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  define: {
    global: "globalThis",
  },
  build: {
    chunkSizeWarningLimit: 800,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            return;
          }
          if (id.includes("i18next")) {
            return "i18n";
          }
          if (
            id.includes("@tanstack") ||
            id.includes("@orpc") ||
            id.includes("/convex/")
          ) {
            return "data";
          }
          if (
            id.includes("/radix-ui/") ||
            id.includes("@radix-ui") ||
            id.includes("lucide-react") ||
            id.includes("/sonner/") ||
            id.includes("next-themes")
          ) {
            return "ui";
          }
          if (
            id.includes("/react/") ||
            id.includes("/react-dom/") ||
            id.includes("/scheduler/")
          ) {
            return "react";
          }
        },
      },
    },
  },
});
