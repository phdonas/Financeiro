import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Firebase Hosting serve o app na raiz do domínio, então manter base absoluta evita
  // quebra de assets em rotas profundas (SPA).
  base: "/",
  build: {
    sourcemap: true,
    outDir: "dist",
    emptyOutDir: true,
  },
});
