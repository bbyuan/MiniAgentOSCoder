import { type Locale, type TranslationKey, translateKnownText, translateStatus } from "../i18n";

type Translator = (
  key: TranslationKey,
  variables?: Record<string, string | number>,
) => string;

export function localizeCompletionEvidence(
  evidence: string,
  passed: boolean,
  locale: Locale,
  t: Translator,
): string {
  if (locale === "en") return evidence;
  const changedFiles = evidence.match(/^Changed files: (.+)$/);
  if (changedFiles) return `变更文件：${changedFiles[1]}`;
  const verifiedExisting = evidence.match(/^Existing behavior verified after (\d+) successful inspection\(s\)$/);
  if (verifiedExisting) return `现有实现已通过 ${verifiedExisting[1]} 次源码检查`;
  const count = evidence.match(/^(\d+) (patch\(es\) applied|successful test run\(s\) after the latest patch|successful read-only inspection\(s\))$/);
  if (count) {
    if (count[2].startsWith("patch")) return `已应用 ${count[1]} 个补丁`;
    if (count[2].startsWith("successful test")) return `最新补丁后有 ${count[1]} 次测试成功`;
    return `已完成 ${count[1]} 次只读检查`;
  }
  const verifiedTests = evidence.match(/^(\d+) successful test run\(s\) verified the existing behavior$/);
  if (verifiedTests) return `现有实现已通过 ${verifiedTests[1]} 次测试验证`;
  return t(passed ? "completion.evidence.met" : "completion.evidence.missing");
}

export function localizeRuntimeError(error: string, locale: Locale): string {
  const knownProviderErrors: Array<[RegExp, string, string]> = [
    [/Model provider request timed out/i, "模型服务请求超时。", "Model provider request timed out."],
    [/Model provider network request failed/i, "模型服务网络请求失败。", "Model provider network request failed."],
    [/Model provider returned invalid JSON/i, "模型服务返回了无效 JSON。", "Model provider returned invalid JSON."],
    [/Model provider returned HTTP (\d+)/i, "模型服务返回了 HTTP 错误。", "Model provider returned an HTTP error."],
  ];
  for (const [pattern, zh, en] of knownProviderErrors) {
    if (pattern.test(error)) return locale === "zh" ? zh : en;
  }
  const transition = error.match(/^Cannot transition run .+ from (\w+) to (\w+)$/);
  if (!transition) return translateKnownText(locale, error);
  const from = translateStatus(locale, transition[1]);
  const to = translateStatus(locale, transition[2]);
  return locale === "zh" ? `运行阶段切换失败：${from} → ${to}` : `Run phase transition failed: ${from} → ${to}`;
}

export function localizeEvidenceDetail(detail: string, locale: Locale): string {
  if (locale === "en") return detail;
  return detail
    .replace("Context Pack is not available yet", "任务上下文尚未就绪")
    .replace("No test summary is available yet", "尚无测试摘要")
    .replace("No structured completion assessment yet", "尚无结构化完成验收")
    .replace("selected items", "个已选上下文项")
    .replace("tokens", "词元")
    .replace("protocol items", "个协议项")
    .replace("provider requests", "次真实模型请求")
    .replace("cache hits", "次缓存命中")
    .replace("responses", "次响应")
    .replace("tool calls", "次工具调用")
    .replace("rejected", "拒绝")
    .replace("policy evaluations", "次策略评估")
    .replace("approvals", "次审批")
    .replace("pending", "待处理")
    .replace("skill activations", "次项目规则激活")
    .replace("MCP calls", "次外部工具调用")
    .replace("hook events", "次自动检查事件")
    .replace("checks passed", "项检查通过")
    .replace("required checks failed", "项必需检查失败")
    .replace("Passed", "通过")
    .replace("Failed", "失败")
    .replace("Not run", "未运行")
    .replace("Not selected", "未选择")
    .replace("failed", "失败");
}

export function localizeEvidenceValue(value: string, locale: Locale): string {
  if (locale === "en") return value;
  return value
    .replace("passed", "通过")
    .replace("missing", "缺失")
    .replace("unknown", "未知");
}
