import React, { useState } from 'react';
import { 
  TransformWrapper, 
  TransformComponent 
} from 'react-zoom-pan-pinch';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronDown, 
  ChevronRight,
  ChevronUp,
  User,
  Users,
  MoreVertical,
  Edit2,
  Trash2
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { cn } from '@/utils/cn';
import type { OrgTreeNode } from '@/types';

interface VisualOrgChartProps {
  treeData: OrgTreeNode[];
  onNodeClick?: (node: OrgTreeNode) => void;
  onNodeDelete?: (nodeId: string) => void;
}

const OrgNode: React.FC<{ 
  node: OrgTreeNode; 
  onNodeClick?: (node: OrgTreeNode) => void;
  onNodeDelete?: (nodeId: string) => void;
  depth: number;
}> = ({ node, onNodeClick, onNodeDelete, depth }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;

  const getTypeStyles = (type: string) => {
    switch (type) {
      case 'business_unit':
        return 'border-amber-500 bg-amber-50/30 text-amber-700';
      case 'division':
        return 'border-blue-500 bg-blue-50/30 text-blue-700';
      case 'department':
        return 'border-emerald-500 bg-emerald-50/30 text-emerald-700';
      case 'cost_center':
        return 'border-purple-500 bg-purple-50/30 text-purple-700';
      default:
        return 'border-gray-500 bg-gray-50/30 text-gray-700';
    }
  };

  const getTopBarColor = (type: string) => {
    switch (type) {
      case 'business_unit': return 'bg-amber-500';
      case 'division': return 'bg-blue-500';
      case 'department': return 'bg-emerald-500';
      case 'cost_center': return 'bg-purple-500';
      default: return 'bg-gray-500';
    }
  };

  return (
    <div className="flex flex-col items-center">
      {/* THE CARD */}
      <div className="relative flex flex-col items-center z-10 group w-64">
        <div
          style={{
            minWidth: 200,
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.09)',
            background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px rgba(0,0,0,0.37)',
            cursor: 'pointer',
            transition: 'all 0.2s ease',
            position: 'relative',
            overflow: 'hidden',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.16)';
            e.currentTarget.style.transform = 'translateY(-2px)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.09)';
            e.currentTarget.style.transform = 'translateY(0)';
          }}
          className="relative flex flex-col items-center w-full z-10 group"
        >
          {/* Decorative Top Bar */}
          <div className={cn("h-1.5 w-full", getTopBarColor(node.type))}></div>
          
          <div className="p-4 flex flex-col items-start w-full">
            <div className="flex justify-between items-start w-full mb-2">
              <span className={cn(
                "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
                getTypeStyles(node.type)
              )}>
                {node.type.replace('_', ' ')}
              </span>
              
              {/* Actions Dropdown */}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button 
                    className="text-ink-muted hover:text-ink hover:bg-surface-alt p-1 rounded-md transition-colors outline-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content 
                    align="end"
                    sideOffset={5}
                    className="border-0 animate-in fade-in zoom-in-95 duration-100 z-[100]"
                    style={{
                      background: 'linear-gradient(145deg, rgba(20,25,35,0.97) 0%, rgba(15,20,30,0.99) 100%)',
                      backdropFilter: 'blur(20px)',
                      WebkitBackdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.09)',
                      borderRadius: 14,
                      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                      minWidth: 180,
                      padding: '6px',
                    }}
                  >
                    <DropdownMenu.Item 
                      onClick={() => onNodeClick?.(node)}
                      style={{ borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 500, color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px' }}
                      className="focus:bg-[rgba(245,176,42,0.10)] focus:text-[#f5b02a] hover:bg-[rgba(245,176,42,0.10)] hover:text-[#f5b02a] outline-none"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      Edit Department
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>

            <h3 className="text-sm font-bold text-ink leading-tight mb-1 truncate w-full" title={node.name}>
              {node.name}
            </h3>

            {node.primary_manager && (
              <div className="flex items-center gap-2 mt-2 w-full">
                <div className="w-6 h-6 rounded-full bg-surface-alt flex items-center justify-center border border-line overflow-hidden">
                  {node.primary_manager.avatar_url ? (
                    <img src={node.primary_manager.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-3 h-3 text-ink-muted" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-ink-muted font-medium">Head</span>
                  <span className="text-xs text-ink font-semibold truncate">{node.primary_manager.full_name}</span>
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-line w-full">
              <div className="flex items-center gap-1">
                <Users className="w-3 h-3 text-ink-muted" />
                <span className="text-[11px] text-ink-muted">{node.headcount || 0} Members</span>
              </div>
            </div>
          </div>

          {/* Expand/Collapse Toggle */}
          {hasChildren && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-white border border-line shadow-sm flex items-center justify-center hover:bg-surface-alt transition-colors z-20"
              title={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-ink-muted" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
              )}
            </button>
          )}
        </div>

        {/* Vertical Line DOWN from Card (Only if children exist and expanded) */}
        {hasChildren && isExpanded && (
          <div className="w-px h-8 bg-white/10"></div>
        )}
      </div>

      {/* CHILDREN CONTAINER */}
      {hasChildren && isExpanded && (
        <div className="flex pt-0">
          {node.children!.map((child, index) => {
            const isFirst = index === 0;
            const isLast = index === node.children!.length - 1;
            const isSole = node.children!.length === 1;

            return (
              <div key={child._id} className="flex flex-col items-center relative px-4">
                {/* --- CONNECTORS --- */}
                {/* 1. Horizontal Bus Line */}
                {!isSole && !isFirst && (
                  <div className="absolute top-0 left-0 w-[calc(50%+2px)] h-px bg-white/10"></div>
                )}
                {!isSole && !isLast && (
                  <div className="absolute top-0 right-0 w-[calc(50%+2px)] h-px bg-white/10"></div>
                )}

                {/* 2. Vertical Line UP (From Bus to Card) */}
                <div className="w-px h-8 bg-white/10"></div>

                {/* Recursive Node */}
                <OrgNode 
                  node={child} 
                  onNodeClick={onNodeClick} 
                  onNodeDelete={onNodeDelete}
                  depth={depth + 1} 
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const VisualOrgChart: React.FC<VisualOrgChartProps> = ({ treeData, onNodeClick, onNodeDelete }) => {
  return (
    <div className="w-full h-full bg-surface-alt/30 relative">
      <TransformWrapper
        initialScale={0.8}
        minScale={0.1}
        maxScale={2}
        centerOnInit={true}
        limitToBounds={false}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Controls */}
            <div className="absolute top-2 right-4 z-40 flex flex-col gap-2 bg-white/80 backdrop-blur-sm p-1.5 rounded-xl border border-line shadow-sm">
              <button 
                onClick={() => zoomIn()} 
                className="p-2 hover:bg-surface-alt rounded-lg text-ink-secondary transition-colors" 
                title="Zoom In"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button 
                onClick={() => resetTransform()} 
                className="p-2 hover:bg-surface-alt rounded-lg text-ink-secondary transition-colors" 
                title="Reset View"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button 
                onClick={() => zoomOut()} 
                className="p-2 hover:bg-surface-alt rounded-lg text-ink-secondary transition-colors" 
                title="Zoom Out"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
            </div>

            <TransformComponent
              wrapperStyle={{ width: "100%", height: "100%" }}
              contentStyle={{ width: "auto", height: "auto", minWidth: "100%", minHeight: "100%", display: "flex", justifyContent: "center" }}
            >
              {/* Background Grid */}
              <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none w-[10000px] h-[10000px] -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2"
                style={{ 
                  backgroundImage: 'radial-gradient(#0F1629 1.5px, transparent 1.5px)', 
                  backgroundSize: '40px 40px' 
                }}
              />

              <div className="min-w-max flex justify-center pb-48 pt-10 relative z-10 px-24">
                {treeData.map((rootNode, idx) => (
                  <div key={rootNode._id} className={idx > 0 ? "ml-20" : ""}>
                    <OrgNode
                      node={rootNode}
                      onNodeClick={onNodeClick}
                      onNodeDelete={onNodeDelete}
                      depth={0}
                    />
                  </div>
                ))}
              </div>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
};
