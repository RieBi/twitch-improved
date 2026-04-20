import type { Settings } from "../../../lib/settings";

interface DeclutterSectionProps {
  value: Settings["declutter"];
  onChange: (next: Settings["declutter"]) => void;
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

export function DeclutterSection({ value, onChange }: DeclutterSectionProps) {
  return (
    <section className="panel" aria-labelledby="declutter-heading">
      <h2 id="declutter-heading">Declutter</h2>
      <p className="panel-description">
        Choose which recommendation shelves are hidden across Twitch pages.
      </p>

      <div className="field-group">
        <h3>Main Feed</h3>
        <ToggleField
          id="hideCarousel"
          label="Hide top carousel"
          checked={value.mainFeed.hideCarousel}
          onChange={(checked) => onChange({ ...value, mainFeed: { ...value.mainFeed, hideCarousel: checked } })}
        />
        <ToggleField
          id="hideRecommendedStreams"
          label="Hide recommended streams shelf"
          checked={value.mainFeed.hideRecommendedStreams}
          onChange={(checked) =>
            onChange({
              ...value,
              mainFeed: { ...value.mainFeed, hideRecommendedStreams: checked }
            })
          }
        />
        <ToggleField
          id="hideMobileGames"
          label="Hide Mobile Games shelf"
          checked={value.mainFeed.hideMobileGames}
          onChange={(checked) =>
            onChange({
              ...value,
              mainFeed: { ...value.mainFeed, hideMobileGames: checked }
            })
          }
        />
        <ToggleField
          id="hideMainRecommendedCategories"
          label="Hide main-page recommended categories"
          checked={value.mainFeed.hideRecommendedCategories}
          onChange={(checked) =>
            onChange({
              ...value,
              mainFeed: { ...value.mainFeed, hideRecommendedCategories: checked }
            })
          }
        />
        <ToggleField
          id="hideCategoriesYoullLike"
          label="Hide categories we think you'll like"
          checked={value.mainFeed.hideCategoriesYoullLike}
          onChange={(checked) =>
            onChange({
              ...value,
              mainFeed: { ...value.mainFeed, hideCategoriesYoullLike: checked }
            })
          }
        />
      </div>

      <div className="field-group">
        <h3>Channel Page</h3>
        <ToggleField
          id="hideOfflinePreview"
          label="Hide offline preview recommendation"
          checked={value.channel.hideOfflinePreview}
          onChange={(checked) => onChange({ ...value, channel: { ...value.channel, hideOfflinePreview: checked } })}
        />
        <ToggleField
          id="hideViewersAlsoWatch"
          label="Hide viewers also watch shelf"
          checked={value.channel.hideViewersAlsoWatch}
          onChange={(checked) =>
            onChange({
              ...value,
              channel: { ...value.channel, hideViewersAlsoWatch: checked }
            })
          }
        />
      </div>

      <div className="field-group">
        <h3>Sidebar</h3>
        <ToggleField
          id="hideSidebarRecommendedChannels"
          label="Hide recommended channels block"
          checked={value.sidebar.hideRecommendedChannels}
          onChange={(checked) =>
            onChange({
              ...value,
              sidebar: { ...value.sidebar, hideRecommendedChannels: checked }
            })
          }
        />
        <ToggleField
          id="hideSidebarRecommendedCategories"
          label="Hide recommended categories block"
          checked={value.sidebar.hideRecommendedCategories}
          onChange={(checked) =>
            onChange({
              ...value,
              sidebar: { ...value.sidebar, hideRecommendedCategories: checked }
            })
          }
        />
        <ToggleField
          id="hideGetAdFreeButton"
          label="Hide Get Ad-Free button"
          checked={value.global.hideGetAdFreeButton}
          onChange={(checked) => onChange({ ...value, global: { ...value.global, hideGetAdFreeButton: checked } })}
        />
      </div>
    </section>
  );
}
