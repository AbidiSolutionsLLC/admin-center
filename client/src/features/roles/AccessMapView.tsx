import React, { useState } from 'react';
import { TransformWrapper, TransformComponent } from 'react-zoom-pan-pinch';
import { Tree, TreeNode } from 'react-organizational-chart';
import { Shield, Users, Building, Key, Maximize2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { useAccessMap } from './useAccessMap';
import { TableSkeleton } from '@/components/ui/TableSkeleton';
import { ErrorState } from '@/components/ui/ErrorState';
import { cn } from '@/utils/cn';

interface AccessMapViewProps {
  // Empty for now, can take filters if needed
}

export function AccessMapView({}: AccessMapViewProps) {
  const { data: roles, isLoading, isError, refetch } = useAccessMap();
  const [expandedNodes, setExpandedNodes] = useState<Record<string, boolean>>({});

  const toggleExpand = (nodeId: string) => {
    setExpandedNodes(prev => ({
      ...prev,
      [nodeId]: !prev[nodeId]
    }));
  };

  if (isLoading) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card p-6 min-h-[500px]">
        <TableSkeleton rows={8} columns={5} />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card min-h-[500px]">
        <ErrorState
          title="Failed to load access map"
          description="Something went wrong while fetching the access map. Please try again."
          onRetry={refetch}
        />
      </div>
    );
  }

  if (!roles || roles.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-line shadow-card min-h-[500px] flex items-center justify-center">
        <div className="text-center p-6">
          <div className="w-12 h-12 rounded-xl bg-primary-light flex items-center justify-center mx-auto mb-4">
            <Shield className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-sm font-semibold text-ink mb-1">No roles found</h3>
          <p className="text-sm text-ink-secondary">Create a role to see the access map.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white/5 rounded-lg border border-line shadow-card overflow-hidden flex flex-col h-[calc(100vh-220px)] min-h-[600px] relative">
      <TransformWrapper
        initialScale={1}
        minScale={0.2}
        maxScale={3}
        centerOnInit
        limitToBounds={false}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {/* Map Controls */}
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-2 bg-white rounded-md shadow-dropdown border border-line p-1">
              <button onClick={() => zoomIn()} className="p-2 text-ink-secondary hover:text-ink hover:bg-surface-alt rounded transition-colors" title="Zoom In">
                <ZoomIn className="w-4 h-4" />
              </button>
              <button onClick={() => zoomOut()} className="p-2 text-ink-secondary hover:text-ink hover:bg-surface-alt rounded transition-colors" title="Zoom Out">
                <ZoomOut className="w-4 h-4" />
              </button>
              <button onClick={() => resetTransform()} className="p-2 text-ink-secondary hover:text-ink hover:bg-surface-alt rounded transition-colors" title="Reset View">
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <TransformComponent wrapperClass="!w-full !h-full" contentClass="!w-full !h-full flex items-center justify-center p-20">
              <Tree
                lineWidth="2px"
                lineColor="#C8CDD8"
                lineBorderRadius="6px"
                label={
                  <div className="inline-block bg-sidebar-bg text-white px-6 py-3 rounded-lg shadow-card border border-sidebar-border relative z-10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-[#1A2540] flex items-center justify-center">
                        <Building className="w-4 h-4 text-white" />
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-bold tracking-tight">Organization</p>
                        <p className="text-[11px] text-sidebar-text uppercase tracking-widest mt-0.5">Access Hub</p>
                      </div>
                    </div>
                  </div>
                }
              >
                {roles.map(role => (
                  <TreeNode
                    key={role._id}
                    label={
                      <div className="inline-block mt-4">
                        <div 
                          className="bg-white border-2 border-primary rounded-xl p-4 w-64 shadow-card hover:shadow-card-hover transition-all cursor-pointer relative z-10"
                          onClick={() => toggleExpand(role._id)}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className={cn("text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5", 
                              role.type === 'system' ? "bg-amber-50 text-amber-700" : "bg-sky-50 text-sky-700"
                            )}>
                              {role.type}
                            </span>
                            <Shield className="w-4 h-4 text-primary" />
                          </div>
                          <div className="text-left">
                            <h3 className="text-sm font-bold text-ink mb-1">{role.name}</h3>
                            <p className="text-xs text-ink-secondary font-medium">
                              {role.users.length} Users • {role.groups.length} Groups
                            </p>
                          </div>
                        </div>
                      </div>
                    }
                  >
                    {expandedNodes[role._id] && (
                      <>
                        {/* Users Node */}
                        {role.users.length > 0 && (
                          <TreeNode 
                            label={
                              <div className="inline-block mt-4 bg-white border border-line rounded-lg p-3 w-56 shadow-sm">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-line">
                                  <Users className="w-3.5 h-3.5 text-emerald-600" />
                                  <span className="text-[11px] font-bold text-ink uppercase tracking-wider">Assigned Users</span>
                                </div>
                                <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                                  {role.users.map(u => (
                                    <div key={u._id} className="flex flex-col text-left">
                                      <span className="text-xs font-semibold text-ink truncate">{u.full_name}</span>
                                      <span className="text-[10px] text-ink-muted truncate">{u.email}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            }
                          />
                        )}
                        
                        {/* Groups Node */}
                        {role.groups.length > 0 && (
                          <TreeNode 
                            label={
                              <div className="inline-block mt-4 bg-white border border-line rounded-lg p-3 w-56 shadow-sm">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-line">
                                  <Users className="w-3.5 h-3.5 text-amber-600" />
                                  <span className="text-[11px] font-bold text-ink uppercase tracking-wider">Related Groups</span>
                                </div>
                                <div className="flex flex-col gap-2 max-h-32 overflow-y-auto pr-1">
                                  {role.groups.map(g => (
                                    <div key={g._id} className="flex flex-col text-left">
                                      <span className="text-xs font-semibold text-ink truncate">{g.name}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            }
                          />
                        )}

                        {/* Permissions Node */}
                        {role.permissions.length > 0 && (
                          <TreeNode 
                            label={
                              <div className="inline-block mt-4 bg-white border border-line rounded-lg p-3 w-56 shadow-sm">
                                <div className="flex items-center gap-2 mb-2 pb-2 border-b border-line">
                                  <Key className="w-3.5 h-3.5 text-indigo-600" />
                                  <span className="text-[11px] font-bold text-ink uppercase tracking-wider">Permissions</span>
                                </div>
                                <div className="flex flex-col gap-3 max-h-40 overflow-y-auto pr-1">
                                  {role.permissions.map(p => (
                                    <div key={p.module} className="text-left">
                                      <span className="text-[10px] font-bold text-ink-secondary uppercase tracking-widest">{p.module}</span>
                                      <div className="mt-1 flex flex-wrap gap-1">
                                        {p.actions.map((a, i) => (
                                          <span key={i} className="text-[9px] font-mono bg-surface-alt text-ink-muted px-1.5 py-0.5 rounded">
                                            {a.action}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            }
                          />
                        )}
                      </>
                    )}
                  </TreeNode>
                ))}
              </Tree>
            </TransformComponent>
          </>
        )}
      </TransformWrapper>
    </div>
  );
}

