export function normalizeDeviceFont(font?: string | null) {
  return font === 'sans' || font === 'rounded' ? font : 'resource-rounded';
}

type FontResource = { family: string; url: string; weight: string };
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
export async function loadDeviceFont(font: string) {
  await Promise.all(deviceFontResources[normalizeDeviceFont(font)].map(resource => {
    const key = resource.url;
    let request = loaded.get(key);
    if (!request) {
      const face = new FontFace(resource.family, `url("${resource.url}")`, { weight: resource.weight, style: 'normal' });
      request = face.load().then(ready => { document.fonts.add(ready); }).catch(error => { loaded.delete(key); throw error; });
      loaded.set(key, request);
    }
    return request;
  }));
}
