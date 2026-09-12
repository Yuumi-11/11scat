# 语音方案与浏览器兼容性研究

本页汇总 2026-09-07 至 2026-09-09 的方案研究与兼容性决定，依据整理前提交 `5714334` 的原文。服务额度与性能数据只反映当时公开资料，功能现状另见[当前功能说明](../../current-functionality.md)，本页不重复维护运行参数。

## 识别方案与资源比较

9 月 7 日先比较开源自托管，随后补充云端免费服务，最终按选择接入 Cloudflare Workers AI Whisper Large V3 Turbo。最初推荐本机 small 模型的意见仅是候选阶段的判断，不能由此推断生产服务器曾部署大型识别模型。

| 自托管候选 | 许可与资源依据 |
| --- | --- |
| Whisper 与 faster-whisper | Whisper 代码与权重及 faster-whisper 实现采用 MIT；多语言模型与仅英语的 .en 模型须区分。作者 v1.1.0 基准使用 13 分钟音频、Intel Core i7-12700K 和 8 线程，small INT8 耗时约 1 分 42 秒，内存 1477 MB，不能作为本站 VPS 或中文样本的实测。 |
| whisper.cpp | 实现为 MIT，提供 CPU 原生及 WebAssembly 路径。作者参考表中 tiny 为 75 MiB / 约 273 MB，base 为 142 MiB / 约 388 MB，small 为 466 MiB / 约 852 MB，分别表示模型文件与运行内存；量化格式和后端会影响实际资源。 |
| SenseVoiceSmall | 代码为 MIT，权重另遵守模型卡中的 FunASR Model Open Source License Agreement。中文、粤语、英语、日语与韩语支持及性能属于作者报告；第三方转换权重仍需核对对应许可。 |

这些研究没有测量生产服务器的 CPU 或可用内存，也没有以私人录音进行模型比较。免按分钟接口费仍需要计算和维护资源，固定硬件基准不能换算成本站的处理时长承诺。

## 2026-09-08 免费服务资料

| 服务 | 当时核对的条件与限制 |
| --- | --- |
| Cloudflare Workers AI Free | 每日 10000 Neurons，UTC 00:00 重置；Whisper Turbo 为 46.63 Neurons/音频分钟，全部额度只给这一模型时理论约 214 分钟。账户其他模型共享额度，不能将换算值当作本站保证；模型页美元数为 0.00051/分钟，统一表显示 0.0005，换算采用 Neurons 数据。 |
| Azure Speech F0 | Standard 与 Custom 实时识别共用每月 5 小时，默认并发为 1，不支持该层批量及快速转写。文件输入需沿实时 SDK 路径，压缩格式可能依赖解码或 GStreamer；注册地区、网络与中国区独立服务条件未实测。 |
| Groq Whisper | 当时价格页可读，限流及语音文档返回 HTTP 403，未核实免费额度，不沿用社区旧分钟数。 |

