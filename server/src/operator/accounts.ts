// server/src/operator/accounts.ts
// Operator realm account resolution (09 §2): accountId = OperatorAccount `_id`, never a tenant User id.
import { Types } from 'mongoose';
import { OperatorAccount, IOperatorAccount } from '../models/OperatorAccount.model';
import { isOperatorRole } from './permissions';

export const OPERATOR_ROLE = 'platform_admin';

/** True when the account holds at least one of the four operator roles (F7: not only platform_admin). */
export const hasOperatorRole = (a: Pick<IOperatorAccount, 'roles'>): boolean => a.roles.some(isOperatorRole);

/** Active operator holding any operator role, or null (no tokens / no API access). */
export async function findOperatorAccount(id: string): Promise<IOperatorAccount | null> {
  if (!Types.ObjectId.isValid(id)) return null;
  const acct = await OperatorAccount.findById(id);
  if (!acct || acct.status !== 'active' || !hasOperatorRole(acct)) return null;
  return acct;
}
