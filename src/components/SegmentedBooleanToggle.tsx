"use client";

import { useId } from "react";

const TRACK_W = 46;
const THUMB = 20;
const INSET = 3;
const THUMB_ON_LEFT = TRACK_W - INSET - THUMB;

type Props = {
  /** Shown beside the switch. */
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  /** Tooltip on hover. */
  title?: string;
};

/** Graphic on/off switch (track + thumb), label on the left. */
export default function SegmentedBooleanToggle({
  label,
  value,
  onChange,
  title,
}: Props) {
  const labelId = useId();

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        flexWrap: "wrap",
      }}
    >
      <span
        id={labelId}
        style={{
          fontSize: 13,
          color: "var(--text-muted)",
          whiteSpace: "nowrap",
        }}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-labelledby={labelId}
        title={title}
        onClick={() => onChange(!value)}
        className="outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-blue)] focus-visible:outline-offset-2"
        style={{
          position: "relative",
          width: TRACK_W,
          height: 26,
          flexShrink: 0,
          borderRadius: 999,
          border: "1px solid var(--border-color)",
          padding: 0,
          cursor: "pointer",
          background: value ? "var(--accent-blue)" : "var(--bg-tertiary)",
          transition: "background 0.2s ease",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: INSET,
            left: value ? THUMB_ON_LEFT : INSET,
            width: THUMB,
            height: THUMB,
            borderRadius: "50%",
            background: "var(--text-primary)",
            boxShadow: "0 1px 3px rgba(0,0,0,0.45)",
            transition: "left 0.2s ease",
          }}
        />
      </button>
    </div>
  );
}
