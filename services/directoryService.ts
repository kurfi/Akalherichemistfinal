import { documentDir, join } from '@tauri-apps/api/path';
import { mkdir, exists, BaseDirectory } from '@tauri-apps/plugin-fs';
import { db } from '../db/db';

const APP_FOLDER_NAME = 'AK Alheri Chemist';

// Helper to detect Tauri v2
export const isTauri = () => '__TAURI_INTERNALS__' in window;

export type DirectoryType = 'receipts' | 'reports' | 'exports' | 'backups';

const DEFAULT_SUBFOLDERS: Record<DirectoryType, string> = {
  receipts: 'Receipts',
  reports: 'Reports',
  exports: 'Exports',
  backups: 'AutoBackups'
};

export const getAppDirectory = async (type: DirectoryType): Promise<string> => {
  // 1. Check DB for custom path
  try {
    const setting = await db.settings.get(`${type}Path`);
    if (setting && setting.value) {
        return setting.value;
    }
  } catch (e) {
    console.warn(`Failed to fetch custom path for ${type}`, e);
  }

  // 2. Fallback to default Documents/AK Alheri Chemist/[Type]
  const docDir = await documentDir();
  return await join(docDir, APP_FOLDER_NAME, DEFAULT_SUBFOLDERS[type]);
};

export const setAppDirectory = async (type: DirectoryType, path: string): Promise<void> => {
  await db.settings.put({ key: `${type}Path`, value: path });
};

export const createAppDirectories = async (): Promise<void> => {
  if (!isTauri()) return; // Skip if not in Tauri

  try {
    const docDir = await documentDir();
    const baseAppDir = await join(docDir, APP_FOLDER_NAME);

    // Create Base App Folder
    const baseExists = await exists(baseAppDir);
    if (!baseExists) {
      await mkdir(baseAppDir, { recursive: true });
    }

    // Create Subfolders
    for (const key of Object.keys(DEFAULT_SUBFOLDERS) as DirectoryType[]) {
       const subfolderPath = await join(baseAppDir, DEFAULT_SUBFOLDERS[key]);
       const subExists = await exists(subfolderPath);
       if (!subExists) {
         await mkdir(subfolderPath, { recursive: true });
       }
    }
  } catch (error) {
    console.error("Failed to create app directories:", error);
  }
};
