"use strict";

const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);
const FEATURE_PATTERN = /^\d+-[A-Za-z0-9._-]+$/;
const FEATURE_IN_BRANCH_PATTERN = /(\d+-[A-Za-z0-9._-]+)/;
const DEFAULT_WORKFLOW_STEPS = [
  { id: "specify", type: "command" },
  { id: "plan", type: "command" },
  { id: "tasks", type: "command" },
  { id: "implement", type: "command" }
];
const PHASE_LABELS = {
  specify: "Specification",
  clarify: "Clarification",
  plan: "Planning",
  checklist: "Checklist",
  tasks: "Task Generation",
  analyze: "Analysis",
  implement: "Implementation"
};
const STEP_WEIGHTS = {
  specify: 15,
  clarify: 5,
  "review-spec": 5,
  plan: 20,
  "review-plan": 5,
  checklist: 10,
  tasks: 15,
  analyze: 10,
  "review-analysis": 5,
  implement: 10
};
const PHASE_DONE_ALIASES = {
  specify: ["specify", "specification"],
  clarify: ["clarify", "clarification"],
  plan: ["plan", "planning"],
  checklist: ["checklist"],
  tasks: ["tasks", "task"],
  analyze: ["analyze", "analysis"],
  implement: ["implement", "implementation"]
};

async function collectSpecKitStatus(rootPath, options = {}) {
  const context = await buildStatusContext(rootPath, options);
  const hasConfiguredWorkflow = Boolean(context.workflowConfig?.steps?.length);
  const phase = hasConfiguredWorkflow
    ? determineConfiguredPhase(context)
    : determineLegacyPhase(context);
  const workflow = hasConfiguredWorkflow
    ? buildWorkflowLabel(context)
    : determineLegacyWorkflow(phase);
  const completion = hasConfiguredWorkflow
    ? determineConfiguredCompletion(context)
    : determineLegacyCompletion(context);

  return {
    phase,
    workflow,
    feature: context.feature?.id ?? "No active feature",
    completion,
    phaseDetail: hasConfiguredWorkflow
      ? buildConfiguredPhaseDetail(context, phase)
      : buildLegacyPhaseDetail(context, phase),
    workflowDetail: hasConfiguredWorkflow
      ? buildWorkflowDetail(context)
      : `${workflow} workflow inferred from the available Spec Kit artifacts.`,
    featureDetail: buildFeatureDetail(context),
    featureFilePath: context.files?.spec ?? null,
    completionDetail: hasConfiguredWorkflow
      ? buildConfiguredCompletionDetail(context, completion)
      : buildLegacyCompletionDetail(context, completion),
    userStories: context.userStories
  };
}

async function buildStatusContext(rootPath, options) {
  const gitBranch = await getGitBranch(rootPath);
  const initOptions = await readJsonOptional(path.join(rootPath, ".specify", "init-options.json"));
  const featureConfig = await readJsonOptional(path.join(rootPath, ".specify", "feature.json"));
  const integrationConfig = await readJsonOptional(path.join(rootPath, ".specify", "integration.json"));
  const workflowConfig = await loadWorkflowConfig(rootPath);
  const hooksSummary = await parseExtensionsHooks(path.join(rootPath, ".specify", "extensions.yml"));
  const phaseDone = await parsePhaseDone(path.join(rootPath, ".specify", ".runtime", "phase-done.txt"));
  const feature = await detectFeature(rootPath, options, featureConfig, gitBranch);

  const files = feature?.directory
    ? {
        spec: path.join(feature.directory, "spec.md"),
        plan: path.join(feature.directory, "plan.md"),
        tasks: path.join(feature.directory, "tasks.md"),
        research: path.join(feature.directory, "research.md"),
        dataModel: path.join(feature.directory, "data-model.md"),
        quickstart: path.join(feature.directory, "quickstart.md"),
        checklistsDir: path.join(feature.directory, "checklists"),
        contractsDir: path.join(feature.directory, "contracts")
      }
    : null;

  const hasConstitution = await exists(path.join(rootPath, ".specify", "memory", "constitution.md"));
  const hasSpec = files ? await exists(files.spec) : false;
  const hasPlan = files ? await exists(files.plan) : false;
  const hasTasks = files ? await exists(files.tasks) : false;
  const hasResearch = files ? await exists(files.research) : false;
  const hasDataModel = files ? await exists(files.dataModel) : false;
  const hasQuickstart = files ? await exists(files.quickstart) : false;
  const taskStats = hasTasks ? await parseTaskStats(files.tasks) : emptyStats();
  const userStoryTaskStats = hasTasks ? await parseUserStoryTaskStats(files.tasks) : new Map();
  const userStories = feature?.directory
    ? await parseUserStories(feature.directory, files?.spec ?? null, userStoryTaskStats)
    : [];
  const checklistStats = files ? await parseChecklistDirectory(files.checklistsDir) : emptyStatsWithFiles();
  const contractStats = files ? await countFiles(files.contractsDir) : { fileCount: 0 };

  return {
    rootPath,
    gitBranch,
    initOptions,
    integrationConfig,
    workflowConfig,
    hooksSummary,
    phaseDone,
    feature,
    files,
    hasConstitution,
    hasSpec,
    hasPlan,
    hasTasks,
    hasResearch,
    hasDataModel,
    hasQuickstart,
    taskStats,
    userStories,
    checklistStats,
    contractStats
  };
}

