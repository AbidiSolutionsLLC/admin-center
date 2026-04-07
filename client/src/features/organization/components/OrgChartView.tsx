// src/features/organization/components/OrgChartView.tsx
import React from 'react';
import type { OrgTreeNode } from '@/types';
import { OrgChart } from '@/components/ui/OrgChart';
import { cn } from '@/utils/cn';

interface OrgChartViewProps {
  treeData: OrgTreeNode[];
  onNodeClick?: (node: OrgTreeNode) => void;
}

/**
 * OrgChartView Component
 * Recursive org chart visualization for the organization hierarchy.
 * Shows department type badge, manager info, headcount, and intelligence warning dot.
 * Used on: OrganizationPage (org chart view tab).
 */
export const OrgChartView: React.FC<OrgChartViewProps> = ({
  treeData,
  onNodeClick,
}) => {
  if (!treeData || treeData.length === 0) return null;

  const renderNode = (node: OrgTreeNode) => (
    <div
      className={cn(
        'bg-white border-2 rounded-lg p-3 min-w-[200px] max-w-[240px] shadow-card text-left transition-all duration-200',
        node.has_intelligence_flag
          ? 'border-dashed border-amber-300 hover:border-amber-400'
          : 'border-line hover:border-primary'
      )}
    >
      {/* Top row: type badge + intelligence dot */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-alt px-1.5 py-0.5 rounded">
          {node.type.replace(/_/g, ' ')}
        </span>
        {node.has_intelligence_flag && (
          <span
            title="Intelligence warning: requires attention"
            className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0"
          />
        )}
      </div>

      {/* Department name */}
      <p className="text-sm font-semibold text-ink truncate">{node.name}</p>

      {/* Manager row */}
      {node.primary_manager ? (
        <div className="flex items-center gap-1.5 mt-2">
          <div className="w-5 h-5 rounded-full bg-primary-light flex items-center justify-center overflow-hidden flex-shrink-0">
            {node.primary_manager.avatar_url ? (
              <img
                src={node.primary_manager.avatar_url}
                className="w-full h-full object-cover"
                alt=""
                width={20}
                height={20}
              />
            ) : (
              <span className="text-[8px] font-bold text-primary">
                {node.primary_manager.full_name
                  .split(' ')
                  .map((n) => n[0])
                  .join('')}
              </span>
            )}
          </div>
          <span className="text-[11px] text-ink-secondary truncate">
            {node.primary_manager.full_name}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-amber-600 mt-2 font-medium">No manager assigned</p>
      )}

      {/* Headcount */}
      {node.headcount !== undefined && (
        <p className="text-[10px] text-ink-muted mt-1.5">
          {node.headcount} {node.headcount === 1 ? 'member' : 'members'}
        </p>
      )}
    </div>
  );

  return (
    <div className="w-full h-full min-h-[500px] overflow-auto">
      {treeData.map((root) => (
        <OrgChart
          key={root._id}
          data={root as OrgTreeNode}
          renderNode={renderNode}
          getChildren={(node) => node.children}
          onNodeClick={onNodeClick}
        />
      ))}
    </div>
  );
};
