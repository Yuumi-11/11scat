export const THEME_PRESETS = {
  blue: { name: "雾蓝", color: "#416b9e" },
  green: { name: "青绿", color: "#28775f" },
  purple: { name: "暮紫", color: "#7753a6" },
  pink: { name: "玫瑰", color: "#a54f76" },
} as const;
export type ThemeName = keyof typeof THEME_PRESETS | "custom";
export type ThemePalette = Record<`--${string}`, string>;

export function normalizeThemeColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const hex = value.trim().replace(/^#/, "");
  if (/^[\da-f]{3}$/i.test(hex)) return "#" + [...hex].map(c => c + c).join("").toLowerCase();
  return /^[\da-f]{6}$/i.test(hex) ? "#" + hex.toLowerCase() : null;
}

export function restoreTheme(name: unknown, custom: unknown): { name: ThemeName; color: string } {
  if (typeof name === "string" && Object.hasOwn(THEME_PRESETS, name)) {
    return { name: name as keyof typeof THEME_PRESETS, color: THEME_PRESETS[name as keyof typeof THEME_PRESETS].color };
  }
  const color = normalizeThemeColor(custom);
  if (name === "custom" && color) return { name: "custom", color };
  return { name: "blue", color: THEME_PRESETS.blue.color };
}

function rgb(hex: string): number[] { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
function linear(value: number): number { return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4; }
function luminance(hex: string): number { const [r, g, b] = rgb(hex).map(linear); return .2126 * r + .7152 * g + .0722 * b; }
export function contrastRatio(a: string, b: string): number {
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

// OKLab matrices: https://bottosson.github.io/posts/oklab/ . Keep generated
// values in sRGB by reducing chroma, rather than clipping individual channels.
function toOklch(hex: string) {
  const [r, g, b] = rgb(hex).map(linear);
  const l = Math.cbrt(.4122214708 * r + .5363325363 * g + .0514459929 * b);
  const m = Math.cbrt(.2119034982 * r + .6806995451 * g + .1073969566 * b);
  const s = Math.cbrt(.0883024619 * r + .2817188376 * g + .6299787005 * b);
  const a = 1.9779984951 * l - 2.428592205 * m + .4505937099 * s;
  const bb = .0259040371 * l + .7827717662 * m - .808675766 * s;
  return { lightness: .2104542553 * l + .793617785 * m - .0040720468 * s, chroma: Math.hypot(a, bb), hue: Math.atan2(bb, a) };
}
function toHex(lightness: number, chroma: number, hue: number): string {
  const channels = (c: number) => {
    const a = c * Math.cos(hue), b = c * Math.sin(hue);
    const l = (lightness + .3963377774 * a + .2158037573 * b) ** 3;
    const m = (lightness - .1055613458 * a - .0638541728 * b) ** 3;
    const s = (lightness - .0894841775 * a - 1.291485548 * b) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + .2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s, -.0041960863 * l - .7034186147 * m + 1.707614701 * s];
  };
  let low = 0, high = chroma;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (channels(mid).every(v => v >= 0 && v <= 1)) low = mid; else high = mid;
  }
  return "#" + channels(low).map(v => {
    const srgb = v <= .0031308 ? 12.92 * v : 1.055 * Math.max(0, v) ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, srgb)) * 255).toString(16).padStart(2, "0");
  }).join("");
}

export function createThemePalette(input: string): ThemePalette {
  const seed = normalizeThemeColor(input) || THEME_PRESETS.blue.color;
  const { lightness, chroma, hue } = toOklch(seed);
  const c = chroma < .005 ? 0 : Math.min(.18, Math.max(.065, chroma));
  const tone = (l: number, factor: number) => toHex(l, c * factor, hue);
  const page = tone(.958, .23), panel = tone(.993, .06), soft = tone(.943, .25), selected = tone(.913, .43);
  const surfaces = [page, panel, soft, selected];
  const darkEnough = (start: number, factor: number, ratio: number) => {
    for (let l = start; l >= .1; l -= .01) {
      const value = tone(l, factor);
      if (surfaces.every(bg => contrastRatio(value, bg) >= ratio)) return value;
    }
    return "#000000";
  };
  // Preserve the chosen color in the picker; adapt its UI tone for readable
  // controls, including near-white, yellow, black and neutral custom seeds.
  const accent = darkEnough(Math.max(.35, Math.min(.68, lightness)), 1, 3.05);
  const accentDark = darkEnough(.40, .8, 4.6);
  const onAccent = contrastRatio("#ffffff", accent) >= contrastRatio("#000000", accent) ? "#ffffff" : "#000000";
  const accentL = toOklch(accent).lightness;
  const hoverCandidate = tone(onAccent === "#ffffff" ? accentL - .045 : Math.min(.76, accentL + .035), 1);
  const hover = contrastRatio(onAccent, hoverCandidate) >= 4.5 && surfaces.every(bg => contrastRatio(hoverCandidate, bg) >= 3) ? hoverCandidate : accent;
  const ink = darkEnough(.25, .23, 7), muted = darkEnough(.47, .26, 4.6);
  const shadowRgb = rgb(tone(.25, .3)).map(v => Math.round(v * 255)).join(" ");
  return {
    "--theme-seed": seed, "--theme-accent": accent, "--theme-accent-dark": accentDark,
    "--theme-accent-hover": hover, "--on-accent": onAccent, "--theme-soft": selected,
    "--page": page, "--panel": panel, "--soft": soft, "--ink": ink, "--muted": muted,
    "--line": tone(.84, .26), "--line-strong": darkEnough(.64, .35, 3.05),
    "--shadow-rgb": shadowRgb, "--shadow": `0 4px 24px rgb(${shadowRgb} / 7%)`,
    "--overlay": `rgb(${shadowRgb} / 40%)`,
  };
}
