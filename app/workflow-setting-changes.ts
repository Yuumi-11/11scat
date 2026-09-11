import type { TaskFields } from "./collaboration-types";
import { attachmentDisplayText } from "./task-description-attachments.ts";

export function workflowSettingChanges(before: TaskFields, after: TaskFields): string {
  const labels: Partial<Record<keyof TaskFields, string>> = { title: "标题", content: "说明", priority: "优先级", startDate: "开始时间", dueDate: "结束时间", isAllDay: "全天", timeZone: "时区", tags: "标签", repeatFlag: "重复", reminders: "提醒" };
  const display = (key: keyof TaskFields, value: unknown, fields: TaskFields): string => {
    if (key === "content") return attachmentDisplayText(String(value || "无")).replace(/\s+/g, " ");
    if (key === "priority") return ({ 0: "无", 1: "低", 3: "中", 5: "高" } as Record<string, string>)[String(value)] || String(value);
    if (key === "isAllDay") return value ? "是" : "否";
    if (key === "startDate" || key === "dueDate") {
      if (!value) return "无";
      return new Intl.DateTimeFormat("zh-CN", { timeZone: fields.timeZone || "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", ...(!fields.isAllDay ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}) }).format(new Date(String(value)));
    }
    if (key === "repeatFlag") {
      const match = /^RRULE:FREQ=(DAILY|WEEKLY|MONTHLY)(;INTERVAL=1)?$/.exec(String(value));
      return match ? ({ DAILY: "每天", WEEKLY: "每周", MONTHLY: "每月" } as Record<string, string>)[match[1]] : String(value || "不重复");
    }
    if (key === "reminders") return (value as string[]).map(item => ({ "TRIGGER:PT0S": "准时", "TRIGGER:-PT15M": "提前15分钟", "TRIGGER:-PT1H": "提前1小时" }[item] || item)).join("、") || "不提醒";
    if (Array.isArray(value)) return value.join("、") || "无";
    return String(value || "无").replace(/\s+/g, " ");
  };
  return (Object.keys(labels) as (keyof TaskFields)[]).filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key])).map(key => `${labels[key]}：${display(key, before[key], before)} → ${display(key, after[key], after)}`).join("\n") || "设置未变化";
}
