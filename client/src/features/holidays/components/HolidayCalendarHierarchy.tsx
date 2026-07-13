// client/src/features/holidays/components/HolidayCalendarHierarchy.tsx
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Calendar, MapPin, Globe2, Building2, Crown, Users, Clock } from 'lucide-react';
import { formatTimeInTimezone, getTimezoneOffset } from '@/lib/timezone';
import type { HolidayCalendarTreeNode } from '@/types';
import { cn } from '@/utils/cn';

interface HolidayCalendarHierarchyProps {
  data: HolidayCalendarTreeNode[];
  onNodeClick?: (node: HolidayCalendarTreeNode) => void;
}

/**
 * HolidayCalendarHierarchy Component — dark glass theme.
 * Renders a collapsible tree of holiday calendars grouped by locations.
 */
export const HolidayCalendarHierarchy: React.FC<HolidayCalendarHierarchyProps> = ({ data, onNodeClick }) => {
  if (!data?.length) return null;

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-4">
      <h2 className="text-base font-bold mb-4" style={{ color: 'var(--text-main)' }}>Holiday Calendars by Location</h2>
      <div className="space-y-3">
        {data.map((node) => (
          <HolidayCalendarNode key={node._id} node={node} depth={0} onNodeClick={onNodeClick} />
        ))}
      </div>
    </div>
  );
};

// ── Node config by depth ──────────────────────────────────────────────────────

const DEPTH_STYLES = [
  { bg: 'rgba(245,176,42,0.08)',  border: 'rgba(245,176,42,0.2)',  hoverBg: 'rgba(245,176,42,0.13)', indentBorder: 'rgba(245,176,42,0.2)'  },
  { bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.09)', hoverBg: 'rgba(255,255,255,0.07)', indentBorder: 'rgba(255,255,255,0.1)'  },
  { bg: 'rgba(255,255,255,0.02)', border: 'rgba(255,255,255,0.06)', hoverBg: 'rgba(255,255,255,0.05)', indentBorder: 'rgba(255,255,255,0.07)'  },
  { bg: 'rgba(255,255,255,0.01)', border: 'rgba(255,255,255,0.05)', hoverBg: 'rgba(255,255,255,0.04)', indentBorder: 'rgba(255,255,255,0.05)'  },
];

const TYPE_ICONS: Record<string, React.FC<{ className?: string; style?: React.CSSProperties }>> = {
  region: Globe2, country: Building2, city: MapPin, office: MapPin,
};

const TYPE_ICON_COLORS: Record<string, string> = {
  region: '#f5b02a', country: '#60a5fa', city: '#34d399', office: '#fbbf24',
};

const TYPE_BADGE_STYLES: Record<string, { bg: string; color: string; border: string }> = {
  region:  { bg: 'rgba(245,176,42,0.12)',  color: '#f5b02a', border: 'rgba(245,176,42,0.3)'  },
  country: { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.3)'  },
  city:    { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.3)'  },
  office:  { bg: 'rgba(245,176,42,0.10)',  color: '#fbbf24', border: 'rgba(245,176,42,0.25)'  },
};

// ── Recursive Node ────────────────────────────────────────────────────────────

interface HolidayCalendarNodeProps {
  node: HolidayCalendarTreeNode;
  depth: number;
  onNodeClick?: (node: HolidayCalendarTreeNode) => void;
}

const HolidayCalendarNode: React.FC<HolidayCalendarNodeProps> = ({ node, depth, onNodeClick }) => {
  const [isExpanded, setIsExpanded] = useState(depth === 0);
  const hasChildren = node.locations && node.locations.length > 0;
  const TypeIcon = TYPE_ICONS[node.type] ?? MapPin;
  const iconColor = TYPE_ICON_COLORS[node.type] ?? '#94a3b8';
  const badge = TYPE_BADGE_STYLES[node.type] ?? TYPE_BADGE_STYLES.office;
  const ds = DEPTH_STYLES[Math.min(depth, DEPTH_STYLES.length - 1)];

  return (
    <div className="space-y-2">
      {/* Node card */}
      <div
        className="flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-150"
        style={{ background: ds.bg, border: `1px solid ${ds.border}` }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = ds.hoverBg; }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ds.bg; }}
        onClick={() => { if (hasChildren) setIsExpanded(!isExpanded); onNodeClick?.(node); }}
      >
        {/* Expand/collapse button */}
        {hasChildren ? (
          <button
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
            className="h-6 w-6 flex items-center justify-center rounded-lg flex-shrink-0 transition-colors"
            style={{ background: 'rgba(255,255,255,0.06)' }}
          >
            {isExpanded
              ? <ChevronDown className="w-4 h-4" style={{ color: '#94a3b8' }} />
              : <ChevronRight className="w-4 h-4" style={{ color: '#94a3b8' }} />}
          </button>
        ) : (
          <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
            <div className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(148,163,184,0.4)' }} />
          </div>
        )}

        {/* Type icon */}
        <TypeIcon
          className={cn('flex-shrink-0', depth === 0 ? 'w-5 h-5' : 'w-4 h-4')}
          style={{ color: iconColor }}
        />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn('font-semibold truncate', depth === 0 ? 'text-base' : 'text-sm')}
              style={{ color: 'var(--text-main)' }}
              title={node.name}
            >
              {node.name}
            </span>

            {/* HQ badge */}
            {node.is_headquarters && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ background: 'rgba(245,176,42,0.15)', color: '#fbbf24', border: '1px solid rgba(245,176,42,0.3)' }}>
                <Crown className="w-2.5 h-2.5" />
                HQ
              </span>
            )}

            {/* Type badge */}
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold capitalize flex-shrink-0"
              style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
              {node.type}
            </span>

            {/* Holiday calendars count */}
            {(node.holiday_calendars ?? 0) > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold flex-shrink-0"
                style={{ background: 'rgba(245,176,42,0.12)', color: '#f5b02a', border: '1px solid rgba(245,176,42,0.25)' }}>
                <Calendar className="w-2.5 h-2.5" />
                {node.holiday_calendars} {node.holiday_calendars === 1 ? 'calendar' : 'calendars'}
              </span>
            )}
          </div>

          {/* Timezone + local time */}
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{node.timezone}</span>
            <span className="text-[10px]" style={{ color: 'rgba(148,163,184,0.4)' }}>{getTimezoneOffset(node.timezone)}</span>
            <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: 'rgba(148,163,184,0.6)' }}>
              <Clock className="w-2.5 h-2.5" />
              {formatTimeInTimezone(new Date(), node.timezone, 'time')}
            </span>
          </div>
        </div>

        {/* Collapsed hint */}
        {!isExpanded && hasChildren && (
          <span className="text-[11px] flex-shrink-0" style={{ color: 'rgba(148,163,184,0.5)' }}>
            {node.locations!.length} location{node.locations!.length > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Children indented with border-l */}
      {isExpanded && hasChildren && (
        <div
          className="space-y-2 ml-4 pl-4 border-l-2"
          style={{ borderColor: ds.indentBorder }}
        >
          {node.locations!.map((child) => (
            <HolidayCalendarNode
              key={child._id}
              node={child as HolidayCalendarTreeNode}
              depth={depth + 1}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};