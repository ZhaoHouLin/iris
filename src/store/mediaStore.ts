import { create } from 'zustand';
import * as FileSystem from 'expo-file-system/legacy';
import * as ExpoCrypto from 'expo-crypto';
import { VAULT_DIR, encryptFile, decryptFile, ensureVaultDir } from '../crypto/encryption';

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface VaultEntry {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: number;
  encryptedPath: string;
  encrypted: boolean;
  folderId?: string;
}

const INDEX_FILE = `${FileSystem.documentDirectory}vault_index.json`;
const FOLDERS_FILE = `${FileSystem.documentDirectory}vault_folders.json`;
const TEMP_DIR = `${FileSystem.cacheDirectory}vault_temp/`;
const THUMB_DIR = `${FileSystem.documentDirectory}vault_thumbs/`;

interface MediaStore {
  entries: VaultEntry[];
  folders: Folder[];
  loadIndex: () => Promise<void>;
  loadFolders: () => Promise<void>;
  createFolder: (name: string) => Promise<Folder>;
  deleteFolder: (id: string) => Promise<void>;
  renameFolder: (id: string, name: string) => Promise<void>;
  moveToFolder: (entryId: string, folderId: string | null) => Promise<void>;
  addMedia: (
    sourcePath: string,
    filename: string,
    mimeType: string,
    deleteOriginal: boolean,
    folderId?: string | null
  ) => Promise<void>;
  removeMedia: (id: string) => Promise<void>;
  getTempDecryptedPath: (id: string) => Promise<string>;
  getVideoThumbPath: (id: string) => Promise<string>;
  cleanupTempFiles: () => Promise<void>;
}

async function saveIndex(entries: VaultEntry[]): Promise<void> {
  await FileSystem.writeAsStringAsync(INDEX_FILE, JSON.stringify(entries));
}

async function saveFolders(folders: Folder[]): Promise<void> {
  await FileSystem.writeAsStringAsync(FOLDERS_FILE, JSON.stringify(folders));
}

async function ensureTempDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(TEMP_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(TEMP_DIR, { intermediates: true });
  }
}

export const useMediaStore = create<MediaStore>((set, get) => ({
  entries: [],
  folders: [],

  loadIndex: async () => {
    const info = await FileSystem.getInfoAsync(INDEX_FILE);
    if (!info.exists) { set({ entries: [] }); return; }
    try {
      const json = await FileSystem.readAsStringAsync(INDEX_FILE);
      set({ entries: JSON.parse(json) as VaultEntry[] });
    } catch { set({ entries: [] }); }
  },

  loadFolders: async () => {
    const info = await FileSystem.getInfoAsync(FOLDERS_FILE);
    if (!info.exists) { set({ folders: [] }); return; }
    try {
      const json = await FileSystem.readAsStringAsync(FOLDERS_FILE);
      set({ folders: JSON.parse(json) as Folder[] });
    } catch { set({ folders: [] }); }
  },

  createFolder: async (name) => {
    const folder: Folder = {
      id: ExpoCrypto.randomUUID(),
      name,
      createdAt: Date.now(),
    };
    const newFolders = [...get().folders, folder];
    set({ folders: newFolders });
    await saveFolders(newFolders);
    return folder;
  },

  deleteFolder: async (id) => {
    // Move all items in this folder to ungrouped
    const newEntries = get().entries.map(e =>
      e.folderId === id ? { ...e, folderId: undefined } : e
    );
    const newFolders = get().folders.filter(f => f.id !== id);
    set({ entries: newEntries, folders: newFolders });
    await saveIndex(newEntries);
    await saveFolders(newFolders);
  },

  renameFolder: async (id, name) => {
    const newFolders = get().folders.map(f => f.id === id ? { ...f, name } : f);
    set({ folders: newFolders });
    await saveFolders(newFolders);
  },

  moveToFolder: async (entryId, folderId) => {
    const newEntries = get().entries.map(e =>
      e.id === entryId ? { ...e, folderId: folderId ?? undefined } : e
    );
    set({ entries: newEntries });
    await saveIndex(newEntries);
  },

  addMedia: async (sourcePath, filename, mimeType, deleteOriginal, folderId) => {
    await ensureVaultDir();
    const id = ExpoCrypto.randomUUID();
    const isVideo = mimeType.startsWith('video/');
    const ext = isVideo ? (filename.split('.').pop() ?? 'mp4') : 'enc';
    const destPath = `${VAULT_DIR}${id}.${ext}`;

    if (isVideo) {
      await FileSystem.copyAsync({ from: sourcePath, to: destPath });
    } else {
      await encryptFile(sourcePath, destPath);
    }

    if (deleteOriginal) {
      await FileSystem.deleteAsync(sourcePath, { idempotent: true });
    }

    const fileInfo = await FileSystem.getInfoAsync(destPath);
    const entry: VaultEntry = {
      id,
      filename,
      mimeType,
      size: fileInfo.exists && 'size' in fileInfo ? (fileInfo.size ?? 0) : 0,
      createdAt: Date.now(),
      encryptedPath: destPath,
      encrypted: !isVideo,
      folderId: folderId ?? undefined,
    };

    const newEntries = [...get().entries, entry];
    set({ entries: newEntries });
    await saveIndex(newEntries);
  },

  removeMedia: async (id) => {
    const entry = get().entries.find(e => e.id === id);
    if (entry) {
      await FileSystem.deleteAsync(entry.encryptedPath, { idempotent: true });
      await FileSystem.deleteAsync(`${THUMB_DIR}${id}.jpg`, { idempotent: true });
    }
    const newEntries = get().entries.filter(e => e.id !== id);
    set({ entries: newEntries });
    await saveIndex(newEntries);
  },

  getTempDecryptedPath: async (id) => {
    const entry = get().entries.find(e => e.id === id);
    if (!entry) throw new Error('Entry not found');
    if (!entry.encrypted) return entry.encryptedPath;
    await ensureTempDir();
    const ext = entry.mimeType.split('/')[1] ?? 'jpg';
    const tempPath = `${TEMP_DIR}${id}.${ext}`;
    const existsInfo = await FileSystem.getInfoAsync(tempPath);
    if (!existsInfo.exists) {
      await decryptFile(entry.encryptedPath, tempPath);
    }
    return tempPath;
  },

  getVideoThumbPath: async (id) => {
    const thumbPath = `${THUMB_DIR}${id}.jpg`;
    const info = await FileSystem.getInfoAsync(thumbPath);
    if (info.exists) return thumbPath;

    const entry = get().entries.find(e => e.id === id);
    if (!entry) throw new Error('Entry not found');

    const thumbDir = await FileSystem.getInfoAsync(THUMB_DIR);
    if (!thumbDir.exists) {
      await FileSystem.makeDirectoryAsync(THUMB_DIR, { intermediates: true });
    }

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getThumbnailAsync } = require('expo-video-thumbnails');
    const { uri } = await getThumbnailAsync(entry.encryptedPath, { time: 1000 });
    await FileSystem.copyAsync({ from: uri, to: thumbPath });
    return thumbPath;
  },

  cleanupTempFiles: async () => {
    await FileSystem.deleteAsync(TEMP_DIR, { idempotent: true });
  },
}));
