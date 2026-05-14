import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";

declare const process: { env: Record<string, string | undefined> };

export default defineConfig({
  plugins: [react()],
  define: {
    __FORMUN_BUILD_ID__: JSON.stringify(process.env.VERCEL_DEPLOYMENT_ID || String(Date.now())),
  },
  server: {
    host: "::",
    port: 5174,
  },
});
