# 教室与任务板设计及批准记录

本页汇总2026年9月9日至11日的教室美术研究、逐轮批注与发布许可，用于查找设计由来和素材来源。记录依据整理前提交 `5714334a50c80adbe2d89a1b280cc5adff602c9c` 中的对应文档；原文件可从该提交追溯。此处描述各轮当时的选择，不表示网站目前仍使用每项历史尺寸或候选。

当前美术要求见[现行参照](../../classroom-art-reference.md)，完整生成提示词见[素材清单](../../classroom-asset-prompts-2026-09-09.md)，文件版权和字体许可见[素材署名](../../../public/classroom/ATTRIBUTION.md)。功能现状另见[当前功能说明](../../current-functionality.md)，未完成与暂缓项目只在[需求表](../../remaining-priority-requirements.md)维护。

## 批准范围与设计演进

9月9日，用户再次指定原图作为颜色及材质基准，取消继续生成整页效果图，改为独立素材与实际页面评审。原图固定低饱和灰绿、米白纸面和哑光木色，旧人物及旧文案不随参照恢复；修改局部物件不能改变未被要求调整的相邻素材，放置只做等比缩放、移动或旋转。

早期人物托盘方案随后改为四张实体课桌，个人卡片经历台历样式，9月10日再改为平板和白色笔记本。台历字体曾比较文楷、马善政及落雁体，设备阶段也曾依赖系统幼圆；最终选择网站提供的资源圆体与 Nunito。第十二轮短暂采用的换座申请和字体选项，在第十三轮被明确取消，设置改成白底左右分栏，只保留通用中的座位和统一保存。

9月11日第十一轮记录用户认可截图中其余外观，仅继续调整红线和云盘位置，并比较黑板底色。第十二轮记录选定“稍深” `#3c645a`，用于黑板、画板、全屏和导出；原色与其余五档仍作为开发比较资料，不能把比较色当作新批准的默认版本。

9月11日发布记录明确写明：用户已确认任务板外观完成，并允许教室更新上线，原有仅限本地要求被本次许可替代。批准范围包括最终教室设备和物件、软木公告板与白色笔记本任务区，以及仅包含座位的设置；日历仍保留物件而无操作。上线后用户又确认共享启停统一由个人设备上的投屏按钮控制，重复启停入口撤去，幕布收放仍只控制观看状态。

该许可针对当时确认的具体版本。9月12日之后的鼠标、图钉及磁吸笔等素材另有更新和批准记录，详见[设备素材说明](../../../public/classroom/devices-README.md)与素材署名；本页旧截图不能替代后续批准版本，更不能作为新增素材自动发布的许可。

## 固定参照与制作来源

早期整体材质使用[用户指定原图](../../assets/classroom-approved-material-reference-2026-09-09.png)，聊天纸面另参考[暖纸与横线原图](../../assets/classroom-chat-paper-reference-2026-09-09.png)，后者只用于纸底、横线和页边线。两图用于追溯当时的制作来源，当前制作以已批准的成品为准；图中的人物、示例消息和布局并不属于需要重新加入的内容。

物件及材质图集的原图、网页切片和遮罩仍保存在 `public/classroom`。第一次物件图集把棋盘格画入RGB，第二次背景编辑改为纯白，再由独立遮罩去除与单元格边缘相连的白底，保留物件内部浅色纸面；原始请求及背景修正提示词完整保存在素材清单。后续右桌物件和台历改为原生SVG，源图集仍保留，不能用现行切片代替制作源图。

