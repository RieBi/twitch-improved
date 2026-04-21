import type { Settings } from "../../../lib/settings";

interface HeatmapSectionProps {
  value: Settings["heatmap"];
  onChange: (next: Settings["heatmap"]) => void;
  title?: string;
}

interface ToggleFieldProps {
  id: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function ToggleField({ id, label, checked, onChange }: ToggleFieldProps) {
  return (
    <label className="field checkbox-field" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

export function HeatmapSection({ value, onChange, title = "Watch heatmap" }: HeatmapSectionProps) {
  return (
    <section className="panel" aria-labelledby="heatmap-heading">
      <h2 id="heatmap-heading">{title}</h2>
      <p className="panel-description">Control tracking, display, and watched indicator behavior.</p>

      <div className="field-group">
        <ToggleField
          id="heatmapEnabled"
          label="Enable watch heatmap"
          checked={value.enabled}
          onChange={(checked) => onChange({ ...value, enabled: checked })}
        />

        <label className="field" htmlFor="watchedThresholdPct">
          <span>Watched threshold: {value.watchedThresholdPct}%</span>
          <input
            id="watchedThresholdPct"
            type="range"
            min={50}
            max={100}
            value={value.watchedThresholdPct}
            onChange={(event) =>
              onChange({
                ...value,
                watchedThresholdPct: Number(event.target.value)
              })
            }
          />
        </label>

        <label className="field" htmlFor="bucketSeconds">
          <span>Bucket seconds</span>
          <select
            id="bucketSeconds"
            value={value.bucketSeconds}
            onChange={(event) =>
              onChange({
                ...value,
                bucketSeconds: Number(event.target.value)
              })
            }
          >
            <option value={1}>1</option>
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={30}>30</option>
          </select>
        </label>
      </div>

      <div className="field-group">
        <h3>Indicator</h3>
        <p className="panel-description">
          Watched tiles are currently shown with a "Watched" badge (plus border when enabled).
        </p>

        <label className="field" htmlFor="indicatorColor">
          <span>Indicator color</span>
          <input
            id="indicatorColor"
            type="color"
            value={value.indicatorColor}
            onChange={(event) => onChange({ ...value, indicatorColor: event.target.value })}
          />
        </label>
      </div>

      <div className="field-group">
        <h3>Display + tracking</h3>
        <ToggleField
          id="showOnTiles"
          label="Show heatmap on VOD tiles"
          checked={value.showOnTiles}
          onChange={(checked) => onChange({ ...value, showOnTiles: checked })}
        />
        <ToggleField
          id="hideNativeTileProgressBar"
          label="Hide Twitch default tile progress bar"
          checked={value.hideNativeTileProgressBar}
          onChange={(checked) => onChange({ ...value, hideNativeTileProgressBar: checked })}
        />
        <ToggleField
          id="showOnPlayerBar"
          label="Show heatmap on player bar"
          checked={value.showOnPlayerBar}
          onChange={(checked) => onChange({ ...value, showOnPlayerBar: checked })}
        />
        <ToggleField
          id="trackLiveStreams"
          label="Track live streams"
          checked={value.trackLiveStreams}
          onChange={(checked) => onChange({ ...value, trackLiveStreams: checked })}
        />
        <ToggleField
          id="pauseWhenTabUnfocused"
          label="Pause sampling when tab is unfocused"
          checked={value.pauseWhenTabUnfocused}
          onChange={(checked) => onChange({ ...value, pauseWhenTabUnfocused: checked })}
        />

        <label className="field" htmlFor="minWatchSecondsToRecord">
          <span>Minimum watch seconds to record</span>
          <input
            id="minWatchSecondsToRecord"
            type="number"
            min={0}
            value={value.minWatchSecondsToRecord}
            onChange={(event) =>
              onChange({
                ...value,
                minWatchSecondsToRecord: Number(event.target.value)
              })
            }
          />
        </label>
      </div>
    </section>
  );
}
