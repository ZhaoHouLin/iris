import { gcm } from '@noble/ciphers/aes.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import * as ExpoCrypto from 'expo-crypto';

const SALT_KEY = 'vault_encryption_salt';
const PBKDF2_ITERATIONS = 10_000;

let cachedKey: Uint8Array | null = null;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function uint8ToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

async function getOrCreateSalt(): Promise<Uint8Array> {
  let saltHex = await SecureStore.getItemAsync(SALT_KEY);
  if (!saltHex) {
    const salt = await ExpoCrypto.getRandomBytesAsync(16);
    saltHex = bytesToHex(salt);
    await SecureStore.setItemAsync(SALT_KEY, saltHex);
    return salt;
  }
  return hexToBytes(saltHex);
}

export async function deriveAndCacheKey(pin: string): Promise<void> {
  const salt = await getOrCreateSalt();
  cachedKey = pbkdf2(sha256, new TextEncoder().encode(pin), salt, {
    c: PBKDF2_ITERATIONS,
    dkLen: 32,
  });
}

export function clearCachedKey(): void {
  if (cachedKey) {
    cachedKey.fill(0);
    cachedKey = null;
  }
}

function getCachedKey(): Uint8Array {
  if (!cachedKey) throw new Error('No encryption key. Please unlock first.');
  return cachedKey;
}

export async function encryptFile(sourcePath: string, destPath: string): Promise<void> {
  const key = getCachedKey();
  const iv = await ExpoCrypto.getRandomBytesAsync(12);

  const base64 = await FileSystem.readAsStringAsync(sourcePath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const fileBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const cipher = gcm(key, iv);
  const encrypted = cipher.encrypt(fileBytes);

  const result = new Uint8Array(12 + encrypted.length);
  result.set(iv, 0);
  result.set(encrypted, 12);

  await FileSystem.writeAsStringAsync(destPath, uint8ToBase64(result), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export async function decryptFile(encPath: string, destPath: string): Promise<void> {
  const key = getCachedKey();

  const base64 = await FileSystem.readAsStringAsync(encPath, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const data = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

  const iv = data.slice(0, 12);
  const ciphertext = data.slice(12);

  const cipher = gcm(key, iv);
  const decrypted = cipher.decrypt(ciphertext);

  await FileSystem.writeAsStringAsync(destPath, uint8ToBase64(decrypted), {
    encoding: FileSystem.EncodingType.Base64,
  });
}

export const VAULT_DIR = `${FileSystem.documentDirectory}vault/`;

export async function ensureVaultDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(VAULT_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(VAULT_DIR, { intermediates: true });
  }
}
