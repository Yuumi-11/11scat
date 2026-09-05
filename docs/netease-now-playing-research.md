# 网易云音乐播放状态同步可行性研究

更新时间：2026-09-05

## 结论

可以同步歌曲名称、歌手、播放/暂停状态和当前进度，但目前没有发现网易云音乐面向普通个人账号、可稳定读取“当前正在播放”状态的公开官方接口。推荐路径是 Windows 本机辅助程序读取系统媒体会话（GSMTC），再由用户主动连接到 11scat；不应把非官方网易云账号接口作为主方案。

## 能力对比

| 路径 | 歌曲/歌手 | 播放状态 | 当前进度 | 安装与登录 | 稳定性与风险 |
| --- | --- | --- | --- | --- | --- |
| 网易云官方开放平台 | 未找到面向个人当前播放状态的公开能力 | 未找到 | 未找到 | 通常需要平台应用资质 | 官方但当前能力不满足，不建议承诺 |
| 网易云网页版 + 浏览器扩展 | 可从页面或媒体元素读取 | 可读取 `paused`/播放事件 | 可读取 `currentTime`/`duration` | 需安装扩展；沿用网页版登录 | 中等，页面 DOM 改版会导致适配失效；扩展需申请站点权限 |
| 网易云桌面客户端 + Windows GSMTC 本机助手 | 客户端向系统媒体会话提供元数据时可读取 | 可读取播放/暂停 | 可读取时间线位置与总时长 | 需安装并运行轻量本机助手；无需交出网易云账号密码 | 推荐；不依赖网易云私有接口，风险最低。客户端未注册媒体会话时需降级提示 |
| 非官方网易云 API/抓包接口 | 常能读取账号、歌单、最近播放等 | 通常不能可靠表示本机实时状态 | 难以可靠获得连续进度 | 依赖登录 Cookie 或扫码登录 | 易失效、可能触发风控，不建议用于正式同步 |

## 网页版边界

网站自身不能跨域读取另一个 `music.163.com` 标签页的 DOM、音频元素或 Media Session 信息。Media Session API 是由媒体页面向浏览器/系统暴露自身元数据的接口，不提供给其他普通网页枚举和读取所有标签页播放状态的能力。因此网页版方案必须使用安装了 `music.163.com` 站点权限的浏览器扩展，由内容脚本读取歌曲信息、`HTMLMediaElement.paused`、`currentTime` 与 `duration`，再在用户明确开启同步后发送给 11scat。

## 桌面客户端边界

Windows 的 `GlobalSystemMediaTransportControlsSessionManager` 可以枚举当前系统媒体会话，并提供媒体属性、播放信息和时间线信息。若网易云桌面客户端当前版本正确注册系统媒体会话，本机助手即可读取：

- 标题与歌手；
- Playing / Paused 等状态；
- 当前时间、开始时间与结束时间；
- 会话变化和播放信息变化事件。

这一方案不需要网易云 Cookie，也不需要调用其私有接口。需要一个仅在本机运行的小程序，并由用户主动选择“向房间同步”。当网易云没有向 GSMTC 上报字段时，网站应显示“客户端未提供此信息”，而不是猜测。

## 推荐实现

1. 优先制作 Windows 本机助手，使用 GSMTC 读取媒体会话。
2. 助手只向 `study.11scat.xyz` 的已登录会话发送歌曲名、歌手、播放状态、进度和采样时间，不上传账号凭据或播放历史。
3. 网站通过现有房间数据通道广播状态；进度每 2—5 秒校准一次，前端在两次校准之间本地递增，暂停时停止。
4. 提供明确的开启/停止按钮和正在同步提示；默认关闭。
5. 若实测网易云客户端不稳定提供 GSMTC，再把浏览器扩展作为网页版备选，而不是转向非官方账号 API。

## 已核对的公开资料

- 网易云音乐开放平台：<https://developer.music.163.com/>
- Microsoft GSMTC Session Manager：<https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssessionmanager>
- MDN Media Session API：<https://developer.mozilla.org/en-US/docs/Web/API/Media_Session_API>
- Chrome 内容脚本与站点权限：<https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts>

上述页面于 2026-09-05 可访问。现阶段不承诺网易云官方接口能够提供完整实时同步；推荐先做 GSMTC 原型并在目标电脑上实测客户端字段覆盖率。