function determineConfiguredPhase(context) {
  if (!context.hasConstitution) {
    return "Setup";
  }

  const workflowSteps = getWorkflowSteps(context);
  for (const step of workflowSteps) {
    if (isGateStep(step) || !PHASE_LABELS[step.id]) {
      continue;
    }

    const progress = getStepProgress(step.id, context);
    if (step.id === "implement") {
      return progress >= 1 ? "Complete" : PHASE_LABELS[step.id];
    }
    if (progress < 1) {
      return PHASE_LABELS[step.id];
    }
  }

  if (context.hasTasks && context.taskStats.total > 0 && context.taskStats.completed < context.taskStats.total) {
    return "Implementation";
  }

  return "Complete";
}

function determineLegacyPhase(context) {
  if (!context.hasConstitution) {
    return "Setup";
  }

  if (!context.feature || !context.hasSpec) {
    return "Specify";
  }

  if (!context.hasPlan) {
    return "Specify";
  }

  if (!context.hasTasks) {
    return "Plan";
  }

  if (context.taskStats.total === 0) {
    return "Tasks";
  }

  if (context.taskStats.completed < context.taskStats.total) {
    return "Implement";
  }

  return "Complete";
}

function determineLegacyWorkflow(phase) {
  if (phase === "Setup" || phase === "Specify") {
    return "Foundation";
  }

  return "Implementation";
}

function determineConfiguredCompletion(context) {
  if (!context.hasConstitution) {
    return 0;
  }

  const workflowSteps = getWorkflowSteps(context);
  const weightedSteps = workflowSteps.filter((step) => STEP_WEIGHTS[step.id] || !isGateStep(step));
  let totalWeight = 0;
  let completedWeight = 0;

  for (const step of weightedSteps) {
    const weight = STEP_WEIGHTS[step.id] ?? 10;
    totalWeight += weight;
    completedWeight += weight * clamp(getStepProgress(step.id, context), 0, 1);
  }

  if (totalWeight === 0) {
    return 0;
  }

  return Math.round((completedWeight / totalWeight) * 100);
}

function determineLegacyCompletion(context) {
  if (!context.hasConstitution) {
    return 0;
  }

  if (!context.feature) {
    return 15;
  }

  if (!context.hasSpec) {
    return 20;
  }

  if (!context.hasPlan) {
    return 35;
  }

  if (!context.hasTasks) {
    return 55;
  }

  if (context.taskStats.total === 0) {
    return 65;
  }

  const taskRatio = context.taskStats.completed / context.taskStats.total;
  return Math.min(100, 65 + Math.round(taskRatio * 35));
}

