// ─── Mobile Device Presets ─────────────────────────────────────────────────────────

export interface MobileDevice {
  id: string;
  label: string;
  w: number;
  h: number;
  icon: string;
  category: 'Default' | 'iOS' | 'Android' | 'Tablet';
}

export const MOBILE_DEVICES: readonly MobileDevice[] = [
  // Default
  { id: '', label: 'Default', w: 375, h: 812, icon: '📱', category: 'Default' },

  // iOS
  { id: 'iphone-15', label: 'iPhone 15 (393x852)', w: 393, h: 852, icon: '🍎', category: 'iOS' },
  { id: 'iphone-14', label: 'iPhone 14 (390x844)', w: 390, h: 844, icon: '🍎', category: 'iOS' },
  { id: 'iphone-se', label: 'iPhone SE (375x667)', w: 375, h: 667, icon: '🍎', category: 'iOS' },
  { id: 'ipad-air', label: 'iPad Air (820x1180)', w: 820, h: 1180, icon: '📟', category: 'iOS' },

  // Android
  { id: 'pixel-8', label: 'Pixel 8 (412x892)', w: 412, h: 892, icon: '🤖', category: 'Android' },
  { id: 'pixel-7', label: 'Pixel 7 (412x892)', w: 412, h: 892, icon: '🤖', category: 'Android' },
  { id: 'galaxy-s24', label: 'Galaxy S24 (384x854)', w: 384, h: 854, icon: '🤖', category: 'Android' },
  { id: 'galaxy-s23', label: 'Galaxy S23 (384x854)', w: 384, h: 854, icon: '🤖', category: 'Android' },
  { id: 'galaxy-fold', label: 'Galaxy Fold (420x1812)', w: 420, h: 1812, icon: '🤖', category: 'Android' },

  // Tablet
  { id: 'ipad-mini', label: 'iPad Mini (744x1133)', w: 744, h: 1133, icon: '📟', category: 'Tablet' },
  { id: 'galaxy-tab', label: 'Galaxy Tab S9 (800x1280)', w: 800, h: 1280, icon: '📟', category: 'Tablet' },
] as const;

export type DeviceId = typeof MOBILE_DEVICES[number]['id'];

// ─── Helpers ───────────────────────────────────────────────────────────────────────

export function getDeviceById(id: string): MobileDevice | undefined {
  return MOBILE_DEVICES.find(d => d.id === id);
}

export function getDevicesByCategory(category: MobileDevice['category']): MobileDevice[] {
  return MOBILE_DEVICES.filter(d => d.category === category);
}

export function getDefaultDevice(): MobileDevice {
  return MOBILE_DEVICES[0];
}
