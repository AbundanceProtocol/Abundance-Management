"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MarkdownPageItem } from "@/lib/pagesTypes";
import {
  listRecurringDayPages,
  plainTextFromPageBody,
  sortDayPagesByDate,
} from "@/lib/recurringNotesPages";
import { FileText } from "./Icons";

const SAVE_DEBOUNCE_MS = 550;

type RowProps = {
  page: MarkdownPageItem;
  label: string;
  onSavePlain: (plainText: string) => void;
  onOpenFull?: () => void;
};

function RecurringDayNoteRow({ page, label, onSavePlain, onOpenFull }: RowProps) {
  const [text, setText] = useState(() => plainTextFromPageBody(page.body));
  const textRef = useRef(plainTextFromPageBody(page.body));
  const focusedRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (focusedRef.current) return;
    const plain = plainTextFromPageBody(page.body);
    setText(plain);
    textRef.current = plain;
  }, [page.body]);

  const flushSave = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    onSavePlain(textRef.current);
  }, [onSavePlain]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(flushSave, SAVE_DEBOUNCE_MS);
  }, [flushSave]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    []
  );

  const lineCount = text.split("\n").length;
  const rows = Math.min(36, Math.max(5, lineCount + 2));

  return (
    <li>
      <div
        style={{
          borderRadius: 8,
          border: "1px solid var(--border-color)",
          background: "var(--bg-primary)",
          padding: "10px 12px",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent-blue)" }}>
            {label}
          </span>
          {onOpenFull && (
            <button
              type="button"
              onClick={onOpenFull}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: "4px 8px",
                borderRadius: 6,
                border: "1px solid var(--border-color)",
                background: "var(--bg-tertiary)",
                color: "var(--text-secondary)",
                cursor: "pointer",
              }}
            >
              Full page editor
            </button>
          )}
        </div>
        <textarea
          value={text}
          onChange={(e) => {
            const v = e.target.value;
            textRef.current = v;
            setText(v);
            scheduleSave();
          }}
          onFocus={() => {
            focusedRef.current = true;
          }}
          onBlur={() => {
            focusedRef.current = false;
            flushSave();
          }}
          rows={rows}
          placeholder="Notes for this day…"
          style={{
            width: "100%",
            resize: "vertical",
            minHeight: 120,
            maxHeight: 560,
            boxSizing: "border-box",
            borderRadius: 6,
            padding: 10,
            border: "1px solid var(--border-color)",
            background: "var(--bg-secondary)",
            color: "var(--text-primary)",
            fontFamily: "inherit",
            fontSize: 13,
            lineHeight: 1.5,
          }}
        />
      </div>
    </li>
  );
}

type Props = {
  hubTitle: string;
  hubId: string;
  items: MarkdownPageItem[];
  sortOrder: "asc" | "desc";
  onSortOrderChange: (order: "asc" | "desc") => void;
  onSaveDayPagePlain: (pageId: string, plainText: string) => void;
  onOpenDayPage?: (pageId: string) => void;
};

export default function RecurringNotesAggregateView({
  hubTitle,
  hubId,
  items,
  sortOrder,
  onSortOrderChange,
  onSaveDayPagePlain,
  onOpenDayPage,
}: Props) {
  const dayPages = useMemo(() => {
    const raw = listRecurringDayPages(items, hubId);
    return sortDayPagesByDate(raw, sortOrder);
  }, [items, hubId, sortOrder]);

  return (
    <div
      style={{
        padding: "16px 18px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-tertiary)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ flexShrink: 0, color: "var(--accent-blue)", display: "flex" }}>
            <FileText size={18} />
          </span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary)" }}>
              Daily notes · {hubTitle.trim() || "Untitled"}
            </div>
            <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 2 }}>
              Each date is expanded below—edit in place. Rich formatting via full page editor.
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 11, color: "var(--text-secondary)", fontWeight: 600 }}>
            Sort
          </span>
          <select
            value={sortOrder}
            onChange={(e) =>
              onSortOrderChange(e.target.value === "desc" ? "desc" : "asc")
            }
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 6,
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
            }}
          >
            <option value="asc">Earliest first</option>
            <option value="desc">Latest first</option>
          </select>
        </div>
      </div>

      {dayPages.length === 0 ? (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
          No day pages yet. Add a note from the task panel or create a child page below.
        </p>
      ) : (
        <ul
          style={{
            margin: 0,
            padding: 0,
            listStyle: "none",
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          {dayPages.map((p) => {
            const lbl = p.recurringNoteDateYmd ?? p.title;
            return (
              <RecurringDayNoteRow
                key={p.id}
                page={p}
                label={lbl}
                onSavePlain={(plain) => onSaveDayPagePlain(p.id, plain)}
                onOpenFull={onOpenDayPage ? () => onOpenDayPage(p.id) : undefined}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