Cloudflare REST 可由现有服务器调用，无须把网站迁移到 Workers；账户配置步骤已归入[部署说明](../../../deploy/README.md#voice-transcription-configuration)。旧文中的“尚未取得授权”仅是当时状态，不覆盖后续已经完成的服务配置与用户确认。

9 月 9 日撤销了应用内每日 180 分钟预算与额度预留，旧锁状态迁移保留已经保存的文本，免费层限制交由平台执行。短时 402/429 根据冷却规则处理，失败不自动改用付费服务；早期“停用到次日”的实现不能恢复为当前规则。

## 播放与加载兼容

流式 WebM 录音可能缺少时长或可定位元数据，浏览器能够录制也不等于另一台设备能够解码。历史兼容方案保留原音频，另生成 `.playback-v1.m4a` AAC 文件；缓存体积约每分钟增加 0.5 MB 只是估算，失败不能发布截断文件或破坏原件，Docker 的 FFmpeg 依赖继续由部署配置维护。

播放启动须留在用户点按动作中，避免等待网络操作后丢失浏览器对声音播放的许可。全屏使用浏览器原生能力并尊重其他正在全屏的元素，输入编辑和中文组合状态不触发快捷键；印章字库提前加载并共享等待请求，字形准备好前保持透明布局，失败后允许重新请求。这些是兼容选择，详细按键与状态条件由现行代码及其检查维护。

印章曾使用 Long Cang 与 Protest Revolution 的搭配，该描述属于历史。实际中文印章来源及许可查阅[STAMP-SOURCES.txt](../../../public/fonts/task-stamp/STAMP-SOURCES.txt)和[崇羲篆体许可](../../../public/fonts/task-stamp/ChongxiSeal-LICENSE.txt)，不能将它们全部归为 OFL。

## 摇铃交互的演进

早期单次提示后来改为周期提醒；旧文的“不重复发送”及“先校验再显示”不作为新版推送规则。2026-09-08 的放置研究以提交 `5ab903bc45227ea46df7e34cb4701bba86b1103b` 为对照，保留控制器常驻、弹层焦点恢复和 reduced-motion 的设计理由，标题旁 44 像素按钮与静态图只属于当时布局。

Lucide BellRing 的 ISC 来源，以及 ARIA Button、Carbon actionable notifications 和 Slack 通知指南见下方来源表。手表持续震动和远程停止的能力限制保留在[首轮总体研究](priority-research-report-2026-09-07.md#12-持续摇铃)，实际远端配合事项只在需求表维护。

## 公开来源

以下链接保留原研究引用及其出处，本次整理没有重新在线核实价格、额度或服务可用性。

| 原研究 | 来源 |
| --- | --- |
| free-speech-recognition-2026-09-07.md | [OpenAI Whisper](https://github.com/openai/whisper) |
| free-speech-recognition-2026-09-07.md | [LICENSE](https://github.com/openai/whisper/blob/main/LICENSE) |
| free-speech-recognition-2026-09-07.md | [SYSTRAN faster-whisper](https://github.com/SYSTRAN/faster-whisper) |
| free-speech-recognition-2026-09-07.md | [LICENSE](https://github.com/SYSTRAN/faster-whisper/blob/master/LICENSE) |
| free-speech-recognition-2026-09-07.md | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |
| free-speech-recognition-2026-09-07.md | [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) |
| free-speech-services-2026-09-08.md | [Cloudflare Workers AI 计费和免费额度](https://developers.cloudflare.com/workers-ai/platform/pricing/) |
| free-speech-services-2026-09-08.md | [Whisper Large V3 Turbo 模型页](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/) |
| free-speech-services-2026-09-08.md | [Azure Speech 官方价格页](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/) |
| free-speech-services-2026-09-08.md | [Azure Speech 配额与限制](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits) |
| free-speech-services-2026-09-08.md | [Azure Speech 语言支持](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt) |
| free-speech-services-2026-09-08.md | [Speech SDK 压缩音频输入](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-codec-compressed-audio-input-streams) |
| free-speech-services-2026-09-08.md | [Groq 价格页](https://groq.com/pricing) |
| free-speech-services-2026-09-08.md | [限流文档](https://console.groq.com/docs/rate-limits) |
| free-speech-services-2026-09-08.md | [语音接口文档](https://console.groq.com/docs/speech-to-text) |
| free-speech-services-2026-09-08.md | [Cloudflare Workers AI REST API 入门](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) |
| room-bell-placement-research-2026-09-08.md | [Lucide：Bell Ring](https://lucide.dev/icons/bell-ring) |
| room-bell-placement-research-2026-09-08.md | [WAI-ARIA APG：Button Pattern](https://www.w3.org/WAI/ARIA/apg/patterns/button/) |
| room-bell-placement-research-2026-09-08.md | [MDN：prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-reduced-motion) |

## 原文索引

| 历史文档 | 固定版本 |
| --- | --- |
| free-speech-recognition-2026-09-07.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/free-speech-recognition-2026-09-07.md) |
| free-speech-services-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/free-speech-services-2026-09-08.md) |
| speech-transcription-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/speech-transcription-2026-09-08.md) |
| mobile-voice-playback-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/mobile-voice-playback-2026-09-08.md) |
| main-window-fullscreen-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/main-window-fullscreen-2026-09-08.md) |
| room-bell-2026-09-07.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/room-bell-2026-09-07.md) |
| room-bell-placement-research-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/room-bell-placement-research-2026-09-08.md) |
| stamp-font-preload-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/stamp-font-preload-2026-09-09.md) |
| stamp-speech-update-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/stamp-speech-update-2026-09-09.md) |
