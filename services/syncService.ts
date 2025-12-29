// services/syncService.ts
import { db } from '../db/db';
import { supabase } from './supabase';
import { v4 as uuidv4 } from 'uuid';

const SYNC_INTERVAL = 30000; // 30 seconds
const LAST_SYNC_KEY = 'last_supabase_sync';

// Type mapping for Supabase table names
const supabaseTableMap: { [key: string]: string } = {
  customers: 'customers',
  products: 'products',
  batches: 'batches',
  sales: 'sales',
  expenses: 'expenses',
  customerPayments: 'customer_payments',
  users: 'user_profiles',
  returns: 'returns',
  returnedItems: 'returned_items',
  auditLogs: 'audit_logs',
  settings: 'settings',
};

// --- Helper Functions for Case Conversion ---
const toSnakeCase = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
const toCamelCase = (str: string) => str.replace(/_([a-z])/g, (g) => g[1].toUpperCase());

const convertKeysToSnakeCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => convertKeysToSnakeCase(v));
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    for (const key in obj) {
      if (key === 'updated_at' || key === 'supabase_id') {
        newObj[key] = obj[key];
      } else {
        newObj[toSnakeCase(key)] = convertKeysToSnakeCase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
};

const convertKeysToCamelCase = (obj: any): any => {
  if (Array.isArray(obj)) {
    return obj.map(v => convertKeysToCamelCase(v));
  } else if (obj !== null && typeof obj === 'object' && !(obj instanceof Date)) {
    const newObj: any = {};
    for (const key in obj) {
      if (key === 'updated_at' || key === 'supabase_id') {
        newObj[key] = obj[key];
      } else {
        newObj[toCamelCase(key)] = convertKeysToCamelCase(obj[key]);
      }
    }
    return newObj;
  }
  return obj;
};

// Helper for dates in remote records
const ensureDateObjects = (dexieTableName: string, record: any) => {
  const dateFields: { [key: string]: string[] } = {
    sales: ['date'],
    expenses: ['date'],
    customerPayments: ['date'],
    returns: ['returnDate'],
    auditLogs: ['timestamp'],
    batches: ['expiryDate'],
    syncQueue: ['timestamp']
  };

  const fields = dateFields[dexieTableName] || [];
  fields.forEach(f => {
    if (record[f] && typeof record[f] === 'string') {
      record[f] = new Date(record[f]);
    }
  });

  return record;
};

// --- Sync Status Subscription ---
export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';
type SyncStatusListener = (status: SyncStatus) => void;
const listeners: SyncStatusListener[] = [];

export const subscribeToSyncStatus = (listener: SyncStatusListener) => {
  listeners.push(listener);
  return () => {
    const index = listeners.indexOf(listener);
    if (index > -1) listeners.splice(index, 1);
  };
};

const notifyListeners = (status: SyncStatus) => {
  listeners.forEach(l => l(status));
};

let isSyncServiceStarted = false;

export const startSyncService = () => {
  if (isSyncServiceStarted) {
    console.log("Sync service already running. Skipping initialization.");
    return;
  }
  isSyncServiceStarted = true;
  console.log("Starting sync service...");
  syncData();
  setInterval(syncData, SYNC_INTERVAL);
  window.addEventListener('online', syncData);
  window.addEventListener('offline', () => notifyListeners('offline'));
};

export const hardResetAndSync = async () => {
  console.log("Initiating hard reset and sync...");
  try {
    const { resetDatabase } = await import('../db/db');
    await resetDatabase();
    await db.settings.put({ key: LAST_SYNC_KEY, value: new Date(0).toISOString() });
    await syncData();
    console.log("Hard reset and sync completed.");
  } catch (error) {
    console.error("Hard reset failed:", error);
  }
};

let isSyncing = false;
let lastSyncAttempt = 0;
const SYNC_TIMEOUT = 120000; // 2 minutes timeout for sync lock

export const resetSyncLock = () => {
  console.log("Sync: Manually resetting sync lock...");
  isSyncing = false;
};

export const syncData = async () => {
  const now = Date.now();
  if (isSyncing) {
    if (now - lastSyncAttempt > SYNC_TIMEOUT) {
      console.warn("Sync: Sync process timed out. Resetting lock.");
      isSyncing = false;
    } else {
      console.log("Sync already in progress. Skipping.");
      return;
    }
  }

  if (!navigator.onLine) {
    console.warn("Sync: Device is offline. Skipping.");
    notifyListeners('offline');
    return;
  }

  console.log("Sync: Process started...");
  lastSyncAttempt = Date.now();
  isSyncing = true;
  notifyListeners('syncing');

  try {
    await pushChangesToSupabase();
    await pullChangesFromSupabase();
    console.log("Sync: Process completed successfully.");
    notifyListeners('idle');
  } catch (error) {
    console.error("Sync: Error during sync:", error);
    notifyListeners('error');
  } finally {
    isSyncing = false;
  }
};

const pushChangesToSupabase = async () => {
  const BATCH_SIZE = 50;

  const totalPending = await db.syncQueue
    .where('status').anyOf('pending', 'failed')
    .count();

  let pendingChanges = await db.syncQueue
    .where('status').anyOf('pending', 'failed')
    .limit(BATCH_SIZE)
    .toArray();

  if (pendingChanges.length === 0) {
    console.log("Sync: No pending changes to push.");
    return;
  }

  console.log(`Sync: Pushing batch of ${pendingChanges.length} (Total pending: ${totalPending})...`);

  for (const change of pendingChanges) {
    const supabaseTableName = supabaseTableMap[change.table_name];
    console.log(`Sync: Attempting to push ${change.action} for ${change.table_name}...`);
    
    if (!supabaseTableName) {
      console.warn(`No Supabase table mapping found for Dexie table: ${change.table_name}`);
      await db.syncQueue.update(change.id!, { status: 'completed' });
      continue;
    }

    try {
      await db.syncQueue.update(change.id!, { status: 'in_progress' });

      // Helper to resolve Foreign Keys (Local ID -> Supabase UUID)
      const resolveFKs = async (payload: any) => {
        const resolved = { ...payload };

        if (change.table_name === 'batches' && typeof resolved.productId === 'number') {
          const p = await db.products.get(resolved.productId);
          if (p?.supabase_id) resolved.productId = p.supabase_id;
        }
        if ((change.table_name === 'sales' || change.table_name === 'customerPayments' || change.table_name === 'returns') && typeof resolved.customerId === 'number') {
          const c = await db.customers.get(resolved.customerId);
          if (c?.supabase_id) resolved.customerId = c.supabase_id;
        }

        // Resolve product IDs inside Sales Items array
        if (change.table_name === 'sales' && Array.isArray(resolved.items)) {
          resolved.items = await Promise.all(resolved.items.map(async (item: any) => {
            const newItem = { ...item };
            if (typeof newItem.productId === 'number') {
              const p = await db.products.get(newItem.productId);
              if (p?.supabase_id) newItem.productId = p.supabase_id;
            }
            return newItem;
          }));
        }

        if (change.table_name === 'returns') {
          if (typeof resolved.saleId === 'number') {
            const s = await db.sales.get(resolved.saleId);
            if (s?.supabase_id) resolved.saleId = s.supabase_id;
          }
          if (typeof resolved.staffId === 'number') {
            const u = await db.users.get(resolved.staffId);
            if (u?.supabase_id) resolved.staffId = u.supabase_id;
          }
        }
        if (change.table_name === 'returnedItems') {
          if (typeof resolved.returnId === 'number') {
            const r = await db.returns.get(resolved.returnId);
            if (r?.supabase_id) resolved.returnId = r.supabase_id;
          }
          if (typeof resolved.productId === 'number') {
            const p = await db.products.get(resolved.productId);
            if (p?.supabase_id) resolved.productId = p.supabase_id;
          }
          if (typeof resolved.batchId === 'number') {
            const b = await db.batches.get(resolved.batchId);
            if (b?.supabase_id) resolved.batchId = b.supabase_id;
          }
        }
        return resolved;
      };

      switch (change.action) {
        case 'create':
          if (!change.supabase_id) {
            await db.syncQueue.update(change.id!, { status: 'failed', error: 'Missing supabase_id' });
            continue;
          }

          let createPayload = { ...change.payload };
          if (change.table_name === 'users') {
            delete createPayload.password;
          }
          delete createPayload.id; // Remove local numeric ID
          delete createPayload.supabase_id; // Remove supabase_id

          // Resolve Foreign Keys
          createPayload = await resolveFKs(createPayload);

          // Convert to snake_case for Supabase
          const snakeCreatePayload = convertKeysToSnakeCase(createPayload);

          const { error: insertError } = await supabase.from(supabaseTableName).upsert({
            ...snakeCreatePayload,
            id: change.supabase_id,
            updated_at: createPayload.updated_at || new Date().toISOString()
          }, { onConflict: 'id' });
          if (insertError) throw insertError;
          break;

        case 'update':
          if (!change.supabase_id) {
            await db.syncQueue.update(change.id!, { status: 'failed', error: 'Missing supabase_id' });
            continue;
          }

          const { id: _ignoredId, ...updatePayload } = change.payload || {};
          if (change.table_name === 'users') {
            delete updatePayload.password;
          }
          delete updatePayload.supabase_id; // Remove supabase_id from update payload

          // Resolve Foreign Keys (for updates too, though less common to change FKs)
          const resolvedUpdatePayload = await resolveFKs(updatePayload);

          // Convert to snake_case for Supabase
          const snakeUpdatePayload = convertKeysToSnakeCase(resolvedUpdatePayload);

          const { error: updateError } = await supabase.from(supabaseTableName).update({
            ...snakeUpdatePayload,
            updated_at: updatePayload.updated_at || new Date().toISOString()
          }).eq('id', change.supabase_id);

          if (updateError) throw updateError;
          break;

        case 'delete':
          if (!change.supabase_id) {
            await db.syncQueue.update(change.id!, { status: 'failed', error: 'Missing supabase_id' });
            continue;
          }
          const { error: deleteError } = await supabase.from(supabaseTableName).update({ is_deleted: true, updated_at: new Date().toISOString() }).eq('id', change.supabase_id);
          if (deleteError) throw deleteError;
          break;
      }
      await db.syncQueue.update(change.id!, { status: 'completed' });
    } catch (error: any) {
      const errorMsg = error.message || 'Unknown error';
      console.error(`Sync Error: [${change.table_name}] ${change.action} failed:`, errorMsg, error);
      await db.syncQueue.update(change.id!, { 
        status: 'failed', 
        error: `${errorMsg}${error.details ? ' - ' + error.details : ''}` 
      });
    }
  }
};

const pullChangesFromSupabase = async () => {
  const lastSyncString = await db.settings.get(LAST_SYNC_KEY);
  const lastSync = lastSyncString ? new Date(lastSyncString.value) : new Date(0);
  const syncStartTime = new Date().toISOString();

  console.log(`Sync: Pulling changes modified since ${lastSync.toISOString()}`);

  // Pull in order of dependency
  const tablePullOrder = [
    'users',
    'customers',
    'products',
    'batches',
    'sales',
    'customerPayments',
    'expenses',
    'returns',
    'returnedItems',
    'auditLogs',
    'settings'
  ];

  for (const dexieTableName of tablePullOrder) {
    const supabaseTableName = supabaseTableMap[dexieTableName];
    if (!supabaseTableName) continue;

    try {
      const localCount = await db.table(dexieTableName).count();
      let query = supabase.from(supabaseTableName).select('*');

      // If we have data locally and a last sync time, only pull changes.
      // If we are starting fresh (hard reset), pull EVERYTHING.
      if (localCount > 0 && lastSync.getTime() > 0) {
        query = query.gt('updated_at', lastSync.toISOString());
        console.log(`Sync: [${dexieTableName}] Fetching incremental changes since ${lastSync.toISOString()} (Local count: ${localCount})`);
      } else {
        console.log(`Sync: [${dexieTableName}] Local table is empty or reset. Fetching full table...`);
      }

      const { data, error, status, statusText } = await query;

      if (error) {
        console.error(`Sync Error: [${dexieTableName}] Fetch failed (Status ${status}):`, error.message, error.details);
        throw error;
      }

      if (!data || data.length === 0) {
        console.log(`Sync: [${dexieTableName}] Supabase returned 0 records.`);
        continue;
      }

      console.log(`Sync: [${dexieTableName}] Successfully pulled ${data.length} records.`);

      for (const remoteRecord of data) {
        // Convert remote snake_case record to camelCase for local DB
        let camelCaseRecord = convertKeysToCamelCase(remoteRecord);

        // Convert date strings to Date objects where needed
        camelCaseRecord = ensureDateObjects(dexieTableName, camelCaseRecord);

        // Resolve Foreign Keys (Supabase UUID -> Local ID)
        const resolveRemoteFKs = async (tableName: string, record: any) => {
          const resolved = { ...record };
          if (tableName === 'batches' && typeof resolved.productId === 'string') {
            const p = await db.products.where('supabase_id').equals(resolved.productId).first();
            if (p) {
              resolved.productId = p.id;
            } else {
              console.warn(`Sync Warn: [${tableName}] Could not find product with supabase_id ${resolved.productId} for batch ${record.id || record.batch_number}`);
            }
          } else if (tableName === 'batches' && typeof resolved.productId !== 'string' && typeof resolved.productId !== 'number') {
            console.error(`Sync Error: [${tableName}] Invalid productId type:`, typeof resolved.productId, resolved.productId);
          }
          if ((tableName === 'sales' || tableName === 'customerPayments' || tableName === 'returns') && typeof resolved.customerId === 'string') {
            const c = await db.customers.where('supabase_id').equals(resolved.customerId).first();
            if (c) {
              resolved.customerId = c.id;
            } else {
              console.warn(`Sync Warn: Could not find customer with supabase_id ${resolved.customerId} for ${tableName} record ${record.id}`);
            }
          }

          // Resolve product IDs inside Sales Items array (from Supabase UUID to local Numeric ID)
          if (tableName === 'sales' && Array.isArray(resolved.items)) {
            resolved.items = await Promise.all(resolved.items.map(async (item: any) => {
              const newItem = { ...item };
              if (typeof newItem.productId === 'string') {
                const p = await db.products.where('supabase_id').equals(newItem.productId).first();
                if (p) newItem.productId = p.id;
              }
              return newItem;
            }));
          }

          if (tableName === 'returns') {
            if (typeof resolved.saleId === 'string') {
              const s = await db.sales.where('supabase_id').equals(resolved.saleId).first();
              if (s) {
                resolved.saleId = s.id;
              } else {
                console.warn(`Sync Warn: Could not find sale with supabase_id ${resolved.saleId} for return ${record.id}`);
              }
            }
            if (typeof resolved.staffId === 'string') {
              const u = await db.users.where('supabase_id').equals(resolved.staffId).first();
              if (u) {
                resolved.staffId = u.id;
              } else {
                console.warn(`Sync Warn: Could not find staff with supabase_id ${resolved.staffId} for return ${record.id}`);
              }
            }
          }
          if (tableName === 'returnedItems') {
            if (typeof resolved.returnId === 'string') {
              const r = await db.returns.where('supabase_id').equals(resolved.returnId).first();
              if (r) {
                resolved.returnId = r.id;
              } else {
                console.warn(`Sync Warn: Could not find return with supabase_id ${resolved.returnId} for returnedItem ${record.id}`);
              }
            }
            if (typeof resolved.productId === 'string') {
              const p = await db.products.where('supabase_id').equals(resolved.productId).first();
              if (p) {
                resolved.productId = p.id;
              } else {
                console.warn(`Sync Warn: Could not find product with supabase_id ${resolved.productId} for returnedItem ${record.id}`);
              }
            }
            if (typeof resolved.batchId === 'string') {
              const b = await db.batches.where('supabase_id').equals(resolved.batchId).first();
              if (b) {
                resolved.batchId = b.id;
              } else {
                console.warn(`Sync Warn: Could not find batch with supabase_id ${resolved.batchId} for returnedItem ${record.id}`);
              }
            }
          }
          return resolved;
        };

        const resolvedRecord = await resolveRemoteFKs(dexieTableName, camelCaseRecord);
        const localRecord = await db.table(dexieTableName).where('supabase_id').equals(remoteRecord.id).first();

        if (remoteRecord.is_deleted) {
          if (localRecord) {
            await db.table(dexieTableName).delete(localRecord.id!);
          }
          continue;
        }

        if (localRecord) {
          // Only update if remote is actually newer
          const localTime = localRecord.updated_at ? new Date(localRecord.updated_at).getTime() : 0;
          const remoteTime = new Date(remoteRecord.updated_at).getTime();

          if (remoteTime >= localTime) {
            await db.table(dexieTableName).update(localRecord.id!, {
              ...resolvedRecord,
              id: localRecord.id, // Preserve local Dexie ID
              supabase_id: remoteRecord.id,
              updated_at: remoteRecord.updated_at
            });

            // Mark any pending sync entries for this record as completed to avoid overwriting remote truth
            await db.syncQueue.where({ table_name: dexieTableName, local_id: localRecord.id }).modify({ status: 'completed' });
          }
        } else {
          const { id: remoteId, ...rest } = resolvedRecord;
          const newLocalId = await db.table(dexieTableName).add({
            ...rest,
            supabase_id: remoteRecord.id, // Use the real remote ID as supabase_id
            updated_at: remoteRecord.updated_at
          });

          // Important: If we just added a record from Supabase, we don't want it in the sync queue as a 'create'
          // Dexie hooks might have added it. Let's clear it.
          await db.syncQueue.where({ table_name: dexieTableName, local_id: newLocalId }).modify({ status: 'completed' });
        }
      }
    } catch (error) {
      console.error(`Error pulling changes for table ${dexieTableName}:`, error);
    }
  }

  await db.settings.put({ key: LAST_SYNC_KEY, value: syncStartTime });
};
