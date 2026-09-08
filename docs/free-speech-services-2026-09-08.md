# 免费语音转文字服务补充调研

调研日期：2026-09-08。本报告补充可以调用的云端服务，开源模型自托管方案继续参见[此前报告](free-speech-recognition-2026-09-07.md)。本次只查阅公开资料，没有创建账户或上传用户语音，也未启用计费。

## 可以采用的免费服务

存在按日或按月刷新额度的云端识别服务，可以减少本项目服务器运行识别模型的负担；免费额度有限，并且需要账号、服务端密钥和可达的网络。本项目首先推荐评估 Cloudflare Workers AI 的 Whisper Large V3 Turbo，Azure Speech F0 可作为中文识别的对照。

| 服务 | 本次从官方资料核实的免费条件 | 对本项目的意义与限制 |
| --- | --- | --- |
| Cloudflare Workers AI，Whisper Large V3 Turbo | Free 计划每日 10,000 Neurons，UTC 00:00 重置；该模型价目表为每音频分钟 46.63 Neurons。额度用完后 Free 计划请求失败，需要升级付费计划才能超额使用。[1][2] | 若全部免费额度只供该模型使用，理论约 214 分钟/日，约 3.6 小时；这是按公开单价换算的参考上限，账号其他模型调用共享额度。可处理多语言语音，需用本站中文录音验证。 |
| Azure Speech，F0 免费层 | Standard/Custom 实时识别共用每月 5 小时免费音频额度，基础实时识别默认并发为 1；免费层不支持批量识别，快速转写也不在 F0 支持范围。[3][4] | 官方语言表包括普通话和粤语。已有文件可以通过 Speech SDK 的音频流识别，但要选实时识别路径，不能把 F0 当作任意长录音上传到批处理接口的免费额度；压缩音频可能需要本地解码或 GStreamer。[5][6] |
| Groq Whisper | 本次公开产品价格页可访问，但免费方案的限流页和语音接口文档返回 HTTP 403，无法核实当前账户免费额度。[7] | 保留候选，不把历史社区常见的分钟数或秒数写成当前保证。接入前需从本人控制台核对免费计划、模型限额和文件大小。 |

Cloudflare 的模型页显示每分钟价格为 0.00051 美元，统一价目表的美元栏显示为 0.0005，Neurons 栏显示 46.63；免费量换算采用统一价目表的 Neurons 数据，不能据四舍五入的美元价推算精确可用分钟数。价目表也列出少数要求支付方式的模型，目前列出的名单不含此 Whisper 模型；实际账号限制仍以控制台为准。[1][2]

Azure 的 5 小时是全球 Azure 页面列出的 F0 标准，并非新用户一次性赠送金额。本项目尚未验证具体注册地区、账号订阅资格，以及中国境内网络到所选区域的稳定性；中国区独立运营服务的条款不能从全球页面直接推定。

## 推荐接入方式

语音卡片增加“转文字”入口，用户点按后才向选定服务发送该音频，原语音继续保留。识别结果按附件编号和模型版本缓存，重复查看不再重复调用；服务端统一排队并记录当天额度，免费额度不足时显示稍后再试，不自动切换到付费服务。当前网站运行在 VPS，也可以通过 Cloudflare 官方 REST API 调用 Workers AI，无需先把整个网站迁移到 Workers。[8]

首轮建议只做手动转写，避免每次录音都产生识别请求。需要保留转写可能有误的提示，原文和修改后的文本应能区分。上线前使用获得同意的普通话、口音及课程术语样本进行对照，记录文字错误和处理时长；公式、代码和人名不能假定识别准确。

云端识别会把音频传给相应服务商。其数据处理、留存和地区条款需要按最终选定服务确认，不能因为免费或模型开源就声称音频不离开服务器。若要求音频不外传，则继续采用此前报告中的本机或自托管方案，但本机下载量、服务器内存和计算时间仍有成本。

## 本轮处理状态

已调研未实现，尚未选择实际服务账户并配置专用授权；本次语音修复不会自动将聊天音频提交给任何识别服务。推荐先评估 Cloudflare 免费方案，并以 Azure F0 验证中文效果；完成账号条件核查和样本测试后再决定正式接入。

## 来源

1. [Cloudflare Workers AI 计费和免费额度](https://developers.cloudflare.com/workers-ai/platform/pricing/)，核实免费层、每日额度、重置时刻及各模型 Neurons 用量。
2. [Whisper Large V3 Turbo 模型页](https://developers.cloudflare.com/workers-ai/models/whisper-large-v3-turbo/)，核实模型、语音转写参数和音频分钟计价。
3. [Azure Speech 官方价格页](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/)，核实 F0 每月 5 小时及 Standard/Custom 共用额度、Batch 不支持。
4. [Azure Speech 配额与限制](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits)，核实 F0 并发和批量、快速识别的限制。
5. [Azure Speech 语言支持](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support?tabs=stt)，核实普通话、粤语条目。
6. [Speech SDK 压缩音频输入](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/how-to-use-codec-compressed-audio-input-streams)，核实 MP4、Opus/OGG 等输入及解码依赖。
7. [Groq 价格页](https://groq.com/pricing)，[限流文档](https://console.groq.com/docs/rate-limits)与[语音接口文档](https://console.groq.com/docs/speech-to-text)。后两页本次请求被拒绝，不能提供当前免费额度承诺。
8. [Cloudflare Workers AI REST API 入门](https://developers.cloudflare.com/workers-ai/get-started/rest-api/)，核实使用账号编号和限定权限 API Token 从现有服务器调用的方式。
