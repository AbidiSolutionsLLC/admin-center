// server/src/operator/accounts.ts
// Operator realm account resolution (09 §2): accountId = OperatorAccount `_id`, never a tenant User id.
import { Types } from 'mongoose';
import { OperatorAccount, IOperatorAccount } from '../models/OperatorAccount.model';

export const OPERATOR_ROLE = 'platform_admin';

/** Active operator holding platform_admin, or null (no tokens / no API access). */
export async function findOperatorAccount(id: string): Promise<IOperatorAccount | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const acct = await OperatorAccount.findById(id);
  if (!acct || acct.status !== 'active' || !acct.roles.includes(OPERATOR_ROLE)) return null;
  return acct;
}
