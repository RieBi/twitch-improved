import { defineConfig } from "wxt";

export default defineConfig({
  modules: ["@wxt-dev/module-react"],
  outDir: "dist",
  suppressWarnings: {
    firefoxDataCollection: true
  },
  webExt: {
    disabled: true
  },
  manifest: {
    name: "Twitch Improved",
    description: "Declutter Twitch and show watch heatmaps for VODs.",
    icons: {
      16: "assets/icons/icon-16.png",
      32: "assets/icons/icon-32.png",
      48: "assets/icons/icon-48.png",
      96: "assets/icons/icon-96.png",
      128: "assets/icons/icon-128.png"
    },
    action: {
      default_icon: {
        16: "assets/icons/icon-16.png",
        32: "assets/icons/icon-32.png",
        48: "assets/icons/icon-48.png"
      }
    },
    permissions: ["storage", "scripting", "alarms"],
    host_permissions: ["https://www.twitch.tv/*"]
  }
});
