"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { TimeUnit } from "@/lib/types";
import { Clock, Pause, Play, Square } from "./Icons";

interface Props {
  open: boolean;
  taskTitle: string;
  dateYmd: string;
  noteText: string;
  saving: boolean;
  /** Used to set default timer length when unit is minutes. */
  timeEstimate: number | null;
  timeUnit: TimeUnit;
  onDateChange: (next: string) => void;
  onTextChange: (next: string) => void;
  onClose: () => void;
}

function clampYmd(input: string): string {
  const s = input.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : "";
}

const DEFAULT_TIMER_SECONDS = 3 * 60;
const MAX_TIMER_SECONDS = 24 * 60 * 60;

function defaultTimerSeconds(
  estimate: number | null | undefined,
  unit: TimeUnit
): number {
  if (unit === "minutes" && estimate != null && estimate > 0) {
    return Math.max(1, Math.round(estimate)) * 60;
  }
  return DEFAULT_TIMER_SECONDS;
}

function clampDurationSeconds(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_TIMER_SECONDS;
  return Math.max(1, Math.min(MAX_TIMER_SECONDS, Math.floor(n)));
}

const ICON_BTN: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 28,
  padding: 0,
  borderRadius: 6,
  border: "1px solid var(--border-color)",
  background: "var(--bg-tertiary)",
  color: "var(--text-primary)",
  cursor: "pointer",
};

const TIME_INPUT: React.CSSProperties = {
  width: 52,
  height: 34,
  padding: "4px 6px",
  borderRadius: 4,
  borderWidth: 1,
  borderStyle: "solid",
  borderColor: "var(--border-color)",
  background: "var(--bg-secondary)",
  color: "var(--text-primary)",
  fontSize: 18,
  fontWeight: 600,
  fontFamily: "ui-monospace, monospace",
  boxSizing: "border-box",
  textAlign: "center",
};

