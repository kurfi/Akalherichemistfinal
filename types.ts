export interface Customer {
  id?: number;
  supabase_id?: string;
  name: string;
  phone: string;
  email?: string;
  creditLimit: number;
  currentDebt: number;
  updated_at?: string;
}

export interface Product {
  id?: number;
  supabase_id?: string;
  name: string;
  barcode: string;
  category: string;
  price: number;
  minStockLevel: number;
  updated_at?: string;
}

export interface Batch {
  id?: number;
  supabase_id?: string;
  productId: number; // This will need to map to product's supabase_id for online sync
  batchNumber: string;
  expiryDate: Date;
  quantity: number;
  costPrice: number;
  sellingPrice?: number;
  updated_at?: string;
}

export enum PaymentMethod {
  CASH = 'CASH',
  CARD = 'CARD',
  TRANSFER = 'TRANSFER',
  CREDIT = 'CREDIT', // Store credit/Debt
  STORE_CREDIT = 'STORE_CREDIT', // For returns
  MULTIPAY = 'MULTIPAY'
}

export enum SaleStatus {
  COMPLETED = 'COMPLETED',
  HELD = 'HELD',
  CANCELLED = 'CANCELLED'
}

export interface SaleItem {
  productId: number;
  productName: string;
  quantity: number;
  price: number;
  total: number;
  batchId?: number; // Optional: if we track specific batch deduction
  returnedQuantity?: number; // New: To track how many of this item have been returned
  costPrice?: number; // Calculated COGS for this item at time of sale
}

export interface Sale {
  id?: number;
  supabase_id?: string;
  customerId?: number; // This will need to map to customer's supabase_id for online sync
  customerName?: string; // denormalized for easier reporting
  date: Date;
  totalAmount: number;
  discount: number;
  finalAmount: number;
  paymentMethod: PaymentMethod;
  paymentMethods?: { method: PaymentMethod; amount: number }[];
  status: SaleStatus;
  items: SaleItem[]; // SaleItem itself might need ID mapping or be embedded
  updated_at?: string;
}

export interface CustomerPayment {
  id?: number;
  supabase_id?: string;
  customerId: number; // This will need to map to customer's supabase_id for online sync
  date: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  note?: string;
  updated_at?: string;
}

export interface Expense {
  id?: number;
  supabase_id?: string;
  date: Date;
  category: string;
  amount: number;
  note: string;
  status: 'PAID' | 'PENDING';
  updated_at?: string;
}

export interface Setting {
  key: string;
  value: any;
}

// --- Added for Authentication ---
export enum UserRole {
  ADMIN = 'ADMIN',
  CASHIER = 'CASHIER'
}

export interface User {
  id?: number;
  supabase_id?: string;
  username: string;
  password?: string; // In a real app, this should be a hash, and ideally not part of the sync for security
  role: UserRole;
  updated_at?: string;
}

// --- New Enums for Returns ---
export enum ReturnReason {
  DEFECTIVE = 'Defective Item',
  WRONG_ITEM = 'Wrong Item Shipped',
  CUSTOMER_CHANGED_MIND = 'Customer Changed Mind',
  SIZE_ISSUE = 'Size Issue',
  DAMAGED_IN_TRANSIT = 'Damaged in Transit',
  OTHER = 'Other'
}

// --- New Interfaces for Returns ---
export interface Return {
  id?: number;
  supabase_id?: string;
  saleId: number; // Reference to the original sale (will need to map to supabase_id)
  customerId?: number; // Optional reference to the customer (will need to map to supabase_id)
  customerName?: string; // Denormalized for easier display
  staffId?: number; // New: Staff who processed the return (will need to map to user's supabase_id)
  returnDate: Date;
  totalRefundAmount: number;
  reason: ReturnReason; // Changed to use ReturnReason enum
  paymentMethod: PaymentMethod; // How the refund was issued (CASH, STORE_CREDIT, etc.)
  notes?: string;
  updated_at?: string;
}

export interface ReturnedItem {
  id?: number;
  supabase_id?: string;
  returnId: number; // Reference to the parent return transaction (will need to map to return's supabase_id)
  productId: number; // (will need to map to product's supabase_id)
  productName: string;
  quantity: number;
  price: number; // Price at time of return (per unit)
  refundAmount: number; // Calculated refund for this item (quantity * price)
  restockStatus: 'restocked' | 'damaged'; // Changed: Removed 'not_applicable', now explicitly restocked or damaged
  valueLost?: number; // New: Value lost for damaged items
  batchId?: number; // Optional: if a specific batch was returned from (will need to map to batch's supabase_id)
  updated_at?: string;
}

export interface AuditLog {
  id?: number;
  supabase_id?: string;
  action: string;
  details: string;
  user: string; // This will likely map to the user's supabase_id or email
  timestamp: Date;
  updated_at?: string;
}

// --- New Interface for Synchronization Queue ---
export interface SyncEntry {
  id?: number;
  table_name: string;
  local_id: number;
  supabase_id?: string; // Supabase UUID if available
  action: 'create' | 'update' | 'delete';
  payload?: any; // The data to sync, or a partial update
  timestamp: Date;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  error?: string;
}
