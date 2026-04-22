// Variation B — "Cards" layout
// Collapsible card-per-group layout with stacked rows (label on top, description below, control at bottom)
// Leans more visual: preview panels, grouped toggles, richer chrome.

function VariationB({ density = 'comfortable', accent = '#A970FF' }) {
  const [state, setState] = React.useState(TI_DEFAULT_STATE);
  const [query, setQuery] = React.useState('');
  const [openCards, setOpenCards] = React.useState({ declutter: true, heatmap: true, data: true });

  const setD = (k, v) => setState(s => ({ ...s, declutter: { ...s.declutter, [k]: v } }));
  const setH = (k, v) => setState(s => ({ ...s, heatmap: { ...s.heatmap, [k]: v } }));
  const setDa = (k, v) => setState(s => ({ ...s, data: { ...s.data, [k]: v } }));

  const toggleCard = k => setOpenCards(o => ({ ...o, [k]: !o[k] }));

  const decluttersOn = Object.values(state.declutter).filter(Boolean).length;

  return (
    <div style={{
      '--ti-accent': accent,
      '--ti-bg': '#0E0E10',
      '--ti-surface': '#18181B',
      '--ti-surface-2': '#1F1F23',
      '--ti-surface-3': '#26262C',
      '--ti-input-bg': '#000',
      '--ti-border': 'rgba(255,255,255,0.08)',
      '--ti-border-strong': 'rgba(255,255,255,0.14)',
      '--ti-text': '#EFEFF1',
      '--ti-muted': '#ADADB8',
      '--ti-subtle': '#6E6E78',
      background: 'var(--ti-bg)',
      color: 'var(--ti-text)',
      fontFamily: '"Inter", "Roobert", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      minHeight: '100%',
      padding: '32px 24px 80px',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        {/* ── Hero header ─────────────────────────── */}
        <header style={{
          background: `radial-gradient(circle at 10% 0%, ${accent}33 0%, transparent 50%), var(--ti-surface)`,
          border: '1px solid var(--ti-border)',
          borderRadius: 10,
          padding: '24px 28px',
          marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12,
            background: `linear-gradient(135deg, ${accent}, ${accent}aa)`,
            display: 'grid', placeItems: 'center',
            color: '#fff', fontSize: 22, fontWeight: 800,
            boxShadow: `0 10px 30px ${accent}55`,
          }}>T+</div>
          <div style={{ flex: 1 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: -0.2 }}>Twitch Improved</h1>
            <p style={{ color: 'var(--ti-muted)', fontSize: 13.5, margin: '4px 0 0' }}>
              Configure declutter rules, watch heatmap, and saved history. Changes save as you make them.
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(74,222,128,.12)', color: '#4ade80', borderRadius: 999, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: '#4ade80' }}/>
            All saved
          </div>
        </header>

        {/* ── Search ─────────────────────────────── */}
        <div style={{ position: 'relative', marginBottom: 20 }}>
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ti-muted)' }}>
            {TI_ICONS.search}
          </span>
          <input
            placeholder="Search settings — try 'heatmap' or 'sidebar'"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%',
              background: 'var(--ti-surface)',
              border: '1px solid var(--ti-border)',
              borderRadius: 8,
              padding: '11px 14px 11px 40px',
              color: 'var(--ti-text)',
              fontSize: 14,
              fontFamily: 'inherit',
              outline: 'none',
              boxSizing: 'border-box',
            }}
            onFocus={e => e.target.style.borderColor = accent}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
        </div>

        {/* ── Declutter card ─────────────────────── */}
        <Card
          open={openCards.declutter}
          onToggle={() => toggleCard('declutter')}
          icon={TI_ICONS.declutter}
          title="Declutter"
          subtitle="Hide recommendation shelves and upsells across Twitch."
          meta={`${decluttersOn} of 7 active`}
          accent={accent}
        >
          <Group title="Home / Main feed" description="Affects the landing page at twitch.tv.">
            <StackedRow
              label="Hide top carousel"
              description="Removes the large rotating spotlight banner at the top of the home page — the one that auto‑plays a live channel with its trailer audio."
              control={<TIToggle checked={state.declutter.hideTopCarousel} onChange={v => setD('hideTopCarousel', v)}/>}
            />
            <StackedRow
              label="Hide everything below the carousel"
              description="Collapses all other recommendation shelves on the home page (Recommended Live, Categories, Because You Watch). Your Following feed stays visible."
              control={<TIToggle checked={state.declutter.hideBelowCarousel} onChange={v => setD('hideBelowCarousel', v)}/>}
            />
          </Group>

          <Group title="Channel page" description="Affects individual channels and VOD pages.">
            <StackedRow
              label="Hide offline preview recommendation"
              description="When a streamer is offline, Twitch shows a promoted replay or a similar‑channel card in the player area. This replaces it with the plain offline banner."
              control={<TIToggle checked={state.declutter.hideOfflinePreview} onChange={v => setD('hideOfflinePreview', v)}/>}
            />
            <StackedRow
              label={'Hide "Viewers also watch" shelf'}
              description="Removes the horizontal strip of other channels surfaced below the video player on channel and VOD pages."
              control={<TIToggle checked={state.declutter.hideViewersAlsoWatch} onChange={v => setD('hideViewersAlsoWatch', v)}/>}
            />
          </Group>

          <Group title="Sidebar & top bar" last>
            <StackedRow
              label="Hide recommended channels"
              description={'Keeps only "Followed Channels" in the left sidebar and removes the "Recommended Channels" block underneath it.'}
              control={<TIToggle checked={state.declutter.hideRecommendedChannels} onChange={v => setD('hideRecommendedChannels', v)}/>}
            />
            <StackedRow
              label="Hide recommended categories"
              description="Removes the block of suggested games and IRL categories that appears in the sidebar when few followed channels are live."
              control={<TIToggle checked={state.declutter.hideRecommendedCategories} onChange={v => setD('hideRecommendedCategories', v)}/>}
            />
            <StackedRow
              label={'Hide the "Get Ad‑Free" button'}
              description="Removes the persistent Turbo / ad‑free upsell button in the top navigation bar next to your avatar."
              control={<TIToggle checked={state.declutter.hideAdFree} onChange={v => setD('hideAdFree', v)}/>}
              last
            />
          </Group>
        </Card>

        {/* ── Heatmap card ───────────────────────── */}
        <Card
          open={openCards.heatmap}
          onToggle={() => toggleCard('heatmap')}
          icon={TI_ICONS.heatmap}
          title="Watch heatmap"
          subtitle="Track which parts of a stream or VOD you actually watched."
          meta={state.heatmap.enabled ? 'Enabled' : 'Off'}
          metaColor={state.heatmap.enabled ? '#4ade80' : 'var(--ti-muted)'}
          accent={accent}
        >
          {/* Hero toggle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: '16px 18px', margin: '-4px 0 20px',
            background: state.heatmap.enabled ? `${accent}12` : 'var(--ti-surface-2)',
            border: `1px solid ${state.heatmap.enabled ? accent + '44' : 'var(--ti-border)'}`,
            borderRadius: 8,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14.5, fontWeight: 600 }}>Enable watch heatmap</div>
              <div style={{ fontSize: 12.5, color: 'var(--ti-muted)', marginTop: 3, lineHeight: 1.5 }}>
                Master switch. When off, no watch time is recorded and all heatmap overlays are hidden.
              </div>
            </div>
            <TIToggle checked={state.heatmap.enabled} onChange={v => setH('enabled', v)}/>
          </div>

          <div style={{ opacity: state.heatmap.enabled ? 1 : 0.45, pointerEvents: state.heatmap.enabled ? 'auto' : 'none', transition: 'opacity .2s' }}>

          <Group title="Sampling" description="How watched time is measured.">
            <StackedRow
              label="Watched threshold"
              description={`Percentage of a video you need to see before it counts as "watched" and gets the indicator. 85% catches true re‑watches without punishing you for skipping the credits.`}
              control={<TISlider value={state.heatmap.threshold} min={25} max={100} step={5} suffix="%" onChange={v => setH('threshold', v)}/>}
              wideControl
            />
            <StackedRow
              label="Bucket size"
              description="Granularity of the heatmap bar. Smaller buckets produce more detail on the scrubber but use a bit more storage."
              control={
                <TISelect
                  value={String(state.heatmap.bucketSeconds)}
                  onChange={v => setH('bucketSeconds', Number(v))}
                  options={[
                    { value: '5', label: '5 seconds — highest detail' },
                    { value: '10', label: '10 seconds — recommended' },
                    { value: '30', label: '30 seconds' },
                    { value: '60', label: '1 minute — lowest detail' },
                  ]}
                  width={280}
                />
              }
            />
            <StackedRow
              label="Minimum watch seconds to record"
              description="A stream or VOD has to be open this long before it's saved to your history. Prevents flicker‑clicks through the directory from polluting the list."
              control={<TINumber value={state.heatmap.minWatchSeconds} onChange={v => setH('minWatchSeconds', v)} min={0} max={600} suffix="seconds"/>}
              last
            />
          </Group>

          <Group title="Watched indicator" description="How watched tiles look in feeds and the directory.">
            <StackedRow
              label="Indicator style"
              description={`The "Watched" badge sits on top of the thumbnail; the coloured border runs all the way around the tile. Pick one or both.`}
              control={
                <TIRadioGroup
                  value={state.heatmap.indicatorStyle}
                  onChange={v => setH('indicatorStyle', v)}
                  options={[
                    { value: 'badge',  label: 'Badge only',     hint: 'Small label in the corner of the thumbnail.' },
                    { value: 'border', label: 'Border only',    hint: 'Coloured outline around the whole tile.' },
                    { value: 'both',   label: 'Badge + border', hint: 'Most visible — hard to miss a re‑watch.' },
                  ]}
                />
              }
            />

            <StackedRow
              label="Indicator color"
              description="Used for the badge label, the tile border, and the watched‑portion fill on the scrubber heatmap. Pick anything that stands out against your theme."
              control={<TIColorPicker value={state.heatmap.indicatorColor} onChange={v => setH('indicatorColor', v)}/>}
              last
            />

            {/* Live preview */}
            <div style={{
              marginTop: 14,
              padding: 18,
              background: 'linear-gradient(135deg, #0a0a0f, #151520)',
              border: '1px solid var(--ti-border)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', gap: 20,
            }}>
              <div style={{
                fontSize: 10.5, letterSpacing: 1.3, textTransform: 'uppercase',
                color: 'var(--ti-subtle)', fontWeight: 700,
                writingMode: 'vertical-rl', transform: 'rotate(180deg)',
              }}>Live preview</div>
              <HeatmapTilePreview
                color={state.heatmap.indicatorColor}
                showBadge={state.heatmap.indicatorStyle !== 'border'}
                showBorder={state.heatmap.indicatorStyle !== 'badge'}
              />
              <div style={{ flex: 1, fontSize: 12.5, color: 'var(--ti-muted)', lineHeight: 1.6 }}>
                This is what a watched VOD tile will look like in your Following feed and on category pages.
                Updates live as you change the style and colour above.
              </div>
            </div>
          </Group>

          <Group title="Display" description="Where heatmap overlays appear." last>
            <StackedRow
              label="Show heatmap on VOD tiles"
              description="Adds a thin coloured progress bar along the bottom of VOD thumbnails, showing how much of each one you've watched."
              control={<TIToggle checked={state.heatmap.showOnTiles} onChange={v => setH('showOnTiles', v)}/>}
            />
            <StackedRow
              label="Hide Twitch's default tile progress bar"
              description={`Twitch draws its own grey "already watched" bar on tiles. Turn this on so only Twitch Improved's coloured bar is visible.`}
              control={<TIToggle checked={state.heatmap.hideDefaultBar} onChange={v => setH('hideDefaultBar', v)}/>}
            />
            <StackedRow
              label="Show heatmap on the player scrubber"
              description="Overlays a coloured strip on top of the video scrubber showing which chunks you've viewed. Useful for finding where you stopped in a long VOD."
              control={<TIToggle checked={state.heatmap.showOnPlayerBar} onChange={v => setH('showOnPlayerBar', v)}/>}
            />
            <StackedRow
              label="Track live streams"
              description="Track watch time on live broadcasts too. When a tracked stream becomes a VOD, your watched time is stitched onto it automatically."
              control={<TIToggle checked={state.heatmap.trackLive} onChange={v => setH('trackLive', v)}/>}
            />
            <StackedRow
              label="Pause sampling when tab is unfocused"
              description="Stops counting watch time when you switch to another tab or app. Strict but accurate — if you listen to streams in the background, leave this off."
              control={<TIToggle checked={state.heatmap.pauseWhenUnfocused} onChange={v => setH('pauseWhenUnfocused', v)}/>}
              last
            />
          </Group>

          </div>
        </Card>

        {/* ── Data card ──────────────────────────── */}
        <Card
          open={openCards.data}
          onToggle={() => toggleCard('data')}
          icon={TI_ICONS.data}
          title="Data & backup"
          subtitle="Your history lives in local browser storage — back it up before clearing."
          meta={`${state.data.storageUsedMb.toFixed(1)} MB / ${state.data.storageCapGb} GB`}
          accent={accent}
        >
          {/* Storage visual */}
          <div style={{
            padding: 18, background: 'var(--ti-surface-2)', borderRadius: 8,
            marginBottom: 18, border: '1px solid var(--ti-border)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
              <div>
                <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--ti-muted)', fontWeight: 700 }}>Storage</div>
                <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {state.data.storageUsedMb.toFixed(1)} MB <span style={{ color: 'var(--ti-muted)', fontWeight: 500, fontSize: 14 }}>of {state.data.storageCapGb.toFixed(1)} GB</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 20, fontSize: 12.5, color: 'var(--ti-muted)' }}>
                <div><b style={{ color: 'var(--ti-text)', fontSize: 16 }}>{state.data.vodRecords}</b><div>VOD records</div></div>
                <div><b style={{ color: 'var(--ti-text)', fontSize: 16 }}>{state.data.liveSessions}</b><div>Live sessions</div></div>
              </div>
            </div>
            <div style={{ height: 8, background: '#2a2a33', borderRadius: 4, overflow: 'hidden' }}>
              <div style={{
                width: `${(state.data.storageUsedMb / (state.data.storageCapGb * 1024)) * 100}%`,
                height: '100%', background: `linear-gradient(90deg, ${accent}, ${accent}aa)`,
              }}/>
            </div>
          </div>

          <Group title="Backup & restore" last>
            <StackedRow
              label="Import mode"
              description={`How to handle conflicts when you import a backup. "Merge" keeps your current data and only adds missing records. "Replace" wipes local data first — use for restoring onto a fresh profile.`}
              control={
                <TISelect value={state.data.importMode} onChange={v => setDa('importMode', v)} options={[
                  { value: 'merge', label: 'Merge — keep newest record on conflict' },
                  { value: 'replace', label: 'Replace — wipe local data first' },
                  { value: 'skip', label: 'Skip existing — never overwrite local' },
                ]} width={320}/>
              }
            />
            <StackedRow
              label="Tools"
              description="Export creates a JSON file you can import on another device. Refresh re‑scans Twitch pages with your latest selector patches."
              control={
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <TIButton variant="primary">Export JSON</TIButton>
                  <TIButton variant="ghost">Import JSON</TIButton>
                  <TIButton variant="ghost">Refresh</TIButton>
                  <TIButton variant="danger">Clear all data…</TIButton>
                </div>
              }
              last
            />
          </Group>

          {/* Diagnostics footer */}
          <div style={{
            marginTop: 20, padding: 14,
            background: 'var(--ti-surface-2)', borderRadius: 8,
            border: '1px dashed var(--ti-border-strong)',
            display: 'flex', alignItems: 'center', gap: 12,
            fontSize: 12.5, color: 'var(--ti-muted)',
          }}>
            <span style={{ color: 'var(--ti-subtle)' }}>{TI_ICONS.info}</span>
            <span><b style={{ color: 'var(--ti-text)' }}>Diagnostics:</b> no selector misses recorded. If tiles stop being detected after a Twitch UI update, misses will appear here for debugging.</span>
          </div>
        </Card>

        <footer style={{
          marginTop: 28,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 12, color: 'var(--ti-subtle)',
        }}>
          <span>Twitch Improved · v1.4.2</span>
          <span>Not affiliated with Twitch Interactive, Inc.</span>
        </footer>
      </div>
    </div>
  );
}

