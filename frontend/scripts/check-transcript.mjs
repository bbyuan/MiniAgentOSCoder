import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workItemsSource = readFileSync(resolve(root, "src/activity/workItems.ts"), "utf8");
const activityFeedSource = readFileSync(resolve(root, "src/components/ActivityFeed.tsx"), "utf8");
const mainSource = readFileSync(resolve(root, "src/main.tsx"), "utf8");
const runSurfaceSource = readFileSync(resolve(root, "src/styles/run-surface.css"), "utf8");

const testableWorkItems = workItemsSource
  .replace(
    'import type { TraceEvent } from "../api/client";',
    'type TraceEvent = { event: string; time: string; payload: Record<string, unknown> };',
  )
  .replace(
    'import { type Locale, type TranslationKey, translateKnownText } from "../i18n";',
    [
      'type Locale = "en" | "zh";',
      "type TranslationKey = string;",
      "const translateKnownText = (_locale: Locale, value: string) => value;",
    ].join("\n"),
  );

const compiled = ts.transpileModule(testableWorkItems, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
});

const module = { exports: {} };
vm.runInNewContext(compiled.outputText, { module, exports: module.exports, console }, { filename: "workItems.cjs" });

const { buildWorkItems } = module.exports;
assert(typeof buildWorkItems === "function", "buildWorkItems should be executable in the transcript check.");

const t = (key, variables = {}) => {
  const dictionary = {
    "activity.actionDetail.readFile": "先读取相关文件，再决定下一步怎么改。",
    "activity.category.approval": "审批",
    "activity.category.change": "变更",
    "activity.category.command": "命令",
    "activity.category.file": "文件",
    "activity.category.guidance": "指令",
    "activity.category.result": "结果",
    "activity.category.system": "系统",
    "activity.category.thinking": "思考",
    "activity.categoryCount": "{label} {count}",
    "activity.detail.modelRequested": "正在让模型给出受约束的下一步动作。",
    "activity.fileLabel": "文件：",
    "activity.modelLabel": "模型：",
    "activity.title.modelRequested": "请求模型判断下一步",
    "activity.title.readFile": "读取 {path}",
    "workspaceFiles.pendingChanges": "待确认变更",
  };
  return (dictionary[key] ?? key).replace(/\{(\w+)\}/g, (_, name) => String(variables[name] ?? ""));
};

const resolvedItems = buildWorkItems([
  {
    event: "model.requested",
    time: "2026-09-01T09:21:33.000Z",
    payload: { step: 1, request: { model: "deepseek-v4-flash" } },
  },
  {
    event: "tool.executed",
    time: "2026-09-01T09:21:37.000Z",
    payload: {
      action: { action_id: "a1", type: "read_file", params: { path: "calculator.py" } },
      result: { output: "def add(left, right): ..." },
    },
  },
], "zh", t);

assert(resolvedItems.length === 1, "A resolved model request should collapse into the following concrete action.");
assert(resolvedItems[0].title === "读取 calculator.py", "The transcript should lead with the concrete file read.");
assert(resolvedItems[0].category === "file", "File reads should be categorized as file activity.");
assert(resolvedItems[0].chips.includes("文件：calculator.py"), "File metadata should remain visible after model request cleanup.");

const pendingItems = buildWorkItems([
  {
    event: "model.requested",
    time: "2026-09-01T09:21:33.000Z",
    payload: { step: 2, request: { model: "deepseek-v4-flash" } },
  },
], "zh", t);

assert(pendingItems.length === 1, "An unresolved model request should still be shown while the agent is thinking.");
assert(pendingItems[0].title === "请求模型判断下一步", "The active thinking state should stay visible.");
assert(pendingItems[0].category === "thinking", "Active model requests should be categorized as thinking activity.");
assert(pendingItems[0].chips.includes("模型：deepseek-v4-flash"), "Model metadata should stay attached to active thinking events.");

const patchItems = buildWorkItems([
  {
    event: "approval.requested",
    time: "2026-09-01T09:22:10.000Z",
    payload: {
      approval: {
        target: {
          tool: "apply_patch",
          patch: "--- a/calculator.py\n+++ b/calculator.py\n@@ -1 +1 @@\n-return 1\n+return 2\n",
          files: ["calculator.py"],
          additions: 1,
          deletions: 1,
        },
      },
    },
  },
], "zh", t);

assert(patchItems[0].category === "change", "Patch operations should be categorized as change activity.");
assert(patchItems[0].changeSet?.kind === "pending", "Patch approval events should carry a pending workspace change set.");
assert(patchItems[0].changeSet?.changedFiles[0] === "calculator.py", "Patch change sets should preserve changed file names.");

assert(/function MetadataChip/.test(activityFeedSource), "ActivityFeed should keep transcript metadata chips as a dedicated component.");
assert(activityFeedSource.includes("category-${item.category}"), "ActivityFeed should expose activity categories to the DOM.");
assert(activityFeedSource.includes("agentProcessLink"), "Patch activity items should offer a lightweight link to changed files.");
assert(activityFeedSource.includes("workBreakdown(workItems, t)"), "The transcript header should summarize activity categories.");
assert(
  activityFeedSource.includes("const match = chip.match(/^([^:：]+[:：])\\s*(.+)$/);"),
  "Metadata chips should split localized labels from values.",
);

assert(
  mainSource.indexOf('import "./styles/global.css";') < mainSource.indexOf('import "./styles/run-surface.css";'),
  "Run surface styles should load after global styles.",
);
assert(runSurfaceSource.includes("Run surface v6"), "Run surface overrides should be consolidated in the dedicated run surface stylesheet.");
assert(runSurfaceSource.includes("left: 14px;"), "The transcript rail should align with the visible icon column.");
assert(!runSurfaceSource.includes("margin-left: -37px"), "Timeline icons must not use negative offsets that clip at the card edge.");
assert(runSurfaceSource.includes(".agentProcessItem.category-command"), "Transcript categories should have visual hooks.");
assert(runSurfaceSource.includes(".agentProcessLink"), "Changed-file links should be styled inside the transcript.");
assert(runSurfaceSource.includes(".activityChips em code"), "Metadata chip values should have dedicated readable styling.");

console.log("transcript check passed");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
