import type { Settings } from "../../../lib/settings";
import { HeatmapIcon } from "./Icons";
import { SectionCard, SettingGroup, SettingRow, ToggleControl, ToggleSettingRow } from "./SettingsUi";

interface HeatmapSectionProps {
  title: string;
  value: Settings["heatmap"];
  onChange: (next: Settings["heatmap"]) => void;
}

export function HeatmapSection({ value, onChange, title }: HeatmapSectionProps) {
  return (
    <SectionCard
      title={title}
      description="Track watched segments and control heatmap overlays."
      icon={<HeatmapIcon />}
      meta={value.enabled ? "Enabled" : "Off"}
      metaTone={value.enabled ? "success" : "default"}
    >
      <div className={`ti-master-toggle${value.enabled ? " is-enabled" : ""}`}>
        <div>
          <p className="ti-master-toggle-title">Enable watch heatmap</p>
          <p className="ti-master-toggle-description">
            Master switch. When off, watch-time collection and heatmap overlays are paused.
          </p>
        </div>
        <ToggleControl id="heatmapEnabled" checked={value.enabled} onChange={(checked) => onChange({ ...value, enabled: checked })} />
      </div>

      <div className={`ti-dependent-block${value.enabled ? "" : " is-disabled"}`} aria-disabled={!value.enabled}>
        <SettingGroup title="Sampling" description="Control how watch segments are recorded and summarized.">
          <SettingRow
            label="Watched threshold"
            description="Percentage of a VOD watched before it is considered watched."
            wideControl
            control={
              <div className="ti-slider-wrap">
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
                <div className="ti-slider-scale">
                  <span>50%</span>
                  <span>{value.watchedThresholdPct}%</span>
                  <span>100%</span>
                </div>
              </div>
            }
          />
          <SettingRow
            label="Bucket seconds"
            description="Smaller buckets produce finer detail but use more storage."
            control={
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
                <option value={1}>1 second</option>
                <option value={5}>5 seconds</option>
                <option value={10}>10 seconds</option>
                <option value={30}>30 seconds</option>
              </select>
            }
          />
          <SettingRow
            label="Minimum watch seconds to record"
            description="Drops very short visits so accidental clicks do not pollute history."
            control={
              <div className="ti-number-input">
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
                <span>seconds</span>
              </div>
            }
          />
        </SettingGroup>

        <SettingGroup title="Watched indicator" description='Watched tiles show a "Watched" badge with your selected accent color.'>
          <SettingRow
            label="Indicator color"
            description="Applied to watched labels and border cues."
            control={
              <div className="ti-color-input">
                <input
                  id="indicatorColor"
                  type="color"
                  value={value.indicatorColor}
                  onChange={(event) => onChange({ ...value, indicatorColor: event.target.value })}
                />
                <code>{value.indicatorColor}</code>
              </div>
            }
          />
        </SettingGroup>

        <SettingGroup title="Display and tracking">
          <ToggleSettingRow
          id="showOnTiles"
          label="Show heatmap on VOD tiles"
          description="Adds watched-segment overlays on VOD thumbnails."
          checked={value.showOnTiles}
          onChange={(checked) => onChange({ ...value, showOnTiles: checked })}
        />
          <ToggleSettingRow
          id="hideNativeTileProgressBar"
          label="Hide Twitch default tile progress bar"
          description="Keeps only the custom heatmap strip on tiles."
          checked={value.hideNativeTileProgressBar}
          onChange={(checked) => onChange({ ...value, hideNativeTileProgressBar: checked })}
        />
          <ToggleSettingRow
          id="showOnPlayerBar"
          label="Show heatmap on player bar"
          description="Adds a heatmap overlay above the VOD scrubber."
          checked={value.showOnPlayerBar}
          onChange={(checked) => onChange({ ...value, showOnPlayerBar: checked })}
        />
          <ToggleSettingRow
          id="trackLiveStreams"
          label="Track live streams"
          description="Record watched ranges during live streams to map to VODs later."
          checked={value.trackLiveStreams}
          onChange={(checked) => onChange({ ...value, trackLiveStreams: checked })}
        />
          <ToggleSettingRow
          id="pauseWhenTabUnfocused"
          label="Pause sampling when tab is unfocused"
          description="Avoids counting watch time while this tab is in the background."
          checked={value.pauseWhenTabUnfocused}
          onChange={(checked) => onChange({ ...value, pauseWhenTabUnfocused: checked })}
        />
        </SettingGroup>
      </div>
    </SectionCard>
  );
}
