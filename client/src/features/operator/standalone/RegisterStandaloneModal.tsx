import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/Select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/Textarea';
import { FormField } from '@/components/ui/FormField';
import { useRegisterStandalone, type RegisterResult } from './standaloneApi';
import { EMPTY_FORM, buildManifest, formFromPortal, validateForm, type RoleRow, type StandaloneFormState, type StandalonePortal } from './standaloneForm';

interface Props {
  /** Present = edit this registration (the key cannot change). */
  portal?: StandalonePortal;
  onClose: () => void;
  /** Called with the saved registration; `client_secret` is set when one was just issued. */
  onSaved: (result: RegisterResult) => void;
}

/** "Register standalone portal" (PRD SP-1): every field of DRD §8.2 in one form. */
export function RegisterStandaloneModal({ portal, onClose, onSaved }: Props) {
  const editing = !!portal;
  const [f, setF] = useState<StandaloneFormState>(portal ? formFromPortal(portal) : EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const save = useRegisterStandalone();
  const errors = validateForm(f, { editing });
  const set = <K extends keyof StandaloneFormState>(k: K, v: StandaloneFormState[K]) => setF((s) => ({ ...s, [k]: v }));
  const err = (k: keyof typeof errors) => (showErrors ? errors[k] : undefined);

  const setRole = (i: number, patch: Partial<RoleRow>) => set('roles', f.roles.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const setDefault = (i: number) => set('roles', f.roles.map((r, j) => ({ ...r, is_default: j === i })));

  const submit = async () => {
    setShowErrors(true);
    if (Object.keys(errors).length) return;
    try {
      onSaved(await save.mutateAsync({ key: f.key.trim(), body: buildManifest(f) }));
    } catch { /* the hook already toasted the server's message */ }
  };

  const confidential = f.client_type === 'confidential';
  return (
    <Modal
      isOpen
      onClose={onClose}
      title={editing ? `Edit ${portal!.name}` : 'Register standalone portal'}
      description="A delivered portal signs members in through Karbexa. Role keys must equal the portal's own role names."
      size="lg"
      footer={(
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={save.isPending} data-testid="standalone-save">{editing ? 'Save changes' : 'Register portal'}</Button>
        </>
      )}
    >
      <form className="grid gap-4" data-testid="standalone-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Name" required error={err('name')}>
            {(p) => <Input {...p} value={f.name} onChange={(e) => set('name', e.target.value)} />}
          </FormField>
          <FormField label="Key" required hint="Also the client id suffix: karbexa-<key>." error={err('key')}>
            {(p) => <Input {...p} value={f.key} disabled={editing} onChange={(e) => set('key', e.target.value.toLowerCase())} />}
          </FormField>
          <FormField label="Icon" required error={err('icon')}>
            {(p) => <Input {...p} value={f.icon} onChange={(e) => set('icon', e.target.value)} />}
          </FormField>
          <FormField label="Category">
            {(p) => (
              <Select {...p} value={f.category} onChange={(e) => set('category', e.target.value as StandaloneFormState['category'])}>
                {['core', 'work', 'it', 'talent'].map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
            )}
          </FormField>
          {editing && (
            <FormField label="Status">
              {(p) => (
                <Select {...p} value={f.status} onChange={(e) => set('status', e.target.value as StandaloneFormState['status'])}>
                  {['active', 'beta', 'hidden', 'retired'].map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              )}
            </FormField>
          )}
          <FormField label="Launch URL" required hint="Where the launcher tile opens (new tab)." error={err('launch_url')}>
            {(p) => <Input {...p} type="url" value={f.launch_url} onChange={(e) => set('launch_url', e.target.value)} />}
          </FormField>
        </div>

        <fieldset className="grid gap-3" aria-describedby="roles-error">
          <legend className="text-table font-medium text-ink">Roles</legend>
          {f.roles.map((r, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_5rem_auto_auto] items-center gap-2" data-testid="role-row">
              <Input aria-label={`Role ${i + 1} key`} placeholder="asset_admin" value={r.key} onChange={(e) => setRole(i, { key: e.target.value })} />
              <Input aria-label={`Role ${i + 1} name`} placeholder="Asset admin" value={r.name} onChange={(e) => setRole(i, { name: e.target.value })} />
              <Input aria-label={`Role ${i + 1} rank`} inputMode="numeric" value={r.rank} onChange={(e) => setRole(i, { rank: e.target.value })} />
              <label className="flex items-center gap-1 text-body text-ink-secondary">
                <input type="radio" name="default-role" checked={r.is_default} onChange={() => setDefault(i)} aria-label={`Role ${i + 1} is the default`} /> default
              </label>
              <Button type="button" variant="ghost" size="sm" disabled={f.roles.length === 1} onClick={() => set('roles', f.roles.filter((_, j) => j !== i))}>Remove</Button>
            </div>
          ))}
          <div><Button type="button" variant="outline" size="sm" onClick={() => set('roles', [...f.roles, { key: '', name: '', rank: '10', is_default: false }])}>Add role</Button></div>
          {err('roles') && <p id="roles-error" role="alert" className="text-body text-error">{err('roles')}</p>}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Client type" hint="Confidential = server-side portal; public = browser-only app.">
            {(p) => (
              <Select {...p} value={f.client_type} onChange={(e) => set('client_type', e.target.value as StandaloneFormState['client_type'])}>
                <option value="confidential">Confidential</option>
                <option value="public">Public</option>
              </Select>
            )}
          </FormField>
          {confidential && (
            <FormField label="Token endpoint authentication" hint="Default: client secret (basic).">
              {(p) => (
                <Select {...p} value={f.token_endpoint_auth} onChange={(e) => set('token_endpoint_auth', e.target.value as StandaloneFormState['token_endpoint_auth'])}>
                  <option value="">client_secret_basic (default)</option>
                  <option value="client_secret_post">client_secret_post</option>
                  <option value="private_key_jwt">private_key_jwt</option>
                </Select>
              )}
            </FormField>
          )}
          {confidential && f.token_endpoint_auth === 'private_key_jwt' && (
            <FormField label="JWKS URI" required error={err('jwks_uri')}>
              {(p) => <Input {...p} type="url" value={f.jwks_uri} onChange={(e) => set('jwks_uri', e.target.value)} />}
            </FormField>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Redirect URIs" required hint="One per line. Exact https URIs, no wildcards." error={err('redirect_uris')}>
            {(p) => <Textarea {...p} rows={3} value={f.redirect_uris} onChange={(e) => set('redirect_uris', e.target.value)} />}
          </FormField>
          <FormField label="Post-logout redirect URIs" hint="One per line." error={err('post_logout_redirect_uris')}>
            {(p) => <Textarea {...p} rows={3} value={f.post_logout_redirect_uris} onChange={(e) => set('post_logout_redirect_uris', e.target.value)} />}
          </FormField>
          <FormField label="Back-channel logout URI" hint="Optional. Without it, sign-out reaches the portal at its next token refresh (at most 10 minutes)." error={err('backchannel_logout_uri')}>
            {(p) => <Input {...p} type="url" value={f.backchannel_logout_uri} onChange={(e) => set('backchannel_logout_uri', e.target.value)} />}
          </FormField>
          <FormField label="Health URL" hint="Optional. Reachability only; the launch URL is used when empty." error={err('health_url')}>
            {(p) => <Input {...p} type="url" value={f.health_url} onChange={(e) => set('health_url', e.target.value)} />}
          </FormField>
        </div>

        <div className="flex items-center gap-3">
          <Switch checked={f.per_tenant_launch_url} onCheckedChange={(v) => set('per_tenant_launch_url', v)} aria-label="Per-tenant launch URL" />
          <span className="text-body text-ink">Per-tenant launch URL: the portal is deployed per customer. Each organization's own URL is set on its entitlement.</span>
        </div>
      </form>
    </Modal>
  );
}
