# Classroom asset attribution

## Blackboard grain

`board-grain.png` is **Black Paper**, created by **Atle Mo**, originally published by Subtle Patterns. The transparent PNG is distributed by Transparent Textures, maintained by Mike Hearn.

- Author/source: https://www.transparenttextures.com/black-paper.html
- Download: https://www.transparenttextures.com/patterns/black-paper.png
- Upstream license notice: https://github.com/atlemo/SubtlePatterns/blob/gh-pages/README.md
- License: **Creative Commons Attribution-ShareAlike 3.0 Unported**, https://creativecommons.org/licenses/by-sa/3.0/

The PNG is included unchanged. The classroom applies a green background and reduces its contrast using a CSS overlay; exported blackboards apply the equivalent transparency. Any adaptation of this texture remains under CC BY-SA 3.0. This texture license does not replace the licenses of independent application code or unrelated assets.

## Paper fiber

`paper-fiber.jpg` is the unmodified color map `Paper001_1K-JPG_Color.jpg` from **Paper 001**, by **ambientCG**. The archive describes height field photogrammetry as its creation method.

- Asset: https://ambientcg.com/a/Paper001
- Download: https://ambientcg.com/get?file=Paper001_1K-JPG.zip
- License: **CC0 1.0 Universal**, https://docs.ambientcg.com/license/ and https://creativecommons.org/publicdomain/zero/1.0/

## Fonts

`fonts/classroom-sans.woff2` is a web subset of **Noto Sans SC**, copyright 2014–2021 Adobe, from https://github.com/google/fonts/tree/main/ofl/notosanssc . It retains the source font name and its OFL license. The reserved font name declared by this source is “Source”; it is not used as a new font name. The subset contains GB2312 and supporting characters, 8,654 code points, with variable weights 400–600. Missing characters use the system sans-serif fallback. Full terms: `fonts/NotoSansSC-OFL.txt`.

Existing **Long Cang** and **CHAWP** retain their accompanying OFL license files in `fonts/`.

`fonts/calendar-pen.woff2` is a web subset of **LXGW WenKai Regular v1.522**, copyright 2021–2026 LXGW and 2020 The Klee Project Authors, from https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522 . The derived web family is named **School Calendar Pen** and contains 7,832 mapped characters, including GB2312 and supporting punctuation. Full original terms: `fonts/wenkai-OFL.txt`.

`fonts/calendar-brush.woff2` is a web subset of **Ma Shan Zheng Regular**, copyright 2018 The Ma Shan Zheng Project Authors, from https://github.com/google/fonts/tree/main/ofl/mashanzheng . The derived web family is named **School Calendar Brush** and contains 7,002 mapped characters. Full original terms: `fonts/mashanzheng-OFL.txt`. These fonts use SIL OFL 1.1; glyph outlines are unchanged. Missing characters fall back to the next configured handwriting face.

`fonts/classroom-yan.woff2` is a web-format version of **ChenYuluoyan 2.0 Thin**, copyright 2022 Wang, Li-Yu and Liu, Wei-Chen, from https://github.com/Chenyu-otf/chenyuluoyan_thin . It contains the original 10,137 mapped characters. The family is renamed **Classroom Yan** to respect the reserved names declared in the original license. Full terms and original copyright: `fonts/ClassroomYan-OFL.txt`. Glyph outlines are unchanged. Characters absent from this font use Long Cang as a fallback.

The additional calendar comparison fonts below are derived WOFF2 subsets from the Google Fonts source repositories. All use **SIL OFL 1.1**, with the full original copyright and license shipped beside each font. The subsets include GB2312 and supporting punctuation where present in the source; unmapped characters use the configured fallback. Their internal family names are changed as listed. Caveat is instantiated at weight 500 before subsetting; the other fonts retain their original outlines.

