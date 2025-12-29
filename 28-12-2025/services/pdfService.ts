import { jsPDF } from 'jspdf';
import { toPng } from 'html-to-image';
import { getAppDirectory, DirectoryType, isTauri } from './directoryService';
import { join } from '@tauri-apps/api/path';

declare global {
  interface Window {
    __TAURI__?: any;
  }
}

/**
 * Generates and saves a PDF, automatically choosing the best method
 * based on the execution environment (Tauri or Web).
 * 
 * In Tauri: Saves silently to the configured folder (Receipts/Reports).
 * In Web: Triggers browser download.
 *
 * @param doc The jsPDF document instance to be saved.
 * @param fileName The suggested filename for the download.
 * @param type The type of document ('receipts' | 'reports' | 'exports') to determine save location.
 */
export const savePdf = async (doc: jsPDF, fileName: string, type: DirectoryType = 'receipts'): Promise<void> => {
  // --- TAURI DESKTOP PATH ---
  if (isTauri()) {
    try {
      const { writeFile } = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');
      
      // Get the target directory
      const dirPath = await getAppDirectory(type);
      const fullPath = await join(dirPath, fileName);

      // Get the PDF output as a Uint8Array
      const pdfOutput = doc.output('arraybuffer');
      const uint8array = new Uint8Array(pdfOutput);

      // Write the file silently
      await writeFile(fullPath, uint8array);
      
      // Optional: You might want to show a toast here, but the calling component usually handles UI feedback
      
    } catch (error) {
      console.error('Failed to save PDF via Tauri:', error);
      throw error; // Re-throw so UI can show error toast
    }
    return;
  }

  // --- WEB BROWSER FALLBACK PATH ---
  try {
    doc.save(fileName);
  } catch (error) {
    console.error('Failed to save PDF in browser:', error);
    throw error;
  }
};

/**
 * Generates a PDF from an HTML element by converting the element to an image
 * and then adding that image to a jsPDF document.
 *
 * @param element The HTML element to convert to PDF.
 * @param fileName The suggested filename for the PDF.
 * @param type The type of document ('receipts' | 'reports') to determine save location.
 * @param orientation 'portrait' or 'landscape'. Defaults to 'portrait'.
 */
export const generateAndSavePdfFromHtml = async (
  element: HTMLElement,
  fileName: string,
  type: DirectoryType = 'receipts',
  orientation: 'portrait' | 'landscape' = 'portrait'
): Promise<void> => {
  try {
    const imageDataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    });

    const img = new Image();
    img.src = imageDataUrl;

    await new Promise<void>((resolve) => {
      img.onload = () => resolve();
    });

    const imgWidth = img.naturalWidth;
    const imgHeight = img.naturalHeight;

    const pdf = new jsPDF(orientation, 'pt', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
    const scaledWidth = imgWidth * ratio;
    const scaledHeight = imgHeight * ratio;

    const xOffset = (pdfWidth - scaledWidth) / 2;
    const yOffset = (pdfHeight - scaledHeight) / 2;

    pdf.addImage(imageDataUrl, 'PNG', xOffset, yOffset, scaledWidth, scaledHeight);

    await savePdf(pdf, fileName, type);
  } catch (error) {
    console.error('Failed to generate and save PDF from HTML:', error);
    throw error;
  }
};

/**
 * Saves an HTML element as a PNG image.
 */
export const saveElementAsImage = async (element: HTMLElement, fileName: string, type: DirectoryType = 'receipts'): Promise<void> => {
  try {
    const imageDataUrl = await toPng(element, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    });

    if (isTauri()) {
      const { writeFile } = await import(/* @vite-ignore */ '@tauri-apps/plugin-fs');
      
      const dirPath = await getAppDirectory(type);
      const fullPath = await join(dirPath, fileName);

      const base64 = imageDataUrl.split(',')[1];
      const binaryString = atob(base64);
      const len = binaryString.length;
      const uint8array = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        uint8array[i] = binaryString.charCodeAt(i);
      }

      await writeFile(fullPath, uint8array);
      return;
    }

    const link = document.createElement('a');
    link.href = imageDataUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (error) {
    console.error('Failed to save element as image:', error);
    throw error;
  }
};