function getStepProgress(stepId, context) {
  const state = deriveWorkflowState(context);

  switch (stepId) {
    case "specify":
      if (context.hasSpec) {
        return 1;
      }
      return hasPhaseDone(context.phaseDone, "specify") ? 0.75 : 0;
    case "clarify":
      if (hasPhaseDone(context.phaseDone, "clarify") || state.reviewSpecPassed || state.planStarted) {
        return 1;
      }
      return 0;
    case "review-spec":
      return state.reviewSpecPassed ? 1 : 0;
    case "plan":
      if (state.planAdvanced) {
        return 1;
      }
      return getPlanningArtifactScore(context);
    case "review-plan":
      return state.reviewPlanPassed ? 1 : 0;
    case "checklist":
      if (state.checklistAdvanced) {
        return 1;
      }
      return context.checklistStats.fileCount > 0 ? 1 : 0;
    case "tasks":
      if (state.tasksAdvanced) {
        return 1;
      }
      if (!context.hasTasks) {
        return 0;
      }
      return context.taskStats.total > 0 ? 1 : 0.75;
    case "analyze":
      return state.analysisDone ? 1 : 0;
    case "review-analysis":
      return state.reviewAnalysisPassed ? 1 : 0;
    case "implement":
      if (hasPhaseDone(context.phaseDone, "implement") && !context.hasTasks) {
        return 1;
      }
      if (!context.hasTasks) {
        return 0;
      }
      if (context.taskStats.total === 0) {
        return state.implementationStarted ? 0.25 : 0;
      }
      return context.taskStats.completed / context.taskStats.total;
    default:
      return isGateStep({ id: stepId }) ? 0 : 0;
  }
}

function deriveWorkflowState(context) {
  const implementationStarted =
    hasPhaseDone(context.phaseDone, "implement") ||
    (context.taskStats.total > 0 && context.taskStats.completed > 0);
  const allTasksComplete = context.hasTasks &&
    context.taskStats.total > 0 &&
    context.taskStats.completed >= context.taskStats.total;
  const tasksGenerated = context.hasTasks || hasPhaseDone(context.phaseDone, "tasks") || implementationStarted;
  const checklistGenerated =
    context.checklistStats.fileCount > 0 ||
    hasPhaseDone(context.phaseDone, "checklist") ||
    tasksGenerated;
  const planStarted = context.hasPlan || hasPhaseDone(context.phaseDone, "plan");
  const planAdvanced = tasksGenerated || checklistGenerated || planStarted;
  const reviewSpecPassed = planStarted || checklistGenerated || tasksGenerated;
  const reviewPlanPassed = checklistGenerated || tasksGenerated || implementationStarted;
  const analysisDone = hasPhaseDone(context.phaseDone, "analyze") || implementationStarted || allTasksComplete;
  const reviewAnalysisPassed = implementationStarted || allTasksComplete;

  return {
    implementationStarted,
    allTasksComplete,
    tasksGenerated,
    checklistGenerated,
    checklistAdvanced: checklistGenerated,
    tasksAdvanced: tasksGenerated,
    planStarted,
    planAdvanced,
    reviewSpecPassed,
    reviewPlanPassed,
    analysisDone,
    reviewAnalysisPassed
  };
}

function getPlanningArtifactScore(context) {
  if (!context.hasPlan) {
    return 0;
  }

  if (context.hasTasks || hasPhaseDone(context.phaseDone, "tasks")) {
    return 1;
  }

  const artifacts = [
    context.hasPlan,
    context.hasResearch,
    context.hasDataModel,
    context.hasQuickstart
  ];
  const presentCount = artifacts.filter(Boolean).length;
  let score = presentCount / artifacts.length;

  if (hasPhaseDone(context.phaseDone, "plan")) {
    score = Math.max(score, 0.75);
  }

  return score;
}

function buildWorkflowLabel(context) {
  const name = context.workflowConfig?.name ?? "Spec Kit";
  const integration = context.integrationConfig?.integration ?? context.initOptions?.integration;
  return integration ? `${name} · ${integration}` : name;
}

