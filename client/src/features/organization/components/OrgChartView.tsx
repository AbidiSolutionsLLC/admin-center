// src/features/organization/components/OrgChartView.tsx
import React from 'react';
import type { OrgTreeNode } from '@/types';
import { DraggableOrgChart } from './DraggableOrgChart';

interface OrgChartViewProps {
  treeData: OrgTreeNode[];
  onNodeClick?: (node: OrgTreeNode) => void;
}

/**
 * OrgChartView Component
 * Wrapper for the interactive, draggable org chart.
 * Replaces the old static OrgChart with the enhanced DraggableOrgChart.
 * Used on: OrganizationPage (org chart view tab).
 */
export const OrgChartView: React.FC<OrgChartViewProps> = ({
  treeData,
  onNodeClick,
}) => {
  if (!treeData || treeData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[500px]">
        <p className="text-sm text-ink-muted">No hierarchy data available.</p>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[500px]">
      <DraggableOrgChart treeData={treeData} onNodeClick={onNodeClick} />
    </div>
  );
};
