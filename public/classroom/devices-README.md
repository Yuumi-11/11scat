# 教室设备与状态素材

本组设备素材始于 2026-09-10，已随后续教室外观确认正式接入，并在 2026-09-12 更新独立鼠标及平板顶部磁吸笔。当前整体对照见[教室现行美术参照](../../docs/classroom-art-reference.md)；保留的相机与麦克风等状态文件不代表当前页面仍有独立物件入口，实际使用以组件引用为准。

| 文件 | 用途与来源 |
| --- | --- |
| `tablet-on.svg`、`tablet-off.svg` | 第一桌的浅粉色折叠保护套平板；亮屏与暗屏保持相同的设备轮廓与支撑比例，两份均包含已批准的顶部白色磁吸笔。早期设备外形按用户描述制作，后续磁吸位置参考 Apple 官方示意图，来源与批准范围见[素材署名](ATTRIBUTION.md#approved-pencil-and-pushpin-artwork-2026-09-12)；不将样式化外观写成精确型号复刻。 |
| `laptop-on.svg`、`laptop-off.svg` | 第二桌的白色笔记本；保留原屏幕和键盘几何位置，2026-09-12 移除图内过小的旧鼠标。 |
| `mouse-white.svg` | 2026-09-12 按用户【0】补充要求绘制为平放桌面、后部朝向镜头的低视角。外形参考 [ROG Keris II Ace 官方图库](https://rog.asus.com/mice-mouse-pads/mice/wireless/rog-keris-ii-ace/gallery/)，沿用白色笔记本的米白、灰绿平面色块；远端露出简化按键和蓝灰滚轮，不添加壳面高光或投影。最新补充将接触桌面的底边改为水平直线，相对笔记本放大约 46%，可见宽度约为笔记本的五分之一。画布为 76×40，网页等比显示，并为电脑与鼠标预留共同摆放空间；未使用官方图片作为发布素材。 |
| `microphone-on.svg`、`microphone-off.svg` | 从既有 `microphone-flat.svg` 派生，保留原轮廓；打开时增加红灯及声音线，关闭时增加浅色斜线。 |
| `camera-on.svg` | 从既有 `camera-flat.svg` 派生，加入红灯与镜头环；红灯使用红色径向扩散和模糊光晕，取消白色亮点。相机物件已从第三桌移除，保留素材供后续使用。 |
| `projector-on.svg`、`projector-off.svg` | 从既有 `projector-rear.svg` 派生，只改变原指示灯及其附近光晕；两者均背对镜头。 |
| `calendar-entry.svg` | 第三桌的双人日历物件，采用灰绿支架、米白纸面和简化装订符号，与相邻物件统一观看角度；当前只有入口外观，没有可用的日历交互。 |
| `chalk/eraser-whole.svg`、`chalk/eraser-area.svg` | 固定的“整笔”“局部”字样，取自项目已收录的 Long Cang 字体轮廓，着色与黑板粉笔一致。保留 [Long Cang 的 OFL 许可及署名](fonts/LongCang-OFL.txt)。 |

`scripts/generate-classroom-devices.mjs` 保留早期设备生成过程，但不包含后续加入的磁吸笔，不能直接运行后覆盖已批准的正式设备。再次制作须以当前 SVG 为起点，候选及对照先放在 `codex-generated`；任务板数字角标仍由页面绘制，不额外重画任务夹板。

设备英文和数字使用本地 Nunito 圆体，中文使用已随项目分发的资源圆体，均加载 400、600 两种字重。2026-09-12 起进入主界面前等待设备字体与教室必要资源就绪，加载失败可以重试。字体原始署名与许可证见 [ATTRIBUTION.md](ATTRIBUTION.md)。

独立素材对照 `docs/assets/classroom-device-states-2026-09-10.png` 是第五轮历史候选，不含后续设备更新；它仅记录当时的素材组合。现行页面样例通过开发环境的 `/classroom-preview` 查看，远端设备验收状态以[剩余需求表](../../docs/remaining-priority-requirements.md)为准，不沿用旧文档的本轮验收表述。粉笔关闭图案 `chalk/close.svg` 的生成来源仍为 `scripts/generate-classroom-chalk.mjs`，新增或重绘后的具体版本须按项目规则先预览并取得同意。
