import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workItemsSource = readFileSync(resolve(root, "src/activity/workItems.ts"), "utf8");
const activityFeedSource = readFileSync(resolve(root, "src/components/ActivityFeed.tsx"), "utf8");
const stylesSource = readFileSync(resolve(root, "src/styles/global.css"), "utf8");

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
    "activity.detail.modelRequested": "正在让模型给出受约束的下一步动作。",
    "activity.fileLabel": "文件：",
    "activity.modelLabel": "模型：",
    "activity.title.modelRequested": "请求模型判断下一步",
    "activity.title.readFile": "读取 {path}",
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
assert(pendingItems[0].chips.includes("模型：deepseek-v4-flash"), "Model metadata should stay attached to active thinking events.");

assert(/function MetadataChip/.test(activityFeedSource), "ActivityFeed should keep transcript metadata chips as a dedicated component.");
assert(
  activityFeedSource.includes("const match = chip.match(/^([^:：]+[:：])\\s*(.+)$/);"),
  "Metadata chips should split localized labels from values.",
);

const finalTranscriptStyles = stylesSource.slice(stylesSource.lastIndexOf("/* Round 4 polish: make the embedded agent transcript feel like one timeline. */"));
assert(finalTranscriptStyles.includes("left: 15px;"), "The transcript rail should align with the visible icon column.");
assert(!finalTranscriptStyles.includes("margin-left: -37px"), "Timeline icons must not use negative offsets that clip at the card edge.");
assert(finalTranscriptStyles.includes(".activityChips em code"), "Metadata chip values should have dedicated readable styling.");

console.log("transcript check passed");

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exit(1);
  }
}
