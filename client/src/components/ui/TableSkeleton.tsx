import React from 'react';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

/**
 * TableSkeleton Component
 * Renders a placeholder skeleton for data tables during loading states.
 * Follows the design structure defined in admin-design-structure.md.
 */
export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 8, columns = 5 }) => {
  return (
    <div className="bg-white rounded-lg border border-line shadow-card overflow-hidden">
      {/* Fake header */}
      <div className="h-10 px-4 border-b border-line bg-surface-base flex items-center gap-6">
        {Array.from({ length: columns }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-skeleton rounded animate-pulse"
            style={{ width: `${60 + i * 20}px` }}
          />
        ))}
      </div>
      {/* Fake rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-14 px-4 border-b border-line last:border-0 flex items-center gap-6"
        >
          <div className="w-8 h-8 rounded-full bg-skeleton animate-pulse flex-shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 bg-skeleton rounded animate-pulse w-1/3" />
            <div className="h-2.5 bg-skeleton rounded animate-pulse w-1/4" />
          </div>
          <div className="h-3 bg-skeleton rounded animate-pulse w-20" />
          <div className="h-5 bg-skeleton rounded-full animate-pulse w-16" />
        </div>
      ))}
    </div>
  );
};
