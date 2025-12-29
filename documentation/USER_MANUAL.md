# AK Alheri Chemist - User Manual

Welcome to the AK Alheri Chemist Management System. This guide provides comprehensive instructions for daily operations, including sales, inventory management, and reporting.

---

## 1. Getting Started

### Accessing the System
1. **Login:** Launch the application and enter your credentials.
   - **Default Admin:** `admin` / `password` (Change this immediately in Settings).
2. **Roles:**
   - **Admin:** Full access to all modules, including Inventory, Reports, and System Settings.
   - **Cashier:** Access to POS, Customers, and the Dashboard overview.

### Navigation
- **Sidebar:** Use the left sidebar to switch between modules. On mobile, tap the hamburger menu (top left) to open the sidebar.
- **Sync Status:** The bottom of the sidebar shows your Cloud Sync status (Online, Offline, or Syncing).

---

## 2. Point of Sale (POS)

The POS module is the heart of your daily operations.

### Making a Sale
1. **Search:** Use the search bar to find products by name or scan a barcode.
2. **Add to Cart:** Tap or click a product card to add it to your sale.
3. **Manage Quantities:** Use the **+** and **-** buttons in the cart to adjust quantities.
4. **Discount:** Apply a flat discount amount at the bottom of the cart if needed.
5. **Customer Selection:** Click the "Select Customer" bar to link the sale to a registered customer (Required for Debt/Credit sales).

### Payment Methods
- **Cash:** Standard cash transaction.
- **POS / Card:** For payments made via bank terminal.
- **Transfer:** For direct bank transfers.
- **Debt / Credit:** Records the sale as a debt for the selected customer.
- **Multipay (Split Payment):** Allows a customer to pay using multiple methods (e.g., half Cash, half Transfer).

### Advanced Features
- **Hold Sale:** Use the **Pause** icon to temporarily save a cart and serve another customer.
- **Resume Sale:** Go to the "Held" tab to reload a previously paused transaction.
- **Receipts:** Upon completion, you can Print, Save as PDF, or Save as Image.

---

## 3. Inventory & Stock

### Product Management (Admin Only)
- **Add Product:** Create new items with categories and minimum stock alerts.
- **Import CSV:** Use the "Import CSV" button to bulk-upload your product list using our standard template.

### Batch Tracking (FIFO)
The system tracks stock by batches to ensure medicine safety:
1. **Add Batch:** Click the **+** icon on a product to add new stock.
2. **Expiry Dates:** Enter the expiry date for every batch. The system will automatically flag expired or near-expiry items.
3. **Automated Deduction:** Sales automatically deduct stock from the **oldest valid batch first** (First-In-First-Out).

---

## 4. Customer & Debt Management

### Managing Relationships
- **Register Customers:** Save names and phone numbers for easy tracking.
- **Credit Limits:** Set a maximum debt limit for trusted customers to prevent over-borrowing.

### Debt Repayment
1. Go to the **Customers** page.
2. Find the customer and click the **Wallet/Repay** icon.
3. Enter the amount paid and the payment method.
4. The system will update their balance and log the payment in your sales reports.

---

## 5. Returns & Refunds (Admin Only)

### Processing a Return
1. Go to **Returns** and click **Process New Return**.
2. Search for the original transaction using the **Sale ID** (e.g., #1045).
3. Select items to return and choose their status:
   - **Restock:** Item is returned to inventory.
   - **Damaged:** Item is recorded as a loss.
4. **Refund:** Select how the customer is being refunded (Cash or Transfer). If it was a debt sale, the debt will be automatically reduced.

---

## 6. Reports & Analytics (Admin Only)

Monitor your business health using the **Reports** module:
- **Overview:** Visual charts showing revenue trends and payment distribution.
- **Sales History:** A detailed list of every transaction made.
- **Inventory Health:** Identify low-stock items and expired products quickly.
- **Exporting:** Generate a professional **PDF Business Report** for any date range (Today, Week, Month, or Custom).

---

## 7. System Settings & Security

### User Profiles
- **Staff Accounts:** Create unique logins for every staff member.
- **Password Security:** Change your password regularly using the "Change Password" button.

### Cloud Synchronization
The system works **offline-first**. All data is saved locally on your device and automatically synced to the cloud when an internet connection is available. 
- Check **Settings > Cloud Sync** to view the status of every table.

---

## Support & Maintenance
- **Backups:** Always export a database backup weekly from the Settings page.
- **Updates:** Ensure you are running the latest version for the best performance.

---

*Prepared by Abdulhakim Aminu and Shamsuddeen Bala. Contact us on 08138012494 or 08037805073.*
