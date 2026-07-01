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
    <div style={{
      background: 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)',
      backdropFilter: 'blur(12px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 20,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        height: 44, padding: '0 20px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(255,255,255,0.02)',
        display: 'flex', alignItems: 'center', gap: 32,
      }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} style={{
            height: 10, width: 60 + i * 20,
            background: 'rgba(255,255,255,0.08)',
            borderRadius: 4,
            animation: 'pulse 1.5s ease-in-out infinite',
          }} />
        ))}
      </div>

      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} style={{
          height: 60, padding: '0 20px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
          display: 'flex', alignItems: 'center', gap: 20,
        }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,0.07)', flexShrink: 0, animation: 'pulse 1.5s ease-in-out infinite' }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 11, width: '30%', background: 'rgba(255,255,255,0.07)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
            <div style={{ height: 9, width: '20%', background: 'rgba(255,255,255,0.05)', borderRadius: 4, animation: 'pulse 1.5s ease-in-out infinite' }} />
          </div>
          <div style={{ height: 20, width: 60, borderRadius: 9999, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
        </div>
      ))}
    </div>
  );
};
