import { Sale, SaleItem } from '../types';
import { format } from 'date-fns';
import { invoke } from '@tauri-apps/api/core';
import { db } from '../db/db';

// ESC/POS Commands
const CMD = {
  INIT: [0x1B, 0x40],
  ALIGN_LEFT: [0x1B, 0x61, 0x00],
  ALIGN_CENTER: [0x1B, 0x61, 0x01],
  ALIGN_RIGHT: [0x1B, 0x61, 0x02],
  BOLD_ON: [0x1B, 0x45, 0x01],
  BOLD_OFF: [0x1B, 0x45, 0x00],
  TEXT_NORMAL: [0x1B, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [0x1B, 0x21, 0x10],
  TEXT_DOUBLE_WIDTH: [0x1B, 0x21, 0x20],
  LF: [0x0A],
  CUT: [0x1D, 0x56, 0x41, 0x00], // Cut paper (partial cut)
};

/**
 * Helper to convert string to byte array (ASCII/standard encoding)
 */
const strToBytes = (str: string): number[] => {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    // Simple ASCII mapping. For extended characters, more complex encoding is needed.
    const code = str.charCodeAt(i);
    bytes.push(code < 256 ? code : 63); // Replace non-ASCII with '?'
  }
  return bytes;
};

/**
 * Formats a line with left and right text (e.g. "Item Name .... 500.00")
 */
const formatLine = (left: string, right: string, width: number = 32): string => {
  const padding = Math.max(0, width - left.length - right.length);
  return left + ' '.repeat(padding) + right;
};

/**
 * Generates a raw ESC/POS buffer for a Sale receipt.
 */
export const generateReceiptBuffer = (
  sale: Sale,
  settings: any = {},
  customerDebt?: { previousDebt: number; newDebt: number; creditLimit: number } | null
): Uint8Array => {
  const buffer: number[] = [];
  const width = 32; // Standard 58mm width usually fits ~32 chars. 80mm fits ~48.
  // Let's assume 32 for broad compatibility or adjustable.
  // Ideally passed in settings.width. Defaulting to 32 (58mm safe).

  const push = (...arrays: number[][]) => {
    arrays.forEach(arr => buffer.push(...arr));
  };

  const pushStr = (str: string) => push(strToBytes(str));
  const pushLine = (str: string) => push(strToBytes(str), CMD.LF);

  // 1. Initialize
  push(CMD.INIT);

  // 2. Header (Center)
  push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
  pushLine("AK Alheri Chemist");
  push(CMD.BOLD_OFF);
  pushLine("PPMVS Kurfi");
  pushLine("No.2&3 Maradi Aliyu Street");
  pushLine("Opposite JIBWIS Jumma'a Masjid");
  pushLine("Tel: 09060605362");
  push(CMD.LF);

  // 3. Meta Data (Left)
  push(CMD.ALIGN_LEFT);
  pushLine(`Date: ${format(sale.date, 'dd/MM/yyyy HH:mm')}`);
  pushLine(`Sale ID: #${sale.id}`);
  pushLine(`Customer: ${sale.customerName || 'Walk-in'}`);
  push(CMD.LF);

  // 4. Items
  pushLine("- ".repeat(width));
  pushLine(formatLine("Item (Qty)", "Total", width));
  pushLine("- ".repeat(width));

  sale.items.forEach(item => {
    // If name is too long, truncate or wrap. Simple truncate for now.
    const name = item.productName.substring(0, 18);
    const total = item.total.toLocaleString(undefined, { minimumFractionDigits: 2 });
    const qtyPrice = `${item.quantity} x ${item.price}`;

    // Line 1: Name and Total
    pushLine(formatLine(name, total, width));
    // Line 2: Qty details (indented slightly or just below)
    pushLine(`  @ ${item.price}`);
  });
  pushLine("- ".repeat(width));

  // 5. Totals (Right aligned logic handled by formatLine mostly, but let's keep simple)
  push(CMD.ALIGN_LEFT); // Reset align

  if ((sale.discount || 0) > 0) {
    pushLine(formatLine("Subtotal:", sale.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
    pushLine(formatLine("Discount:", "-" + sale.discount.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
  }

  push(CMD.BOLD_ON, CMD.TEXT_DOUBLE_HEIGHT);
  pushLine(formatLine("TOTAL:", sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
  push(CMD.TEXT_NORMAL, CMD.BOLD_OFF);

  pushLine(`Paid via: ${sale.paymentMethod}`);
  push(CMD.LF);

  // 6. Debt Information for Credit Sales
  if (sale.paymentMethod === 'CREDIT' && customerDebt) {
    pushLine("= ".repeat(width));
    push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
    pushLine("CREDIT SALE - DEBT ACCOUNT");
    push(CMD.BOLD_OFF, CMD.ALIGN_LEFT);
    pushLine("= ".repeat(width));

    pushLine(formatLine("Previous Balance:", customerDebt.previousDebt.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
    pushLine(formatLine("This Sale:", "+" + sale.finalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
    pushLine("- ".repeat(width));

    push(CMD.BOLD_ON);
    pushLine(formatLine("New Balance:", customerDebt.newDebt.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));
    push(CMD.BOLD_OFF);

    pushLine(formatLine("Credit Limit:", customerDebt.creditLimit.toLocaleString(undefined, { minimumFractionDigits: 2 }), width));

    // Warning if credit limit exceeded
    if (customerDebt.newDebt > customerDebt.creditLimit) {
      push(CMD.LF);
      push(CMD.ALIGN_CENTER, CMD.BOLD_ON);
      pushLine("!!! CREDIT LIMIT EXCEEDED !!!");
      push(CMD.BOLD_OFF, CMD.ALIGN_LEFT);
    }

    push(CMD.LF);
  }

  // 7. Footer (Center)
  push(CMD.ALIGN_CENTER);
  pushLine("Mun gode da kasuwancin ku!");
  pushLine("Thank you for your patronage!");
  push(CMD.LF, CMD.LF, CMD.LF); // Feed

  // 8. Cut
  push(CMD.CUT);

  return new Uint8Array(buffer);
};

/**
 * Placeholder function to send data to a printer.
 * In a real Tauri app, this would interface with a Rust command (e.g., via a plugin)
 * to send raw ESC/POS data to a connected thermal printer.
 */
export const printRawReceipt = async (data: Uint8Array): Promise<void> => {
  try {
    // Fetch configured printer target from settings
    const setting = await db.settings.get('printerTarget');
    const target = setting?.value;

    if (!target) {
      throw new Error("Printer target not configured. Please go to Settings.");
    }

    // Invoke the native Rust command
    await invoke('print_raw', { target, data: Array.from(data) });
    alert("Sent to printer!");
  } catch (error: any) {
    console.error("Failed to send raw data to printer:", error);
    alert(`Failed to send raw data to printer: ${error.message || error}`);
  }
};