// ── Card ──────────────────────────────────────────────────────
function Card({ open, onToggle, icon, title, subtitle, meta, metaColor, accent, children }) {
  return (
    <section style={{
      background: 'var(--ti-surface)',
      border: '1px solid var(--ti-border)',
      borderRadius: 10,
      marginBottom: 16,
      overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        all: 'unset',
        display: 'flex', alignItems: 'center', gap: 16,
        width: '100%', boxSizing: 'border-box',
        padding: '18px 22px',
        cursor: 'pointer',
        borderBottom: open ? '1px solid var(--ti-border)' : 'none',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: `${accent}1A`, color: accent,
          display: 'grid', placeItems: 'center', flexShrink: 0,
        }}>{icon}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--ti-text)' }}>{title}</div>
          <div style={{ fontSize: 13, color: 'var(--ti-muted)', marginTop: 2 }}>{subtitle}</div>
        </div>
        {meta && (
          <div style={{
            fontSize: 12, color: metaColor || 'var(--ti-muted)',
            fontWeight: 600,
            padding: '4px 10px', background: 'var(--ti-surface-2)',
            borderRadius: 999,
          }}>{meta}</div>
        )}
        <div style={{
          color: 'var(--ti-muted)',
          transform: open ? 'rotate(180deg)' : 'rotate(0)',
          transition: 'transform .2s',
        }}>
          {TI_ICONS.chevron}
        </div>
      </button>
      {open && (
        <div style={{ padding: '20px 22px 22px' }}>
          {children}
        </div>
      )}
    </section>
  );
}

