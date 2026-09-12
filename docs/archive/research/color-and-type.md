# 配色与中文粉笔字体研究

本页汇总 2026-09-07 至 2026-09-09 的配色和字体资料，保留可复核的作者来源与样本范围。早期方案已被后续选择替代，制作时采用[固定美术参照](../../classroom-flat-style-2026-09-09.md)，批准沿革见[教室设计历史](../2026-09/classroom-design.md)。

## 配色方法与未采用的方案

原研究用 Radix 色阶区分背景、交互状态和文字用途，并参考 OKLCH 与 Oklab 转换矩阵。处理越界颜色时采用彩度缩减，未宣称实现 CSS Color 4 的全部色域映射；WCAG 对比度计算与 Radix 资料中使用的 APCA 指标分别对待。

后续读取 Material Color Utilities 0.3.0 的 SchemeTonalSpot、SchemeVibrant 和 SchemeExpressive 实际源码，具体版本链接保留在下表。HCT 与 OKLCH 的数值不能直接比较，当时四套手选色板没有运行 Material 算法，也没有证明适用于任意输入颜色。

原研究中的 220 或 222 个颜色输入样本，以及另一轮 32 对前景与背景，只能支持各自测试的颜色组合。普通文字 4.5:1、大字 3:1 和必要非文字控件 3:1 的资料范围按 W3C 原文解释，阈值不能向上取整，样本通过不等同于整站无障碍或移动端验收。

六种近白主题被否定并撤回，随后选择晨间教室方向，学院风仍是未选候选；偏写实的课桌人物效果图也被否定。USWDS、WCAG、Fluent 2 和 Carbon 保留为方法参考，早期色值与人物属性方案不据此恢复为需求。早期 Material 页面读取失败的记录，与后续成功读取固定版本源码是不同阶段；Adobe 404 或仅返回脚本提示的页面没有作为证据。

## 字体覆盖与许可

最早 Chalk-S 检查仅针对日期汉字与数字，读取到 8223 个字符映射和 10812 字节的日期子集，不能由此推断其适合整站中文。后续扩大至 GB2312 的 6763 个汉字，并用真实轮廓绘制样张，缺字明确显示空框，没有借系统字体补齐。

| 字体 | 固定来源与 GB2312 结果 |
| --- | --- |
| Chalk-S | 原作者 `Chalk-S_3_JP.zip`，OFL 1.1，基于 Stick 改制；3384/6763，缺“业、务、审、认、领”等字。 |
| Chalk JP | 原作者说明及原包 OFL 1.1，基于 Klee One 改制；3779/6763。 |
| 悠哉 Medium v0.868 | 作者发布与 OFL 1.1；6763/6763，仍须注意个别日文字形习惯。 |
| 小赖 v3.126 | 作者发布与 OFL 1.1；6763/6763，不能将该范围等同所有 Unicode 字符。 |

[真实字形对比](../../assets/chinese-chalk-comparison-2026-09-09.png)和[覆盖数据 JSON](../../assets/chinese-chalk-coverage-2026-09-09.json)保留缺字、文件大小及 SHA256。原文件分别为 5145856、11949376、15238394、22220806 字节，样句 WOFF2 子集分别为 16784、24168、11644、9356 字节；这些子集只是检测材料，不能当作支持动态中文输入的完整发布字库。

CHAWP 仅承担已验证的拉丁日期字形，Fredericka the Great 与 Cabin Sketch 使用 OFL，Walter Turncoat 为 Apache 2.0。陈代明演示版、邯郸粉笔中黑体、上首粉笔体和韩绍杰毛楷粉笔简体仅保留目录线索，当时未取得完整网页嵌入授权，不把下载入口等同使用许可。

