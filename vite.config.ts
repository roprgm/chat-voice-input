import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    cssCodeSplit: true,
    lib: {
      entry: {
        "ai-sdk": fileURLToPath(new URL("./src/transcription.ts", import.meta.url)),
        index: fileURLToPath(new URL("./src/index.tsx", import.meta.url)),
        server: fileURLToPath(new URL("./src/server.ts", import.meta.url)),
        style: fileURLToPath(new URL("./src/styles.css", import.meta.url)),
      },
      fileName: (_, entryName) => `${entryName}.js`,
      formats: ["es"],
    },
    rolldownOptions: {
      external: ["@ai-sdk/gateway", "ai", "lucide-react", "react", "react/jsx-runtime"],
    },
    sourcemap: true,
    target: "es2022",
  },
});
