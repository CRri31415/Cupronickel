import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Tauri는 고정 포트의 dev 서버를 기대하므로 1420으로 고정한다.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  // Tauri는 빌드 산출물을 chromium/webview2 기준으로 처리하므로 esnext로 둔다.
  build: {
    target: "esnext",
    minify: "esbuild",
    sourcemap: false,
  },
});