function buildWorkflowDetail(context) {
  const steps = getWorkflowSteps(context).map((step) => step.id).join(" -> ");
  const hooks = context.hooksSummary.enabledHookCount;
  const branchNumbering = context.initOptions?.branch_numbering ?? "unknown";
  const version = context.workflowConfig?.version ?? context.initOptions?.speckit_version ?? "unknown";
  const clarifySuffix = context.hooksSummary.hasClarify
    ? " Optional clarify hooks are configured."
    : "";

  return [
    context.workflowConfig?.description ?? "Configured Spec Kit workflow.",
    `Steps: ${steps}.`,
    `Spec Kit version: ${version}. Branch numbering: ${branchNumbering}. Enabled hooks: ${hooks}.${clarifySuffix}`
  ].join(" ");
}

function buildFeatureDetail(context) {
  if (!context.feature) {
    return "No active Spec Kit feature was detected from .specify/feature.json, the environment, git, or the specs directory.";
  }

  const pieces = [`Detected from ${context.feature.source}.`];
  if (context.feature.relativeDirectory) {
    pieces.push(`Directory: ${context.feature.relativeDirectory}.`);
  }
  if (context.gitBranch) {
    pieces.push(`Current git branch: ${context.gitBranch}.`);
  }
  return pieces.join(" ");
}

function buildConfiguredPhaseDetail(context, phase) {
  switch (phase) {
    case "Setup":
      return "Create .specify/memory/constitution.md to initialize Spec Kit governance.";
    case "Specification":
      return context.hasSpec
        ? "Specification exists, but the configured workflow has not advanced beyond the specification phase yet."
        : "Create the current feature spec with /speckit.specify.";
    case "Clarification":
      return "Clarification hooks are configured; run /speckit.clarify if the spec still has open ambiguities before planning.";
    case "Planning": {
      const planningArtifacts = [
        context.hasPlan ? "plan.md" : null,
        context.hasResearch ? "research.md" : null,
        context.hasDataModel ? "data-model.md" : null,
        context.hasQuickstart ? "quickstart.md" : null
      ].filter(Boolean);
      return `${planningArtifacts.length}/4 core planning artifacts are present for the active feature.`;
    }
    case "Checklist":
      return context.checklistStats.fileCount > 0
        ? `${context.checklistStats.fileCount} checklist file(s) detected for the active feature.`
        : "No feature checklists were found under checklists/ yet.";
    case "Task Generation":
      return context.hasTasks
        ? `tasks.md exists with ${context.taskStats.total} tracked tasks.`
        : "Generate tasks.md to prepare the implementation plan for execution.";
    case "Analysis":
      return "The configured workflow includes an analysis phase after task generation. Implementation has not started yet, so analysis is treated as the current phase.";
    case "Implementation":
      if (context.taskStats.total > 0) {
        return `${context.taskStats.completed}/${context.taskStats.total} implementation tasks are checked off.`;
      }
      return "Implementation has started, but no task checkboxes were detected in tasks.md.";
    case "Complete":
      return "The configured workflow artifacts are present and all tracked implementation tasks are complete.";
    default:
      return `Current phase: ${phase}.`;
  }
}

function buildLegacyPhaseDetail(context, phase) {
  if (phase === "Setup") {
    return "Create .specify/memory/constitution.md to initialize Spec Kit governance.";
  }

  if (phase === "Specify") {
    if (!context.hasSpec) {
      return "Create the current feature spec with /speckit.specify.";
    }

    if (!context.hasPlan) {
      return "Specification exists; the next major artifact is plan.md.";
    }
  }

  if (phase === "Plan") {
    return "Plan exists; generate tasks.md to begin tracked implementation.";
  }

  if (phase === "Tasks") {
    return "tasks.md exists but no task checkboxes were found yet.";
  }

  if (phase === "Implement") {
    return `${context.taskStats.completed}/${context.taskStats.total} tasks checked off in tasks.md.`;
  }

  if (phase === "Complete") {
    return "All tracked tasks are checked off for the active feature.";
  }

  return `Constitution: ${context.hasConstitution}, spec: ${context.hasSpec}, plan: ${context.hasPlan}, tasks: ${context.hasTasks}.`;
}