// ── Group ─────────────────────────────────────────────────────
function Group({ title, description, children, last }) {
  return (
    <div style={{ paddingBottom: last ? 0 : 24, marginBottom: last ? 0 : 24, borderBottom: last ? 'none' : '1px solid var(--ti-border)' }}>
      <div style={{ marginBottom: 14 }}>
        <div style={{
          fontSize: 10.5, letterSpacing: 1.3, textTransform: 'uppercase',
          color: 'var(--ti-muted)', fontWeight: 700, marginBottom: 4,
        }}>{title}</div>
        {description && (
          <div style={{ fontSize: 12.5, color: 'var(--ti-subtle)' }}>{description}</div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  );
}

// ── Stacked row ───────────────────────────────────────────────
function StackedRow({ label, description, control, last, wideControl }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: wideControl ? '1fr' : 'minmax(0, 1fr) auto',
      gap: wideControl ? 14 : 24,
      padding: '14px 0',
      borderBottom: last ? 'none' : '1px solid var(--ti-border)',
      alignItems: 'start',
    }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--ti-text)', marginBottom: 4 }}>
          {label}
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--ti-muted)', lineHeight: 1.55, maxWidth: 560 }}>
          {description}
        </div>
      </div>
      <div style={{ marginTop: wideControl ? 6 : 4 }}>{control}</div>
    </div>
  );
}

Object.assign(window, { VariationB });
