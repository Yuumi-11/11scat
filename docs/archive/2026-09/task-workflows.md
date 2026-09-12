# 任务协作与兼容处理的历史依据

本页归并 2026-09-08 至 2026-09-10 的任务专题，保留设计变化的原因、外部接口证据及旧数据处理范围。整理依据为提交 `5714334a50c80adbe2d89a1b280cc5adff602c9c`，正文提到的当时状态不覆盖后续版本；现行操作统一查阅[当前功能说明](../../current-functionality.md)。

## 2026-09-08：认领取代跨账户移动

用户决定保留来源任务，以认领流程承接成员之间的协作，并取消早期移动、回退及核验界面。外部任务创建并非与网站数据提交同步完成，因此必须保存外部写入回执，遇到响应丢失先核对已知任务 ID；无法确定是否已成功创建时不得重复创建。

字段复制不能等同于提供方完整任务迁移。滴答原生附件、评论和专注历史继续留在来源任务，网站流程附件单独保存；旧发布者身份只可根据原始创建记录回填，不依据任务标题或当前执行者推测。

旧移动记录迁移覆盖所有状态的 `action=move` 记录，同时清理旧核验记录并释放 `stagedBy` 占用。缓冲任务、远端滴答任务、新认领流程和正常操作记录均在保留范围内，迁移仅由已登录成员的正常请求触发，启动检查和共享数据目录的候选容器不主动执行该迁移；这一决定不授权删除远端同名任务。

