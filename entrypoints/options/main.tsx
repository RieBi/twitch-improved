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
import { DeclutterSection } from "./components/DeclutterSection";
import { HeatmapSection } from "./components/HeatmapSection";

const formatBytes = (bytes?: number): string => {
  if (!bytes || bytes <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

function App() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [counts, setCounts] = useState({ vods: 0, liveSessions: 0 });
  const [storageUsage, setStorageUsage] = useState<{ used: number; quota: number } | null>(null);
  const [diagnostics, setDiagnostics] = useState<GetDiagnosticsResponse["selectorMisses"]>([]);
  const [dataError, setDataError] = useState<string | null>(null);
  const [dataStatus, setDataStatus] = useState<string>("Data tools ready.");
  const [importMode, setImportMode] = useState<ImportMode>("merge");
  const [busyAction, setBusyAction] = useState<"export" | "import" | "clear" | null>(null);

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

  const refreshDataPanel = () => {
    setDataError(null);
    return Promise.all([
      sendMsg<GetDataSummaryResponse>({ type: "getDataSummary" }),
      sendMsg<GetDiagnosticsResponse>({ type: "getDiagnostics" }),
      navigator.storage?.estimate?.() ?? Promise.resolve({ usage: 0, quota: 0 })
    ])
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
    void refreshDataPanel();
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
        <p className="panel-description">Manage saved watch history, backups, and selector diagnostics.</p>

        <div className="data-summary">
          <div>VOD records: {counts.vods}</div>
          <div>Live sessions: {counts.liveSessions}</div>
          <div>
            Storage: {formatBytes(storageUsage?.used)} / {formatBytes(storageUsage?.quota)}
          </div>
        </div>

        <p className="data-status">{dataError ? `Error: ${dataError}` : dataStatus}</p>

        <div className="data-actions">
          <button type="button" onClick={handleExport} disabled={busyAction !== null}>
            {busyAction === "export" ? "Exporting..." : "Export JSON"}
          </button>
          <label className="import-control">
            <span>Import mode</span>
            <select
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as ImportMode)}
              disabled={busyAction !== null}
            >
              <option value="merge">Merge</option>
              <option value="replace">Replace</option>
            </select>
          </label>
          <label className="file-button" aria-disabled={busyAction !== null}>
            {busyAction === "import" ? "Importing..." : "Import JSON"}
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              disabled={busyAction !== null}
            />
          </label>
          <button type="button" className="danger" onClick={handleClearAll} disabled={busyAction !== null}>
            {busyAction === "clear" ? "Clearing..." : "Clear all"}
          </button>
          <button type="button" onClick={() => void refreshDataPanel()} disabled={busyAction !== null}>
            Refresh
          </button>
        </div>

        <div className="field-group">
          <h3>Diagnostics</h3>
          <p className="panel-description">Recent selector misses (latest first, up to 100).</p>
          {diagnostics.length === 0 ? (
            <p className="data-empty">No selector misses recorded.</p>
          ) : (
            <ul className="diagnostics-list">
              {diagnostics.map((entry, index) => (
                <li key={`${entry.id}-${entry.timestamp}-${index}`}>
                  <code>{entry.id}</code> on <code>{entry.url}</code> at{" "}
                  {new Date(entry.timestamp).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
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
