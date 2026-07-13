import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from '@tanstack/react-table';
import type { ColumnDef } from '@tanstack/react-table';
import { cn } from '@/utils/cn';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  onRowClick?: (row: TData) => void;
  getRowClassName?: (row: TData) => string;
}

/**
 * DataTable Component
 * A wrapper around TanStack Table v8 that implements standardized styling.
 * Supports row clicking and core row modeling.
 */
export function DataTable<TData, TValue>({
  columns,
  data,
  onRowClick,
  getRowClassName,
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="glass-card" style={{ borderRadius: 20, overflowX: 'auto' }}>
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
                      className={alignmentClass}
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
                  onRowClick && 'cursor-pointer',
                  getRowClassName?.(row.original)
                )}
                onClick={() => onRowClick?.(row.original)}
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
  );
}
