// Shared primitives for both Twitch Improved settings variations.
// All components read CSS vars so tweaks can swap accent/density/mode live.

const TI_ICONS = {
  declutter: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18M6 12h12M10 18h4"/>
    </svg>
  ),
  heatmap: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1"/>
      <rect x="14" y="3" width="7" height="7" rx="1"/>
      <rect x="3" y="14" width="7" height="7" rx="1"/>
      <rect x="14" y="14" width="7" height="7" rx="1"/>
    </svg>
  ),
  data: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3"/>
      <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5"/>
      <path d="M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/>
    </svg>
  ),
  check: (
    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5L20 7"/>
    </svg>
  ),
  chevron: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6"/>
    </svg>
  ),
  info: (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4M12 8h.01"/>
    </svg>
  ),
  search: (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7"/>
      <path d="M20 20l-3.5-3.5"/>
    </svg>
  ),
};

// ── Toggle ──────────────────────────────────────────────────────
function TIToggle({ checked, onChange, size = 'md' }) {
  const w = size === 'sm' ? 34 : 40;
  const h = size === 'sm' ? 18 : 22;
  const knob = h - 6;
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: w, height: h, borderRadius: h,
        border: 'none', padding: 0, cursor: 'pointer',
        background: checked ? 'var(--ti-accent)' : '#3a3a43',
        position: 'relative',
        transition: 'background .15s',
      }}
    >
      <span style={{
        position: 'absolute',
        top: 3, left: checked ? w - knob - 3 : 3,
        width: knob, height: knob, borderRadius: knob,
        background: '#fff',
        transition: 'left .18s cubic-bezier(.2,.7,.3,1)',
        boxShadow: '0 1px 2px rgba(0,0,0,.3)',
      }}/>
    </button>
  );
}

// ── Checkbox ────────────────────────────────────────────────────
function TICheckbox({ checked, onChange, label }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 10,
      cursor: 'pointer', userSelect: 'none',
      color: 'var(--ti-text)',
      fontSize: 14,
    }}>
      <span style={{
        width: 18, height: 18, borderRadius: 4,
        background: checked ? 'var(--ti-accent)' : 'transparent',
        border: checked ? '1.5px solid var(--ti-accent)' : '1.5px solid #4a4a55',
        display: 'grid', placeItems: 'center',
        color: '#fff',
        transition: 'all .12s',
      }}>
        {checked && TI_ICONS.check}
      </span>
      <span>{label}</span>
    </label>
  );
}

// ── Radio group ─────────────────────────────────────────────────
function TIRadioGroup({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map(o => (
        <label key={o.value} style={{
          display: 'flex', alignItems: 'flex-start', gap: 10,
          cursor: 'pointer', color: 'var(--ti-text)', fontSize: 14,
        }}>
          <span style={{
            width: 18, height: 18, borderRadius: 10, flexShrink: 0,
            border: `1.5px solid ${value === o.value ? 'var(--ti-accent)' : '#4a4a55'}`,
            display: 'grid', placeItems: 'center', marginTop: 1,
            transition: 'border-color .12s',
          }}>
            {value === o.value && (
              <span style={{
                width: 9, height: 9, borderRadius: 5,
                background: 'var(--ti-accent)',
              }}/>
            )}
          </span>
          <span>
            <div>{o.label}</div>
            {o.hint && <div style={{ color: 'var(--ti-muted)', fontSize: 12.5, marginTop: 2 }}>{o.hint}</div>}
          </span>
        </label>
      ))}
    </div>
  );
}

// ── Select ──────────────────────────────────────────────────────
function TISelect({ value, onChange, options, width }) {
  return (
    <div style={{ position: 'relative', display: 'inline-block', width: width || 'auto' }}>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          appearance: 'none',
          background: 'var(--ti-input-bg)',
          border: '1px solid var(--ti-border)',
          borderRadius: 4,
          color: 'var(--ti-text)',
          fontSize: 13,
          fontFamily: 'inherit',
          padding: '7px 30px 7px 10px',
          cursor: 'pointer',
          width: '100%',
        }}
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <span style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        pointerEvents: 'none', color: 'var(--ti-muted)',
      }}>
        {TI_ICONS.chevron}
      </span>
    </div>
  );
}

// ── Slider ──────────────────────────────────────────────────────
function TISlider({ value, min, max, step, onChange, suffix }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: 'var(--ti-muted)' }}>
        <span>{min}{suffix}</span>
        <span style={{ color: 'var(--ti-text)', fontVariantNumeric: 'tabular-nums' }}>{value}{suffix}</span>
        <span>{max}{suffix}</span>
      </div>
      <input
        type="range"
        min={min} max={max} step={step} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          width: '100%',
          appearance: 'none',
          height: 4,
          borderRadius: 2,
          background: `linear-gradient(to right, var(--ti-accent) 0%, var(--ti-accent) ${pct}%, #3a3a43 ${pct}%, #3a3a43 100%)`,
          outline: 'none',
          cursor: 'pointer',
        }}
      />
    </div>
  );
}

// ── Number input ────────────────────────────────────────────────
function TINumber({ value, onChange, min, max, suffix, width }) {
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number" min={min} max={max} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{
          background: 'var(--ti-input-bg)',
          border: '1px solid var(--ti-border)',
          borderRadius: 4,
          color: 'var(--ti-text)',
          fontSize: 13,
          fontFamily: 'inherit',
          padding: '7px 10px',
          width: width || 80,
          outline: 'none',
        }}
      />
      {suffix && <span style={{ color: 'var(--ti-muted)', fontSize: 13 }}>{suffix}</span>}
    </div>
  );
}

