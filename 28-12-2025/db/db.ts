import Dexie, { Table } from 'dexie';
// React imports removed as they are unused here
import {
  Customer,
  Product,
  Batch,
  SaleItem,
  Sale,
  Expense,
  PaymentMethod,
  SaleStatus,
  Setting,
  CustomerPayment,
  User,
  UserRole,
  Return,        // Imported new interface
  ReturnedItem,   // Imported new interface
  AuditLog,       // Imported new interface
  SyncEntry        // Imported new interface
} from '../types'; // Import from central types.ts
import { v4 as uuidv4 } from 'uuid';

// Extend Dexie to declare your tables
class AKAlheriChemistDB extends Dexie {
  customers!: Table<Customer, number>;
  products!: Table<Product, number>;
  batches!: Table<Batch, number>;
  sales!: Table<Sale, number>;
  expenses!: Table<Expense, number>;
  settings!: Table<Setting, string>; // Primary key for settings is 'key'
  customerPayments!: Table<CustomerPayment, number>;
  users!: Table<User, number>;
  returns!: Table<Return, number>;        // Declared new table
  returnedItems!: Table<ReturnedItem, number>; // Declared new table
  auditLogs!: Table<AuditLog, number>; // Declared new table
  syncQueue!: Table<SyncEntry, number>; // Declared new sync queue table


  constructor() {
    super('AK_Alheri_Chemist_DB_v4'); // Incremented to v4 for fresh start

    // Consolidate all schema into version 1 for the new DB
    this.version(1).stores({
      customers: '++id, supabase_id, name, phone, email, currentDebt, updated_at',
      products: '++id, supabase_id, name, barcode, category, price, minStockLevel, updated_at',
      batches: '++id, supabase_id, productId, batchNumber, expiryDate, updated_at',
      sales: '++id, supabase_id, customerId, date, paymentMethod, status, invoiceNumber, updated_at',
      expenses: '++id, supabase_id, date, category, amount, updated_at',
      settings: '&key', // '&' for unique index and primary key
      customerPayments: '++id, supabase_id, customerId, date, updated_at',
      users: '++id, supabase_id, &username, role, updated_at', // '&' for unique index
      returns: '++id, supabase_id, saleId, customerId, staffId, returnDate, reason, paymentMethod, updated_at',
      returnedItems: '++id, supabase_id, returnId, productId, restockStatus, updated_at', // New returnedItems table
      auditLogs: '++id, supabase_id, action, user, timestamp, updated_at', // New auditLogs table
      syncQueue: '++id, table_name, local_id, supabase_id, action, status, timestamp, [table_name+local_id]' // Added composite index
    });

    // --- Dexie Hooks for Sync Queue ---
    const dbInstance = this;
    const syncableTableNames = [
      'customers', 'products', 'batches', 'sales', 'expenses',
      'customerPayments', 'users', 'returns', 'returnedItems', 'auditLogs'
    ];

    syncableTableNames.forEach(tableName => {
      const table = this.table(tableName);
      if (!table) {
        console.error(`Sync Error: Table "${tableName}" not found during hook registration.`);
        return;
      }

      console.log(`Sync: Attaching hooks to table "${tableName}"`);

      // Hook for 'creating' operations
      table.hook('creating', function (primKey, obj, transaction) {
        if (!obj.supabase_id) {
          obj.supabase_id = uuidv4(); // Generate UUID for Supabase
        }
        obj.updated_at = new Date().toISOString(); // Set updated timestamp

        // Use onsuccess to capture the auto-incremented primary key
        this.onsuccess = function (primKey) {
          console.log(`Hook: [${tableName}] created locally (ID: ${primKey}, SupabaseID: ${obj.supabase_id})`);
          
          const syncEntry: SyncEntry = {
            table_name: tableName,
            local_id: primKey as number,
            supabase_id: obj.supabase_id,
            action: 'create' as const,
            payload: { ...obj, id: primKey },
            timestamp: new Date(),
            status: 'pending'
          };

          // Use setTimeout and ignoreTransaction to ensure this runs outside the current transaction scope
          setTimeout(() => {
            Dexie.ignoreTransaction(async () => {
              try {
                await dbInstance.syncQueue.add(syncEntry);
                console.log(`Hook: [${tableName}] sync entry successfully added to queue.`);
              } catch (e) {
                console.error(`Sync Queue Error: [${tableName}] failed to add CREATE entry:`, e);
              }
            });
          }, 0);
        };
      });

      // Hook for 'updating' operations
      table.hook('updating', function (modifications, primKey, obj, transaction) {
        if (!(modifications as any).updated_at) {
          (modifications as any).updated_at = new Date().toISOString(); // Update timestamp
        }

        const syncEntry: SyncEntry = {
          table_name: tableName,
          local_id: primKey as number,
          supabase_id: obj.supabase_id,
          action: 'update' as const,
          payload: { id: primKey, ...modifications },
          timestamp: new Date(),
          status: 'pending'
        };

        // Use setTimeout and ignoreTransaction
        setTimeout(() => {
          Dexie.ignoreTransaction(async () => {
            try {
              await dbInstance.syncQueue.add(syncEntry);
              console.log(`Hook: [${tableName}] update sync entry added to queue.`);
            } catch (e) {
              console.error(`Sync Queue Error: [${tableName}] failed to add UPDATE entry:`, e);
            }
          });
        }, 0);
      });

      // Hook for 'deleting' operations
      table.hook('deleting', function (primKey, obj, transaction) {
        const syncEntry: SyncEntry = {
          table_name: tableName,
          local_id: primKey as number,
          supabase_id: obj.supabase_id,
          action: 'delete' as const,
          payload: { id: primKey, supabase_id: obj.supabase_id },
          timestamp: new Date(),
          status: 'pending'
        };

        // Use setTimeout and ignoreTransaction
        setTimeout(() => {
          Dexie.ignoreTransaction(async () => {
            try {
              await dbInstance.syncQueue.add(syncEntry);
              console.log(`Hook: [${tableName}] delete sync entry added to queue.`);
            } catch (e) {
              console.error(`Sync Queue Error: [${tableName}] failed to add DELETE entry:`, e);
            }
          });
        }, 0);
      });
    });
  }
}

