# 教室设备与状态素材

本组素材为 2026-09-10 本地外观候选，于 2026-09-11 更新粉色平板支撑套和红灯光晕，使用可编辑 SVG 路径制作。沿用已确定物件的低饱和色块与简化轮廓，放置时只允许等比缩放、移动和旋转。

| 文件 | 用途与来源 |
| --- | --- |
| `tablet-on.svg`、`tablet-off.svg` | 第一桌的浅粉色折叠保护套平板；亮屏与暗屏尺寸、边框及支撑壳完全相同。按用户的 iPad Pro 2025 与粉色保护套描述制作候选，尚未核对官方图片。 |
| `laptop-on.svg`、`laptop-off.svg` | 第二桌的白色笔记本与鼠标；根据用户提供的 ROG 幻 14 Air 和 ROG Ace 白色款描述制作简化候选，尚未核对外部官方参考图，不声明为精确型号复刻。 |
| `microphone-on.svg`、`microphone-off.svg` | 从既有 `microphone-flat.svg` 派生，保留原轮廓；打开时增加红灯及声音线，关闭时增加浅色斜线。 |
| `camera-on.svg` | 从既有 `camera-flat.svg` 派生，加入红灯与镜头环；红灯使用红色径向扩散和模糊光晕，取消白色亮点。相机物件已从第三桌移除，保留素材供后续使用。 |
| `projector-on.svg`、`projector-off.svg` | 从既有 `projector-rear.svg` 派生，只改变原指示灯及其附近光晕；两者均背对镜头。 |
| `calendar-entry.svg` | 第三桌的双人日历入口，侧向支撑式台历，以暖米白纸张和棕色支撑绘制；点击显示后续开放提示。 |
| `chalk/eraser-whole.svg`、`chalk/eraser-area.svg` | 固定的“整笔”“局部”字样，取自项目已收录的 Long Cang 字体轮廓，着色与黑板粉笔一致。保留 [Long Cang 的 OFL 许可及署名](fonts/LongCang-OFL.txt)。 |

设备差分可以由 `scripts/generate-classroom-devices.mjs` 重新输出。任务板、文件袋及设置物件继续使用既有素材；任务板数字角标由页面绘制，以支持动态计数，不额外重画任务夹板。

设备英文和数字增加本地 Nunito 圆体，使用 400、600 两种字重的 Latin 子集，已验证 ASCII 字母和数字完整覆盖。中文幼圆仅引用用户设备已安装字体，不随项目分发，缺失时回退 Noto Sans SC。字体原始署名与许可证见 [ATTRIBUTION.md](ATTRIBUTION.md)。

独立素材对照 `docs/assets/classroom-device-states-2026-09-10.png` 是第五轮历史候选，不含本轮粉色支撑套和灯光；它仅展示素材文件，不是网页截图。当前页面入口为 `/classroom-preview`，尚未完成本轮页面和真实设备验收。粉笔关闭图案 `chalk/close.svg` 沿用已有工具 SVG 的生成方法，可单独运行 `node scripts/generate-classroom-chalk.mjs close` 更新，不影响装饰图案。
