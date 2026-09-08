import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createThemePalette, contrastRatio, normalizeThemeColor, restoreTheme, THEME_PRESETS } from '../app/theme-palette.ts';

test('custom colors normalize safely and saved preset names remain compatible', () => {
  assert.equal(normalizeThemeColor(' #AbC '), '#aabbcc');
  assert.equal(normalizeThemeColor('D68B42'), '#d68b42');
  for (const value of ['', '#ffff', 'red', '#12345678', 'url(test)', null, {}, 'blue; color:red']) assert.equal(normalizeThemeColor(value), null);
  for (const [name, preset] of Object.entries(THEME_PRESETS)) assert.deepEqual(restoreTheme(name, '#ffffff'), { name, color: preset.color });
  assert.deepEqual(restoreTheme('custom', '#Ff0'), { name: 'custom', color: '#ffff00' });
  assert.deepEqual(restoreTheme('custom', 'broken'), restoreTheme('blue', null));
  assert.deepEqual(restoreTheme('__proto__', '#123456'), restoreTheme('blue', null));
});

test('palette text and meaningful controls meet contrast targets across RGB gamut samples', () => {
  const seeds = new Set(Object.values(THEME_PRESETS).map(p => p.color));
  for (const r of [0, 51, 102, 153, 204, 255]) for (const g of [0, 51, 102, 153, 204, 255]) for (const b of [0, 51, 102, 153, 204, 255]) seeds.add('#' + [r,g,b].map(n => n.toString(16).padStart(2,'0')).join(''));
  for (const seed of seeds) {
    const palette = createThemePalette(seed);
    const check = (a,b,target) => assert.ok(contrastRatio(palette[a], palette[b]) >= target, `${seed}: ${a} / ${b} = ${contrastRatio(palette[a], palette[b])}`);
    for (const background of ['--page', '--panel', '--soft', '--theme-soft']) {
      check('--ink', background, 7);
      check('--muted', background, 4.5);
      check('--theme-accent-dark', background, 4.5);
      check('--line-strong', background, 3);
      check('--theme-accent', background, 3);
      check('--theme-accent-hover', background, 3);
    }
    check('--on-accent', '--theme-accent', 4.5);
    check('--on-accent', '--theme-accent-hover', 4.5);
    assert.equal(palette['--theme-seed'], seed);
    for (const key of ['--page','--panel','--soft','--theme-soft','--line','--line-strong']) assert.match(palette[key], /^#[0-9a-f]{6}$/);
  }
});

test('all theme roles change with preset hue and server default matches the generated palette', async () => {
  const palettes = Object.values(THEME_PRESETS).map(preset => createThemePalette(preset.color));
  for (const key of ['--page','--panel','--soft','--ink','--muted','--line','--theme-soft','--theme-accent','--overlay']) assert.equal(new Set(palettes.map(p => p[key])).size, 4, key);
  const css = await readFile('app/room-theme.css', 'utf8');
  const root = css.match(/:root \{([\s\S]*?)\n\}/)[1];
  for (const [key,value] of Object.entries(palettes[0])) assert.ok(root.includes(`${key}: ${value};`), key);
  assert.ok(!css.includes(':has(.app-shell[data-theme='), 'per-preset overrides must not mask root custom variables');
});
