import { readFile, writeFile } from 'node:fs/promises';
const root = 'public/classroom/';
for (const lit of [true, false]) {
  const screen = lit ? '#e9efeb' : '#354340';
  const tablet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240">
    <path fill="#b48d94" d="m301 88 38 138h-57Z"/>
    <path fill="#ceabb1" d="m304 109 23 107h-40Z"/>
    <path fill="#d8b4bd" d="M30 213h290l21 13H24Z"/>
    <path fill="#ebcdd2" d="M31 213h286l11 6H25Z"/>
    <rect x="31" y="12" width="293" height="207" rx="13" fill="#d6adb7"/>
    <rect x="35" y="15" width="285" height="201" rx="11" fill="#eac8ce"/>
    <rect x="40" y="20" width="275" height="191" rx="9" fill="#454a49"/>
    <rect x="45" y="26" width="265" height="180" rx="6" fill="${lit ? '#f0eeee' : screen}"/>
    <circle cx="176" cy="23" r="1.3" fill="#778b88"/>
    ${!lit ? '<path d="M62 48h155L62 142Z" fill="#7d9690" opacity=".10"/>' : ''}
  </svg>\n`;
  const laptop = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240">
    <rect x="28" y="10" width="284" height="181" rx="8" fill="#b9bfb6"/>
    <rect x="33" y="13" width="274" height="173" rx="5" fill="#e5e5d9"/>
    <rect x="42" y="24" width="256" height="153" rx="2" fill="${screen}"/>
    <circle cx="170" cy="19" r="2" fill="#829083"/>
    <path fill="#e2e3d7" d="m28 187-22 37h326l-20-37Z"/>
    <path fill="#abb2aa" d="M6 224h326l-7 7H13Z"/>
    <path fill="#bec5bc" d="M44 196h251l6 14H37Z"/>
    <path d="M54 201h230M53 206h231" stroke="#e4e7db" stroke-width="2"/>
    <path fill="#ccd3c7" d="M137 212h64l4 9h-71Z"/>
    <path fill="#ced2c6" d="M333 194c-9 0-12 10-12 20s7 18 15 17c11-1 15-10 13-20-1-11-6-17-16-17Z"/>
    <path fill="#eef0e4" d="M334 192c-9 0-11 10-11 20s5 15 13 14c9-1 12-8 11-18-1-10-5-16-13-16Z"/>
    <path d="m334 197 1 8" stroke="#99a89e" stroke-width="3" stroke-linecap="round"/>
    ${!lit ? '<path d="M56 38h147L56 144Z" fill="#7d9690" opacity=".1"/>' : ''}
  </svg>\n`;
  await writeFile(`${root}tablet-${lit ? 'on' : 'off'}.svg`, tablet.replace(/^[ \t]+$/gm, ''));
  await writeFile(`${root}laptop-${lit ? 'on' : 'off'}.svg`, laptop.replace(/^[ \t]+$/gm, ''));
}
const camera = await readFile(`${root}camera-flat.svg`, 'utf8');
const projector = await readFile(`${root}projector-rear.svg`, 'utf8');
await writeFile(`${root}projector-off.svg`, projector.replace('fill="#6e9274"', 'fill="#7a8475"'));
const lamp = (x,y,r) => `<circle cx="${x}" cy="${y}" r="${r * 4.2}" fill="url(#record-light)"/><circle cx="${x}" cy="${y}" r="${r * 1.5}" fill="#f32731" opacity=".7" filter="url(#red-bloom)"/><circle cx="${x}" cy="${y}" r="${r}" fill="#e7353e"/>`;
const glow = '<defs><radialGradient id="record-light"><stop stop-color="#ff2635" stop-opacity=".75"/><stop offset=".35" stop-color="#f52132" stop-opacity=".4"/><stop offset="1" stop-color="#ea1e30" stop-opacity="0"/></radialGradient><filter id="red-bloom" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="1.8"/></filter></defs>';
await writeFile(`${root}projector-on.svg`, projector.replace('<circle cx="116" cy="88" r="2" fill="#6e9274"/>',glow+lamp(116,88,2.6)));
await writeFile(`${root}camera-on.svg`, camera.replace('</svg>', glow+lamp(120,68,4)+'<circle cx="77" cy="97" r="15" fill="none" stroke="#a1bfb0" stroke-width="2"/></svg>'));
const mic = await readFile(`${root}microphone-flat.svg`, 'utf8');
await writeFile(`${root}microphone-on.svg`, mic.replace('</svg>', '<circle cx="61" cy="60" r="3" fill="#d97968"/><path d="M32 29v23M89 29v23" stroke="#9bb6a4" stroke-width="3" stroke-linecap="round"/></svg>'));
await writeFile(`${root}microphone-off.svg`, mic.replace('</svg>', '<path d="m45 24 31 35" stroke="#c9b9a0" stroke-width="3" stroke-linecap="round"/></svg>'));
console.log('Generated tablet and laptop screen states; preserved existing camera and microphone silhouettes.');
