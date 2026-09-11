import { withLoadingTimeout } from './loading-timeout.ts';

export function normalizeDeviceFont(font?: string | null) {
  return font === 'sans' || font === 'rounded' ? font : 'resource-rounded';
}

export type FontResource = { family: string; url: string; weight: string; sizeAdjust?: string };
export const deviceFontResources: Record<string, FontResource[]> = {
  'resource-rounded': [
    { family: 'Device Han Rounded', url: '/classroom/fonts/resource-han-rounded-regular.woff2', weight: '400' },
    { family: 'Device Han Rounded', url: '/classroom/fonts/resource-han-rounded-medium.woff2', weight: '600' },
    { family: 'Device Latin', url: '/classroom/fonts/nunito-latin-400.woff2', weight: '400' },
    { family: 'Device Latin', url: '/classroom/fonts/nunito-latin-600.woff2', weight: '600' },
  ],
  sans: [{ family: 'Device Sans', url: '/classroom/fonts/classroom-sans.woff2', weight: '400 600' }],
  rounded: [
    { family: 'Device Rounded', url: '/classroom/fonts/zcoolkuaile.woff2', weight: '400' },
    { family: 'Device Latin', url: '/classroom/fonts/nunito-latin-400.woff2', weight: '400' },
    { family: 'Device Latin', url: '/classroom/fonts/nunito-latin-600.woff2', weight: '600' },
    { family: 'Device Sans', url: '/classroom/fonts/classroom-sans.woff2', weight: '400 600' },
  ],
};

// Each loaded face is shared by both desks. Failed requests can be retried with a fresh FontFace.
const loaded = new Map<string, Promise<void>>();
const ready = new Set<string>();
export function isDeviceFontReady(font: string) {
  return deviceFontResources[normalizeDeviceFont(font)].every(resource => ready.has(resource.url));
}
export async function loadFontResources(resources: FontResource[], timeout = 90_000) {
  await Promise.all(resources.map(resource => {
    const key = `${resource.family}:${resource.url}`;
    let request = loaded.get(key);
    if (!request) {
      const face = new FontFace(resource.family, `url("${resource.url}")`, { weight: resource.weight, style: 'normal', ...(resource.sizeAdjust ? { sizeAdjust: resource.sizeAdjust } : {}) });
      request = withLoadingTimeout(face.load(), timeout).then(face => { document.fonts.add(face); ready.add(resource.url); }).catch(error => { if (loaded.get(key) === request) loaded.delete(key); throw error; });
      loaded.set(key, request);
    }
    return request;
  }));
}

export function loadDeviceFont(font: string) {
  return loadFontResources(deviceFontResources[normalizeDeviceFont(font)]);
}
