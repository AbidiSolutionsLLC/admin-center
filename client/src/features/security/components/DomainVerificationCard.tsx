// src/features/security/components/DomainVerificationCard.tsx
import React, { useState } from 'react';
import { CheckCircle2, Clock, Copy, Check, RefreshCw, AlertCircle, ShieldCheck } from 'lucide-react';
import type { IdpDomain } from '@/types';
import { useVerifyDomain } from '../hooks/useIdentityProviders';
import { toast } from 'sonner';

interface DomainVerificationCardProps {
  connectionId: string;
  domains: IdpDomain[];
}

export const DomainVerificationCard: React.FC<DomainVerificationCardProps> = ({
  connectionId,
  domains,
}) => {
  const verifyDomain = useVerifyDomain(connectionId);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [verifyingDomain, setVerifyingDomain] = useState<string | null>(null);

  const handleCopy = (token: string) => {
    const txtRecord = `karbexa-verification=${token}`;
    navigator.clipboard.writeText(txtRecord);
    setCopiedToken(token);
    toast.success('DNS TXT record value copied to clipboard');
    setTimeout(() => {
      setCopiedToken(null);
    }, 2500);
  };

  const handleVerify = (domainName: string) => {
    setVerifyingDomain(domainName);
    verifyDomain.mutate(
      { domain: domainName },
      {
        onSettled: () => {
          setVerifyingDomain(null);
        },
      }
    );
  };

  if (!domains || domains.length === 0) {
    return (
      <div className="p-4 rounded-lg bg-surface-alt border border-line text-sm text-ink-secondary">
        No domains configured for this connection. Add domains to enable SSO routing and verification.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">
          Configured Domains & DNS Verification
        </h4>
        <span className="text-xs text-ink-muted">
          {domains.filter((d) => d.verified_at).length} of {domains.length} verified
        </span>
      </div>

      <div className="divide-y divide-line border border-line rounded-lg overflow-hidden bg-white">
        {domains.map((d) => {
          const isVerified = !!d.verified_at;
          const isPendingVerification = !isVerified;
          const isVerifying = verifyingDomain === d.domain && verifyDomain.isPending;

          return (
            <div key={d.domain} className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-semibold text-ink">{d.domain}</span>
                  {isVerified ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verified {new Date(d.verified_at!).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                      <Clock className="w-3.5 h-3.5" />
                      Pending DNS Verification
                    </span>
                  )}
                </div>

                {isPendingVerification && (
                  <button
                    onClick={() => handleVerify(d.domain)}
                    disabled={isVerifying}
                    className="h-8 px-3 text-xs font-medium rounded-md bg-primary hover:bg-primary-hover text-white transition-colors flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isVerifying ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Verifying...
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="w-3.5 h-3.5" />
                        Verify DNS Record
                      </>
                    )}
                  </button>
                )}
              </div>

              {isPendingVerification && (
                <div className="rounded-lg bg-surface-alt p-3.5 border border-line/80 space-y-2 text-xs">
                  <div className="flex items-start gap-2 text-ink-secondary">
                    <AlertCircle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <span>
                      Add a <strong>TXT</strong> record to your domain's DNS zone to verify ownership.
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-4 gap-2 pt-1 font-mono">
                    <div className="bg-white p-2 rounded border border-line">
                      <span className="text-[10px] uppercase tracking-wider text-ink-muted block font-sans">
                        Record Type
                      </span>
                      <span className="text-ink font-semibold">TXT</span>
                    </div>

                    <div className="bg-white p-2 rounded border border-line">
                      <span className="text-[10px] uppercase tracking-wider text-ink-muted block font-sans">
                        Host / Name
                      </span>
                      <span className="text-ink font-semibold">@</span>
                    </div>

                    <div className="bg-white p-2 rounded border border-line md:col-span-2 flex items-center justify-between gap-2 overflow-hidden">
                      <div className="overflow-hidden">
                        <span className="text-[10px] uppercase tracking-wider text-ink-muted block font-sans">
                          Value
                        </span>
                        <span className="text-ink truncate block text-[11px]" title={`karbexa-verification=${d.verification_token}`}>
                          karbexa-verification={d.verification_token}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(d.verification_token)}
                        className="flex-shrink-0 p-1.5 rounded hover:bg-surface-alt text-ink-secondary hover:text-ink transition-colors"
                        title="Copy DNS TXT value"
                      >
                        {copiedToken === d.verification_token ? (
                          <Check className="w-4 h-4 text-emerald-600" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