后续更有手写感的字体比较、辰宇落雁体的改名与回退，以及网页显示和导出共用粉笔渲染的决定，合并在[教室设计历史](../2026-09/classroom-design.md#手写字体与自由笔画的研究证据)。正式字体署名和许可继续原位保留，任务内容不为适配字体转换成繁体，图片上的模型生成文字也不代替真实字形检测。

## 历史示意资料

[晨间候选](../../assets/classroom-theme-1-2026-09-09.png)与[学院候选](../../assets/classroom-theme-2-2026-09-09.png)都是设计示意，[写实课桌概念](../../assets/classroom-desks-concept-2026-09-09.png)属于被否定方案。早期[字体真实渲染图](../../assets/chalk-font-comparison-2026-09-09.png)仍可比较笔触，全部历史图与独立原型的文件入口见[资料文件索引](../assets-index.md)。

## 公开来源

以下链接保留原研究引用及其出处，本次整理没有重新在线核实价格、额度或服务可用性。

| 原研究 | 来源 |
| --- | --- |
| chinese-chalk-font-research-2026-09-09.md | [作者说明](https://font.cutegirl.jp/chalk-s.html) |
| chinese-chalk-font-research-2026-09-09.md | [作者说明](https://font.cutegirl.jp/chalk-font-free.html) |
| chinese-chalk-font-research-2026-09-09.md | [作者仓库](https://github.com/lxgw/yozai-font) |
| chinese-chalk-font-research-2026-09-09.md | [版本发布](https://github.com/lxgw/yozai-font/releases/tag/v0.868) |
| chinese-chalk-font-research-2026-09-09.md | [授权](https://github.com/lxgw/yozai-font/blob/master/OFL.txt) |
| chinese-chalk-font-research-2026-09-09.md | [作者仓库](https://github.com/lxgw/kose-font) |
| chinese-chalk-font-research-2026-09-09.md | [版本发布](https://github.com/lxgw/kose-font/releases/tag/v3.126) |
| chinese-chalk-font-research-2026-09-09.md | [授权](https://github.com/lxgw/kose-font/blob/master/OFL.txt) |
| chinese-chalk-font-research-2026-09-09.md | [作者仓库](https://github.com/awp/chawp) |
| chinese-chalk-font-research-2026-09-09.md | [授权](https://github.com/awp/chawp/blob/master/LICENSE) |
| classroom-desks-and-chalk-research-2026-09-09.md | [Chalk-S_3_JP.zip](https://font.cutegirl.jp/wp-content/uploads/2021/04/Chalk-S_3_JP.zip) |
| classroom-desks-and-chalk-research-2026-09-09.md | [Google Fonts 元数据](https://github.com/google/fonts/blob/main/ofl/frederickathegreat/METADATA.pb) |
| classroom-desks-and-chalk-research-2026-09-09.md | [Google Fonts 元数据](https://github.com/google/fonts/blob/main/ofl/cabinsketch/METADATA.pb) |
| classroom-desks-and-chalk-research-2026-09-09.md | [Google Fonts 元数据](https://github.com/google/fonts/blob/main/apache/walterturncoat/METADATA.pb) |
| classroom-desks-and-chalk-research-2026-09-09.md | [字体目录](https://www.fonts.net.cn/font-33608874314.html) |
| classroom-desks-and-chalk-research-2026-09-09.md | [字体目录](https://www.fonts.net.cn/font-33662499086.html) |
| classroom-desks-and-chalk-research-2026-09-09.md | [字体目录](https://www.fonts.net.cn/font-39719416241.html) |
| classroom-desks-and-chalk-research-2026-09-09.md | [字体目录](https://www.fonts.net.cn/font-42303241212.html) |
| classroom-theme-study-2026-09-09.md | [USWDS 色彩设计令牌](https://designsystem.digital.gov/design-tokens/color/overview/) |
| classroom-theme-study-2026-09-09.md | [WCAG 2.2 最低对比度说明](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |
| theme-color-research-2026-09-07.md | [Radix Colors：Understanding the scale](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale) |
| theme-color-research-2026-09-07.md | [MDN：oklch()](https://developer.mozilla.org/en-US/docs/Web/CSS/color_value/oklch) |
| theme-color-research-2026-09-07.md | [Björn Ottosson：A perceptual color space for image processing](https://bottosson.github.io/posts/oklab/) |
| theme-color-research-2026-09-07.md | [W3C：Understanding SC 1.4.11 Non-text Contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html) |
| theme-color-second-study-2026-09-08.md | [Material Color Utilities 0.3.0 — SchemeTonalSpot](https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/scheme/scheme_tonal_spot.js) |
| theme-color-second-study-2026-09-08.md | [Material Color Utilities 0.3.0 — SchemeVibrant](https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/scheme/scheme_vibrant.js) |
| theme-color-second-study-2026-09-08.md | [Material Color Utilities 0.3.0 — SchemeExpressive](https://cdn.jsdelivr.net/npm/@material/material-color-utilities@0.3.0/scheme/scheme_expressive.js) |
| theme-color-second-study-2026-09-08.md | [Atlassian Design — Color](https://atlassian.design/foundations/color/) |
| theme-refresh-2026-09-08.md | [Radix Colors — Composing a palette](https://www.radix-ui.com/colors/docs/palette-composition/composing-a-palette) |
| theme-refresh-2026-09-08.md | [Microsoft Fluent 2 — Color](https://fluent2.microsoft.design/color) |
| theme-refresh-2026-09-08.md | [IBM Carbon — Color overview](https://carbondesignsystem.com/elements/color/overview/) |
| theme-refresh-2026-09-08.md | [W3C — CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/#ok-lab) |

## 原文索引

| 历史文档 | 固定版本 |
| --- | --- |
| chinese-chalk-font-research-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/chinese-chalk-font-research-2026-09-09.md) |
| classroom-desks-and-chalk-research-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-desks-and-chalk-research-2026-09-09.md) |
| classroom-theme-study-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-theme-study-2026-09-09.md) |
| theme-color-research-2026-09-07.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/theme-color-research-2026-09-07.md) |
| theme-color-second-study-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/theme-color-second-study-2026-09-08.md) |
| theme-refresh-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/theme-refresh-2026-09-08.md) |
