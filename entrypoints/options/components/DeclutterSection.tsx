import type { Settings } from "../../../lib/settings";
import { DeclutterIcon } from "./Icons";
import { SectionCard, SettingGroup, ToggleSettingRow } from "./SettingsUi";

interface DeclutterSectionProps {
  title: string;
  value: Settings["declutter"];
  onChange: (next: Settings["declutter"]) => void;
}

export function DeclutterSection({ title, value, onChange }: DeclutterSectionProps) {
  const activeCount = [
    value.mainFeed.hideCarousel,
    value.mainFeed.hideRecommendedStreams,
    value.channel.hideOfflinePreview,
    value.channel.hideViewersAlsoWatch,
    value.sidebar.hideRecommendedChannels,
    value.sidebar.hideRecommendedCategories,
    value.global.hideGetAdFreeButton
  ].filter(Boolean).length;

  return (
    <SectionCard
      title={title}
      description="Hide recommendation shelves and upsells across Twitch."
      icon={<DeclutterIcon />}
      meta={`${activeCount} of 7 active`}
    >
      <SettingGroup title="Home / main feed" description="Affects Twitch home feed shelves and spotlight rows.">
        <ToggleSettingRow
          id="hideCarousel"
          label="Hide top carousel"
          description="Removes the top rotating spotlight rail from the home page."
          checked={value.mainFeed.hideCarousel}
          onChange={(checked) => onChange({ ...value, mainFeed: { ...value.mainFeed, hideCarousel: checked } })}
        />
        <ToggleSettingRow
          id="hideRecommendedStreams"
          label="Hide everything below top carousel"
          description="Collapses recommendation shelves while leaving followed-feed sections visible."
          checked={value.mainFeed.hideRecommendedStreams}
          onChange={(checked) =>
            onChange({
              ...value,
              mainFeed: { ...value.mainFeed, hideRecommendedStreams: checked }
            })
          }
        />
      </SettingGroup>

      <SettingGroup title="Channel page" description="Affects individual channel pages and VOD context areas.">
        <ToggleSettingRow
          id="hideOfflinePreview"
          label="Hide offline preview recommendation"
          description="Hides promo cards shown when a channel is offline."
          checked={value.channel.hideOfflinePreview}
          onChange={(checked) => onChange({ ...value, channel: { ...value.channel, hideOfflinePreview: checked } })}
        />
        <ToggleSettingRow
          id="hideViewersAlsoWatch"
          label="Hide viewers also watch shelf"
          description="Removes side recommendations for other channels from channel and VOD pages."
          checked={value.channel.hideViewersAlsoWatch}
          onChange={(checked) =>
            onChange({
              ...value,
              channel: { ...value.channel, hideViewersAlsoWatch: checked }
            })
          }
        />
      </SettingGroup>

      <SettingGroup title="Sidebar and top bar" description="Affects left sidebar and top navigation distractions.">
        <ToggleSettingRow
          id="hideSidebarRecommendedChannels"
          label="Hide recommended channels block"
          description="Keeps only followed channels in the left sidebar list."
          checked={value.sidebar.hideRecommendedChannels}
          onChange={(checked) =>
            onChange({
              ...value,
              sidebar: { ...value.sidebar, hideRecommendedChannels: checked }
            })
          }
        />
        <ToggleSettingRow
          id="hideSidebarRecommendedCategories"
          label="Hide recommended categories block"
          description="Removes category recommendations in the left sidebar."
          checked={value.sidebar.hideRecommendedCategories}
          onChange={(checked) =>
            onChange({
              ...value,
              sidebar: { ...value.sidebar, hideRecommendedCategories: checked }
            })
          }
        />
        <ToggleSettingRow
          id="hideGetAdFreeButton"
          label="Hide Get Ad-Free button"
          description="Removes the persistent ad-free upsell button in the top navigation."
          checked={value.global.hideGetAdFreeButton}
          onChange={(checked) => onChange({ ...value, global: { ...value.global, hideGetAdFreeButton: checked } })}
        />
      </SettingGroup>
    </SectionCard>
  );
}
