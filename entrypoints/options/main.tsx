import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import browser from "webextension-polyfill";
import "./styles.css";
import {
  sendMsg,
  type ClearAllDataResponse,
  type ExportDataResponse,
  type GetDataSummaryResponse,
  type GetDiagnosticsResponse,
  type ImportDataResponse,
  type ImportMode
} from "../../lib/messaging";
import { defaultSettings, loadSettings, saveSettings, type Settings } from "../../lib/settings";
import { DataSection } from "./components/DataSection";
import { DeclutterSection } from "./components/DeclutterSection";
import { HeatmapSection } from "./components/HeatmapSection";

function App() {
  const declutterTitle = "Declutter";
  const heatmapTitle = "Watch heatmap";
  const dataTitle = "Data";

  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"loading" | "saving" | "saved" | "error">("loading");
  const [counts, setCounts] = useState<{ vods: number; liveSessions: number } | null>(null);
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<GetDiagnosticsResponse["selectorMisses"]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<string>("Data tools ready.");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [busyAction, setBusyAction] = useState<"export" | "import" | "clear" | null>(null);

  const fetchDataPanel = () =>
    Promise.all([
      sendMsg<GetDataSummaryResponse>({ type: "getDataSummary" }),
      sendMsg<GetDiagnosticsResponse>({ type: "getDiagnostics" }),
      navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0, quota: 0 })
    ]);

  const refreshDataPanel = () => {
    setDataError(null);
    return fetchDataPanel()
      .then(([summary, diagnosticsResponse, estimate]) => {
        setCounts(summary.counts);
        setDiagnostics(diagnosticsResponse.selectorMisses.slice().reverse());
        setStorageUsage({
          used: estimate.usage ?? 0,
          quota: estimate.quota ?? 0
        });
      })
      .catch((error) => {
        setDataError(error instanceof Error ? error.message : "Failed to load data panel.");
      });
  };

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        const [loadedSettings, [summary, diagnosticsResponse, estimate]] = await Promise.all([
          loadSettings(browser.storage.sync),
          fetchDataPanel()
        ]);

        if (cancelled) {
          return;
        }

        setSettings(loadedSettings);
        setCounts(summary.counts);
        setDiagnostics(diagnosticsResponse.selectorMisses.slice().reverse());
        setStorageUsage({
          used: estimate.usage ?? 0,
          quota: estimate.quota ?? 0
        });
        setSaveState("saved");
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load options data.";
        setSaveError(message);
        setDataError(message);
        setSaveState("error");
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

    if (saveState === "saving") {
      return "Saving changes...";
    }

    if (saveState === "error") {
      return saveError ? `Save failed: ${saveError}` : "Save failed.";
    }

    return "All saved";
  }, [loading, saveError, saveState]);

  const persistSettings = (next: Settings) => {
    setSettings(next);
    setSaveError(null);
    setSaveState("saving");
    void saveSettings(next, browser.storage.sync)
      .then((normalized) => {
        setSettings(normalized);
        setSaveState("saved");
        void sendMsg<void>({ type: "settingsChanged" }).catch((error) => {
          // Settings are already persisted; ignore transient background messaging issues.
          console.warn("Failed to dispatch settingsChanged.", error);
        });
      })
      .catch((error) => {
        setSaveError(error instanceof Error ? error.message : "Failed to save settings.");
        setSaveState("error");
      });
  };

  const handleExport = () => {
    setBusyAction("export");
    setDataStatus("Exporting data...");
    setDataError(null);

    void sendMsg<ExportDataResponse>({ type: "exportData" })
      .then(({ snapshot }) => {
        const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: "application/json" });
        const timestamp = new Date(snapshot.exportedAt).toISOString().replace(/[:.]/g, "-");
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `twitch-improved-export-${timestamp}.json`;
        anchor.click();
        URL.revokeObjectURL(url);
        setDataStatus("Export complete.");
      })
      .catch((error) => {
        setDataError(error instanceof Error ? error.message : "Export failed.");
      })
      .finally(() => {
        setBusyAction(null);
      });
  };

  const handleImportFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    setBusyAction("import");
    setDataStatus(`Importing ${file.name}...`);
    setDataError(null);

    void file
      .text()
      .then((text) => JSON.parse(text) as unknown)
      .then((payload) => sendMsg<ImportDataResponse>({ type: "importData", mode: importMode, payload }))
      .then((response) => {
        if (!response.ok) {
          throw new Error("Import failed.");
        }

        setDataStatus(
          `Import complete (${response.mode}): ${response.imported.vods} vods, ${response.imported.liveSessions} live sessions.`
        );
        return refreshDataPanel();
      })
      .catch((error) => {
        setDataError(error instanceof Error ? error.message : "Import failed.");
      })
      .finally(() => {
        setBusyAction(null);
      });
  };

  const handleClearAll = () => {
    const confirmed = window.confirm("Clear all tracked VOD/live data? This cannot be undone.");
    if (!confirmed) {
      return;
    }

    setBusyAction("clear");
    setDataStatus("Clearing data...");
    setDataError(null);

    void sendMsg<ClearAllDataResponse>({ type: "clearAllData" })
      .then((response) => {
        if (!response.ok) {
          throw new Error("Clear all failed.");
        }

        setDataStatus("All data cleared.");
        return refreshDataPanel();
      })
      .catch((error) => {
        setDataError(error instanceof Error ? error.message : "Clear all failed.");
      })
      .finally(() => {
        setBusyAction(null);
      });
  };

  return (
    <main className="app">
      <header className="hero">
        <div className="hero-brand">
          <div className="hero-logo" aria-hidden="true">
            T+
          </div>
          <div className="hero-copy">
            <h1>Twitch Improved</h1>
            <p>Configure declutter rules, watch heatmap, and saved history. Changes save as you make them.</p>
          </div>
        </div>
        <p className={`hero-status${saveState === "error" ? " is-error" : ""}`}>{statusText}</p>
      </header>

      {loading || !settings || !counts ? (
        <section className="ti-card">
          <div className="ti-card-body">
            <p className="ti-data-status">Loading saved settings and data...</p>
          </div>
        </section>
      ) : (
        <>
          <DeclutterSection
            title={declutterTitle}
            value={settings.declutter}
            onChange={(declutter) => persistSettings({ ...settings, declutter })}
          />

          <HeatmapSection
            title={heatmapTitle}
            value={settings.heatmap}
            onChange={(heatmap) => persistSettings({ ...settings, heatmap })}
          />

          <DataSection
            title={dataTitle}
            counts={counts}
            storageUsage={storageUsage}
            diagnostics={diagnostics}
            dataStatus={dataStatus}
            dataError={dataError}
            importMode={importMode}
            busyAction={busyAction}
            onImportModeChange={setImportMode}
            onExport={handleExport}
            onImport={handleImportFile}
            onClearAll={handleClearAll}
            onRefresh={() => {
              void refreshDataPanel();
            }}
          />
        </>
      )}
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
