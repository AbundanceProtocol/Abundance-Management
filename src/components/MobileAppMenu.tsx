"use client";

import React from "react";
import { ChevronDown, Settings as SettingsIcon } from "./Icons";

/** Typography for primary controls in the expanded mobile board menu (segmented row, sign out). */
export const MOBILE_MENU_BUTTON: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 6px",
};

export const MOBILE_MENU_SIGN_OUT: React.CSSProperties = {
  fontSize: 10,
  padding: "3px 8px",
};

type CollapsedProps = {
  title: string;
  subtitle?: string;
  /** e.g. Tasks · Pages links */
  links: React.ReactNode;
  onExpand: () => void;
  menuId: string;
  onOpenSettings?: () => void;
};

/** Slim top strip when the full app menu is hidden (narrow viewports). */
export function MobileAppMenuCollapsedBar({
  title,
  subtitle,
  links,
  onExpand,
  menuId,
  onOpenSettings,
}: CollapsedProps) {
  return (
    <div
      role="region"
      aria-label="App menu"
      style={{
        borderBottom: "1px solid var(--border-color)",
        padding: "10px 16px",
        display: "flex",
        alignItems: "center",
        gap: 12,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text-primary)",
            letterSpacing: "-0.01em",
          }}
        >
          {title}
        </div>
        {subtitle ? (
          <div
            style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 2 }}
          >
            {subtitle}
          </div>
        ) : null}
        <div style={{ fontSize: 11, marginTop: 6 }}>{links}</div>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onOpenSettings}
          title="Settings"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--text-secondary)",
            cursor: "pointer",
          }}
        >
          <SettingsIcon size={16} />
        </button>
        <button
          type="button"
          onClick={onExpand}
          aria-expanded={false}
          aria-controls={menuId}
          aria-label="Expand menu"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            borderRadius: 8,
            border: "1px solid var(--border-color)",
            background: "var(--bg-tertiary)",
            color: "var(--text-primary)",
            cursor: "pointer",
          }}
        >
          <ChevronDown size={18} />
        </button>
      </div>
    </div>
  );
}

/** Chevron-up control to collapse the full menu on narrow viewports. */
export function MobileAppMenuCollapseButton({
  menuId,
  onCollapse,
  /** Sit next to a title on one row instead of a full-width bar above it. */
  inline = false,
}: {
  menuId: string;
  onCollapse: () => void;
  inline?: boolean;
}) {
  const button = (
    <button
      type="button"
      onClick={onCollapse}
      aria-expanded
      aria-controls={menuId}
      aria-label="Collapse menu"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 8,
        borderRadius: 8,
        border: "1px solid var(--border-color)",
        background: "var(--bg-tertiary)",
        color: "var(--text-primary)",
        cursor: "pointer",
        flexShrink: 0,
      }}
    >
      <span style={{ display: "inline-flex", transform: "rotate(180deg)" }}>
        <ChevronDown size={18} />
      </span>
    </button>
  );

  if (inline) return button;

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        width: "100%",
      }}
    >
      {button}
    </div>
  );
}
