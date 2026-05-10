"use strict";

const path = require("path");
const vscode = require("vscode");
const { KittScannerManager } = require("./src/kittScannerManager");
const { collectSpecKitStatus } = require("./src/specKitStatus");
const { buildNewFeaturePromptTemplate } = require("./src/newFeatureTemplate");

class SpecKitStatusProvider {
  constructor(context, statusBarItem, kittScannerManager) {
    this.context = context;
    this.statusBarItem = statusBarItem;
    this.kittScannerManager = kittScannerManager;
    this.onDidChangeTreeDataEmitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;
    this.state = {
      rootPath: null,
      status: null
    };
  }

  async refresh() {
    await this.kittScannerManager.runTask(async () => {
      const folder = vscode.workspace.workspaceFolders?.[0];
      const rootPath = folder?.uri.fsPath ?? null;
      this.state.rootPath = rootPath;

      if (!rootPath) {
        this.state.status = null;
        this.renderStatusBar(null);
        this.onDidChangeTreeDataEmitter.fire();
        return;
      }

      try {
        const configuration = vscode.workspace.getConfiguration("specKitStatus");
        this.state.status = await collectSpecKitStatus(rootPath, {
          preferGitBranchFeature: configuration.get("preferGitBranchFeature", true),
          specsDirectory: configuration.get("specsDirectory", "specs")
        });
        this.renderStatusBar(this.state.status);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.state.status = {
          phase: "Unavailable",
          workflow: "Unavailable",
          feature: "Unknown",
          completion: 0,
          summary: "Unable to load Spec Kit status.",
          details: message
        };
        this.renderStatusBar(this.state.status);
      }

      this.onDidChangeTreeDataEmitter.fire();
    });
  }

  getTreeItem(item) {
    return item;
  }

  async getChildren(element) {
    const rootPath = this.state.rootPath;
    const status = this.state.status;

    if (element?.kind === "feature") {
      const userStories = status?.userStories ?? [];
      if (userStories.length === 0) {
        return [
          this.createItem("User Stories", "No user stories found in spec.md.", "Add user story headings to the feature spec.")
        ];
      }

      return userStories.map((story) => this.createUserStoryItem(story));
    }

    if (!rootPath) {
      return [
        this.createItem("Workspace", "Open a folder to inspect Spec Kit status.", "No workspace folder is open.")
      ];
    }

    if (!status) {
      return [
        this.createItem("Status", "Refreshing...", "Spec Kit status is loading.")
      ];
    }

    return [
      this.createItem("Phase", status.phase, status.phaseDetail),
      this.createItem("Workflow", status.workflow, status.workflowDetail),
      this.createFeatureItem(status),
      this.createItem("Completion", `${status.completion}%`, status.completionDetail)
    ];
  }

  createItem(label, description, tooltip) {
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    item.description = description;
    item.tooltip = tooltip;
    item.contextValue = "specKitStatusItem";
    return item;
  }

  createFeatureItem(status) {
    const collapsibleState = (status.userStories?.length ?? 0) > 0
      ? vscode.TreeItemCollapsibleState.Expanded
      : vscode.TreeItemCollapsibleState.None;
    const item = new vscode.TreeItem("Feature", collapsibleState);
    item.kind = "feature";
    item.description = status.feature;
    item.tooltip = status.featureDetail;
    item.contextValue = "specKitFeatureItem";

    if (status.featureFilePath) {
      item.command = {
        command: "specKitStatus.openFile",
        title: "Open Feature",
        arguments: [status.featureFilePath]
      };
    }

    return item;
  }

  createUserStoryItem(story) {
    const item = new vscode.TreeItem(story.id, vscode.TreeItemCollapsibleState.None);
    item.description = `${story.status}${story.title && story.title !== story.id ? ` · ${story.title}` : ""}`;
    item.tooltip = `${story.id}: ${story.title}\nStatus: ${story.status}\nTasks: ${story.completedTasks}/${story.totalTasks}`;
    item.contextValue = "specKitUserStoryItem";
    item.command = {
      command: "specKitStatus.openFile",
      title: "Open User Story",
      arguments: [story.filePath, story.line]
    };
    return item;
  }

