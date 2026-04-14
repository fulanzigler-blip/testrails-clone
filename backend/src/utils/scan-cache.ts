import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.join(__dirname, '../../cache/scan-cache');
const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

interface CacheEntry {
  hash: string;
  data: any;
  timestamp: number;
}

function getCachePath(key: string): string {
  return path.join(CACHE_DIR, `${key}.json`);
}

function hashContent(content: string): string {
  return crypto.createHash('md5').update(content).digest('hex');
}

export async function getCached<T>(key: string, fileContent: string): Promise<T | null> {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const cachePath = getCachePath(key);
    if (!fs.existsSync(cachePath)) {
      return null;
    }

    const entry: CacheEntry = JSON.parse(fs.readFileSync(cachePath, 'utf-8'));
    const now = Date.now();

    // Check if cache is still valid
    if (now - entry.timestamp > CACHE_TTL) {
      fs.unlinkSync(cachePath);
      return null;
    }

    // Verify hash to detect file changes (for now, skip since we don't track file hashes)
    return entry.data as T;
  } catch {
    return null;
  }
}

export function setCached<T>(key: string, fileContent: string, data: T): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }

    const entry: CacheEntry = {
      hash: hashContent(fileContent || Date.now().toString()),
      data,
      timestamp: Date.now(),
    };

    fs.writeFileSync(getCachePath(key), JSON.stringify(entry));
  } catch (error) {
    console.warn('Failed to cache scan result:', error);
  }
}

export function clearScanCache(): void {
  try {
    if (fs.existsSync(CACHE_DIR)) {
      fs.rmSync(CACHE_DIR, { recursive: true });
    }
  } catch (error) {
    console.warn('Failed to clear scan cache:', error);
  }
}

// Generate cache key from config
export function getScanCacheKey(projectPath: string, deviceId?: string): string {
  const safePath = projectPath.replace(/[^a-zA-Z0-9]/g, '_');
  return deviceId ? `${safePath}_${deviceId}` : safePath;
}
