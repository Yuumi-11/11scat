import { mkdir, writeFile } from 'node:fs/promises';
const out = 'public/classroom/chalk';
await mkdir(out, {recursive:true});
const icons = {
  close: ['M7.1 6.8 24.7 25 M24.1 7.2 7.3 24.6'],
  expand: ['M4.6 11.2 4.1 4.6 11.3 4.3 M20.9 4.6 27.7 4.1 27.3 11.4 M4.2 20.9 4.6 27.6 11.2 27.3 M21 27.4 27.5 27.8 27.9 21','M5.4 5.8 12 12.4 M26.3 5.6 20 12 M5.6 26.3 12 20.1 M26.4 26.2 20 19.8'],
  collapse: ['M3.9 10.2 10.7 10.6 10.4 3.8 M21.4 3.7 21.1 10.5 28.1 10.1 M3.9 21.6 10.5 21.1 10.9 28 M21.2 28.1 21.7 21.5 28 21.7','M4 4.6 9.8 9.7 M27.4 4.5 22 9.8 M4.4 27.7 9.8 22 M27.5 27.2 22.1 22'],
  text: ['M5.5 8.7 5.8 5.7 Q15 5.1 26.4 5.8 L26.1 8.9','M16.1 6.4 15.7 26.1 M10.8 26 21.2 26.5'],
  clear: ['M7.4 9.5 24.6 9 M10 10.2 10.7 26 Q17 26.8 23 26 L23.4 10 M12.5 8.4 13 5.1 20 4.8 21 8.2','M14.4 14.7 14.8 22.2 M19.3 14.3 19 22.6'],
  save: ['M5.9 5.9 23 5.4 27 9.7 26.5 27 5.6 26.6 Z','M10.1 6.2 10.4 14.1 21.1 14 21 6.4 M10.4 26 10 19.3 22.1 19 22.4 26 M17.9 7.8 18 11.9'],
};
const motifs = {
  heart: [
    {color:'#e6b1ba',d:'M79 122 C65 110 29 85 30 59 C31 31 64 28 80 53 C96 29 126 34 130 58 C134 81 100 112 79 122 Z',fill:'#e6b1ba'},
    {color:'#f5efdb',d:'M40 26 46 34 M118 22 114 33 M18 94 29 92 M133 108 143 115'},
  ],
  stars: [
    {color:'#efd28a',d:'M76 26 86 55 117 56 93 75 101 104 76 87 52 105 60 75 37 57 66 55 Z',fill:'#efd28a'},
    {color:'#f5efdb',d:'M29 28 34 39 47 40 37 48 41 61 29 53 18 61 22 48 12 40 25 39 Z M128 102 133 114 147 116 137 124 140 137 128 130 117 137 120 124 110 115 124 114 Z'},
    {color:'#a4c5de',d:'M120 25v14 M113 32h14 M32 105v16 M25 113h14 M77 128v9 M73 133h9'},
  ],
  balloons: [
    {color:'#e6b1ba',d:'M62 49 C64 27 47 21 36 29 C18 40 26 66 43 73 C57 68 63 59 62 49 Z M41 74 38 82 47 81 Z',fill:'#e6b1ba'},
    {color:'#a4c5de',d:'M126 57 C128 34 112 24 98 33 C80 44 88 72 104 81 C119 77 125 68 126 57 Z M104 82 101 90 109 90 Z',fill:'#a4c5de'},
    {color:'#efd28a',d:'M99 31 C97 11 76 8 66 21 C53 37 65 58 80 65 C96 56 101 43 99 31 Z M79 65 75 73 85 73 Z',fill:'#efd28a'},
    {color:'#f5efdb',d:'M43 82 C48 102 70 112 77 141 M80 74 C81 94 74 116 78 141 M105 91 C105 113 88 121 78 142'},
  ],
  cat: [
    {color:'#f5efdb',d:'M48 93 Q35 81 41 57 L42 30 63 45 Q81 39 98 45 L119 29 119 59 Q126 82 111 94 Q116 109 107 127 L58 128 Q47 114 48 93 Z M59 95 Q81 105 104 95 M63 125 64 112 M93 112 93 126 M113 122 C142 128 146 100 132 101 C119 103 126 115 113 112',fill:'#f5efdb'},
    {color:'#f5efdb',d:'M57 66 59 71 M99 66 98 71 M77 77 83 77 80 81 Z M80 81 Q76 88 71 83 M80 81 Q85 89 90 82 M51 77 30 72 M52 83 29 84 M108 77 132 71 M108 84 133 87'},
    {color:'#e6b1ba',d:'M47 42 56 48 M105 49 113 41 M55 85 61 86 M98 86 104 84'},
  ],
};
function grain(size, count) {
  let seed=4096;const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  return Array.from({length:count},()=>`<circle cx="${(next()*size).toFixed(2)}" cy="${(next()*size).toFixed(2)}" r="${((.0015+next()*.007)*size).toFixed(2)}" fill="#000" opacity="${(.25+next()*.65).toFixed(2)}"/>`).join('');
}
function svg(size, strokes) {
  const w=size===32?2.3:3.9;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}"><defs><mask id="chalk" maskUnits="userSpaceOnUse" x="0" y="0" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="white"/>${grain(size,size===32?620:1800)}</mask></defs><g mask="url(#chalk)" stroke-linecap="round" stroke-linejoin="round">${strokes.map(s=>`${s.fill?`<path d="${s.d}" fill="${s.fill}" fill-opacity=".09"/>`:''}<path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${w}" opacity=".82"/><path d="${s.d}" transform="translate(${size*.002} ${size*-.0015})" fill="none" stroke="${s.color}" stroke-width="${w*.48}" opacity=".63"/><path d="${s.d}" fill="none" stroke="${s.color}" stroke-width="${w*1.25}" stroke-dasharray="${size*.007} ${size*.027}" opacity=".29"/>`).join('')}</g></svg>\n`;
}
const requested = new Set(process.argv.slice(2));
for(const [name,paths] of Object.entries(icons)) if (!requested.size || requested.has(name)) await writeFile(`${out}/${name}.svg`,svg(32,paths.map(d=>({d,color:'#f6f1dc'}))));
for(const [name,strokes] of Object.entries(motifs)) if (!requested.size || requested.has(name)) await writeFile(`${out}/${name}.svg`,svg(160,strokes));
console.log('Created requested editable chalk vectors.');
