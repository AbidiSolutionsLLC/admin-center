// src/features/organization/components/DraggableOrgChart.tsx
import React, { useState, useEffect } from 'react';
import { 
  DndContext, 
  useSensor, 
  useSensors, 
  PointerSensor, 
  DragOverlay,
  defaultDropAnimationSideEffects
} from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import { ChevronRight, ChevronDown, Plus, Users, AlertTriangle, GripVertical, Loader2 } from 'lucide-react';
import { useMoveDepartment } from '../hooks/useMoveDepartment';
import { DepartmentPanel } from './DepartmentPanel';
import { cn } from '@/utils/cn';
import type { OrgTreeNode } from '@/types';

interface DraggableOrgChartProps {
  treeData: OrgTreeNode[];
}

/**
 * DraggableNode Component
 * Higher-order component to make an element draggable.
 */
const DraggableNode: React.FC<{ id: string; children: React.ReactNode; disabled?: boolean }> = ({ 
  id, 
  children, 
  disabled 
}) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id,
    disabled,
  });

  const style = transform ? {
    transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    opacity: isDragging ? 0.5 : 1,
  } : undefined;

  return (
    <div ref={setNodeRef} style={style} className="group relative">
      <div 
        {...listeners} 
        {...attributes} 
        className={cn(
          "absolute left-[-20px] top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing p-1 transition-opacity",
          disabled && "hidden"
        )}
      >
        <GripVertical className="w-4 h-4 text-ink-muted" />
      </div>
      {children}
    </div>
  );
};

/**
 * DroppableNode Component
 * Higher-order component to make an element a drop target.
 */
const DroppableNode: React.FC<{ id: string; children: React.ReactNode; disabled?: boolean }> = ({ 
  id, 
  children, 
  disabled 
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id,
    disabled,
  });

  return (
    <div 
      ref={setNodeRef} 
      className={cn(
        "transition-all duration-200 rounded-lg",
        isOver && !disabled && "ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-lg",
        isOver && disabled && "ring-2 ring-error ring-offset-2 opacity-60 cursor-not-allowed"
      )}
    >
      {children}
    </div>
  );
};

/**
 * DraggableOrgChart Component
 * Interactive org chart with drag-and-drop reparenting, expand/collapse, and node click panel.
 */