export default function RecurringTaskNotesModal({
  open,
  taskTitle,
  dateYmd,
  noteText,
  saving,
  timeEstimate,
  timeUnit,
  onDateChange,
  onTextChange,
  onClose,
}: Props) {
  const displayTitle = useMemo(
    () => taskTitle.trim() || "Untitled",
    [taskTitle]
  );

  const safeDate = useMemo(() => clampYmd(dateYmd), [dateYmd]);
  const [localDate, setLocalDate] = useState(safeDate);

  const baselineSeconds = useMemo(
    () => defaultTimerSeconds(timeEstimate, timeUnit),
    [timeEstimate, timeUnit]
  );

  /** User-chosen countdown length (Stop resets remaining to this). */
  const [presetSeconds, setPresetSeconds] = useState(baselineSeconds);
  const [remainingSeconds, setRemainingSeconds] = useState(baselineSeconds);
  const [isRunning, setIsRunning] = useState(false);
  const [noteBorderFlash, setNoteBorderFlash] = useState(false);

  const applyPresetSeconds = useCallback((next: number) => {
    const v = clampDurationSeconds(next);
    setPresetSeconds(v);
    if (!isRunning) setRemainingSeconds(v);
  }, [isRunning]);

  const resetTimerToPreset = useCallback(() => {
    setRemainingSeconds(presetSeconds);
    setIsRunning(false);
    setNoteBorderFlash(false);
  }, [presetSeconds]);

  useEffect(() => {
    if (!open) return;
    setLocalDate(safeDate);
    const base = defaultTimerSeconds(timeEstimate, timeUnit);
    setPresetSeconds(base);
    setRemainingSeconds(base);
    setIsRunning(false);
    setNoteBorderFlash(false);
  }, [open, safeDate, timeEstimate, timeUnit]);

  useEffect(() => {
    if (!isRunning) return;
    const id = window.setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setIsRunning(false);
          setNoteBorderFlash(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [isRunning]);

  if (!open) return null;

  const atZero = remainingSeconds <= 0;
  const remMin = Math.floor(remainingSeconds / 60);
  const remSec = remainingSeconds % 60;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="recurring-notes-modal-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 420,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(0,0,0,0.55)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%",
          maxWidth: 560,
          maxHeight: "min(78vh, 640px)",
          borderRadius: 10,
          border: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          boxShadow: "0 16px 48px rgba(0,0,0,0.45)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            padding: "16px 18px",
            borderBottom: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <h2
            id="recurring-notes-modal-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 700,
              color: "var(--text-primary)",
              minWidth: 0,
            }}
          >
            Daily notes · {displayTitle}
          </h2>

          <button
            type="button"
            onClick={onClose}
            style={{
              flexShrink: 0,
              padding: "6px 12px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-tertiary)",
              color: "var(--text-primary)",
              fontSize: 13,
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>

        <div
          style={{
            padding: "14px 18px 18px",
            overflow: "auto",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Date
            </label>

            <input
              type="date"
              value={localDate}
              onChange={(e) => {
                const next = e.target.value;
                setLocalDate(next);
                onDateChange(next);
              }}
              style={{
                flex: 1,
                minWidth: 0,
                padding: "8px 10px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
              }}
            />
          </div>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-subtle)",
              background: "var(--bg-primary)",
              width: "100%",
              boxSizing: "border-box",
            }}
            aria-label="Timer"
          >
            <span style={{ color: "var(--text-muted)", display: "flex", flexShrink: 0 }}>
              <Clock size={14} />
            </span>
            <input
              type="number"
              min={0}
              max={999}
              step={1}
              readOnly={isRunning}
              tabIndex={isRunning ? -1 : undefined}
              value={remMin}
              onChange={(e) => {
                const m = Math.max(0, Math.min(999, Number(e.target.value) || 0));
                applyPresetSeconds(m * 60 + remSec);
              }}
              aria-label="Minutes"
              aria-live={isRunning ? "polite" : undefined}
              className={isRunning ? "recurring-notes-timer-input-flat" : undefined}
              style={{
                ...TIME_INPUT,
                ...(isRunning
                  ? {
                      background: "transparent",
                      borderWidth: 0,
                      borderStyle: "solid",
                      borderColor: "transparent",
                      boxShadow: "none",
                      outline: "none",
                      cursor: "default",
                    }
                  : {}),
                color: atZero ? "var(--accent-green)" : "var(--text-primary)",
              }}
            />
            <span
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 20,
                fontWeight: 600,
                color: "var(--text-muted)",
                userSelect: "none",
              }}
            >
              :
            </span>
            <input
              type="number"
              min={0}
              max={59}
              step={1}
              readOnly={isRunning}
              tabIndex={isRunning ? -1 : undefined}
              value={remSec}
              onChange={(e) => {
                const s = Math.max(0, Math.min(59, Number(e.target.value) || 0));
                applyPresetSeconds(remMin * 60 + s);
              }}
              aria-label="Seconds"
              aria-live={isRunning ? "polite" : undefined}
              className={isRunning ? "recurring-notes-timer-input-flat" : undefined}
              style={{
                ...TIME_INPUT,
                ...(isRunning
                  ? {
                      background: "transparent",
                      borderWidth: 0,
                      borderStyle: "solid",
                      borderColor: "transparent",
                      boxShadow: "none",
                      outline: "none",
                      cursor: "default",
                    }
                  : {}),
                color: atZero ? "var(--accent-green)" : "var(--text-primary)",
              }}
            />
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              <button
                type="button"
                disabled={atZero}
                onClick={() => setIsRunning((r) => !r)}
                style={{
                  ...ICON_BTN,
                  cursor: atZero ? "not-allowed" : "pointer",
                  opacity: atZero ? 0.55 : 1,
                }}
                title={isRunning ? "Pause" : "Start"}
                aria-label={isRunning ? "Pause" : "Start"}
              >
                {isRunning ? <Pause size={14} /> : <Play size={14} />}
              </button>
              <button
                type="button"
                onClick={resetTimerToPreset}
                style={ICON_BTN}
                title="Stop (reset)"
                aria-label="Stop (reset)"
              >
                <Square size={14} />
              </button>
            </div>
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text-secondary)",
                marginBottom: 6,
                fontWeight: 600,
              }}
            >
              Note
            </label>
            <textarea
              value={noteText}
              onChange={(e) => onTextChange(e.target.value)}
              rows={9}
              placeholder="Add notes for this date…"
              autoFocus
              className={noteBorderFlash ? "recurring-notes-text--timer-done" : undefined}
              onAnimationEnd={() => setNoteBorderFlash(false)}
              style={{
                width: "100%",
                resize: "vertical",
                minHeight: 180,
                borderRadius: 8,
                padding: 12,
                border: "1px solid var(--border-color)",
                background: "var(--bg-primary)",
                color: "var(--text-primary)",
                lineHeight: 1.5,
                boxSizing: "border-box",
                fontFamily: "inherit",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>
            {saving
              ? "Saving changes…"
              : "Saves to that date’s page (see the hub on Pages for all days)."}
          </div>
        </div>
      </div>
    </div>
  );
}
