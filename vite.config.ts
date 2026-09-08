/* eslint-disable import/no-extraneous-dependencies */
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  esbuild: {
    supported: {
      "top-level-await": true,
    },
  },
  build: {
    // El motor 3D (three + ThatOpen) pesa ~6 MB inevitablemente: se separa
    // en un chunk "vendor" con hash propio para que el navegador lo guarde
    // en caché y cada despliegue solo invalide el código de la app.
    // (Vercel sirve gzip/brotli: la primera descarga real es ~1 MB.)
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: [
            "three",
            "web-ifc",
            "@thatopen/components",
            "@thatopen/components-front",
            "@thatopen/fragments",
            "@thatopen/ui",
            "@thatopen/ui-obc",
          ],
        },
      },
    },
  },
});