黑板细颗粒来自 Atle Mo 的 [Black Paper](https://www.transparenttextures.com/black-paper.html)，采用 CC BY-SA 3.0；纸纤维来自 [ambientCG Paper001](https://ambientcg.com/a/Paper001)，采用 CC0。页面以既有配色控制纹理反差，导出使用对应处理；这些来源与完整许可由素材署名持续保存。墙面出口人物及门参考 MaxxL 提供的[ISO 7010 E002](https://commons.wikimedia.org/wiki/File:ISO_7010_E002.svg)公共领域图形，另采用项目绿白配色与右箭头。

任务板软木背景从用户照片 `codex-clipboard-b923b027-697a-4b42-9ba9-72774c9474b9.png` 的空白软木区域裁片并交叠拼接，形成 `public/classroom/taskboard-cork-reference.webp`；木框来自 `codex-clipboard-fe6e0333-641c-4d3a-9223-2fa556be779c.png`，形成 `public/classroom/taskboard-frame-reference.webp`。背景避开便签、图钉与文字，木框中间透明，下沿由上沿翻转以避开原照片里的笔。已提交仓库保留派生WebP及原文件名记录，未找到这两张原照片的已提交副本，因此这里保留来源标识，不提供失效的文件链接。

双人日历外形曾参考用户白色线圈台历照片 `codex-clipboard-0daea248-7435-4230-8645-6321aa607e7e.png`，只采用支撑与纸面的几何关系，不嵌入照片像素。第九轮将细线圈版本改为灰绿支架、米白纸面和少量装订符号，与粉笔筒和任务夹板共同核对比例；早期细节较多的版本已被替代，原照片标识见素材署名。

## 物件和页面批注的最终方向

四桌保持同等宽度，前两桌按登录身份安排设备，不因同一成员增加连接设备而增加座位。平板后来允许轻微缩小，亮暗屏使用同一比例；设备名字和控制各自独立，活动输入按屏幕容量限制。历史素材中的粉色保护套与白色笔记本在当时尚未完成官方图片核对，不能将通用形状候选写成精确型号复刻。

投影仪按要求背对观看者，展开幕布后仍位于前方；灯光曾有白色亮点，随后改为局部红色柔光，取消白点。这项已明确要求的灯光是局部设计记录，不能扩大为整件物品的写实高光。铃铛沿用原路径及颜色，只让钟体摆动，挂架固定，后续位置补偿使其贴近木框。

黑板文字先取消固定三条上限，再取消长标题三行限制，按完整文字实际高度决定可见条数；第一条自身过长时允许滚动。粉笔与板擦承担绘画和擦除入口，蓝色预设和粗细滑块后来取消；后板只在存在相邻画板时露出，取消早期箭头和把手。这里保留设计演进，具体画板操作和保存规则由现有功能说明解释。

第三桌最后安排粉笔筒、双人日历与任务板，第四桌保留云盘和设置，原相机及麦克风物件退出桌面但源素材留存。任务夹板按原比例放大8%，数字角标本身不放大，并按图案右上角定位，保留小半覆盖效果；日历入口撤去“后续开放”提示，等待后续功能。

聊天纸条始终不新增折角或已读回执，消息起点后来对齐“传纸条”页签并允许跨越纸面红线。红线曾多次调整色相和透明度，历史数值不作为新版本的固定约束；今日任务纸卡改为上下均分、各自滚动，字形沿用辰宇落雁体、龙藏体与 Caveat，小记没有预设用途。第七轮旧日期窗口与历史数量提示已经被后续功能修正替代，不从历史段落恢复。

## 任务板与详细设置

9月11日任务板采用18px木框的软木公告板，上方沿用便签与图钉，取消长尾夹。该轮图钉沿用历史提交 `8578150` 的10px几何，五种颜色按任务编号保持稳定；9月12日另有图钉批准版本，因此这里仅记录前一版来源。标题“任务板”被取消，白色工具与新增入口根据公告板自身宽度排列。

下方采用摊开的白色线装本，两名成员各占一页，移除活页环和外皮，纸页延伸到弹窗内容边缘。`title:` 栏目使用Georgia常规衬线，姓名采用同一组手写字体；卡片名称和操作同排，成员卡片不显示图钉，仍保留非交互区域拖动与键盘操作。优先级以卡片左侧整条色标表达，不重复添加小旗。

任务设置批注要求删除入口与标签左边缘对齐，采用红色垃圾桶图标，保存按钮留在右侧，已有权限与二次确认保持。附件改为本页预览，去掉上传成功后的常驻说明文字；具体暂存、引用保护和清理行为不在此重复维护，以现有功能说明为准。

## 手写字体与自由笔画的研究证据

9月9日研究直接读取字体真实轮廓，再添加固定颗粒，字体缺字用方框明确展示，没有用系统补字掩盖缺失。检测以6763个GB2312汉字为范围，覆盖率不能代表所有人名、扩展字或emoji；只有样例字符的体积也不能代表动态中文字体包。

| 字体 | 当时GB2312覆盖 | 来源与处理 |
| --- | --- | --- |
| 志莽行书 | 6763/6763 | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/zhimangxing)，OFL 1.1；笔势较强的对照候选。 |
| 龙藏体 | 6763/6763 | [Google Fonts](https://github.com/google/fonts/tree/main/ofl/longcang)，OFL 1.1；承担辰宇字体缺字回退，第九轮CSS按90%调整其显示度量，字体文件本身不改。 |
| 辰宇落雁体 Thin 2.0 | 4333/6763 | [作者仓库](https://github.com/Chenyu-otf/chenyuluoyan_thin)，OFL 1.1；原版10137映射转网页格式，更名Classroom Yan以遵守保留名称要求。 |
| 悠哉 Medium | 6763/6763 | [作者仓库](https://github.com/lxgw/yozai-font)，OFL 1.1；保留为较规整的早期对照。 |

台历阶段另比较[文楷Regular v1.522](https://github.com/lxgw/LxgwWenKai/releases/tag/v1.522)和[马善政](https://github.com/google/fonts/tree/main/ofl/mashanzheng)，网页派生名分别为School Calendar Pen与School Calendar Brush。设备最终采用Resource Han Rounded CN v0.990，Regular和Medium保留全部30887个字符映射，转换文件合计约9.50MiB；英文数字采用Nunito。字体许可、摘要和后续新增候选的具体信息继续保存于素材署名和字库目录，不分发商业系统幼圆。

自由笔画由用户输入点列决定，字体负责自动显示文字，两者共享粉笔颗粒风格。原型沿线重新采样，以笔迹ID固定边缘变化和颗粒，已完成笔迹缓存，减少拖动中重复绘制；同一数据重复绘制一致并不承诺不同浏览器逐像素相同。网页显示、重绘和导出必须复用笔触规则，旧白色擦除及深色笔迹继续按已有语义兼容，不能用临时像素演示代替协作记录。

可复核资料保留[字形比较图](../../assets/handwriting-chalk-comparison-2026-09-09.png)与[覆盖检测JSON](../../assets/handwriting-coverage-2026-09-09.json)，以及[实际渲染样张](../../assets/chalk-renderer-sample-2026-09-09.png)、[独立试写HTML](../../assets/chalk-freehand-demo-2026-09-09.html)和[配套绘制模块](../../assets/chalk-stroke-renderer.mjs)。试写原型不接真实账号，原型自身刷新不保留笔迹；这不代替正式协作行为说明。

## 历史预览索引

以下图片反映对应日期的候选或页面，不能作为最新相邻物件的替代参照。素材对照图与网页截图的性质在各项中明确区分，源文件保持原位置。

| 阶段 | 保留资料 |
| --- | --- |
| 人物托盘提案 | [待机](../../assets/classroom-refined-idle-2026-09-09.png)、[投影](../../assets/classroom-refined-projector-2026-09-09.png)、[画板](../../assets/classroom-refined-board-2026-09-09.png)、[独立动画示意](../../assets/classroom-refined-interactive-2026-09-09.html)。 |
| 第一轮材质与第二轮 | [材质调整页面](../../assets/classroom-local-refinement-2026-09-09.png)、[第二轮待机](../../assets/classroom-second-review-idle-2026-09-09.png)、[第二轮投影](../../assets/classroom-second-review-projection-2026-09-09.png)。 |
| 第三轮 | [台历字体对照](../../assets/classroom-calendar-fonts-2026-09-10.png)、[任务排版](../../assets/classroom-third-review-tasks-2026-09-10.png)、[投影边距](../../assets/classroom-third-review-projection-2026-09-10.png)。 |
| 第四轮 | [画板与托槽](../../assets/classroom-fourth-review-board-2026-09-10.jpg)、[字体候选](../../assets/classroom-fourth-review-fonts-2026-09-10.jpg)、[长标题](../../assets/classroom-fourth-review-long-tasks-2026-09-10.jpg)、[四款装饰](../../assets/classroom-chalk-motifs-2026-09-10.jpg)。 |
| 第五轮设备 | [独立设备状态对照](../../assets/classroom-device-states-2026-09-10.png)，这是素材图，不含随后粉色保护套和灯光改动。 |

9月11日任务板页面复核截图当时保存在 `codex-generated/taskboard-reference-materials/final-preview.png` 和 `codex-generated/taskboard-controls-final.png`，构建及拖动检查日志也在该临时目录。这些路径是历史证据索引，不保证新检出目录包含文件；不能用一个不存在的本地路径代替已提交的原始来源。

## 发布与未验证边界

正式整合记录使用线上 `5be2787` 与本地外观 `99ebb4a`，保留两边已完成工作，发布沿用现有GitHub Actions、GHCR及服务器流程，目标为 [study.11scat.xyz](https://study.11scat.xyz/)。发布文档记录最终生产构建通过、179项自动检查通过，包含模拟任务及组件检查；它没有给出最终部署运行ID，本页不补造该编号，也不以当时的检查声称今天线上已运行某个版本。

历史研究期间，部分外部参考和浏览器操作被自动审批拒绝，少数构建及暂存也因审批服务错误未执行，后来权限恢复并完成相关构建。保留这一点是为了说明当时的证据范围，它不构成当前新操作的禁令。部分轮次只看了用户截图或独立SVG，尺寸也可能是CSS推算，不能改写为浏览器实测；最终外观批准与真实双设备联调是两类记录。

双人日历仍待明确和实现，黑板装饰的每日变化、用户选择及房间同步按要求暂缓；源素材和大小组合继续保留。真实成员座位及音视频连续性由需求表中的远端协作项跟进，本地观感待验收已按用户决定取消，不因历史整理恢复。后续美术仍先展示具体版本，再取得明确同意后接入正式路径。

## 较早的局部决定

2026-09-08 的设置改版曾提供六种接近白色的主题，用户否定这一方向并撤回提交 `f7e7637`；这些候选不作为新的默认主题。同期云盘图标按要求改为黄色手提包，属于当日局部调整，不能替代后来确定的教室固定风格。来源见[设置菜单旧文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/settings-menu-2026-09-08.md)与[云盘改版旧文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/cloud-drive-redesign-2026-09-08.md)。

## 逐轮原文索引

下面的固定提交链接用于核对完整批注和原来的验证范围；原文中的阶段性尺寸及“仅本地”状态只适用于对应日期。

| 原记录 | 固定版本 |
| --- | --- |
| classroom-theme-refinement-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-theme-refinement-2026-09-09.md) |
| classroom-material-refinement-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-material-refinement-2026-09-09.md) |
| classroom-local-implementation-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-local-implementation-2026-09-09.md) |
| classroom-second-review-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-second-review-2026-09-09.md) |
| classroom-third-review-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-third-review-2026-09-10.md) |
| classroom-fourth-review-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-fourth-review-2026-09-10.md) |
| classroom-fifth-review-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-fifth-review-2026-09-10.md) |
| classroom-sixth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-sixth-review-2026-09-11.md) |
| classroom-seventh-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-seventh-review-2026-09-11.md) |
| classroom-eighth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-eighth-review-2026-09-11.md) |
| classroom-ninth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-ninth-review-2026-09-11.md) |
| classroom-tenth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-tenth-review-2026-09-11.md) |
| classroom-eleventh-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-eleventh-review-2026-09-11.md) |
| classroom-twelfth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-twelfth-review-2026-09-11.md) |
| classroom-thirteenth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-thirteenth-review-2026-09-11.md) |
| classroom-fourteenth-review-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-fourteenth-review-2026-09-11.md) |
| classroom-release-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/classroom-release-2026-09-11.md) |
| taskboard-notebook-local-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/taskboard-notebook-local-2026-09-11.md) |
| task-settings-annotations-2026-09-11.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-settings-annotations-2026-09-11.md) |
| handwriting-and-freehand-chalk-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/handwriting-and-freehand-chalk-2026-09-09.md) |
