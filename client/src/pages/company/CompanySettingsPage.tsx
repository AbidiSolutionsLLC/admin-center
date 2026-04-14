import { useEffect, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useEmployeeIdFormat, useUpdateEmployeeIdFormat } from '@/hooks/useEmployeeIdFormat';
import { ROUTES } from '@/constants/routes';

type FormValues = {
  employee_id_format: string;
};

const CompanySettingsSchema = z.object({
  employee_id_format: z
    .string()
    .min(1, 'Format is required')
    .max(50, 'Format must be 50 characters or fewer')
    .regex(/\{counter:\d+\}/, 'Format must contain a {counter:N} placeholder'),
});

function generateFormatPreview(format: string, counter: number) {
  const match = format.match(/\{counter:(\d+)\}/);
  if (!match) return 'Invalid format preview';

  const width = parseInt(match[1], 10);
  const nextCounter = counter + 1;
  return format.replace(/\{counter:\d+\}/, nextCounter.toString().padStart(width, '0'));
}

export default function CompanySettingsPage() {
  const { data, isLoading, isError } = useEmployeeIdFormat();
  const updateEmployeeIdFormat = useUpdateEmployeeIdFormat();

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(CompanySettingsSchema),
    defaultValues: {
      employee_id_format: '',
    },
  });

  useEffect(() => {
    if (data?.employee_id_format) {
      reset({ employee_id_format: data.employee_id_format });
    }
  }, [data, reset]);

  const currentFormat = watch('employee_id_format');
  const preview = useMemo(() => {
    if (!currentFormat || typeof data?.employee_id_counter !== 'number') {
      return '';
    }
    return generateFormatPreview(currentFormat, data.employee_id_counter);
  }, [currentFormat, data?.employee_id_counter]);

  const onSubmit = (values: FormValues) => {
    updateEmployeeIdFormat.mutate({ employee_id_format: values.employee_id_format });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-ink-muted">Loading company settings...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <h1 className="text-2xl font-semibold text-ink">Company Settings</h1>
        <p className="mt-3 text-sm text-error">Unable to load employee ID settings. Please try again later.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-ink">Company Settings</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Configure the employee ID format used for new users. Changes apply to future employee records.
          </p>
        </div>
      </div>

      <Card className="shadow-card">
        <CardHeader>
          <CardTitle>Employee ID Format</CardTitle>
          <CardDescription>
            Define how employee IDs are generated. The format must contain a <code className="rounded bg-slate-100 px-1 py-[2px] text-xs">{`{counter:N}`}</code> placeholder.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            <div className="space-y-2">
              <label htmlFor="employee_id_format" className="block text-sm font-medium text-ink">
                Employee ID Format
              </label>
              <Input
                id="employee_id_format"
                {...register('employee_id_format')}
                className={errors.employee_id_format ? 'border-destructive focus-visible:ring-destructive/50' : ''}
                placeholder="EMP-{counter:5}"
              />
              {errors.employee_id_format ? (
                <p className="text-xs text-destructive">{errors.employee_id_format.message}</p>
              ) : (
                <p className="text-xs text-ink-secondary">
                  Example: <span className="font-mono">EMP-{`{counter:5}`}</span>
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-line bg-surface-base p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-secondary">Current format</p>
                <p className="mt-2 text-sm text-ink">{data?.employee_id_format || 'Not configured'}</p>
              </div>
              <div className="rounded-lg border border-line bg-surface-base p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-ink-secondary">Next employee ID preview</p>
                <p className="mt-2 text-sm text-ink">{preview || 'Enter a valid format to preview'}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-ink-secondary">
                Current counter: <span className="font-semibold">{data?.employee_id_counter ?? 0}</span>
              </div>
              <Button type="submit" disabled={updateEmployeeIdFormat.isLoading}>
                {updateEmployeeIdFormat.isLoading ? 'Saving...' : 'Save Format'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
