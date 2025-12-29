# AK Alheri Chemist - Admin & Operations Guide

This guide is intended for business owners and system administrators to manage the high-level configurations, data integrity, and staff security of the AK Alheri Chemist system.

---

## 1. User Security & Access Control

### Managing Staff Accounts
- **Adding Users:** In **Settings**, you can create new accounts. Always assign the correct role:
  - **Cashier:** Restricted to daily sales and basic customer viewing.
  - **Admin:** Full access to financial reports, inventory pricing, and system logs.
- **Account Recovery:** Admins can reset passwords for any staff member if they are forgotten.

### System Auditing
- The **System Logs (Audit)** section tracks every sensitive action, including:
  - Deleting products or batches.
  - Modifying customer credit details.
  - User creations and logins.
- Use these logs to investigate discrepancies or verify who performed a specific update.

---

## 2. Advanced Inventory Management

### Bulk Data Entry
- Use the **Import CSV** feature in the Inventory module to save time during initial setup or when receiving large shipments.
- Ensure the CSV matches the exact columns in the **Template.csv** (Name, Barcode, Category, Price, MinStockLevel).

### Managing Cost vs. Selling Price
- When adding a batch, always record the **Cost Price**. This allows the system to calculate your **Net Profit** in the Reports module.
- The system automatically updates the product's general selling price to match the newest batch added.

---

## 3. Financial Oversight

### Revenue vs. Receivables
- **Gross Sales:** The total amount of all sales made.
- **Receivables (Debt):** Money owed by customers. Monitor the **Customers** list regularly to ensure debts are within safe limits.
- **Net Profit:** Calculated as `(Sales - Cost of Goods Sold) - Expenses - Refunds`. This provides the most accurate view of your actual earnings.

### Expense Tracking
- Encourage staff to record every shop expense (fuel, rent, cleaning) in the **Expenses** module to ensure financial reports are accurate.

---

## 4. Cloud Sync & Data Safety

### Sync Architecture
The system uses an **Offline-First** model:
1. Data is written to the local database immediately.
2. A background worker (Sync Service) pushes changes to the Supabase Cloud.
3. If internet is lost, the system continues to work perfectly. Changes will sync automatically once reconnected.

### Handling Sync Errors
- If the sync indicator shows an **Error**, check your internet connection.
- In **Settings > Cloud Sync**, you can view "Recent Sync Activities" to see exactly which table is failing.

### Data Backups
- **Exporting:** Even with Cloud Sync, it is best practice to perform a manual **Database Export** weekly. Save this file to an external drive or USB stick.
- **Restoring:** Use the **Restore** feature only in emergencies (e.g., if you are moving to a new computer).

---

## 5. System Maintenance

### Performance
- If the application feels slow, clear the **System Logs (Audit History)** in Settings to free up local memory.
- Ensure your browser or host application is updated to the latest version.

---

*Prepared by Abdulhakim Aminu and Shamsuddeen Bala. Contact us on 08138012494 or 08037805073.*
