import styles from "./site-mode.module.css";

/** Decorative link arrow: fixed SVG geometry avoids platform font substitution. */
export default function ModeArrow() {
  return (
    <svg
      className={styles.arrow}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M3 13 13 3M3 3h10v10" />
    </svg>
  );
}
