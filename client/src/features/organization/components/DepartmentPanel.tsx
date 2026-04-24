// src/features/organization/components/DepartmentPanel.tsx
import React from 'react';
import { X, Building2, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import type { OrgTreeNode } from '@/types';

interface DepartmentPanelProps {
  department: OrgTreeNode;
  onClose: () => void;
  onNavigateToChildren?: (dept: OrgTreeNode) => void;
  breadcrumbPath?: OrgTreeNode[];
  onEdit?: (dept: OrgTreeNode) => void;
}

/**
 * DepartmentPanel Component
 * Side panel showing detailed department information.
 * Opens when clicking a node in the org chart.
 * Shows manager, headcount, children, and intelligence warnings.
 * Used on: OrganizationPage (org chart view).
 */
export const DepartmentPanel: React.FC<DepartmentPanelProps> = ({
  department,
  onClose,
  onNavigateToChildren,
  breadcrumbPath = [],
  onEdit,
}) => {
  const childCount = department.children?.length ?? 0;
  const hasIntelligence = department.has_intelligence_flag;

  return (
    <div className="w-80 h-full bg-white border-l border-line shadow-card flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-line flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-semibold text-ink truncate">{department.name}</h3>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={() => onEdit(department)}
              className="px-2 py-1 text-[11px] font-medium text-primary hover:bg-primaryLight rounded-md transition-colors"
            >
              Edit
            </button>
          )}
          <button
            onClick={onClose}
            className="h-7 w-7 flex items-center justify-center rounded-md text-ink-secondary hover:text-ink hover:bg-surface-alt transition-colors"
            aria-label="Close panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Breadcrumb */}
        {breadcrumbPath.length > 0 && (
          <div className="flex items-center gap-1 text-xs text-ink-muted flex-wrap">
            {breadcrumbPath.map((dept, idx) => (
              <React.Fragment key={dept._id}>
                {idx > 0 && <ChevronRight className="w-3 h-3" />}
                <span className="hover:text-ink cursor-pointer">{dept.name}</span>
              </React.Fragment>
            ))}
          </div>
        )}

        {/* Type badge */}
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-ink-secondary bg-surface-alt px-2 py-0.5 rounded">
            {department.type.replace(/_/g, ' ')}
          </span>
        </div>

        {/* Intelligence warning */}
        {hasIntelligence && (
          <div className="flex items-start gap-2 p-3 bg-warningLight border border-warningBorder rounded-md">
            <AlertTriangle className="w-4 h-4 text-warning flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-ink">Attention needed</p>
              <p className="text-[11px] text-ink-secondary mt-0.5">
                {(() => {
                  const isOrphan = department.type !== 'business_unit' && !department.parent_id;
                  const isImbalanced = (department.headcount ?? 0) > 15 && (!department.secondary_managers || department.secondary_managers.length === 0);
                  const noManager = (department.headcount ?? 0) > 0 && !department.primary_manager;

                  if (noManager) return "This department has active members but no primary manager assigned.";
                  if (isOrphan) return "This department is not nested under a parent, which breaks organizational structure.";
                  if (isImbalanced) return "This department has a high span of control. Consider assigning secondary managers.";
                  return "This department requires attention.";
                })()}
              </p>
            </div>
          </div>
        )}

        {/* Manager info */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-2">
            Manager
          </p>
          {department.primary_manager ? (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                {department.primary_manager.avatar_url ? (
                  <img
                    src={department.primary_manager.avatar_url}
                    className="w-full h-full object-cover"
                    alt=""
                    width={32}
                    height={32}
                  />
                ) : (
                  <span className="text-[10px] font-bold text-primary">
                    {department.primary_manager.full_name
                      .split(' ')
                      .map((n) => n[0])
                      .join('')}
                  </span>
                )}
              </div>
              <div>
                <p className="text-sm font-medium text-ink">{department.primary_manager.full_name}</p>
                <p className="text-[11px] text-ink-muted">Primary Manager</p>
              </div>
            </div>
          ) : (
            <p className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              No manager assigned
            </p>
          )}

          {/* Secondary Managers (Department) */}
          {department.secondary_managers && department.secondary_managers.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary">
                Secondary Managers
              </p>
              {department.secondary_managers.map((m) => (
                <div key={m._id} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary-light flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {m.avatar_url ? (
                      <img
                        src={m.avatar_url}
                        className="w-full h-full object-cover"
                        alt=""
                        width={32}
                        height={32}
                      />
                    ) : (
                      <span className="text-[10px] font-bold text-primary">
                        {m.full_name
                          .split(' ')
                          .map((n) => n[0])
                          .join('')}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-ink">{m.full_name}</p>
                    <p className="text-[11px] text-ink-muted">Secondary Manager</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Headcount */}
        {department.headcount !== undefined && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-2">
              Headcount
            </p>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-accent" />
              <p className="text-lg font-bold text-ink">{department.headcount}</p>
              <p className="text-xs text-ink-secondary">
                {department.headcount === 1 ? 'member' : 'members'}
              </p>
            </div>
          </div>
        )}

        {/* Children */}
        {childCount > 0 && (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-2">
              Sub-departments ({childCount})
            </p>
            <div className="space-y-1">
              {department.children!.map((child) => (
                <button
                  key={child._id}
                  onClick={() => onNavigateToChildren?.(child)}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-surface-alt transition-colors flex items-center justify-between group"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{child.name}</p>
                    <p className="text-[10px] text-ink-muted capitalize">
                      {child.type.replace(/_/g, ' ')}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-ink-muted group-hover:text-ink transition-colors" />
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Slug */}
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-secondary mb-1">
            Slug
          </p>
          <p className="text-xs font-mono text-ink-muted">{department.slug}</p>
        </div>
      </div>
    </div>
  );
};