来源：[claim-approval-workflow-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/claim-approval-workflow-2026-09-08.md#L7)；[collaboration-simplification-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/collaboration-simplification-2026-09-08.md#L3)；[room-collaboration-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/room-collaboration-2026-09-08.md#L93)。

## 2026-09-08：创建回执与收集箱兼容事故

早期创建处理忽略批量接口返回的 `id2etag`，错误地继续使用请求提出的任务 ID，而提供方可能分配另一个实际 ID。测试接口沿用了请求 ID，因此未能暴露该问题；修正要求先保存提供方返回的实际 ID，再执行后续核对，外部写入前保存既有 ID 集合，并在含糊响应时限制再次创建。

操作记录的 `actorId` 表示实际发起请求的网站身份，不能改记为来源任务所有者。更新时间也不能冒充创建时间，旧记录缺少创建时间时保留缺失，避免产生虚构的历史顺序；已有未知任务不凭标题相同推定归属。

同一阶段发现，Open API 授权并不保证能够调用旧 V2 接口，收集箱响应也可能返回 `tasks` 和 `columns` 而没有 `project`。已取得的 HTTP 200 样本中有 24 个有效任务，且全部指向同一 `projectId`，因此严格要求 `project.id` 会拒绝实际有效的响应；只在任务项目 ID 一致时推导项目位置，并将缓存限制在对应授权账户内，不能使用跨账户共享的收集箱 ID。

这些材料证明了当时缺陷与修正的依据，不证明全部历史异常已在真实账户恢复。历史部署记录可追溯到提交 `55f64f469c74a20d30fbc246a04df1e1860329e0` 及 [对应部署运行](https://github.com/yuumiqwq/duo-space/actions/runs/34184847697)，生产重试或删除结果应另取实际操作证据。

来源：[room-collaboration-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/room-collaboration-2026-09-08.md#L71)。

## 2026-09-08 至 09-10：旧回执和身份权限的延续

自己的公共任务转入个人列表后作为普通任务处理，旧自取自审流程迁移保持滴答任务已有状态。未决创建、编辑或完成回执仍需保存，旧流程文件与历史回执不能因流程形式变化被一并丢弃。

安排任务的人并不自动获得审批权限，判断仍依赖来源所有者或发布者身份。完成重试需要同时检查当前请求者和最初请求者，旧越权回执不能因为现在有人重试而得到执行。

2026-09-10 的早期删除规则曾允许只删除单方任务，并保留另一方任务及流程。这段历史只用于解释旧回执授权：当前入口已改成整段流程删除，但旧单方删除回执不能扩张为删除另一方任务的新授权。

来源：[workflow-archive-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-archive-2026-09-08.md#L13)；[workflow-flexibility-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-flexibility-2026-09-08.md#L15)；[workflow-initiator-deletion-2026-09-10.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-initiator-deletion-2026-09-10.md#L3)。

## 2026-09-09：滴答状态查询的外部证据

当日调研依据为公开的[滴答 Open API 文档](https://developer.dida365.com/docs/openapi.md)，另有[官方文档入口](https://developer.dida365.com/docs#/openapi)。这是 2026-09-09 的接口证据记录，接口将来变化时应重新查证；读取公开文档及模拟接口测试均不能证明真实账户写入、真实双账户协作或设备推送送达已经验证。

| 当日接口依据 | 能证明的事项及限制 |
| --- | --- |
| `GET /project/{projectId}/task/{taskId}`；Task 模型 `status=0/2/-1` | 明确返回的任务状态可以作为未完成、完成或放弃的证据；404 与请求失败分别处理。 |
| `POST /task/completed`，最多 200 项 | 命中可提供完成证据，未命中不能证明任务不存在或未完成。 |
| `POST /task/filter`，最多 200 项；`GET /project` | 筛选未命中后，可列举可访问清单并按精确任务 ID 继续查询，不能仅凭标题认定任务移动。 |
| `POST /task/undone` 支持 `taskIds`，要求最长 14 天日期范围 | 无日期任务或范围外任务无法完整覆盖，此请求不适合作为通用存在性检查。 |
| `POST /task/move` | 说明存在移动能力，不能据此知道此前是否发生过移动，也不能代替变更通知。 |
| 批量更新接受含 `status` 的 Task 模型，单任务更新参数表未列主任务 `status` | 支持尝试批量恢复未完成，但必须读取核对结果；文档模型与模拟通过不等于真实账户已接受该写入。 |

当时采用共享筛选减少重复请求，仍需查找时每批最多并发 3 次详情读取。任一请求失败都保留为读取错误，不转换成任务缺失；重复任务已推进到下一日期时暂停相应自动动作，不能把下一次任务恢复成上一次，也没有据此实现历史实例重建。

这些研究支持已经建立的流程核对，不涵盖所有创建阶段故障。在整理依据提交 `5714334` 中，`creating` 阶段仍只查收集箱并拒绝已完成目标，用户已暂缓处理已知提前勾选案例；已经撤回的 `diagnoseWorkflow` 也不能作为现有诊断入口列入档案的能力清单，其请求会落入常规 GET 快照处理并可能发生写入。研究文档旧有的“双方补建”措辞不得继续用于当前只创建认领者滴答任务的公共认领流程。

来源：[workflow-sync-research-2026-09-09.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-sync-research-2026-09-09.md#L19)；现状边界以[当前功能说明](../../current-functionality.md)的流程核对说明为准，后续是否采用新方案须以相应版本为依据。历史验证不生成新的验收待办，需要成员或设备配合的项目只在[需求表](../../remaining-priority-requirements.md)维护。

## 2026-09-10：审批版本规则与音乐范围

用户明确取消“提交后任务内容或外部版本变化便阻止审批”的规则。权限检查、流程状态及重复任务完成结果不确定时的保护继续存在，需要补充成果时由审批人明确打回，再等待新提交。

用户同时取消独立音乐功能，包括其界面和接口，相关预览以及 Windows 桥接程序的源码、构建和下载包；网易云同步要求也随之取消。仓库历史和研究材料只作为历史依据，不构成待恢复功能，屏幕共享电脑音频仍在保留范围内，聊天语音、麦克风及通用实时通信不因该决定被移除。

来源：[workflow-approval-and-music-removal-2026-09-10.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-approval-and-music-removal-2026-09-10.md#L3)。

## 2026-09-09 至 09-10：附件、通知和目录读取的维护依据

描述附件先作为短期私有草稿保存，在任务保存成功后才公开，防止放弃编辑留下公开附件。删除链接后的清理也等待任务保存，并保留仍被当前任务共享引用的文件；旧附件只随实际引用变化处理，客户端提供的文件路径不能成为任意删除文件的权限。此机制使用网站链接，与滴答原生附件机制分开，流程成果附件也有独立生命周期。

编辑器把链接显示成行内附件时，继续保存兼容的 Markdown 链接，避免旧任务内容迁移。现行展示名称与预览规则由功能说明维护，不延续旧稿中图片原始文件名及其他附件另开页面的描述。

通知在网络发送前持久记录“已尝试”，目的是限制同一事件的重复尝试；进程在记录之后、发送之前中断时可能漏发，这是该取舍的实际代价。持久未读事件与推送结果分开维护，旧事件建立成员级基线，避免升级后大量补发；当前已读需要进入流程详情并看到事件，列表可见不等同于已读。

云盘曾在读取目录时自动创建 `chat/pics`，导致用户删除后目录重新出现。后续处理将目录创建放回实际导入操作，列目录本身不创建目录，这条事故依据用于防止读取操作再次改变用户的目录结构。

来源：[task-description-attachments-2026-09-10.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-description-attachments-2026-09-10.md#L7)；[task-inline-attachments-2026-09-10.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-inline-attachments-2026-09-10.md#L3)；[task-nudges-notifications-2026-09-09.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-nudges-notifications-2026-09-09.md#L15)；[cloud-drive-redesign-2026-09-08.md](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/cloud-drive-redesign-2026-09-08.md#L27)。

## 历史示意资料

以下图片只用于说明当时的设计，保留原位置和文件内容，不代表当前页面，也不证明真实账户或设备已验收。

| 主题 | 资料 |
| --- | --- |
| 早期协作及日历方案 | [协作区](../../images/room-collaboration-blackboard-2026-09-08.png)、[日历入口提案](../../images/room-calendar-entry-proposal-2026-09-08.png) |
| 同步与通知 | [恢复界面](../../assets/workflow-recovery-2026-09-09.png)、[外部勾选示意](../../assets/external-checkbox-2026-09-09.png)、[通知示意](../../assets/task-notifications-2026-09-09.png) |
| 云盘 | [当日界面示意](../../images/cloud-drive-redesign-2026-09-08.png) |

## 原始专题索引

操作流程的重复介绍已由现行功能说明承接，旧菜单和尺寸不继续独立维护。完整旧文可按固定提交追溯，设置和云盘的局部美术决定另见[教室设计历史](classroom-design.md)。

| 原专题 | 固定版本 |
| --- | --- |
| claim-approval-workflow-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/claim-approval-workflow-2026-09-08.md) |
| room-collaboration-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/room-collaboration-2026-09-08.md) |
| collaboration-simplification-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/collaboration-simplification-2026-09-08.md) |
| workflow-settings-layout-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-settings-layout-2026-09-09.md) |
| workflow-initiator-deletion-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-initiator-deletion-2026-09-10.md) |
| workflow-flexibility-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-flexibility-2026-09-08.md) |
| workflow-archive-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-archive-2026-09-08.md) |
| workflow-sync-research-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-sync-research-2026-09-09.md) |
| workflow-approval-and-music-removal-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/workflow-approval-and-music-removal-2026-09-10.md) |
| task-description-attachments-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-description-attachments-2026-09-10.md) |
| task-inline-attachments-2026-09-10.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-inline-attachments-2026-09-10.md) |
| task-nudges-notifications-2026-09-09.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/task-nudges-notifications-2026-09-09.md) |
| settings-menu-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/settings-menu-2026-09-08.md) |
| cloud-drive-redesign-2026-09-08.md | [原文](https://github.com/yuumiqwq/duo-space/blob/5714334a50c80adbe2d89a1b280cc5adff602c9c/docs/cloud-drive-redesign-2026-09-08.md) |
