# 手绘粉笔图案

这一套用于当前教室的灰绿色黑板，配色沿用暖白、淡黄、柔粉和浅蓝。四款素材各自独立，背景透明，粉笔线条和涂色中的颗粒空隙可以透出网页背景。

2026-09-11 第七版更新：气球的三根绳线增加轻微弧度，继续朝气球组中下方汇合，保持与气球边缘接近的笔画粗细。猫咪的双耳改为接近的大小，保留少量徒手差异与整体轻微倾斜；额头和身体一侧的淡黄擦涂、耳内柔粉沿用上一版的配色与分布，轮廓继续保留手绘转折。两款 PNG 和 WebP 已一同更新，文件地址沿用原路径。网上参考与采用方式见 [REFERENCES.md](REFERENCES.md)。

| 图案 | 标识 | 网页文件 | 原始文件 |
| --- | --- | --- | --- |
| 爱心 | `heart` | [heart.webp](heart.webp) | [heart.png](heart.png) |
| 星星 | `stars` | [stars.webp](stars.webp) | [stars.png](stars.png) |
| 三个气球 | `balloons` | [balloons.webp](balloons.webp) | [balloons.png](balloons.png) |
| 猫咪 | `cat` | [cat.webp](cat.webp) | [cat.png](cat.png) |

PNG 保留生图原件。WebP 为 512 × 512 像素，保留完整透明通道，按无损模式编码；缩小后适合常用的 160 像素展示尺寸，也可用于 52 像素的小图案。空白边缘是构图的一部分，图片应等比缩放，避免拉伸。

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