  renderStatusBar(status) {
    const enabled = vscode.workspace.getConfiguration("specKitStatus").get("showStatusBar", true);
    if (!enabled) {
      this.statusBarItem.hide();
      return;
    }

    if (!status) {
      this.statusBarItem.text = "$(checklist) Spec Kit";
      this.statusBarItem.tooltip = "Open a workspace folder to inspect Spec Kit status.";
      this.statusBarItem.command = "specKitStatus.refresh";
      this.statusBarItem.show();
      return;
    }

    this.statusBarItem.text = `$(checklist) ${status.completion}% ${status.feature} · ${status.phase}`;
    this.statusBarItem.tooltip = [
      `Feature: ${status.feature}`,
      `Phase: ${status.phase}`,
      `Workflow: ${status.workflow}`,
      `Completion: ${status.completion}%`
    ].join("\n");
    this.statusBarItem.command = "specKitStatus.refresh";
    this.statusBarItem.show();
  }
}

function activate(context) {
  const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  const kittScannerManager = new KittScannerManager({
    extensionsApi: vscode.extensions,
    configurationTarget: vscode.ConfigurationTarget.Workspace,
    onError: (error) => {
      console.warn("[spec-kit-status] Unable to sync KITT scanner.", error);
    }
  });
  const provider = new SpecKitStatusProvider(context, statusBarItem, kittScannerManager);
  let watcherDisposables = [];

  function registerWatchers() {
    for (const disposable of watcherDisposables) {
      disposable.dispose();
    }
    watcherDisposables = [];

    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const configuration = vscode.workspace.getConfiguration("specKitStatus", folder.uri);
      const specsDirectory = configuration.get("specsDirectory", "specs");
      const specsPattern = getWorkspaceRelativePattern(folder, specsDirectory);
      const specWatcher = vscode.workspace.createFileSystemWatcher(
        specsPattern
      );
      const specifyWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, ".specify/**")
      );
      const gitHeadWatcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, ".git/HEAD")
      );

      const refresh = () => {
        void provider.refresh();
      };

      specWatcher.onDidCreate(refresh);
      specWatcher.onDidChange(refresh);
      specWatcher.onDidDelete(refresh);
      specifyWatcher.onDidCreate(refresh);
      specifyWatcher.onDidChange(refresh);
      specifyWatcher.onDidDelete(refresh);
      gitHeadWatcher.onDidCreate(refresh);
      gitHeadWatcher.onDidChange(refresh);
      gitHeadWatcher.onDidDelete(refresh);

      watcherDisposables.push(specWatcher, specifyWatcher, gitHeadWatcher);
    }
  }

  context.subscriptions.push(statusBarItem);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider("specKitStatusView", provider),
    vscode.commands.registerCommand("specKitStatus.refresh", async () => {
      await provider.refresh();
    }),
    vscode.commands.registerCommand("specKitStatus.openFile", async (filePath, line) => {
      const document = await vscode.workspace.openTextDocument(filePath);
      const editor = await vscode.window.showTextDocument(document, { preview: false });
      if (typeof line === "number" && line > 0) {
        const targetLine = Math.min(line - 1, Math.max(document.lineCount - 1, 0));
        const position = new vscode.Position(targetLine, 0);
        const range = new vscode.Range(position, position);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      }
    }),
    vscode.commands.registerCommand("specKitStatus.newFeature", async () => {
      const document = await vscode.workspace.openTextDocument({
        language: "markdown",
        content: buildNewFeaturePromptTemplate()
      });
      await vscode.window.showTextDocument(document, { preview: false });
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("specKitStatus")) {
        void provider.refresh();
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      registerWatchers();
      void provider.refresh();
    }),
    new vscode.Disposable(() => {
      void kittScannerManager.dispose();
      for (const disposable of watcherDisposables) {
        disposable.dispose();
      }
    })
  );

  registerWatchers();
  void provider.refresh();
}

function deactivate() {}

function getWorkspaceRelativePattern(folder, targetDirectory) {
  const workspaceRoot = folder.uri.fsPath;
  const resolvedDirectory = path.isAbsolute(targetDirectory)
    ? normalizePath(targetDirectory)
    : normalizePath(vscode.Uri.joinPath(folder.uri, targetDirectory).fsPath);
  const relativePath = normalizePath(path.relative(workspaceRoot, resolvedDirectory));
  const watchPath = relativePath && !relativePath.startsWith("..")
    ? `${relativePath}/**`
    : "specs/**";
  return new vscode.RelativePattern(folder, watchPath);
}

function normalizePath(value) {
  return value.replace(/\\/g, "/");
}

module.exports = {
  activate,
  buildNewFeaturePromptTemplate,
  deactivate
};