// ── Button ──────────────────────────────────────────────────────
function TIButton({ children, onClick, variant = 'secondary', size = 'md' }) {
  const pad = size === 'sm' ? '6px 12px' : '8px 16px';
  const palettes = {
    primary: { bg: 'var(--ti-accent)', color: '#fff', border: 'transparent' },
    secondary: { bg: '#2a2a33', color: 'var(--ti-text)', border: 'transparent' },
    ghost: { bg: 'transparent', color: 'var(--ti-text)', border: 'var(--ti-border)' },
    danger: { bg: 'transparent', color: '#f47171', border: 'rgba(244,113,113,.35)' },
  };
  const p = palettes[variant];
  return (
    <button onClick={onClick} style={{
      background: p.bg,
      color: p.color,
      border: `1px solid ${p.border}`,
      borderRadius: 4,
      padding: pad,
      fontSize: 13,
      fontWeight: 600,
      fontFamily: 'inherit',
      cursor: 'pointer',
      transition: 'filter .12s',
    }}
    onMouseOver={e => e.currentTarget.style.filter = 'brightness(1.15)'}
    onMouseOut={e => e.currentTarget.style.filter = 'none'}
    >{children}</button>
  );
}

// ── Color picker (swatches + custom) ─────────────────────────────
function TIColorPicker({ value, onChange }) {
  const swatches = ['#A970FF', '#00F5D4', '#FF6B9D', '#FFB703', '#4ADE80', '#60A5FA', '#F87171', '#FFFFFF'];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      {swatches.map(s => (
        <button key={s} onClick={() => onChange(s)} style={{
          width: 26, height: 26, borderRadius: 6,
          background: s,
          border: value.toLowerCase() === s.toLowerCase() ? '2px solid #fff' : '2px solid transparent',
          boxShadow: value.toLowerCase() === s.toLowerCase() ? '0 0 0 2px var(--ti-accent)' : 'none',
          cursor: 'pointer', padding: 0,
        }} aria-label={s}/>
      ))}
      <label style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '4px 10px 4px 4px',
        background: 'var(--ti-input-bg)',
        border: '1px solid var(--ti-border)',
        borderRadius: 6, cursor: 'pointer',
      }}>
        <span style={{
          width: 20, height: 20, borderRadius: 4, background: value, display: 'block',
          border: '1px solid rgba(255,255,255,.15)',
        }}/>
        <span style={{ fontSize: 12, fontFamily: 'ui-monospace, Menlo, monospace', color: 'var(--ti-text)' }}>
          {value.toUpperCase()}
        </span>
        <input type="color" value={value} onChange={e => onChange(e.target.value)}
          style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}/>
      </label>
    </div>
  );
}

// ── Heatmap preview (used in the indicator explainer) ───────────
function HeatmapTilePreview({ color, showBadge = true, showBorder = false, showBar = true }) {
  return (
    <div style={{
      width: 160, height: 90, borderRadius: 6,
      background: 'linear-gradient(135deg, #2a1f4a 0%, #4a2a5e 60%, #1f1f2a 100%)',
      position: 'relative', overflow: 'hidden',
      border: showBorder ? `2px solid ${color}` : '2px solid transparent',
      flexShrink: 0,
    }}>
      {/* fake thumbnail highlights */}
      <div style={{ position: 'absolute', left: 8, top: 8, width: 50, height: 6, background: 'rgba(255,255,255,.2)', borderRadius: 2 }}/>
      <div style={{ position: 'absolute', left: 8, top: 20, width: 30, height: 5, background: 'rgba(255,255,255,.12)', borderRadius: 2 }}/>
      {showBadge && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          background: color, color: '#fff',
          fontSize: 9, fontWeight: 700, letterSpacing: 0.4,
          padding: '2px 6px', borderRadius: 2, textTransform: 'uppercase',
        }}>Watched</div>
      )}
      {showBar && (
        <div style={{
          position: 'absolute', left: 0, right: 0, bottom: 0, height: 4,
          background: 'rgba(0,0,0,.4)',
        }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: '72%',
            background: `linear-gradient(90deg, ${color}55, ${color})`,
          }}/>
        </div>
      )}
    </div>
  );
}

// ── Default settings state used by both variations ──────────────
const TI_DEFAULT_STATE = {
  declutter: {
    hideTopCarousel: true,
    hideBelowCarousel: true,
    hideOfflinePreview: true,
    hideViewersAlsoWatch: true,
    hideRecommendedChannels: true,
    hideRecommendedCategories: true,
    hideAdFree: true,
  },
  heatmap: {
    enabled: true,
    threshold: 85,
    bucketSeconds: 10,
    indicatorColor: '#A970FF',
    indicatorStyle: 'badge',
    showOnTiles: true,
    hideDefaultBar: true,
    showOnPlayerBar: true,
    trackLive: true,
    pauseWhenUnfocused: false,
    minWatchSeconds: 10,
  },
  data: {
    importMode: 'merge',
    vodRecords: 22,
    liveSessions: 2,
    storageUsedMb: 1.1,
    storageCapGb: 2.0,
  },
};

Object.assign(window, {
  TI_ICONS, TIToggle, TICheckbox, TIRadioGroup, TISelect, TISlider,
  TINumber, TIButton, TIColorPicker, HeatmapTilePreview, TI_DEFAULT_STATE,
});
