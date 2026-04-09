// src/features/integrations/components/FieldMappingTable.tsx
import React, { useState } from 'react';
import { Plus, Trash2, Save } from 'lucide-react';
import type { Integration } from '@/types';
import { cn } from '@/utils/cn';

interface FieldMappingTableProps {
  integration: Integration;
  onSave: (mapping: Record<string, string>) => void;
  isSaving?: boolean;
}

/**
 * FieldMappingTable Component
 * Editable table for mapping external fields to internal fields.
 * Used on: IntegrationsPage (configure modal).
 */
export const FieldMappingTable: React.FC<FieldMappingTableProps> = ({
  integration,
  onSave,
  isSaving = false,
}) => {
  const [mapping, setMapping] = useState<Record<string, string>>(
    integration.field_mapping ?? {}
  );

  const addMapping = () => {
    setMapping({ ...mapping, '': '' });
  };

  const updateMapping = (oldKey: string, newKey: string, value: string) => {
    const newMapping = { ...mapping };
    if (oldKey !== newKey) {
      delete newMapping[oldKey];
    }
    newMapping[newKey] = value;
    setMapping(newMapping);
  };

  const removeMapping = (key: string) => {
    const newMapping = { ...mapping };
    delete newMapping[key];
    setMapping(newMapping);
  };

  const handleSave = () => {
    // Remove empty keys
    const cleanMapping = Object.fromEntries(
      Object.entries(mapping).filter(([k, v]) => k && v)
    );
    onSave(cleanMapping);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Field Mapping</h3>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className={cn(
            'h-8 px-3 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5',
            'bg-primary hover:bg-primary-hover text-white',
            'disabled:opacity-40 disabled:cursor-not-allowed'
          )}
        >
          <Save className="w-3.5 h-3.5" />
          {isSaving ? 'Saving...' : 'Save Mapping'}
        </button>
      </div>

      <div className="bg-surface-alt rounded-md p-3 space-y-2">
        {Object.entries(mapping).map(([externalField, internalField], index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={externalField}
              onChange={(e) => updateMapping(externalField, e.target.value, internalField)}
              placeholder="External field"
              className="flex-1 h-8 px-2 text-sm rounded border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30"
            />
            <span className="text-ink-muted">→</span>
            <input
              value={internalField}
              onChange={(e) => updateMapping(externalField, externalField, e.target.value)}
              placeholder="Internal field"
              className="flex-1 h-8 px-2 text-sm rounded border border-line bg-white text-ink placeholder:text-ink-muted focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/30"
            />
            <button
              onClick={() => removeMapping(externalField)}
              className="h-8 w-8 flex items-center justify-center rounded-md hover:bg-red-50 text-error transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}

        <button
          onClick={addMapping}
          className="text-xs text-accent hover:underline flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Mapping
        </button>
      </div>
    </div>
  );
};
