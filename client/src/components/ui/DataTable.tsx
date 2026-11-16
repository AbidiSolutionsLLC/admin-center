import React from 'react';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/utils/cn';

/** Cursor paging controls. The server owns the cursor; the table only shows the buttons. */
export interface DataTableCursorPaging {
  hasNext: boolean;
  hasPrev?: boolean;
  onNext: () => void;
  onPrev?: () => void;
  isLoading?: boolean;
}

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: TData) => string;
  /** Keeps the header visible while the body scrolls (body scrolls inside 70vh). */
  stickyHeader?: boolean;
  /** Cursor pagination footer. Omit for an unpaged table. */
  paging?: DataTableCursorPaging;
}

/**
 * DataTable Component
 * A wrapper around TanStack Table v8 that implements standardized styling.
 * Supports row clicking, cursor paging, a sticky header and keyboard rows:
 * with `onRowClick` each row is focusable, Enter or Space opens it, and the
 * Up / Down arrows move between rows.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  getRowClassName,
  stickyHeader = false,
  paging,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleRowKeyDown = (e: React.KeyboardEvent<HTMLTableRowElement>, row: TData) => {
    if (!onRowClick) return;
    if (e.target !== e.currentTarget) return; // ignore keys typed in controls inside the row
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onRowClick(row);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const sibling = (e.key === 'ArrowDown'
        ? e.currentTarget.nextElementSibling
        : e.currentTarget.previousElementSibling) as HTMLElement | null;
      sibling?.focus();
    }
  };

  return (
    <div className="glass-card" style={{ borderRadius: 20 }}>
      <div
        className={cn('overflow-x-auto', stickyHeader && 'max-h-[70vh] overflow-y-auto')}
        style={{ borderRadius: 20 }}
      >
        <table className="glass-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id} style={{ background: 'rgba(255,255,255,0.02)' }}>
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                  const alignmentClass = meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : '';

                  return (
                    <th
                      key={header.id}
                      className={cn(alignmentClass, stickyHeader && 'sticky top-0 z-10 bg-surface-elevated')}
                      style={{
                        minWidth: header.column.columnDef.minSize || undefined,
                        width: header.column.columnDef.size || undefined,
                      }}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className={cn(
                    onRowClick &&
                      'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                    getRowClassName?.(row.original)
                  )}
                  tabIndex={onRowClick ? 0 : undefined}
                  onClick={() => onRowClick?.(row.original)}
                  onKeyDown={(e) => handleRowKeyDown(e, row.original)}
                >
                  {row.getVisibleCells().map((cell) => {
                    const meta = cell.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                    const alignmentClass = meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : '';

                    return (
                      <td key={cell.id} className={cn('text-sm text-ink', alignmentClass)}
                        style={{
                          minWidth: cell.column.columnDef.minSize || undefined,
                          width: cell.column.columnDef.size || undefined,
                        }}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    );
                  })}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="h-24 text-center text-sm text-ink-muted">
                  No items found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {paging && (paging.hasNext || paging.hasPrev) && (
        <div className="flex items-center justify-end gap-2 border-t border-line px-4 py-2">
          <button
            type="button"
            onClick={paging.onPrev}
            disabled={!paging.hasPrev || paging.isLoading}
            aria-label="Previous page"
            className="h-8 w-8 flex items-center justify-center rounded-control border border-line text-ink-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={paging.onNext}
            disabled={!paging.hasNext || paging.isLoading}
            aria-label="Next page"
            className="h-8 w-8 flex items-center justify-center rounded-control border border-line text-ink-secondary hover:bg-surface-hover disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}
