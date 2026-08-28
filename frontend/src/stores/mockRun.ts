export const mockRun = {
  project: "MiniAgentOSCoder",
  mode: "Bugfix",
  status: "Ready",
  budget: {
    modelCalls: 0,
    toolCalls: 0,
    tokens: "0 / 32k",
  },
  plan: [
    { title: "Scan workspace", state: "done" },
    { title: "Compile AgentContract", state: "done" },
    { title: "Build Context Pack", state: "active" },
    { title: "Generate Patch", state: "waiting" },
  ],
  contract: {
    effects: ["fs.read", "fs.write", "shell.exec", "test.run"],
    policies: ["patch approval", "path guard", "secret sensor"],
  },
  context: [
    { path: "openspec/project.md", reason: "project mission", tokens: 420 },
    { path: "AGENTS.md", reason: "development rules", tokens: 360 },
    { path: ".agent/skills.yaml", reason: "skill cards", tokens: 280 },
  ],
  diff: {
    files: 0,
    insertions: 0,
    deletions: 0,
    status: "No patch proposed",
  },
  tests: {
    command: "pytest",
    status: "Not run",
    passed: 0,
    failed: 0,
  },
  trace: [
    "runtime.created",
    "project.profile.loaded",
    "contract.compiled",
    "context.pack.started",
  ],
};
