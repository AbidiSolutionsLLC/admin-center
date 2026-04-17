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
}: DataTableProps<TData, TValue>) {
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-x-auto">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="bg-surface-base border-b border-line">
                {headerGroup.headers.map((header) => {
                  const meta = header.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                  const alignmentClass = meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : 'text-left';
                  
                  return (
                    <th
                      key={header.id}
                      className={cn(
                        'h-10 px-4 text-[11px] font-semibold text-ink-secondary uppercase tracking-wider',
                        alignmentClass
                      )}
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
                  'border-b border-line last:border-0 hover:bg-surface-base transition-colors duration-100',
                  onRowClick && 'cursor-pointer'
                )}
                onClick={() => onRowClick?.(row.original)}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta as { align?: 'left' | 'center' | 'right' } | undefined;
                  const alignmentClass = meta?.align === 'right' ? 'text-right' : meta?.align === 'center' ? 'text-center' : 'text-left';
                  
                  return (
                    <td key={cell.id} className={cn('h-14 px-4 text-sm text-ink', alignmentClass)}>
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