function buildConfiguredCompletionDetail(context, completion) {
  const planningArtifacts = [
    context.hasPlan,
    context.hasResearch,
    context.hasDataModel,
    context.hasQuickstart
  ].filter(Boolean).length;
  const detailParts = [
    `Workflow completion: ${completion}%.`,
    `Planning artifacts: ${planningArtifacts}/4.`,
    `Checklist files: ${context.checklistStats.fileCount}.`,
    `Tasks complete: ${context.taskStats.completed}/${context.taskStats.total}.`
  ];

  if (context.contractStats.fileCount > 0) {
    detailParts.push(`Contracts detected: ${context.contractStats.fileCount}.`);
  }

  return detailParts.join(" ");
}

function buildLegacyCompletionDetail(context, completion) {
  if (context.hasTasks && context.taskStats.total > 0) {
    return `${context.taskStats.completed}/${context.taskStats.total} tasks complete. Overall progress: ${completion}%.`;
  }

  return `Progress is estimated from Spec Kit artifact milestones. Overall progress: ${completion}%.`;
}

async function detectFeature(rootPath, options = {}, featureConfig = null, gitBranch = null) {
  const specsRoot = resolveSpecsRoot(rootPath, options.specsDirectory);
  const envFeatureDirectory = process.env.SPECIFY_FEATURE_DIRECTORY;
  if (envFeatureDirectory) {
    return createFeatureFromDirectory(rootPath, envFeatureDirectory, "SPECIFY_FEATURE_DIRECTORY");
  }

  if (featureConfig?.feature_directory) {
    return createFeatureFromDirectory(rootPath, featureConfig.feature_directory, ".specify/feature.json");
  }

  if (options.preferGitBranchFeature !== false) {
    const featureId = extractFeatureId(gitBranch);
    if (featureId) {
      return createFeatureFromDirectory(specsRoot, path.join(specsRoot, featureId), `git branch "${gitBranch}"`, rootPath);
    }
  }

  return getLatestFeature(specsRoot, rootPath);
}

function createFeatureFromDirectory(basePath, featureDirectory, source, rootPath = basePath) {
  const directory = path.isAbsolute(featureDirectory)
    ? path.normalize(featureDirectory)
    : path.resolve(basePath, featureDirectory);
  return {
    id: path.basename(directory),
    source,
    directory,
    relativeDirectory: normalizeRelativePath(rootPath, directory)
  };
}

async function loadWorkflowConfig(rootPath) {
  const registry = await readJsonOptional(path.join(rootPath, ".specify", "workflows", "workflow-registry.json"));
  const registryEntries = registry?.workflows ? Object.entries(registry.workflows) : [];
  const candidates = [];

  for (const [workflowId, workflowEntry] of registryEntries) {
    candidates.push({
      id: workflowId,
      source: workflowEntry.source,
      url: workflowEntry.url,
      path: path.join(rootPath, ".specify", "workflows", workflowId, "workflow.yml")
    });
  }

  candidates.push({
    id: "speckit",
    source: "workspace",
    url: null,
    path: path.join(rootPath, ".specify", "workflows", "speckit", "workflow.yml")
  });

  for (const candidate of candidates) {
    if (!(await exists(candidate.path))) {
      continue;
    }

    const parsed = await parseWorkflowYaml(candidate.path);
    if (parsed) {
      return {
        ...parsed,
        source: candidate.source ?? parsed.source ?? "workspace",
        url: candidate.url ?? null
      };
    }
  }

  return null;
}

async function parseWorkflowYaml(workflowPath) {
  const content = await readTextOptional(workflowPath);
  if (!content) {
    return null;
  }

  const workflow = {
    id: null,
    name: null,
    version: null,
    description: null,
    steps: []
  };
  const lines = content.split(/\r?\n/);
  let section = null;
  let currentStep = null;

  for (const line of lines) {
    if (/^workflow:\s*$/.test(line)) {
      section = "workflow";
      currentStep = null;
      continue;
    }

    if (/^steps:\s*$/.test(line)) {
      section = "steps";
      currentStep = null;
      continue;
    }

    if (/^\S/.test(line) && !/^workflow:\s*$/.test(line) && !/^steps:\s*$/.test(line)) {
      section = null;
      currentStep = null;
    }

    if (section === "workflow") {
      const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.+?)\s*$/);
      if (match) {
        workflow[match[1]] = stripYamlValue(match[2]);
      }
      continue;
    }

    if (section === "steps") {
      const idMatch = line.match(/^\s*-\s+id:\s*(.+?)\s*$/);
      if (idMatch) {
        currentStep = { id: stripYamlValue(idMatch[1]), type: "command" };
        workflow.steps.push(currentStep);
        continue;
      }

      if (!currentStep) {
        continue;
      }

      const typeMatch = line.match(/^\s+type:\s*(.+?)\s*$/);
      if (typeMatch) {
        currentStep.type = stripYamlValue(typeMatch[1]);
      }
    }
  }

  return workflow.steps.length > 0 ? workflow : null;
}

