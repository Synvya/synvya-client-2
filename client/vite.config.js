import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url))
        }
    },
    server: {
        port: 5173,
        proxy: {
            "/nostr-build": {
                target: "https://nostr.build",
                changeOrigin: true,
                secure: true,
                rewrite: function (path) { return path.replace(/^\/nostr-build/, ""); }
            }
        }
    }
});
