import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// `base` must match how the site is served on GitHub Pages.
//   Project site  -> https://<user>.github.io/<repo>/   ->  base: "/<repo>/"
//   User/Org site -> https://<user>.github.io/          ->  base: "/"
// This is set for a repo named "cadence". Change it if your repo name differs.
export default defineConfig({
  plugins: [react()],
  base: "/cadence/",
});
