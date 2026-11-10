// server/src/identity/mongoAdapter.ts
// oidc-provider storage adapter on the shared Mongoose connection (03 §10.11, port of the E1 spike):
// collection per realm+model (`oidc_<realm>_<Model>`), TTL index on expiresAt (+ read-time expiry
// check because the TTL monitor lags), indexes on grantId / uid, atomic consume.
import mongoose from 'mongoose';
import { Realm } from './config';

export interface AdapterDoc {
  _id: string;
  payload: Record<string, any>;
  expiresAt?: Date;
}

export const TENANT_MODELS = ['Session', 'Interaction', 'Grant', 'AuthorizationCode', 'RefreshToken', 'AccessToken', 'ReplayDetection'];
export const SERVICES_MODELS = ['ClientCredentials', 'ReplayDetection'];

export function realmCollection(realm: Realm, name: string) {
  const db = mongoose.connection.db;
  if (!db) throw new Error('[identity] MongoDB is not connected');
  return db.collection<AdapterDoc>(`oidc_${realm}_${name}`);
}

const live = (doc: AdapterDoc | null) => (!doc || (doc.expiresAt && doc.expiresAt < new Date()) ? undefined : doc.payload);

export async function initAdapterIndexes(realm: Realm, names: string[]): Promise<void> {
  for (const n of names) {
    const c = realmCollection(realm, n);
    await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await c.createIndex({ 'payload.grantId': 1 });
    await c.createIndex({ 'payload.uid': 1 });
    if (n === 'RefreshToken') await c.createIndex({ 'payload.sessionUid': 1 });
  }
}

export function makeAdapter(realm: Realm) {
  return class MongoAdapter {
    private name: string;

    constructor(name: string) {
      this.name = name;
    }

    private get col() {
      return realmCollection(realm, this.name);
    }

    async upsert(_id: string, payload: Record<string, any>, expiresIn?: number): Promise<void> {
      const expiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
      await this.col.updateOne({ _id }, { $set: { payload, ...(expiresAt ? { expiresAt } : {}) } }, { upsert: true });
    }

    async find(_id: string) {
      return live(await this.col.findOne({ _id }));
    }

    async findByUid(uid: string) {
      return live(await this.col.findOne({ 'payload.uid': uid }));
    }

    async findByUserCode(): Promise<undefined> {
      return undefined; // device flow disabled
    }

    async consume(_id: string): Promise<void> {
      await this.col.updateOne(
        { _id, 'payload.consumed': { $exists: false } },
        { $set: { 'payload.consumed': Math.floor(Date.now() / 1000) } },
      );
    }

    async destroy(_id: string): Promise<void> {
      await this.col.deleteOne({ _id });
    }

    async revokeByGrantId(grantId: string): Promise<void> {
      await this.col.deleteMany({ 'payload.grantId': grantId });
    }
  };
}
