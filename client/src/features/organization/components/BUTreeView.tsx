// src/features/organization/components/BUTreeView.tsx
import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Building2, Layers, Users } from 'lucide-react';
import { cn } from '@/utils/cn';

interface BUTreeNode {
  _id: string;
  name: string;
  slug: string;
  type: string;
  dept_count?: number;
  team_count?: number;
  primary_manager?: { full_name: string };
  children?: BUTreeNode[];
  teams?: Array<{
    _id: string;
    name: string;
    slug: string;
    team_lead?: { full_name: string };
  }>;
}

interface BUTreeViewProps {
  treeData: BUTreeNode[];
}

/**
 * BUTreeView Component
 * Renders hierarchical BU → Departments → Teams tree.
 * Features expandable/collapsible nodes.
 * Used on: OrganizationPage (Business Units tab - tree view).
 */
export const BUTreeView: React.FC<BUTreeViewProps> = ({ treeData }) => {
  return (
    <div className="bg-white rounded-lg border border-line shadow-card p-6 space-y-4">
      <h2 className="text-base font-semibold text-ink mb-4">Business Unit Hierarchy</h2>
      <div className="space-y-3">
        {treeData.map((bu) => (
          <BUNode key={bu._id} node={bu} depth={0} />
        ))}
      </div>
    </div>
  );
};

interface BUNodeProps {
  node: BUTreeNode;
  depth: number;
}

const BUNode: React.FC<BUNodeProps> = ({ node, depth }) => {
  const [isExpanded, setIsExpanded] = useState(depth === 0);

  const hasChildren = node.children && node.children.length > 0;
  const hasTeams = node.teams && node.teams.length > 0;

  return (
    <div className="space-y-2">
      {/* Node header */}
      <div
        className={cn(
          'flex items-center gap-3 p-3 rounded-lg border transition-colors',
          depth === 0
            ? 'bg-primary-light border-primary/20'
            : depth === 1
            ? 'bg-surface-alt border-line'
            : 'bg-white border-line'
        )}
      >
        {hasChildren ? (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-white/50 transition-colors"
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

        {depth === 0 ? (
          <Building2 className="w-5 h-5 text-primary" />
        ) : depth === 1 ? (
          <Layers className="w-4 h-4 text-accent" />
        ) : (
          <Users className="w-4 h-4 text-success" />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn(
              'font-medium text-ink truncate',
              depth === 0 ? 'text-base' : 'text-sm'
            )}>
              {node.name}
            </span>
            {node.dept_count !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary-light text-primary">
                {node.dept_count} {node.dept_count === 1 ? 'dept' : 'depts'}
              </span>
            )}
            {node.team_count !== undefined && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-accent-light text-accent">
                {node.team_count} {node.team_count === 1 ? 'team' : 'teams'}
              </span>
            )}
          </div>
          <span className="text-xs text-ink-muted font-mono">{node.slug}</span>
        </div>
      </div>

      {/* Children */}
      {isExpanded && (
        <div className={cn(
          'space-y-2 ml-4 pl-4 border-l-2',
          depth === 0 ? 'border-primary/20' : 'border-line/50'
        )}>
          {/* Teams under this department/BU */}
          {hasTeams && (
            <div className="space-y-1 ml-4 pl-4 border-l-2 border-accent/20">
              {node.teams!.map((team) => (
                <div
                  key={team._id}
                  className="flex items-center gap-2 p-2 bg-white border border-line rounded-md text-sm"
                >
                  <Users className="w-3.5 h-3.5 text-success" />
                  <span className="font-medium text-ink">{team.name}</span>
                  {team.team_lead && (
                    <span className="text-xs text-ink-muted">· {team.team_lead.full_name}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Child departments/BUs */}
          {hasChildren &&
            node.children!.map((child) => (
              <BUNode key={child._id} node={child} depth={depth + 1} />
            ))}
        </div>
      )}
    </div>
  );
};