export const db = new AKAlheriChemistDB();

// --- Helper for Audit Logging ---
export const logAudit = async (action: string, details: string, user: string) => {
  try {
    await db.auditLogs.add({
      action,
      details,
      user,
      timestamp: new Date()
    });
  } catch (error) {
    console.error("Failed to log audit:", error);
  }
};

// --- Example CRUD Functions ---

// Customers
export const addCustomer = async (customer: Omit<Customer, 'id'>) => db.customers.add(customer);
export const getCustomer = async (id: number) => db.customers.get(id);
export const getAllCustomers = async () => db.customers.toArray();
export const updateCustomer = async (id: number, changes: Partial<Customer>) => db.customers.update(id, changes);
export const deleteCustomer = async (id: number) => db.customers.delete(id);

// Products
export const addProduct = async (product: Omit<Product, 'id'>) => db.products.add(product);
export const getProduct = async (id: number) => db.products.get(id);
export const getAllProducts = async () => db.products.toArray();
export const updateProduct = async (id: number, changes: Partial<Product>) => db.products.update(id, changes);
export const deleteProduct = async (id: number) => db.products.delete(id);

// Sales
export const addSale = async (sale: Omit<Sale, 'id'>) => db.sales.add(sale);
export const getSale = async (id: number) => db.sales.get(id);
export const getAllSales = async () => db.sales.toArray();
export const updateSale = async (id: number, changes: Partial<Sale>) => db.sales.update(id, changes);
export const deleteSale = async (id: number) => db.sales.delete(id);

// Expenses
export const addExpense = async (expense: Omit<Expense, 'id'>) => db.expenses.add(expense);
export const getExpense = async (id: number) => db.expenses.get(id);
export const getAllExpenses = async () => db.expenses.toArray();
export const updateExpense = async (id: number, changes: Partial<Expense>) => db.expenses.update(id, changes);
export const deleteExpense = async (id: number) => db.expenses.delete(id);

// Settings
export const getSetting = async (key: string) => db.settings.get(key);
export const setSetting = async (key: string, value: any) => db.settings.put({ key, value });

// Users
export const addUser = async (user: Omit<User, 'id'>) => db.users.add(user);
export const getUser = async (id: number) => db.users.get(id);
export const getUserByUsername = async (username: string) => db.users.where('username').equals(username).first();
export const getAllUsers = async () => db.users.toArray();
export const updateUser = async (id: number, changes: Partial<User>) => db.users.update(id, changes);
export const deleteUser = async (id: number) => db.users.delete(id);

// Customer Payments
export const addCustomerPayment = async (payment: Omit<CustomerPayment, 'id'>) => db.customerPayments.add(payment);
export const getCustomerPayment = async (id: number) => db.customerPayments.get(id);
export const getAllCustomerPayments = async () => db.customerPayments.toArray();
export const updateCustomerPayment = async (id: number, changes: Partial<CustomerPayment>) => db.customerPayments.update(id, changes);
export const deleteCustomerPayment = async (id: number) => db.customerPayments.delete(id);

// Returns CRUD Functions
export const addReturn = async (returnEntry: Omit<Return, 'id'>) => db.returns.add(returnEntry);
export const getReturn = async (id: number) => db.returns.get(id);
export const getReturnsBySaleId = async (saleId: number) => db.returns.where('saleId').equals(saleId).toArray();
export const getAllReturns = async () => db.returns.toArray();
export const updateReturn = async (id: number, changes: Partial<Return>) => db.returns.update(id, changes); // Added update and delete
export const deleteReturn = async (id: number) => db.returns.delete(id);

// Returned Items CRUD Functions
export const addReturnedItem = async (returnedItem: Omit<ReturnedItem, 'id'>) => db.returnedItems.add(returnedItem);
export const getReturnedItem = async (id: number) => db.returnedItems.get(id);
export const getReturnedItemsByReturnId = async (returnId: number) => db.returnedItems.where('returnId').equals(returnId).toArray();
export const updateReturnedItem = async (id: number, changes: Partial<ReturnedItem>) => db.returnedItems.update(id, changes); // Added update and delete
export const deleteReturnedItem = async (id: number) => db.returnedItems.delete(id);

// Database Reset Function
export const resetDatabase = async () => {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all(db.tables.map(table => table.clear()));
  });
};
