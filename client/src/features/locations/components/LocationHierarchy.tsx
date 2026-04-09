// src/features/locations/components/LocationHierarchy.tsx
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, MapPin, Building2, Globe2, Crown } from 'lucide-react';
import type { LocationTreeNode } from '@/types';
import { cn } from '@/utils/cn';

interface LocationHierarchyProps {
  data: LocationTreeNode[];
  onNodeClick?: (node: LocationTreeNode) => void;
}

const TYPE_ICONS: Record<string, typeof MapPin> = {
  region: Globe2,
  country: Building2,
  city: MapPin,
  office: MapPin,
};

/**
 * LocationHierarchy Component
 * Renders a collapsible tree of locations (Region → Country → City → Office).
 * Used on: LocationsPage (tree view tab).
 */
export const LocationHierarchy: React.FC<LocationHierarchyProps> = ({ data, onNodeClick }) => {
  if (!data?.length) return null;

  return (
    <div className="space-y-2">
      {data.map((node) => (
        <TreeNode key={node._id} node={node} depth={0} onNodeClick={onNodeClick} />
      ))}
    </div>
  );
};

// ── Recursive Tree Node ──────────────────────────────────────────────────────

interface TreeNodeProps {
  node: LocationTreeNode;
  depth: number;
  onNodeClick?: (node: LocationTreeNode) => void;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, depth, onNodeClick }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const TypeIcon = TYPE_ICONS[node.type] ?? MapPin;

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer transition-colors duration-100',
          'hover:bg-surface-base',
          depth > 0 && 'ml-6'
        )}
        onClick={() => {
          if (hasChildren) setIsExpanded(!isExpanded);
          onNodeClick?.(node);
        }}
      >
        {/* Expand/Collapse indicator */}
        <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            isExpanded ? (
              <ChevronDown className="w-4 h-4 text-ink-muted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-ink-muted" />
            )
          ) : (
            <div className="w-4" />
          )}
        </div>

        {/* Type icon */}
        <TypeIcon className="w-4 h-4 text-ink-secondary flex-shrink-0" />

        {/* Name */}
        <span className="text-sm font-medium text-ink flex-1 truncate">{node.name}</span>

        {/* HQ Badge */}
        {node.is_headquarters && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
            <Crown className="w-3 h-3" />
            HQ
          </span>
        )}

        {/* Type badge */}
        <span className="text-[11px] text-ink-secondary uppercase tracking-wide">
          {node.type}
        </span>

        {/* User count */}
        <span className="text-xs text-ink-secondary">
          {node.user_count ?? 0} user{(node.user_count ?? 0) !== 1 ? 's' : ''}
        </span>

        {/* Timezone */}
        <span className="text-xs font-mono text-ink-secondary">
          {getLocalTime(node.timezone)}
        </span>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="mt-1">
          {node.children!.map((child) => (
            <TreeNode key={child._id} node={child as LocationTreeNode} depth={depth + 1} onNodeClick={onNodeClick} />
          ))}
        </div>
      )}
    </div>
  );
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function getLocalTime(timezone: string): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    });
    return formatter.format(now);
  } catch {
    return 'N/A';
  }
}
