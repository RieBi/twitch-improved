import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import "./styles.css";
import { sendMsg } from "../../lib/messaging";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "../../lib/settings";
import { DeclutterSection } from "./components/DeclutterSection";
import { HeatmapSection } from "./components/HeatmapSection";

function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const loaded = await loadSettings(browser.storage.sync);
        if (!cancelled) {
          setSettings(loaded);
        }
      } catch (error) {
        if (!cancelled) {
          setSaveError(error instanceof Error ? error.message : "Failed to load settings.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void init();

    return () => {
      cancelled = true;
    };
  }, []);

  const statusText = useMemo(() => {
    if (loading) {
      return "Loading settings...";
    }

    return saveError ? `Error: ${saveError}` : "Changes save automatically.";
  }, [loading, saveError]);

  const persistSettings = (next: Settings) => {
    setSettings(next);
    setSaveError(null);
    void saveSettings(next, browser.storage.sync)
      .then((normalized) => {
        setSettings(normalized);
        void sendMsg<void>({ type: "settingsChanged" }).catch((error) => {
          // Settings are already persisted; ignore transient background messaging issues.
          console.warn("Failed to dispatch settingsChanged.", error);
        });
      })
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : "Failed to save settings.");
      });
  };

  return (
    <main className="app">
      <header className="app-header">
        <h1>Twitch Improved</h1>
        <p className="app-subtitle">{statusText}</p>
      </header>

      <DeclutterSection
        value={settings.declutter}
        onChange={(declutter) => persistSettings({ ...settings, declutter })}
      />

      <HeatmapSection
        title="Watch heatmap"
        value={settings.heatmap}
        onChange={(heatmap) => persistSettings({ ...settings, heatmap })}
      />

      <section className="panel" aria-labelledby="data-heading">
        <h2 id="data-heading">Data</h2>
        <p className="panel-description">
          Data controls are part of a later milestone. This section will expose usage, export/import, and diagnostics.
        </p>
      </section>
    </main>
  );
}

const container = document.getElementById("root");
if (!container) {
  throw new Error("Options root element was not found.");
}

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
