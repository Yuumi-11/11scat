# 手绘粉笔图案

这一套用于当前教室的灰绿色黑板，主要使用暖白、淡黄、柔粉和浅蓝；第八版气球根据用户指定参考增加淡紫。四款素材各自独立，背景透明，粉笔线条和涂色中的颗粒空隙可以透出网页背景。

2026-09-11 第十版猫咪更新：采用用户指定的高挑坐姿猫原图，局部去除双颊红晕，保留原有圆环眼睛、长前腿与卷尾，鼻子和耳内的柔粉以及额头和后腿的淡黄粉笔擦涂均保持原样。猫咪 PNG 和 WebP 已更新；气球固定为已确认的第八版，爱心和星星继续沿用原版。参考与采用方式见 [REFERENCES.md](REFERENCES.md)。

| 图案 | 标识 | 网页文件 | 原始文件 |
| --- | --- | --- | --- |
| 爱心 | `heart` | [heart.webp](heart.webp) | [heart.png](heart.png) |
| 星星 | `stars` | [stars.webp](stars.webp) | [stars.png](stars.png) |
| 三个气球 | `balloons` | [balloons.webp](balloons.webp) | [balloons.png](balloons.png) |
| 猫咪 | `cat` | [cat.webp](cat.webp) | [cat.png](cat.png) |

爱心、星星与气球的 PNG 保留生图原件；猫咪 PNG 为用户指定的 1254 × 1254 像素生图原件局部去除双颊红晕的结果，两个局部区域以外像素保持一致，来源和验证结果见 [PROMPTS.md](PROMPTS.md)。WebP 为 512 × 512 像素，保留完整透明通道，按无损模式编码；缩小后适合常用的 160 像素展示尺寸，也可用于 52 像素的小图案。空白边缘是构图的一部分，图片应等比缩放，避免拉伸。

## 网页调用

项目的静态地址以 `/classroom/chalk/handdrawn/` 开头。普通 HTML 可以直接使用图片，CSS 背景和 Canvas 的 `drawImage` 也能使用同一文件。素材已经包含颜色和粉笔颗粒，通常不需要额外滤镜、阴影或整体透明度。

```html
<img
  src="/classroom/chalk/handdrawn/heart.webp"
  width="160"
  height="160"
  alt="粉笔爱心"
  style="object-fit: contain"
>
```

项目内可复用 `app/ChalkMotif.tsx`，`name` 支持表格中的四个标识，`size` 控制尺寸，`rotation` 控制旋转角度。默认按纯装饰处理；需要图像说明时设置 `decorative={false}`。组件不附带位置、点击行为或房间状态，使用者可在自己的容器内排布。

```tsx
import { ChalkMotif } from './ChalkMotif';

<ChalkMotif name="heart" size={160} />
<ChalkMotif name="cat" size={52} rotation={-4} decorative={false} />
```

调用方也可以从 `app/classroom-chalk-art.ts` 读取素材清单，通过 `classroomChalkArtUrl` 获取 WebP 或 PNG 地址。该组件无需引入教室样式表。

## 预览与维护

本地样例入口为 `/classroom-preview/chalk-art`，可查看四款图案的大小版本以及两个位置的独立组合。[便携预览](preview.html)可在浏览器中打开，和这四对素材文件放在同一目录即可使用；它提供不同底色和展示尺寸，不依赖项目运行环境。

这次仅接入素材样例，正式黑板的每日更换和房间同步仍按现有安排保留为后续工作。原 SVG 素材和生成器继续保留，程序生成器不会覆盖这一目录。

素材由内置 imagegen 为本项目生成，完整请求见 [PROMPTS.md](PROMPTS.md)。后续视觉修改应从 PNG 原件继续处理，再导出网页版本。技术检查记录保存在 `codex-generated/chalk-handdrawn-2026-09-10/`。
