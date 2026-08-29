import { useId } from "react";
import styles from "./FilterSelect.module.css";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterSelectProps {
  label: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
  /** Value that counts as "no filter" — used to render the active accent. */
  neutralValue?: string;
}

/** Compact labeled select used for the direction/status list filters. */
export function FilterSelect({ label, value, options, onChange, neutralValue = "all" }: FilterSelectProps) {
  const id = useId();
  const isActive = value !== neutralValue;

  return (
    <div className={[styles.field, isActive ? styles.active : ""].filter(Boolean).join(" ")}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <div className={styles.selectWrap}>
        <select id={id} className={styles.select} value={value} onChange={(event) => onChange(event.target.value)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <svg className={styles.chevron} viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </div>
  );
}
