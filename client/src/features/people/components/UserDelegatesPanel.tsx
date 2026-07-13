// src/features/people/components/UserDelegatesPanel.tsx
import { useState } from 'react';
import { PlaneTakeoff, Plus, Trash2, Save } from 'lucide-react';
import { useUserDetail } from '../hooks/useUserDetail';
import { useUpdateUser } from '../hooks/useUpdateUser';
import { formatDate } from '@/utils/formatDate';
import { Modal } from '@/components/ui/Modal';
import { UserSelect } from '@/components/ui/UserSelect';

interface UserDelegatesPanelProps {
  userId: string;
}

export function UserDelegatesPanel({ userId }: UserDelegatesPanelProps) {
  const { data: user, isLoading } = useUserDetail(userId);
  const updateMutation = useUpdateUser(userId);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    user_id: '',
    start_date: '',
    end_date: '',
  });

  if (isLoading) {
    return <div className="h-24 bg-surface-alt rounded-lg animate-pulse" />;
  }

  const delegates = user?.delegates || [];
  const now = new Date();

  const handleAssign = () => {
    // Map existing delegates back to string user_ids for API
    const existingDelegates = delegates.map((d: any) => ({
      user_id: typeof d.user_id === 'object' && d.user_id ? d.user_id._id : d.user_id,
      start_date: d.start_date,
      end_date: d.end_date,
    }));

    const newDelegate = {
      user_id: formData.user_id,
      start_date: formData.start_date,
      end_date: formData.end_date,
    };

    updateMutation.mutate(
      { delegates: [...existingDelegates, newDelegate] },
      {
        onSuccess: () => {
          setIsAssignModalOpen(false);
          setFormData({ user_id: '', start_date: '', end_date: '' });
        },
      }
    );
  };

  const handleRevoke = (indexToRemove: number) => {
    if (!confirm('Are you sure you want to revoke this delegate?')) return;
    
    const existingDelegates = delegates.map((d: any) => ({
      user_id: typeof d.user_id === 'object' && d.user_id ? d.user_id._id : d.user_id,
      start_date: d.start_date,
      end_date: d.end_date,
    }));

    const newDelegates = existingDelegates.filter((_, idx) => idx !== indexToRemove);
    
    updateMutation.mutate({ delegates: newDelegates });
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setIsAssignModalOpen(true)}
          className="h-8 px-3 text-xs font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors flex items-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Assign Delegate
        </button>
      </div>

      {delegates.length === 0 ? (
        <div className="p-4 text-center border border-dashed border-line rounded-lg text-ink-muted text-sm bg-surface-alt">
          No delegates currently assigned.
        </div>
      ) : (
        <div className="space-y-3">
          {delegates.map((delegate: any, index: number) => {
            const start = new Date(delegate.start_date);
            const end = new Date(delegate.end_date);
            
            end.setHours(23, 59, 59, 999);
            
            const isActive = now >= start && now <= end;
            const isPast = now > end;
            const isFuture = now < start;

            let statusText = 'Active';
            let statusClass = 'bg-emerald-50 text-emerald-600 border-emerald-200';

            if (isPast) {
              statusText = 'Expired';
              statusClass = 'bg-surface-alt text-ink-muted border-line';
            } else if (isFuture) {
              statusText = 'Scheduled';
              statusClass = 'bg-sky-50 text-sky-600 border-sky-200';
            }

            const delegateName = typeof delegate.user_id === 'object' && delegate.user_id !== null
              ? delegate.user_id.full_name
              : `Delegate ID: ${delegate.user_id}`;
            
            const delegateEmail = typeof delegate.user_id === 'object' && delegate.user_id !== null
              ? delegate.user_id.email
              : '';

            return (
              <div key={index} className="flex items-center gap-4 p-4 bg-white border border-line rounded-lg">
                <div className="h-10 w-10 flex items-center justify-center rounded-full bg-primary/10 text-primary shrink-0">
                  {typeof delegate.user_id === 'object' && delegate.user_id?.avatar_url ? (
                    <img src={delegate.user_id.avatar_url} alt={delegateName} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <PlaneTakeoff className="w-5 h-5" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink truncate">{delegateName}</span>
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${statusClass} shrink-0`}>
                      {statusText}
                    </span>
                  </div>
                  {delegateEmail && (
                     <p className="text-xs text-ink-muted truncate mb-0.5">{delegateEmail}</p>
                  )}
                  <p className="text-xs text-ink-secondary mt-1">
                    From {formatDate(delegate.start_date)} to {formatDate(delegate.end_date)}
                  </p>
                </div>

                <button
                  onClick={() => handleRevoke(index)}
                  className="p-1.5 text-ink-secondary hover:text-error hover:bg-error-light rounded transition-colors shrink-0"
                  title="Revoke Delegate"
                  disabled={updateMutation.isPending}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Assign Delegate Modal */}
      <Modal
        isOpen={isAssignModalOpen}
        onClose={() => setIsAssignModalOpen(false)}
        title="Assign Delegate"
        description="Select a user to act as an approval delegate during a specified timeframe."
        size="sm"
        footer={
          <>
            <button
              onClick={() => setIsAssignModalOpen(false)}
              disabled={updateMutation.isPending}
              className="h-9 px-4 text-sm font-medium rounded-md border border-line bg-white text-ink hover:bg-surface-alt transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssign}
              disabled={updateMutation.isPending || !formData.user_id || !formData.start_date || !formData.end_date}
              className="h-9 px-4 text-sm font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? 'Assigning...' : 'Assign Delegate'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium text-ink block mb-1.5">
              Select User <span className="text-error">*</span>
            </label>
            <UserSelect
              value={formData.user_id}
              onChange={(value) => setFormData({ ...formData, user_id: value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                Start Date <span className="text-error">*</span>
              </label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-ink block mb-1.5">
                End Date <span className="text-error">*</span>
              </label>
              <input
                type="date"
                value={formData.end_date}
                onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
                className="w-full h-9 px-3 text-sm rounded-md border border-line bg-white text-ink focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