async function parseExtensionsHooks(extensionsPath) {
  const content = await readTextOptional(extensionsPath);
  if (!content) {
    return { enabledHookCount: 0, hookEvents: [], hasClarify: false };
  }

  const lines = content.split(/\r?\n/);
  const hookEvents = [];
  let inHooks = false;

  for (const line of lines) {
    if (/^hooks:\s*$/.test(line)) {
      inHooks = true;
      continue;
    }

    if (inHooks && /^[A-Za-z0-9_-]+:\s*$/.test(line)) {
      inHooks = false;
    }

    if (!inHooks) {
      continue;
    }

    const hookMatch = line.match(/^  ([A-Za-z0-9_-]+):\s*$/);
    if (hookMatch) {
      hookEvents.push(hookMatch[1]);
    }
  }

  return {
    enabledHookCount: (content.match(/enabled:\s*true/g) ?? []).length,
    hookEvents,
    hasClarify: hookEvents.includes("before_clarify") || hookEvents.includes("after_clarify")
  };
}

async function parsePhaseDone(phasePath) {
  const content = await readTextOptional(phasePath);
  if (!content) {
    return {};
  }

  const result = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_-]+)\s*:\s*(\d+)\s*$/);
    if (match) {
      result[match[1].toLowerCase()] = Number.parseInt(match[2], 10);
    }
  }
  return result;
}

function hasPhaseDone(phaseDone, phaseName) {
  const aliases = PHASE_DONE_ALIASES[phaseName] ?? [phaseName];
  return aliases.some((alias) => (phaseDone[alias] ?? 0) > 0);
}

function getWorkflowSteps(context) {
  if (context.workflowConfig?.steps?.length) {
    return context.workflowConfig.steps;
  }
  return DEFAULT_WORKFLOW_STEPS;
}

function isGateStep(step) {
  return step.type === "gate" || step.id.startsWith("review-");
}

async function getGitBranch(rootPath) {
  try {
    const result = await execFileAsync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      cwd: rootPath,
      timeout: 1500,
      windowsHide: true
    });
    const branchName = result.stdout.trim();
    if (!branchName || branchName === "HEAD") {
      return null;
    }
    return branchName;
  } catch {
    return null;
  }
}

function extractFeatureId(branchName) {
  if (!branchName) {
    return null;
  }

  const match = branchName.match(FEATURE_IN_BRANCH_PATTERN);
  return match ? match[1] : null;
}

async function getLatestFeature(specsRoot, rootPath) {
  if (!(await isDirectory(specsRoot))) {
    return null;
  }

  const entries = await fs.readdir(specsRoot, { withFileTypes: true });
  const candidates = [];

  for (const entry of entries) {
    if (!entry.isDirectory() || !FEATURE_PATTERN.test(entry.name)) {
      continue;
    }

    const directory = path.join(specsRoot, entry.name);
    const stats = await fs.stat(directory);
    const featureNumber = Number.parseInt(entry.name.split("-")[0], 10);
    candidates.push({
      id: entry.name,
      source: "the latest specs directory",
      directory,
      relativeDirectory: normalizeRelativePath(rootPath, directory),
      featureNumber,
      modifiedTime: stats.mtimeMs
    });
  }

  candidates.sort((left, right) => {
    if (right.featureNumber !== left.featureNumber) {
      return right.featureNumber - left.featureNumber;
    }
    return right.modifiedTime - left.modifiedTime;
  });

  return candidates[0] ?? null;
}

