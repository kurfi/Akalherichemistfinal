// services/fileDialogService.ts
import { open, OpenDialogOptions } from '@tauri-apps/plugin-dialog';
import { isTauri } from './directoryService';

/**
 * Opens a native file selection dialog.
 * @param options Options for the file dialog, including filters and multi-selection.
 * @returns A promise that resolves to the selected file path(s) or null if the dialog is cancelled.
 */
export const openFileDialog = async (options?: OpenDialogOptions): Promise<string | string[] | null> => {
  // In Tauri environment
  if (isTauri()) {
    try {
      // The `open` function from @tauri-apps/plugin-dialog handles both single and multiple selections
      // based on the `multiple` option.
      const selected = await open(options);
      return selected;
    } catch (error) {
      console.error('Error opening file dialog in Tauri:', error);
      alert('Failed to open file dialog. Please check console for details.');
      return null;
    }
  } else {
    // Web environment fallback
    console.warn('Not running in Tauri environment. File dialog functionality is limited.');
    // In a web environment, a true file dialog for local files is not directly available
    // for security reasons. A typical fallback would be an <input type="file"> element.
    // For this example, we'll return null or simulate a basic selection.
    // A production app would need a robust web-based file input for this case.
    alert('File dialogs are not fully supported in the web browser for local file access.');
    return null;
  }
};
