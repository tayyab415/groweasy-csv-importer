"use client";

import { useRef, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface Column {
  key: string;
  label: string;
  width?: number;
  /** Optional custom cell renderer (e.g. status badges). */
  render?: (value: string, row: string[], rowIndex: number) => ReactNode;
}

interface DataTableProps {
  columns: Column[];
  /** Rows as cell arrays aligned to `columns`. */
  rows: string[][];
  maxHeight?: number;
  rowHeight?: number;
  emptyText?: string;
  /** Optional 1-based row-number column pinned on the left. */
  showRowNumbers?: boolean;
}

const DEFAULT_WIDTH = 190;

/**
 * Virtualized data table with a sticky header, horizontal + vertical scrolling,
 * and a responsive container. Only visible rows are rendered so multi-thousand
 * row CSVs stay smooth.
 */
export default function DataTable({
  columns,
  rows,
  maxHeight = 460,
  rowHeight = 44,
  emptyText = "No rows to display.",
  showRowNumbers = true,
}: DataTableProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const numCol = showRowNumbers ? "56px " : "";
  const template = numCol + columns.map((c) => `${c.width ?? DEFAULT_WIDTH}px`).join(" ");
  const minWidth = (showRowNumbers ? 56 : 0) + columns.reduce((s, c) => s + (c.width ?? DEFAULT_WIDTH), 0);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center text-sm text-[var(--text-muted)]">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
      <div ref={scrollRef} className="scroll-thin overflow-auto" style={{ maxHeight }}>
        <div style={{ minWidth }}>
          {/* Sticky header */}
          <div
            className="sticky top-0 z-10 grid border-b border-[var(--border)] bg-[var(--surface-2)] text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]"
            style={{ gridTemplateColumns: template }}
          >
            {showRowNumbers && <div className="px-3 py-3">#</div>}
            {columns.map((c) => (
              <div key={c.key} className="truncate px-3 py-3" title={c.label}>
                {c.label}
              </div>
            ))}
          </div>

          {/* Virtualized body */}
          <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
            {virtualizer.getVirtualItems().map((vi) => {
              const row = rows[vi.index];
              return (
                <div
                  key={vi.key}
                  className="grid items-center border-b border-[var(--border)] text-sm hover:bg-[var(--surface-2)]"
                  style={{
                    gridTemplateColumns: template,
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: vi.size,
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  {showRowNumbers && (
                    <div className="px-3 text-xs text-[var(--text-muted)]">{vi.index + 1}</div>
                  )}
                  {columns.map((c, ci) => {
                    const value = row[ci] ?? "";
                    return (
                      <div key={c.key} className="truncate px-3" title={value}>
                        {c.render ? c.render(value, row, vi.index) : value || <span className="text-[var(--text-muted)]">—</span>}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
