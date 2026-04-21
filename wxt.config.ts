import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "dist",
  webExt: {
    disabled: true
  },
  manifest: {
    name: "Twitch Improved",
    description: "Declutter Twitch and show watch heatmaps for VODs.",
    permissions: ["storage", "scripting", "alarms"],
    host_permissions: ["https://www.twitch.tv/*"]
  }
});
