import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// The Lighthouse workflow serves dist/ at the web root, unlike GitHub Pages.
// Use a dedicated config so audit assets resolve from / rather than the Pages subpath.
export default defineConfig({
  plugins: [react()],
  base: "/",
});
