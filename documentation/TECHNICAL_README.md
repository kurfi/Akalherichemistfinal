# AK Alheri Chemist - Technical Documentation

This document provides a deep dive into the system architecture, technology stack, and core logic for developers maintaining or extending the AK Alheri Chemist application.

---

## 1. Technology Stack

- **Frontend Framework:** React 19 (TypeScript)
- **Build Tool:** Vite 6
- **Styling:** Tailwind CSS 4 (Utility-first, responsive design)
- **Local Database:** Dexie.js (Wrapper for IndexedDB)
- **Cloud Database:** Supabase (PostgreSQL with Real-time capabilities)
- **Iconography:** Lucide-React
- **Date Handling:** date-fns

---

## 2. System Architecture

The application follows an **Offline-First Synchronized Architecture**:

### Local Storage (Dexie.js)
The primary "Source of Truth" during runtime is the local browser IndexedDB. This ensures zero-latency interactions and 100% offline availability.
- **Hooks:** Every table has `creating`, `updating`, and `deleting` hooks that automatically populate a `syncQueue` table whenever local changes occur.

### Synchronization Service (`syncService.ts`)
A background service manages data parity with the Supabase cloud:
- **Push:** Scans the `syncQueue` for pending changes, converts keys to `snake_case`, resolves Foreign Keys (mapping local Numeric IDs to Supabase UUIDs), and performs an `upsert` to the cloud.
- **Pull:** Periodically fetches records from Supabase modified since the last successful sync, resolves UUIDs back to local Numeric IDs, and updates the local store.
- **Conflict Resolution:** Uses an `updated_at` timestamp strategy (Last-Write-Wins).

---

## 3. Database Schema

### Core Tables
1. **products:** Metadata about items (name, barcode, category).
2. **batches:** The actual stock levels. Linked to products via `productId`. Tracks `expiryDate` and `costPrice`.
3. **sales:** Master transaction records. Supports `MULTIPAY` (multiple payment methods).
4. **customers:** CRM and debt tracking.
5. **returns:** Refund transactions linked to sales.

### Key Logic: FIFO Stock Deduction
When a sale is processed, the system automatically identifies the oldest unexpired batches for the selected product and deducts quantity sequentially until the order is fulfilled.

---

## 4. Key Components

- **POS.tsx:** Complex state management for the cart, multipay logic, and transaction processing.
- **Layout.tsx:** Handles the responsive shell, sidebar state, and global sync status polling.
- **SyncContext.tsx:** Provides a global state for the synchronization status (online/offline/syncing).

---

## 5. Development & Deployment

### Environment Variables
The following must be defined in a `.env` file:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

### Setup Instructions
1. `npm install`
2. `npm run dev` (Local development server)
3. `npm run build` (Generates optimized production bundle in `/dist`)

---

## 6. Maintenance Tasks

- **Schema Migrations:** If the local Dexie schema changes, the `version` number in `db/db.ts` must be incremented.
- **Supabase Policies:** Ensure Row Level Security (RLS) is correctly configured on the cloud tables to protect user data.

---

*Prepared by Abdulhakim Aminu and Shamsuddeen Bala. Contact us on 08138012494 or 08037805073.*
