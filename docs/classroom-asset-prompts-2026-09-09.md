# 教室主题独立素材与生成提示词

2026-09-09 的素材生成记录。本文保留原始图集、完整提示词与授权来源；其中的台历和早期物件描述用于追溯制作过程，不能直接当作当前页面要求。后续批准与替换关系见[教室设计历史](archive/2026-09/classroom-design.md)，新的素材修改仍按 [AGENTS.md](../AGENTS.md)取得具体版本同意后发布。

## 参照与文件

每次生成时附上[固定颜色与材质参照](assets/classroom-approved-material-reference-2026-09-09.png)，只继承颜色和干燥哑光的插画质感。图里的旧人物和旧文字不属于当前要求。

| 用途 | 项目文件 |
| --- | --- |
| 九件物品的原始图集 | [objects-source.png](../public/classroom/objects-source.png) |
| 网页加载的物件图集 | [objects.webp](../public/classroom/objects.webp) |
| 对应的背景遮罩 | [objects-mask.png](../public/classroom/objects-mask.png) |
| 四种材质原始图集 | [materials-source.png](../public/classroom/materials-source.png) |
| 网页材质 | public/classroom/board.webp、wood.webp、paper.webp、fabric.webp |

第一次物件图集将棋盘格画进了 RGB 图像，并没有真正的透明通道。已通过第二次图像编辑改为纯白背景，网页使用独立遮罩去除与每个单元格边缘连通的白底，保留台历纸面等浅色物件。源图保留不变，便于继续编辑；用户 ID、活动和任务文字由网页显示，不写进图片。

## 物件图集提示词

以下是第一次请求的完整提示词。网页版生成时，同样上传固定参照图作为图像 1；若没有返回真实透明通道，可以接着使用下方的背景修正提示词。

```text
Use case: stylized-concept. Asset type: ONE production-ready transparent sprite atlas for a hand-painted classroom web interface. Input image 1 is STRICT reference for color, light and dry matte gouache/paper grain only; do not copy its people, text, arrangement or UI. Create a square 3 by 3 sprite atlas, all 9 cells equal sized, each prop isolated with ample transparent margin in its own cell. No grid lines, no cell backgrounds, no text, no labels, no numbers, no people. True transparent background.
Coordinates / order: top-left a front-facing warm ivory blank desk calendar with small copper spiral rings and visible ochre triangular side stand, ample blank paper face; top-middle a muted teal ceramic cup holding four stubby sticks of white, yellow, blue and pink chalk; top-right a ceiling projector seen from front with recognizable dark circular lens, matte cream housing, side vents, small visible suspension mount. Middle-left a simple charcoal tabletop microphone on short stand; middle-middle a small black vintage compact camera; middle-right a warm wood clipboard with cream blank paper and visible triangular easel support so it stands on a desk. Bottom-left a low saturation golden yellow document folder; bottom-middle a muted teal stationery box holding pencils, small neutral gear emblem without text; bottom-right an ochre brass school bell suspended from a short dark wall bracket.
Match reference exactly: restrained grey-green, warm cream, matte ochre wood, gentle granular brush texture, flat storybook gouache illustration, soft daylight from upper-left, subtle soft object shadows, small natural irregular edges. Props front view with very slight view of top and right side, consistent perspective and lighting. Avoid saturated orange/yellow, shine, photoreal 3D, scratchy grunge, white outlines, hard thick strokes, labels, folded paper corners. All nine objects fully contained within their 3x3 cells; never overlap cells. The atlas is the deliverable, not a screen mockup.
```

背景修正提示词，上传生成的物件图集作为编辑目标：

```text
Use case: precise-object-edit. Edit ONLY the background of this 3x3 sprite atlas. Remove the entire grey-and-white checkerboard and replace it with perfectly uniform pure white #ffffff. Keep all nine illustrated objects, their exact shapes, positions, individual scale, gouache grain, muted colors and shadows unchanged. Do not add anything. Do not draw any checkerboard pattern or border. Output the same square 3x3 layout. Background must be solid pure white so this source atlas can be composited using multiply; no transparency simulation. No text.
```

## 材质图集提示词

```text
Use case: stylized-concept. Asset type: ONE square production texture atlas, 2 by 2 equal square swatches, no gaps no borders no text. Reference image 1 is the EXACT approved palette and texture. Top-left: even dusty grey-green chalkboard surface #426e63 with extremely subtle dry gouache tooth, no chalk marks, no scratches, no objects. Top-right: muted light ochre wood #d3a05d, fine soft horizontal wood fiber like the reference board frame, matte not shiny, no objects. Bottom-left: warm ivory paper #f5edda with fine gentle paper grain, no lines, no wrinkles. Bottom-right: warm off-white projection fabric #ece8db, extremely faint woven threads, matte, no folds, no gradients. Each swatch fills exactly one quadrant from edge to edge, no margin, surface viewed straight-on, uniform light. Do not make a scene or a UI. Preserve low saturation and restrained contrast; no heavy distressed grain, no vignettes. This is a single 2x2 material atlas for web backgrounds.
```

页面用固定颜色覆盖层控制颗粒强度，避免纹理平铺放大后比参照过重。图集切片仅用于网页加载和布局，原始素材保留以便后续调整。

## 字体授权与额度说明

[辰宇落雁体](https://github.com/Chenyu-otf/chenyuluoyan_thin/blob/main/license.txt)和[龙藏体](https://github.com/google/fonts/blob/main/ofl/longcang/OFL.txt)采用 SIL Open Font License 1.1，允许免费商用、网页嵌入和随软件分发，需要保留版权及授权声明，不能将字体本身单独出售，修改字体时还要遵守保留字体名称条款。项目实际接入完整龙藏体 WOFF2，避免常见简体字缺失；[CHAWP](https://github.com/awp/chawp)用于英文日期。授权文件随字体保存在 public/classroom/fonts。

截至 2026-09-09，[OpenAI 官方生图说明](https://developers.openai.com/codex/image-generation)写明：内置生图计入 Codex 通用使用额度，通常比不生图的类似请求更快消耗额度；网页版可用性和限制取决于 ChatGPT 套餐与工作区设置。这不能证明当前连接环境与网页版额度完全共用或完全独立，也不能保证工具受限时网页版一定可用。本轮内置工具已经成功生成上述素材，提示词仍保留，方便用户自行继续制作。

## 2026-09-09 浏览器批注后的素材更新

右桌三个物件、墙铃和台历当前采用项目原生 SVG，原生成图集继续保留作为制作源图。黑板与聊天纸面改用有明确授权的现成细纹素材，来源及保留许可见[素材署名](../public/classroom/ATTRIBUTION.md)；新素材没有调用生图服务。当日显示方案和按钮印刷字体的选择见[历史材质调整原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-material-refinement-2026-09-09.md)；当时的本地调试状态不代表后续发布状态。
