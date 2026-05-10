"use strict";

const assert = require("assert");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");

const {
  collectSpecKitStatus,
  determineLegacyCompletion,
  determineLegacyPhase,
  determineLegacyWorkflow,
  deriveUserStoryStatus,
  extractFeatureId,
  parsePhaseDone,
  parseTaskStats,
  parseUserStories,
  parseUserStoryTaskStats
} = require("../src/specKitStatus");
const {
  KittScannerManager,
  resolveKittScannerExtension
} = require("../src/kittScannerManager");
const { buildNewFeaturePromptTemplate } = require("../src/newFeatureTemplate");

async function run() {
  assert.strictEqual(extractFeatureId("001-chat"), "001-chat");
  assert.strictEqual(extractFeatureId("feature/042-status-dashboard"), "042-status-dashboard");
  assert.strictEqual(extractFeatureId("main"), null);

  assert.strictEqual(
    determineLegacyPhase({
      hasConstitution: false,
      feature: null,
      hasSpec: false,
      hasPlan: false,
      hasTasks: false,
      taskStats: { total: 0, completed: 0 }
    }),
    "Setup"
  );

  assert.strictEqual(
    determineLegacyCompletion({
      hasConstitution: true,
      feature: { id: "001-status-dashboard" },
      hasSpec: true,
      hasPlan: true,
      hasTasks: true,
      taskStats: { total: 4, completed: 2 }
    }),
    83
  );

  assert.strictEqual(determineLegacyWorkflow("Specify"), "Foundation");
  assert.strictEqual(determineLegacyWorkflow("Implement"), "Implementation");
  assert.strictEqual(deriveUserStoryStatus({ total: 0, completed: 0 }), "No tasks");
  assert.strictEqual(deriveUserStoryStatus({ total: 2, completed: 0 }), "Not started");
  assert.strictEqual(deriveUserStoryStatus({ total: 2, completed: 1 }), "In progress");
  assert.strictEqual(deriveUserStoryStatus({ total: 2, completed: 2 }), "Completed");

  const fallbackRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec-kit-status-fallback-"));
  await fs.mkdir(path.join(fallbackRoot, ".specify", "memory"), { recursive: true });
  await fs.writeFile(path.join(fallbackRoot, ".specify", "memory", "constitution.md"), "# Constitution\n");
  await fs.mkdir(path.join(fallbackRoot, "specs", "001-status-dashboard"), { recursive: true });
  await fs.writeFile(
    path.join(fallbackRoot, "specs", "001-status-dashboard", "spec.md"),
    [
      "# Spec",
      "",
      "## User Story 1: View status",
      "",
      "Details",
      "",
      "## User Story 2: Refresh status",
      "",
      "More details"
    ].join("\n")
  );
  await fs.writeFile(path.join(fallbackRoot, "specs", "001-status-dashboard", "plan.md"), "# Plan\n");
  await fs.writeFile(
    path.join(fallbackRoot, "specs", "001-status-dashboard", "US1-view-status.md"),
    [
      "# View status",
      "",
      "- [x] Tree rendered",
      "- [ ] Status bar rendered"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(fallbackRoot, "specs", "001-status-dashboard", "US2-refresh-status.md"),
    [
      "# Refresh status",
      "",
      "- [x] Parse tasks",
      "- [ ] Refresh on changes"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(fallbackRoot, "specs", "001-status-dashboard", "tasks.md"),
    [
      "## User Story 1: View status",
      "- [x] Create tree view",
      "- [ ] Add status bar item",
      "",
      "## User Story 2: Refresh status",
      "- [x] Parse tasks",
      "- [ ] Refresh on changes"
    ].join("\n")
  );

  const taskStats = await parseTaskStats(path.join(fallbackRoot, "specs", "001-status-dashboard", "tasks.md"));
  assert.deepStrictEqual(taskStats, { total: 4, completed: 2 });
  const userStoryTaskStats = await parseUserStoryTaskStats(path.join(fallbackRoot, "specs", "001-status-dashboard", "tasks.md"));
  assert.deepStrictEqual(Object.fromEntries(userStoryTaskStats), {
    US1: { total: 2, completed: 1 },
    US2: { total: 2, completed: 1 }
  });
  const parsedUserStories = await parseUserStories(
    path.join(fallbackRoot, "specs", "001-status-dashboard"),
    path.join(fallbackRoot, "specs", "001-status-dashboard", "spec.md"),
    userStoryTaskStats
  );
  assert.deepStrictEqual(
    parsedUserStories.map((story) => ({
      id: story.id,
      title: story.title,
      status: story.status,
      totalTasks: story.totalTasks,
      completedTasks: story.completedTasks
    })),
    [
      {
        id: "US1",
        title: "View status",
        status: "In progress",
        totalTasks: 2,
        completedTasks: 1
      },
      {
        id: "US2",
        title: "Refresh status",
        status: "In progress",
        totalTasks: 2,
        completedTasks: 1
      }
    ]
  );
  assert.strictEqual(parsedUserStories[0].filePath, path.join(fallbackRoot, "specs", "001-status-dashboard", "US1-view-status.md"));

  const fallbackStatus = await collectSpecKitStatus(fallbackRoot, { preferGitBranchFeature: false });
  assert.strictEqual(fallbackStatus.feature, "001-status-dashboard");
  assert.strictEqual(fallbackStatus.phase, "Implement");
  assert.strictEqual(fallbackStatus.workflow, "Implementation");
  assert.strictEqual(fallbackStatus.completion, 83);
  assert.strictEqual(fallbackStatus.featureFilePath, path.join(fallbackRoot, "specs", "001-status-dashboard", "spec.md"));
  assert.deepStrictEqual(
    fallbackStatus.userStories.map((story) => ({
      id: story.id,
      status: story.status
    })),
    [
      { id: "US1", status: "In progress" },
      { id: "US2", status: "In progress" }
    ]
  );
  assert.strictEqual(fallbackStatus.userStories[0].filePath, path.join(fallbackRoot, "specs", "001-status-dashboard", "US1-view-status.md"));

  const configuredRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec-kit-status-configured-"));
  await fs.mkdir(path.join(configuredRoot, ".specify", "memory"), { recursive: true });
  await fs.mkdir(path.join(configuredRoot, ".specify", ".runtime"), { recursive: true });
  await fs.mkdir(path.join(configuredRoot, ".specify", "workflows", "speckit"), { recursive: true });
  await fs.writeFile(path.join(configuredRoot, ".specify", "memory", "constitution.md"), "# Constitution\n");
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "init-options.json"),
    JSON.stringify({
      integration: "copilot",
      branch_numbering: "sequential",
      speckit_version: "0.6.3.dev0"
    })
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "integration.json"),
    JSON.stringify({
      integration: "copilot",
      version: "0.6.3.dev0"
    })
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "feature.json"),
    JSON.stringify({
      feature_directory: "specs/003-local-api-server"
    })
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", ".runtime", "phase-done.txt"),
    "specification:1\n"
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "extensions.yml"),
    [
      "installed: []",
      "hooks:",
      "  before_clarify:",
      "  - extension: git",
      "    enabled: true",
      "  before_plan:",
      "  - extension: git",
      "    enabled: true",
      "  after_checklist_log:",
      "  - extension: git",
      "    enabled: true"
    ].join("\n")
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "workflows", "workflow-registry.json"),
    JSON.stringify({
      schema_version: "1.0",
      workflows: {
        speckit: {
          name: "Full SDD Cycle",
          version: "1.0.0",
          description: "Runs specify -> plan -> checklist -> tasks -> analyze -> implement with review gates",
          source: "catalog"
        }
      }
    })
  );
  await fs.writeFile(
    path.join(configuredRoot, ".specify", "workflows", "speckit", "workflow.yml"),
    [
      "workflow:",
      "  id: \"speckit\"",
      "  name: \"Full SDD Cycle\"",
      "  version: \"1.0.0\"",
      "  description: \"Runs specify -> plan -> checklist -> tasks -> analyze -> implement with review gates\"",
      "steps:",
      "  - id: specify",
      "    command: speckit.specify",
      "  - id: review-spec",
      "    type: gate",
      "  - id: plan",
      "    command: speckit.plan",
      "  - id: review-plan",
      "    type: gate",
      "  - id: checklist",
      "    command: speckit.checklist",
      "  - id: tasks",
      "    command: speckit.tasks",
      "  - id: analyze",
      "    command: speckit.analyze",
      "  - id: review-analysis",
      "    type: gate",
      "  - id: implement",
      "    command: speckit.implement"
    ].join("\n")
  );

  await fs.mkdir(path.join(configuredRoot, "specs", "003-local-api-server"), { recursive: true });
  await fs.writeFile(path.join(configuredRoot, "specs", "003-local-api-server", "spec.md"), "# Spec\n");

  const configuredStatus = await collectSpecKitStatus(configuredRoot, { preferGitBranchFeature: false });
  assert.strictEqual(configuredStatus.feature, "003-local-api-server");
  assert.strictEqual(configuredStatus.phase, "Planning");
  assert.strictEqual(configuredStatus.workflow, "Full SDD Cycle · copilot");
  assert.strictEqual(configuredStatus.completion, 16);
  assert.match(configuredStatus.workflowDetail, /Enabled hooks: 3/);
  assert.match(configuredStatus.featureDetail, /\.specify\/feature\.json/);

  const parsedPhaseDone = await parsePhaseDone(path.join(configuredRoot, ".specify", ".runtime", "phase-done.txt"));
  assert.deepStrictEqual(parsedPhaseDone, { specification: 1 });
  assert.match(buildNewFeaturePromptTemplate(), /# New Feature Prompt/);
  assert.match(buildNewFeaturePromptTemplate(), /\/speckit\.specify/);

  const customSpecsRoot = await fs.mkdtemp(path.join(os.tmpdir(), "spec-kit-status-custom-specs-"));
  await fs.mkdir(path.join(customSpecsRoot, ".specify", "memory"), { recursive: true });
  await fs.writeFile(path.join(customSpecsRoot, ".specify", "memory", "constitution.md"), "# Constitution\n");
  await fs.mkdir(path.join(customSpecsRoot, "product-specs", "007-custom-root"), { recursive: true });
  await fs.writeFile(path.join(customSpecsRoot, "product-specs", "007-custom-root", "spec.md"), "# Spec\n");
  const customStatus = await collectSpecKitStatus(customSpecsRoot, {
    preferGitBranchFeature: false,
    specsDirectory: "product-specs"
  });
  assert.strictEqual(customStatus.feature, "007-custom-root");

  const fallbackExtension = { id: "alt.publisher", packageJSON: { name: "kitt-scanner-statusbar" } };
  assert.strictEqual(
    resolveKittScannerExtension({
      getExtension() {
        return null;
      },
      all: [fallbackExtension]
    }),
    fallbackExtension
  );

  const updates = [];
  let scannerEnabled = false;
  let activationCount = 0;
  const controller = {
    async enable(target) {
      updates.push({ action: "enable", target });
      scannerEnabled = true;
      return true;
    },
    async disable(target) {
      updates.push({ action: "disable", target });
      scannerEnabled = false;
      return false;
    },
    isEnabled() {
      return scannerEnabled;
    }
  };

  const manager = new KittScannerManager({
    extensionsApi: {
      getExtension(extensionId) {
        assert.strictEqual(extensionId, "local.kitt-scanner-statusbar");
        return {
          isActive: false,
          async activate() {
            activationCount += 1;
            return controller;
          }
        };
      },
      all: []
    },
    configurationTarget: "workspace"
  });

  await manager.runTask(async () => {});
  assert.strictEqual(activationCount, 1);
  assert.deepStrictEqual(updates, [
    { action: "enable", target: "workspace" },
    { action: "disable", target: "workspace" }
  ]);

  await manager.beginActivity();
  await manager.beginActivity();
  await manager.endActivity();
  assert.deepStrictEqual(updates, [
    { action: "enable", target: "workspace" },
    { action: "disable", target: "workspace" },
    { action: "enable", target: "workspace" }
  ]);
  await manager.endActivity();
  assert.deepStrictEqual(updates, [
    { action: "enable", target: "workspace" },
    { action: "disable", target: "workspace" },
    { action: "enable", target: "workspace" },
    { action: "disable", target: "workspace" }
  ]);

  const preEnabledUpdates = [];
  const preEnabledManager = new KittScannerManager({
    extensionsApi: {
      getExtension() {
        return {
          isActive: true,
          exports: {
            async enable(target) {
              preEnabledUpdates.push({ action: "enable", target });
            },
            async disable(target) {
              preEnabledUpdates.push({ action: "disable", target });
            },
            isEnabled() {
              return true;
            }
          }
        };
      },
      all: []
    },
    configurationTarget: "workspace"
  });

  await preEnabledManager.runTask(async () => {});
  assert.deepStrictEqual(preEnabledUpdates, []);
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