export const DraggableOrgChart: React.FC<DraggableOrgChartProps> = ({ treeData }) => {
  const moveMutation = useMoveDepartment();
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<OrgTreeNode | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<OrgTreeNode[]>([]);
  const [currentTree, setCurrentTree] = useState<OrgTreeNode[]>(treeData);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Sync currentTree when treeData changes (e.g. after refetch)
  useEffect(() => {
    if (breadcrumb.length === 0) {
      setCurrentTree(treeData);
    } else {
      // Re-navigate to refresh the current view
      const lastNode = breadcrumb[breadcrumb.length - 1];
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
      const childTree = findAndSet(treeData, lastNode._id);
      setCurrentTree(childTree.length > 0 ? childTree : [lastNode]);
    }
  }, [treeData, breadcrumb]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    })
  );

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

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = event;

    if (!over || active.id === over.id) return;

    const draggedId = active.id as string;
    const newParentId = over.id as string;

    const findNodeInTree = (nodes: OrgTreeNode[], id: string): OrgTreeNode | null => {
      for (const n of nodes) {
        if (n._id === id) return n;
        if (n.children) {
          const found = findNodeInTree(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const draggedNode = findNodeInTree(treeData, draggedId);
    if (!draggedNode) return;

    // Circular hierarchy prevention
    const descendantIds = getDescendantIds(draggedNode);
    if (descendantIds.has(newParentId)) return;

    moveMutation.mutate({
      id: draggedId,
      parent_id: newParentId,
    });
  };

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const navigateToNode = (node: OrgTreeNode) => {
    const newBreadcrumb = [...breadcrumb, node];
    setBreadcrumb(newBreadcrumb);
    setCurrentTree(node.children ?? [node]);
  };

  const resetBreadcrumb = () => {
    setBreadcrumb([]);
    setCurrentTree(treeData);
  };

  const renderNode = (node: OrgTreeNode) => {
    const isExpanded = expandedNodes.has(node._id);
    const childCount = node.children?.length ?? 0;
    const hasChildren = childCount > 0;
    
    // Correct circular check: Is current node a descendant of the dragged node?
    const findNodeInTree = (nodes: OrgTreeNode[], id: string): OrgTreeNode | null => {
      for (const n of nodes) {
        if (n._id === id) return n;
        if (n.children) {
          const found = findNodeInTree(n.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const draggedNode = activeId ? findNodeInTree(treeData, activeId) : null;
    const isCircular = draggedNode ? (node._id === activeId || getDescendantIds(draggedNode).has(node._id)) : false;

    return (
      <div key={node._id} className="space-y-2">
        <DroppableNode id={node._id} disabled={isCircular}>
          <DraggableNode id={node._id} disabled={isCircular}>
            <div
              className={cn(
                'flex items-center gap-2 p-3 rounded-lg border-2 transition-all duration-200',
                selectedNode?._id === node._id
                  ? 'border-primary bg-primaryLight'
                  : 'border-line hover:border-primary bg-white',
                isCircular && "opacity-40 border-dashed bg-surface-alt grayscale",
                moveMutation.isPending && moveMutation.variables?.id === node._id && "ring-2 ring-primary animate-pulse"
              )}
            >
              {/* Expand/Collapse */}
              {hasChildren ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleExpand(node._id);
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-surface-alt transition-colors"
                >
                  {isExpanded ? <ChevronDown className="w-4 h-4 text-ink-secondary" /> : <ChevronRight className="w-4 h-4 text-ink-secondary" />}
                </button>
              ) : (
                <div className="w-6" />
              )}

              {/* Content */}
              <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setSelectedNode(node)}>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-ink truncate">{node.name}</span>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-alt px-1.5 py-0.5 rounded">
                    {node.type.replace(/_/g, ' ')}
                  </span>
                  {node.has_intelligence_flag && <AlertTriangle className="w-3 h-3 text-amber-500" />}
                  {moveMutation.isPending && moveMutation.variables?.id === node._id && (
                    <Loader2 className="w-3 h-3 animate-spin text-primary" />
                  )}
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-secondary">
                  <span className="truncate">{node.primary_manager?.full_name ?? 'No manager'}</span>
                  {node.headcount !== undefined && (
                    <span className="flex items-center gap-1 text-ink-muted">
                      <Users className="w-3 h-3" />
                      {node.headcount}
                    </span>
                  )}
                </div>
              </div>

              {/* Collapsed badge */}
              {hasChildren && !isExpanded && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primaryLight text-primary flex items-center gap-1">
                  <Plus className="w-3 h-3" />
                  {childCount}
                </span>
              )}
            </div>
          </DraggableNode>
        </DroppableNode>

        {/* Children */}
        {hasChildren && isExpanded && (
          <div className="ml-8 pl-4 border-l-2 border-primary/20 space-y-2">
            {node.children!.map((child) => renderNode(child))}
          </div>
        )}
      </div>
    );
  };

  return (
    <DndContext 
      sensors={sensors} 
      onDragStart={handleDragStart} 
      onDragEnd={handleDragEnd}
    >
      <div className="flex h-full bg-white">
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Breadcrumb */}
          {breadcrumb.length > 0 && (
            <div className="flex items-center gap-2 px-4 py-2 border-b border-line bg-surface-alt/30">
              <button 
                type="button"
                onClick={resetBreadcrumb} 
                className="text-xs font-semibold text-primary hover:text-primary-hover"
              >
                Root
              </button>
              {breadcrumb.map((node, idx) => (
                <React.Fragment key={node._id}>
                  <ChevronRight className="w-3 h-3 text-ink-muted" />
                  {idx === breadcrumb.length - 1 ? (
                    <span className="text-xs font-semibold text-ink">{node.name}</span>
                  ) : (
                    <button 
                      type="button"
                      onClick={() => setBreadcrumb(breadcrumb.slice(0, idx + 1))}
                      className="text-xs text-primary hover:text-primary-hover"
                    >
                      {node.name}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>
          )}

          {/* Tree area */}
          <div className="flex-1 overflow-auto p-6">
            <div className="max-w-4xl space-y-3">
              {currentTree.map((rootNode) => renderNode(rootNode))}
            </div>
          </div>
        </div>

        {/* Side Panel */}
        {selectedNode && (
          <DepartmentPanel
            department={selectedNode}
            onClose={() => setSelectedNode(null)}
            onNavigateToChildren={navigateToNode}
            breadcrumbPath={breadcrumb}
          />
        )}
      </div>
      
      {/* Drag Overlay */}
      <DragOverlay dropAnimation={{
        sideEffects: defaultDropAnimationSideEffects({
          styles: {
            active: {
              opacity: '0.4',
            },
          },
        }),
      }}>
        {activeId ? (
          <div className="bg-white border-2 border-primary shadow-xl rounded-lg p-3 w-[240px] opacity-90 cursor-grabbing">
            <p className="text-sm font-bold text-ink truncate">Moving Department...</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
