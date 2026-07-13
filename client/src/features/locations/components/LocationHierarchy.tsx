import React, { useState } from 'react';
import { ChevronRight, ChevronDown, MapPin, Building2, Globe2, Crown, Users } from 'lucide-react';
import { formatTimeInTimezone, getTimezoneOffset } from '@/lib/timezone';
import type { LocationTreeNode } from '@/types';
import { cn } from '@/utils/cn';

interface LocationHierarchyProps {
  data: LocationTreeNode[];
  onNodeClick?: (node: LocationTreeNode) => void;
}

export const LocationHierarchy: React.FC<LocationHierarchyProps> = ({ data, onNodeClick }) => {
  if (!data?.length) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-bold" style={{ color: 'var(--text-main)' }}>Location Hierarchy</h2>
      <div className="space-y-3">
        {data.map((node) => (
          <LocationNode key={node._id} node={node} depth={0} onNodeClick={onNodeClick} />
        ))}
      </div>
    </div>
  );
};

const TYPE_ICONS: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  region: Globe2,
  country: Building2,
  city: MapPin,
  office: MapPin,
};

const TYPE_COLORS: Record<string, string> = {
  region: '#f5b02a',
  country: '#60a5fa',
  city: '#34d399',
  office: '#94a3b8',
};

const TYPE_ACCENT_CLASSES: Record<string, string> = {
  region: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
  country: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
  city: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
  office: 'bg-slate-500/10 border-slate-500/20 text-slate-400',
};

const DEPTH_CLASSES = [
  'bg-[rgba(245,176,42,0.06)] border-[rgba(245,176,42,0.15)]',
  'bg-[rgba(255,255,255,0.03)] border-[rgba(255,255,255,0.08)]',
  'bg-[rgba(255,255,255,0.01)] border-[rgba(255,255,255,0.05)]',
];

const INDENT_COLORS = [
  'rgba(245,176,42,0.25)',
  'rgba(148,163,184,0.2)',
  'rgba(148,163,184,0.12)',
];

interface LocationNodeProps {
  node: LocationTreeNode;
  depth: number;
  parentName?: string;
  onNodeClick?: (node: LocationTreeNode) => void;
}

const LocationNode: React.FC<LocationNodeProps> = ({ node, depth, parentName, onNodeClick }) => {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const hasChildren = node.children && node.children.length > 0;
  const TypeIcon = TYPE_ICONS[node.type] ?? MapPin;
  const iconColor = TYPE_COLORS[node.type] ?? '#94a3b8';
  const dc = DEPTH_CLASSES[Math.min(depth, DEPTH_CLASSES.length - 1)];
  const indentColor = INDENT_COLORS[Math.min(depth, INDENT_COLORS.length - 1)];
  const accentClass = TYPE_ACCENT_CLASSES[node.type] ?? 'bg-slate-500/10 border-slate-500/20 text-slate-400';

  return (
    <div className="space-y-2">
      {/* Node card */}
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer',
          dc
        )}
        style={depth === 0 ? { borderColor: 'rgba(245,176,42,0.2)' } : {}}
        onClick={() => { if (hasChildren) setIsExpanded(!isExpanded); onNodeClick?.(node); }}
      >
        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/10 transition-colors flex-shrink-0"
          >
            {isExpanded
              ? <ChevronDown className="w-4 h-4" style={{ color: '#94a3b8' }} />
              : <ChevronRight className="w-4 h-4" style={{ color: '#94a3b8' }} />}
          </button>
        ) : (
          <div className="w-6 flex-shrink-0" />
        )}

        {/* Type icon */}
        <TypeIcon className="w-4 h-4 flex-shrink-0" style={{ color: iconColor }} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn('font-semibold truncate', depth === 0 ? 'text-sm' : 'text-sm')}
              style={{ color: 'var(--text-main)' }}
              title={node.name}
            >
              {node.name}
            </span>

            {parentName && (
              <span className="text-[11px]" style={{ color: 'rgba(148,163,184,0.45)' }}>
                — <span style={{ color: 'rgba(148,163,184,0.6)' }}>{parentName}</span>
              </span>
            )}

            {node.is_headquarters && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                style={{ background: 'rgba(245,176,42,0.15)', color: '#fbbf24', border: '1px solid rgba(245,176,42,0.3)' }}>
                <Crown className="w-2.5 h-2.5" />
                HQ
              </span>
            )}

            <span className={cn(
              'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize flex-shrink-0 border',
              accentClass
            )}>
              {node.type}
            </span>
          </div>

          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-[11px] font-mono" style={{ color: 'rgba(148,163,184,0.5)' }}>{node.timezone}</span>
            <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.35)' }}>{getTimezoneOffset(node.timezone)}</span>
            <span className="text-[10px] font-mono" style={{ color: 'rgba(148,163,184,0.5)' }}>
              {formatTimeInTimezone(new Date(), node.timezone, 'time')}
            </span>
            {(node.user_count ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: 'rgba(96,165,250,0.7)' }}>
                <Users className="w-3 h-3" />
                {node.user_count}
              </span>
            )}
          </div>
        </div>

        {/* Collapsed badge */}
        {!isExpanded && hasChildren && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold flex-shrink-0"
            style={{ background: 'rgba(245,176,42,0.12)', color: '#f5b02a' }}>
            {node.children!.length} child{node.children!.length > 1 ? 'ren' : ''}
          </span>
        )}
      </div>

      {/* Children — indented with depth */}
      {isExpanded && hasChildren && (
        <div
          className="space-y-2 border-l-2"
          style={{
            marginLeft: `${28 + depth * 32}px`,
            paddingLeft: '16px',
            borderColor: indentColor,
          }}
        >
          {node.children!.map((child) => (
            <LocationNode
              key={child._id}
              node={child as LocationTreeNode}
              depth={depth + 1}
              parentName={node.name}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