| Web file and derived family | Original source and copyright | Mapped characters | License file |
| --- | --- | --- | --- |
| `zhimangxing.woff2` · School Running | [Zhi Mang Xing](https://github.com/google/fonts/tree/main/ofl/zhimangxing), copyright 2018 The Zhi Mang Xing Project Authors | 7,002 | `fonts/zhimangxing-OFL.txt` |
| `liujianmaocao.woff2` · School Cursive | [Liu Jian Mao Cao](https://github.com/google/fonts/tree/main/ofl/liujianmaocao), copyright 2018 The Liu Jian Mao Cao Project Authors | 7,002 | `fonts/liujianmaocao-OFL.txt` |
| `zcoolkuaile.woff2` · School Rounded | [ZCOOL KuaiLe](https://github.com/google/fonts/tree/main/ofl/zcoolkuaile), copyright 2018 The ZCOOL KuaiLe Project Authors | 7,005 | `fonts/zcoolkuaile-OFL.txt` |
| `caveat.woff2` · School Caveat | [Caveat](https://github.com/google/fonts/tree/main/ofl/caveat), copyright 2014 The Caveat Project Authors | 292 | `fonts/caveat-OFL.txt` |
| `patrickhand.woff2` · School Patrick | [Patrick Hand](https://github.com/google/fonts/tree/main/ofl/patrickhand), copyright 2010–2012 Patrick Wagesreiter | 229 | `fonts/patrickhand-OFL.txt` |

## Vector illustrations

`taskboard-flat.svg`, `folder-flat.svg`, `settings-flat.svg`, `bell-flat.svg`, `calendar-flat.svg`, `chalk-cup-flat.svg`, `microphone-flat.svg`, `camera-flat.svg` and `projector-rear.svg` were drawn for this project using editable paths. Existing generated objects and material source atlases are documented in `docs/classroom-asset-prompts-2026-09-09.md`.

The figure/door path in `emergency-exit.svg` is adapted from **MaxxL**, [ISO 7010 E002](https://commons.wikimedia.org/wiki/File:ISO_7010_E002.svg), released into the **public domain** by its author. The project applies a muted green and ivory palette and a separate right arrow in a horizontal sign. Source SVG: https://upload.wikimedia.org/wikipedia/commons/3/35/ISO_7010_E002.svg . The reference and its public-domain notice were checked on 2026-09-09.

The inline bell in `app/ClassroomScene.tsx` preserves the paths and colors of `bell-flat.svg`; its mount and bell body are separate groups so only the body swings. The rough fullscreen arrows are editable paths drawn for this project, textured with the existing chalk grain.

`chalk/{expand,collapse,text,clear,save,heart,stars,balloons,cat}.svg` are original editable vector drawings for this project. Their grain is a deterministic pattern generated by `scripts/generate-classroom-chalk.mjs`, without external texture dependencies. The four decorative motifs are local review assets only; design constraints and regeneration instructions are in `chalk/README.md`. The lower tray is drawn using CSS geometry and the existing classroom palette.

## Generated chalk illustrations

`chalk/handdrawn/{heart,stars,balloons,cat}.png` were generated individually for this project with the built-in imagegen tool on 2026-09-10. Each image retains its original RGBA pixels and metadata. The corresponding 512 × 512 WebP files are proportionally downscaled delivery copies, encoded losslessly with transparency preserved. Prompts and usage notes are included in `chalk/handdrawn/PROMPTS.md` and `chalk/handdrawn/README.md`. These images contain no external texture overlays; the older SVG assets remain available separately.

## Binder clip

`binder-clip-flat.svg` was drawn as editable SVG on 2026-09-11, using the current `taskboard-flat.svg`, `folder-flat.svg`, `camera-flat.svg` and `settings-flat.svg` as style references. No early scene mockups were used. Prepared for the next task-board redesign; the existing pushpin is preserved.

## Device Latin and todo handwriting

`fonts/nunito-latin-{400,600}.woff2` are unchanged Latin webfont subsets of **Nunito**, distributed in `@fontsource/nunito@5.2.6`, font version v31. The package metadata identifies Google Fonts as the source and OFL-1.1 as the license. Copyright and full license are preserved in `fonts/Nunito-OFL.txt`. The package was obtained from the npm registry on 2026-09-11; no proprietary system fonts are bundled. Both weights cover all ASCII letters and digits, verified from the font cmap. Chinese device text continues to reference a locally installed YouYuan and falls back to Noto Sans SC.

Todo paper uses the existing Classroom Yan / Long Cang fonts for Chinese and Caveat for Latin text. The unsegmented checkbox and its irregular check mark are CSS geometry. `calendar-entry.svg` is an original editable vector drawing for this project, using the existing classroom prop palette and a tilted tent-calendar silhouette; it is a future calendar entry, not a date display.
