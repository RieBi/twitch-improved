import { type ReactNode, useId, useState } from "react";
import { ChevronIcon } from "./Icons";

interface SectionCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  meta?: ReactNode;
  metaTone?: "default" | "success";
  defaultOpen?: boolean;
  children: ReactNode;
}

interface SettingGroupProps {
  title: string;
  description?: string;
  children: ReactNode;
}

interface SettingRowProps {
  label: string;
  description: string;
  control: ReactNode;
  wideControl?: boolean;
}

interface ToggleControlProps {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

interface ToggleSettingRowProps {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function SectionCard({
  title,
  description,
  icon,
  meta,
  metaTone = "default",
  defaultOpen = true,
  children
}: SectionCardProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();

  return (
    <section className="ti-card">
      <button
        type="button"
        className="ti-card-header"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="ti-card-header-main">
          <span className="ti-card-icon">{icon}</span>
          <span className="ti-card-heading">
            <span className="ti-card-title">{title}</span>
            <span className="ti-card-description">{description}</span>
          </span>
        </span>
        <span className="ti-card-header-meta">
          {meta ? <span className={`ti-pill${metaTone === "success" ? " is-success" : ""}`}>{meta}</span> : null}
          <span className={`ti-chevron${open ? " is-open" : ""}`} aria-hidden="true">
            <ChevronIcon />
          </span>
        </span>
      </button>
      {open ? (
        <div id={bodyId} className="ti-card-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

export function SettingGroup({ title, description, children }: SettingGroupProps) {
  return (
    <section className="ti-group">
      <header className="ti-group-header">
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="ti-group-body">{children}</div>
    </section>
  );
}

export function SettingRow({ label, description, control, wideControl = false }: SettingRowProps) {
  return (
    <div className={`ti-setting-row${wideControl ? " is-wide" : ""}`}>
      <div className="ti-setting-copy">
        <p className="ti-setting-label">{label}</p>
        <p className="ti-setting-description">{description}</p>
      </div>
      <div className="ti-setting-control">{control}</div>
    </div>
  );
}

export function ToggleControl({ id, checked, onChange, disabled = false }: ToggleControlProps) {
  return (
    <label className="ti-switch" htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ti-switch-track" aria-hidden="true">
        <span className="ti-switch-thumb" />
      </span>
    </label>
  );
}

export function ToggleSettingRow({
  id,
  label,
  description,
  checked,
  onChange,
  disabled = false
}: ToggleSettingRowProps) {
  return (
    <SettingRow
      label={label}
      description={description}
      control={<ToggleControl id={id} checked={checked} onChange={onChange} disabled={disabled} />}
    />
  );
}
