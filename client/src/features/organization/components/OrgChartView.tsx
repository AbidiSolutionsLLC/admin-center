// src/features/organization/components/OrgChartView.tsx
import React, { useState } from 'react';
import type { OrgTreeNode } from '@/types';
import { DraggableOrgChart } from './DraggableOrgChart';
import { VisualOrgChart } from './VisualOrgChart';
import { Users, Layers } from 'lucide-react';
import { cn } from '@/utils/cn';

interface OrgChartViewProps {
  treeData: OrgTreeNode[];
  onNodeClick?: (node: OrgTreeNode) => void;
  onNodeDelete?: (nodeId: string) => void;
}

/**
 * OrgChartView Component
 * Wrapper for the organization chart views.
 * Provides a toggle between the card-based VisualOrgChart and the list-based DraggableOrgChart.
 * Used on: OrganizationPage (org chart view tab).
 */
export const OrgChartView: React.FC<OrgChartViewProps> = ({
  treeData,
  onNodeClick,
  onNodeDelete,
}) => {
  const [viewMode, setViewMode] = useState<'visual' | 'interactive'>('visual');

  if (!treeData || treeData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-sm text-ink-muted">No hierarchy data available.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {/* View Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex items-center bg-surface-alt p-1 rounded-lg gap-1 border border-line">
          <button
            onClick={() => setViewMode('visual')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
              viewMode === 'visual' 
                ? "bg-white text-primary shadow-sm border border-line" 
                : "text-ink-muted hover:text-ink hover:bg-white/50"
            )}
          >
            <Users className="w-4 h-4" />
            Visual Chart
          </button>
          <button
            onClick={() => setViewMode('interactive')}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200",
              viewMode === 'interactive' 
                ? "bg-white text-primary shadow-sm border border-line" 
                : "text-ink-muted hover:text-ink hover:bg-white/50"
            )}
          >
            <Layers className="w-4 h-4" />
            Interactive Tree
          </button>
        </div>
        
        <p className="text-[11px] text-ink-muted italic pr-4">
          {viewMode === 'visual' 
            ? "Use mouse wheel to zoom, drag to pan. Use three-dot menu for actions." 
            : "Drag nodes to reparent. Use arrows to expand/collapse branches."}
        </p>
      </div>

      <div className="w-full h-[700px] rounded-xl border border-line relative">
        {viewMode === 'visual' ? (
          <VisualOrgChart 
            treeData={treeData} 
            onNodeClick={onNodeClick} 
            onNodeDelete={onNodeDelete} 
          />
        ) : (
          <DraggableOrgChart treeData={treeData} onNodeClick={onNodeClick} />
        )}
      </div>
    </div>
  );
};