async function parseTaskStats(tasksPath) {
  return parseMarkdownChecklistStats(tasksPath);
}

async function parseUserStories(featureDirectory, specPath, userStoryTaskStats = new Map()) {
  const storyFiles = await findUserStoryFiles(featureDirectory);
  if (storyFiles.length > 0) {
    return Promise.all(storyFiles.map((filePath) => parseUserStoryFile(filePath, userStoryTaskStats)));
  }

  if (!specPath) {
    return [];
  }

  const content = await fs.readFile(specPath, "utf8");
  const lines = content.split(/\r?\n/);
  const userStories = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = matchUserStoryHeading(lines[index]);
    if (!match) {
      continue;
    }

    const id = `US${match.storyNumber}`;
    const stats = userStoryTaskStats.get(id) ?? emptyStats();
    userStories.push({
      id,
      title: match.title || id,
      filePath: specPath,
      line: index + 1,
      totalTasks: stats.total,
      completedTasks: stats.completed,
      status: deriveUserStoryStatus(stats)
    });
  }

  return userStories;
}

async function parseUserStoryFile(filePath, userStoryTaskStats) {
  const content = await fs.readFile(filePath, "utf8");
  const lines = content.split(/\r?\n/);
  const userStoryId = extractUserStoryIdFromFileName(path.basename(filePath));
  const headingLineIndex = lines.findIndex((line) => /^#{1,6}\s+/.test(line));
  const titleFromHeading = headingLineIndex >= 0
    ? lines[headingLineIndex].replace(/^#{1,6}\s+/, "").trim()
    : "";
  const title = titleFromHeading || path.basename(filePath, path.extname(filePath));
  const fileChecklistStats = deriveChecklistStatsFromContent(lines);
  const stats = fileChecklistStats.total > 0
    ? fileChecklistStats
    : (userStoryId ? userStoryTaskStats.get(userStoryId) : null) ?? emptyStats();

  return {
    id: userStoryId ?? title,
    title,
    filePath,
    line: headingLineIndex >= 0 ? headingLineIndex + 1 : 1,
    totalTasks: stats.total,
    completedTasks: stats.completed,
    status: deriveUserStoryStatus(stats)
  };
}

async function parseUserStoryTaskStats(tasksPath) {
  const content = await fs.readFile(tasksPath, "utf8");
  const lines = content.split(/\r?\n/);
  const statsByUserStory = new Map();
  let currentUserStoryId = null;

  for (const line of lines) {
    const storyHeading = matchUserStoryHeading(line);
    if (storyHeading) {
      currentUserStoryId = `US${storyHeading.storyNumber}`;
    }

    if (!/^\s*[-*]\s+\[( |x|X)\]\s+/.test(line)) {
      continue;
    }

    const inlineUserStoryIds = extractUserStoryReferences(line);
    const targetUserStoryIds = inlineUserStoryIds.length > 0
      ? inlineUserStoryIds
      : currentUserStoryId
        ? [currentUserStoryId]
        : [];

    for (const userStoryId of targetUserStoryIds) {
      const stats = statsByUserStory.get(userStoryId) ?? emptyStats();
      stats.total += 1;
      if (/^\s*[-*]\s+\[(x|X)\]\s+/.test(line)) {
        stats.completed += 1;
      }
      statsByUserStory.set(userStoryId, stats);
    }
  }

  return statsByUserStory;
}

async function parseChecklistDirectory(checklistsDir) {
  if (!(await isDirectory(checklistsDir))) {
    return emptyStatsWithFiles();
  }

  const markdownFiles = await listMarkdownFiles(checklistsDir);
  let total = 0;
  let completed = 0;

  for (const filePath of markdownFiles) {
    const stats = await parseMarkdownChecklistStats(filePath);
    total += stats.total;
    completed += stats.completed;
  }

  return {
    fileCount: markdownFiles.length,
    total,
    completed
  };
}

async function parseMarkdownChecklistStats(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return deriveChecklistStatsFromContent(content.split(/\r?\n/));
}

async function listMarkdownFiles(directoryPath) {
  const files = [];
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(entryPath)));
      continue;
    }
    if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      files.push(entryPath);
    }
  }

  return files;
}

