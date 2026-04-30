import * as vscode from 'vscode';

export class ConfigManager {
  private static readonly SECTION = 'tokenMonitor';

  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(ConfigManager.SECTION);
  }

  get enabled(): boolean {
    return this.config.get<boolean>('enabled', true);
  }

  get warningThreshold(): number {
    return this.config.get<number>('warningThreshold', 4000);
  }

  get criticalThreshold(): number {
    return this.config.get<number>('criticalThreshold', 16000);
  }

  get costPerMillionInputTokens(): number {
    return this.config.get<number>('costPerMillionInputTokens', 3.0);
  }

  get costPerMillionOutputTokens(): number {
    return this.config.get<number>('costPerMillionOutputTokens', 15.0);
  }

  get estimatedOutputRatio(): number {
    return this.config.get<number>('estimatedOutputRatio', 0.5);
  }

  get notificationCooldownSeconds(): number {
    return this.config.get<number>('notificationCooldownSeconds', 30);
  }

  onDidChange(callback: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ConfigManager.SECTION)) {
        callback();
      }
    });
  }
}
