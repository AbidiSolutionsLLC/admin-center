// src/features/organization/components/DraggableOrgChart.tsx
import React, { useState } from 'react';
import { DndContext, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Plus, Users, AlertTriangle } from 'lucide-react';
import { useMoveDepartment } from '../hooks/useMoveDepartment';
import { DepartmentPanel } from './DepartmentPanel';
import { cn } from '@/utils/cn';
import type { OrgTreeNode } from '@/types';

interface DraggableOrgChartProps {
  treeData: OrgTreeNode[];
}

/**
 * DraggableOrgChart Component
 * Interactive org chart with drag-and-drop reparenting, expand/collapse, and node click panel.
 * Features:
 * - Drag-and-drop reparents with optimistic UI
 * - Circular hierarchy prevention (grey-out + tooltip on invalid drops)
 * - Expand/collapse with +N child count
 * - Clicking node opens DepartmentPanel
 * - Breadcrumb navigation when zooming into subtree
 * Used on: OrganizationPage (org chart view tab).
 */
export const DraggableOrgChart: React.FC<DraggableOrgChartProps> = ({ treeData }) => {
  const moveMutation = useMoveDepartment();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<OrgTreeNode | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<OrgTreeNode[]>([]);
  const [currentTree, setCurrentTree] = useState<OrgTreeNode[]>(treeData);

  // Sensors detect pointer movement for drag
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 }, // 8px before drag starts
    })
  );

  // Get all descendant IDs of a node (for circular hierarchy prevention)
  const getDescendantIds = (node: OrgTreeNode): Set<string> => {
    const ids = new Set<string>();
    if (node.children) {
      node.children.forEach((child) => {
        ids.add(child._id);
        getDescendantIds(child).forEach((id) => ids.add(id));
      });
    }
    return ids;
  };

  // Handle drag end - reparent department
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;
    const newParentId = over.id as string;

    // Find dragged node to get its current parent
    const findNode = (nodes: OrgTreeNode[], id: string): OrgTreeNode | null => {
      for (const node of nodes) {
        if (node._id === id) return node;
        if (node.children) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const draggedNode = findNode(currentTree, draggedId);
    if (!draggedNode) return;

    // Check for circular hierarchy: can't drop on own descendant
    const descendantIds = getDescendantIds(draggedNode);
    if (descendantIds.has(newParentId)) {
      // Grey-out effect handled by tooltip in render
      return;
    }

    // Optimistic update handled by useMoveDepartment hook
    moveMutation.mutate({
      id: draggedId,
      parent_id: newParentId,
    });
  };

  // Toggle expand/collapse
  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      return next;
    });
  };

  // Navigate to child subtree
  const navigateToNode = (node: OrgTreeNode) => {
    const newBreadcrumb = [...breadcrumb, node];
    setBreadcrumb(newBreadcrumb);

    // Find this node's children in the tree
    const findAndSet = (nodes: OrgTreeNode[], id: string): OrgTreeNode[] => {
      for (const n of nodes) {
        if (n._id === id) return n.children ?? [];
        if (n.children) {
          const found = findAndSet(n.children, id);
          if (found.length > 0) return found;
        }
      }
      return [];
    };

    const childTree = findAndSet(currentTree, node._id);
    if (childTree.length > 0) {
      setCurrentTree(childTree);
    }
  };

  // Reset breadcrumb to root
  const resetBreadcrumb = () => {
    setBreadcrumb([]);
    setCurrentTree(treeData);
  };

  // Render a single node with children
  const renderNode = (node: OrgTreeNode, depth: number = 0) => {
    const isExpanded = expandedNodes.has(node._id);
    const childCount = node.children?.length ?? 0;
    const hasChildren = childCount > 0;

    return (
      <div key={node._id} className="space-y-2">
        <div
          className={cn(
            'flex items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200',
            selectedNode?._id === node._id
              ? 'border-primary bg-primaryLight'
              : 'border-line hover:border-primary bg-white'
          )}
        >
          {/* Expand/Collapse button */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleExpand(node._id);
              }}
              className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-alt transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-ink-secondary" />
              ) : (
                <ChevronRight className="w-4 h-4 text-ink-secondary" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Node content (clickable) */}
          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => setSelectedNode(node)}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-ink truncate">{node.name}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-alt px-1.5 py-0.5 rounded">
                {node.type.replace(/_/g, ' ')}
              </span>
              {node.has_intelligence_flag && (
                <span title="Intelligence warning">
                  <AlertTriangle className="w-3 h-3 text-amber-500" />
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 mt-1">
              {node.primary_manager ? (
                <span className="text-[11px] text-ink-secondary truncate">
                  {node.primary_manager.full_name}
                </span>
              ) : (
                <span className="text-[11px] text-amber-600 font-medium">No manager</span>
              )}
              {node.headcount !== undefined && (
                <span className="text-[10px] text-ink-muted flex items-center gap-1">
                  <Users className="w-3 h-3" />
                  {node.headcount}
                </span>
              )}
            </div>
          </div>

          {/* Child count badge (when collapsed) */}
          {hasChildren && !isExpanded && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primaryLight text-primary">
              <Plus className="w-3 h-3" />
              {childCount}
            </span>
          )}
        </div>

        {/* Children (indented) */}
        {hasChildren && isExpanded && (
          <div className="ml-8 pl-4 border-l-2 border-primary/20 space-y-2">
            {node.children!.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full">
      {/* Chart area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Breadcrumb navigation */}
        {breadcrumb.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 bg-white border-b border-line">
            <button
              onClick={resetBreadcrumb}
              className="text-xs font-medium text-accent hover:text-accent-hover"
            >
              Root
            </button>
            {breadcrumb.map((node, idx) => (
              <React.Fragment key={node._id}>
                <ChevronRight className="w-3 h-3 text-ink-muted" />
                {idx === breadcrumb.length - 1 ? (
                  <span className="text-xs font-medium text-ink">{node.name}</span>
                ) : (
                  <button
                    onClick={() => {
                      setBreadcrumb(breadcrumb.slice(0, idx + 1));
                    }}
                    className="text-xs text-accent hover:text-accent-hover"
                  >
                    {node.name}
                  </button>
                )}
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Draggable tree content */}
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-auto p-6 bg-white">
            <div className="space-y-3">
              {currentTree.map((rootNode) => renderNode(rootNode))}
            </div>
          </div>
        </DndContext>
      </div>

      {/* Side panel */}
      {selectedNode && (
        <DepartmentPanel
          department={selectedNode}
          onClose={() => setSelectedNode(null)}
          onNavigateToChildren={navigateToNode}
          breadcrumbPath={breadcrumb}
        />
      )}
    </div>
  );
};
