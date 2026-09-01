import { translateKnownText, translateMode, translateStatus, type Locale } from "./i18n";

const headings: Record<string, string> = {
  "# MiniAgentOS Coder Run Report": "# MiniAgentOS Coder 运行报告",
  "## Outcome": "## 运行结果",
  "## Task": "## 用户任务",
  "## Final Answer": "## 最终答复",
  "## Completion Guard": "## 完成验收",
  "## Changes": "## 代码变更",
  "## Validation": "## 验证结果",
  "## Budget": "## 运行预算",
  "## Agent Contract": "## 执行契约",
  "## Prompt And Agent Roles": "## 提示词与智能体角色",
  "## Extensions": "## 项目能力",
  "## Context And Trace": "## 上下文与轨迹",
};

const labels: Array<[string, string]> = [
  ["Latest insertions/deletions", "最新增加/删除行数"],
  ["Trace events before report", "报告生成前轨迹"],
  ["Files in latest change", "最近变更文件数"],
  ["Current changed files", "当前变更文件"],
  ["MCP servers started", "已启动的外部工具服务"],
  ["Policy evaluations", "策略评估"],
  ["Context compactions", "上下文压缩次数"],
  ["Completion compactions", "完成条件压缩次数"],
  ["Repair attempts", "修复尝试次数"],
  ["Rolled back to", "已回滚至"],
  ["Applied patches", "已应用补丁数"],
  ["Patch artifact", "补丁工件"],
  ["Diff status", "变更状态"],
  ["Model calls", "模型调用"],
  ["Tool calls", "工具调用"],
  ["Input tokens", "输入词元"],
  ["Output tokens", "输出词元"],
  ["Total tokens", "总词元"],
  ["Config version", "配置版本"],
  ["Allowed effects", "允许的副作用"],
  ["Denied effects", "禁止的副作用"],
  ["Prompt layers", "提示词分层"],
  ["Reviewer checks", "审查智能体检查"],
  ["Verifier checks", "验证智能体检查"],
  ["Active skills", "已激活项目规则"],
  ["MCP tool calls", "外部工具调用"],
  ["Hook executions", "自动检查执行"],
  ["Selected context", "已选上下文"],
  ["Compressed context", "已压缩上下文"],
  ["Omitted context", "已省略上下文"],
  ["Context threshold", "上下文阈值"],
  ["Memory references", "记忆引用"],
  ["Memory recommendations", "记忆建议"],
  ["Sandbox executions", "沙箱执行"],
  ["Trace artifact", "轨迹文件"],
  ["Assessment", "验收结果"],
  ["Verdict", "结论"],
  ["Attempt", "尝试次数"],
  ["Summary", "摘要"],
  ["Generated", "生成时间"],
  ["Termination", "终止原因"],
  ["Status", "状态"],
  ["Mode", "模式"],
  ["Steps", "执行步骤"],
  ["Command", "命令"],
  ["Passed", "通过"],
  ["Failed", "失败"],
  ["Agent", "智能体"],
  ["Policies", "策略"],
  ["Run", "运行"],
];

export function localizeRunReport(content: string, locale: Locale): string {
  if (locale !== "zh") return content;
  return content.split("\n").map((line) => {
    if (headings[line]) return headings[line];
    if (line === "No final message was produced.") return "智能体未生成最终答复。";
    if (line === "This report is a deterministic summary. `trace.jsonl` remains the authoritative event record.") {
      return "本报告为确定性摘要，`trace.jsonl` 仍是具有权威性的完整事件记录。";
    }
    const bullet = line.startsWith("- ") ? "- " : "";
    const body = bullet ? line.slice(2) : line;
    const matched = labels.find(([label]) => body.startsWith(`${label}:`));
    let localized = matched ? `${bullet}${matched[1]}:${body.slice(matched[0].length + 1)}` : line;
    localized = localized.replace(/`([^`]+)`/g, (_match, value: string) => {
      const known = translateKnownText(locale, value);
      if (known !== value) return `\`${known}\``;
      const status = translateStatus(locale, value);
      if (status !== value) return `\`${status}\``;
      const mode = translateMode(locale, value);
      return `\`${mode}\``;
    });
    return localized
      .replace(/\b(\d[\d,]*) tokens\b/g, "$1 词元")
      .replace(/\bPrompt Cache\b/g, "提示缓存")
      .replace(/\bSandbox\b/g, "沙箱")
      .replace(/\bGuard\b/g, "安全检查")
      .replace(/\bSkills\b/g, "项目规则")
      .replace(/\bSkill\b/g, "项目规则")
      .replace(/\bHooks\b/g, "自动检查")
      .replace(/\bHook\b/g, "自动检查")
      .replace(/\bTrace\b/g, "轨迹")
      .replace(/\bDaemon\b/g, "后端服务")
      .replace(/\bProfile\b/g, "模型配置")
      .replace(/\bProvider\b/g, "模型服务")
      .replace(/\bAPI Key\b/g, "接口密钥")
      .replace(/\((\d+) denied\)/g, "（$1 次拒绝）");
  }).join("\n");
}
