import { readFile, writeFile } from 'node:fs/promises';
const root = 'public/classroom/';
for (const lit of [true, false]) {
  const screen = lit ? '#e9efeb' : '#354340';
  const tablet = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 360 240">
    <path fill="#929b93" d="M62 69 83 223 324 223 285 59Z"/>
    <path fill="#aab3a6" d="M58 207h248l22 18H47Z"/>
    <rect x="32" y="17" width="288" height="199" rx="12" fill="#778b7f"/>
    <rect x="38" y="22" width="276" height="187" rx="8" fill="#405951"/>
    <rect x="46" y="32" width="260" height="167" rx="3" fill="${screen}"/>
    <circle cx="176" cy="27" r="2" fill="#a5b7ac"/>
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
await writeFile(`${root}projector-on.svg`, projector.replace('fill="#6e9274"', 'fill="#df8768"'));
await writeFile(`${root}camera-on.svg`, camera.replace('</svg>', '<circle cx="120" cy="68" r="4" fill="#d97968"/><circle cx="77" cy="97" r="15" fill="none" stroke="#a1bfb0" stroke-width="2"/></svg>'));
const mic = await readFile(`${root}microphone-flat.svg`, 'utf8');
await writeFile(`${root}microphone-on.svg`, mic.replace('</svg>', '<circle cx="61" cy="60" r="3" fill="#d97968"/><path d="M32 29v23M89 29v23" stroke="#9bb6a4" stroke-width="3" stroke-linecap="round"/></svg>'));
await writeFile(`${root}microphone-off.svg`, mic.replace('</svg>', '<path d="m45 24 31 35" stroke="#c9b9a0" stroke-width="3" stroke-linecap="round"/></svg>'));
console.log('Generated tablet and laptop screen states; preserved existing camera and microphone silhouettes.');