async function countFiles(directoryPath) {
  if (!(await isDirectory(directoryPath))) {
    return { fileCount: 0 };
  }

  let fileCount = 0;
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      const nested = await countFiles(entryPath);
      fileCount += nested.fileCount;
      continue;
    }
    if (entry.isFile()) {
      fileCount += 1;
    }
  }

  return { fileCount };
}

function stripYamlValue(value) {
  return value.replace(/^["']|["']$/g, "");
}

function resolveSpecsRoot(rootPath, specsDirectory = "specs") {
  return path.isAbsolute(specsDirectory)
    ? path.normalize(specsDirectory)
    : path.resolve(rootPath, specsDirectory);
}

async function findUserStoryFiles(featureDirectory) {
  if (!(await isDirectory(featureDirectory))) {
    return [];
  }

  const entries = await fs.readdir(featureDirectory, { withFileTypes: true });
  const storyFiles = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) {
      continue;
    }

    const lowerName = entry.name.toLowerCase();
    if (["spec.md", "plan.md", "tasks.md", "research.md", "data-model.md", "quickstart.md"].includes(lowerName)) {
      continue;
    }
    if (!/^us\d+/i.test(entry.name)) {
      continue;
    }

    storyFiles.push(path.join(featureDirectory, entry.name));
  }

  storyFiles.sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
  return storyFiles;
}

function extractUserStoryIdFromFileName(fileName) {
  const match = fileName.match(/^(us\d+)/i);
  return match ? match[1].toUpperCase() : null;
}

function matchUserStoryHeading(line) {
  const match = line.match(/^\s{0,3}#{2,6}\s+(?:user\s+story\s*(\d+)|us\s*(\d+)|us(\d+))\b(?:\s*[:\-]\s*|\s+)?(.+?)?\s*$/i);
  if (!match) {
    return null;
  }

  const storyNumber = match[1] ?? match[2] ?? match[3];
  const rawTitle = match[4]?.trim() ?? "";
  return {
    storyNumber,
    title: rawTitle.replace(/\s+/g, " ")
  };
}

function extractUserStoryReferences(line) {
  const matches = line.matchAll(/\b(?:user\s+story\s*(\d+)|us\s*(\d+)|us(\d+))\b/gi);
  const userStoryIds = new Set();

  for (const match of matches) {
    const storyNumber = match[1] ?? match[2] ?? match[3];
    if (storyNumber) {
      userStoryIds.add(`US${storyNumber}`);
    }
  }

  return [...userStoryIds];
}

function deriveUserStoryStatus(stats) {
  if (stats.total === 0) {
    return "No tasks";
  }
  if (stats.completed === 0) {
    return "Not started";
  }
  if (stats.completed < stats.total) {
    return "In progress";
  }
  return "Completed";
}

function deriveChecklistStatsFromContent(lines) {
  let total = 0;
  let completed = 0;

  for (const line of lines) {
    if (/^\s*[-*]\s+\[( |x|X)\]\s+/.test(line)) {
      total += 1;
    }
    if (/^\s*[-*]\s+\[(x|X)\]\s+/.test(line)) {
      completed += 1;
    }
  }

  return { total, completed };
}

function normalizeRelativePath(rootPath, targetPath) {
  const relativePath = path.relative(rootPath, targetPath);
  return relativePath ? relativePath.replace(/\\/g, "/") : ".";
}

function emptyStats() {
  return { total: 0, completed: 0 };
}

function emptyStatsWithFiles() {
  return { fileCount: 0, total: 0, completed: 0 };
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

async function readJsonOptional(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

async function readTextOptional(filePath) {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch {
    return null;
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function isDirectory(targetPath) {
  try {
    const stats = await fs.stat(targetPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

module.exports = {
  collectSpecKitStatus,
  determineConfiguredCompletion,
  determineConfiguredPhase,
  determineLegacyCompletion,
  determineLegacyPhase,
  determineLegacyWorkflow,
  deriveUserStoryStatus,
  extractFeatureId,
  parseUserStories,
  parsePhaseDone,
  parseTaskStats,
  parseUserStoryTaskStats
};
