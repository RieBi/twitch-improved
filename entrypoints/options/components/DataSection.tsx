import type { ChangeEvent } from "react";
import type { GetDiagnosticsResponse, ImportMode } from "../../../lib/messaging";
import { DataIcon } from "./Icons";
import { SectionCard, SettingGroup } from "./SettingsUi";

interface DataSectionProps {
  title: string;
  counts: {
    vods: number;
    liveSessions: number;
  };
  storageUsage: { used: number; quota: number } | null;
  diagnostics: GetDiagnosticsResponse["selectorMisses"];
  dataStatus: string;
  dataError: string | null;
  importMode: ImportMode;
  busyAction: "export" | "import" | "clear" | null;
  onImportModeChange: (mode: ImportMode) => void;
  onExport: () => void;
  onImport: (event: ChangeEvent<HTMLInputElement>) => void;
  onClearAll: () => void;
  onRefresh: () => void;
}

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

export function DataSection({
  title,
  counts,
  storageUsage,
  diagnostics,
  dataStatus,
  dataError,
  importMode,
  busyAction,
  onImportModeChange,
  onExport,
  onImport,
  onClearAll,
  onRefresh
}: DataSectionProps) {
  const usageRatio =
    storageUsage && storageUsage.quota > 0
      ? Math.min(1, Math.max(0, storageUsage.used / storageUsage.quota))
      : 0;
  const statusText = dataError ? `Error: ${dataError}` : dataStatus;

  return (
    <SectionCard
      title={title}
      description="Manage saved watch history, backups, and selector diagnostics."
      icon={<DataIcon />}
      meta={dataError ? "Needs attention" : "Ready"}
    >
      <div className="ti-storage-summary">
        <div className="ti-storage-metric">
          <span className="ti-storage-value">{formatBytes(storageUsage?.used)}</span>
          <span className="ti-storage-label">used</span>
        </div>
        <div className="ti-storage-metric">
          <span className="ti-storage-value">{counts.vods}</span>
          <span className="ti-storage-label">VOD records</span>
        </div>
        <div className="ti-storage-metric">
          <span className="ti-storage-value">{counts.liveSessions}</span>
          <span className="ti-storage-label">Live sessions</span>
        </div>
      </div>
      <div className="ti-usage-track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={usageRatio * 100}>
        <span style={{ width: `${usageRatio * 100}%` }} />
      </div>
      <p className="ti-usage-caption">
        {formatBytes(storageUsage?.used)} of {formatBytes(storageUsage?.quota)} browser storage
      </p>

      <SettingGroup title="Backup and restore" description="Export data snapshots or import them in merge/replace mode.">
        <p className={`ti-data-status${dataError ? " is-error" : ""}`}>{statusText}</p>
        <div className="ti-data-actions">
          <button type="button" onClick={onExport} disabled={busyAction !== null}>
            {busyAction === "export" ? "Exporting..." : "Export JSON"}
          </button>
          <label className="ti-inline-select" htmlFor="importMode">
            <span>Import mode</span>
            <select
              id="importMode"
              value={importMode}
              onChange={(event) => onImportModeChange(event.target.value as ImportMode)}
              disabled={busyAction !== null}
            >
              <option value="merge">Merge</option>
              <option value="replace">Replace</option>
            </select>
          </label>
          <label className="ti-file-button" aria-disabled={busyAction !== null}>
            {busyAction === "import" ? "Importing..." : "Import JSON"}
            <input
              type="file"
              accept="application/json,.json"
              onChange={onImport}
              disabled={busyAction !== null}
            />
          </label>
          <button type="button" className="danger" onClick={onClearAll} disabled={busyAction !== null}>
            {busyAction === "clear" ? "Clearing..." : "Clear all"}
          </button>
          <button type="button" onClick={onRefresh} disabled={busyAction !== null}>
            Refresh
          </button>
        </div>
      </SettingGroup>

      <section className="ti-diagnostics">
        <h3>Diagnostics</h3>
        <p>Recent selector misses (latest first, up to 100).</p>
        {diagnostics.length === 0 ? (
          <p className="ti-data-empty">No selector misses recorded.</p>
        ) : (
          <ul className="ti-diagnostics-list">
            {diagnostics.map((entry, index) => (
              <li key={`${entry.id}-${entry.timestamp}-${index}`}>
                <code>{entry.id}</code> on <code>{entry.url}</code> at {new Date(entry.timestamp).toLocaleString()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </SectionCard>
  );
}
