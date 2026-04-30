import * as vscode from 'vscode';
import { ConfigManager } from './configManager';
import { CostCalculator } from './costCalculator';
import { OutputChannelManager } from './outputChannel';

export class NotificationManager {
  private lastNotificationTime = 0;

  constructor(
    private readonly config: ConfigManager,
    private readonly costCalculator: CostCalculator,
    private readonly outputChannel: OutputChannelManager,
  ) {}

  evaluate(tokenCount: number, source: string): void {
    const estimate = this.costCalculator.estimate(tokenCount);
    const costStr = this.costCalculator.formatCost(estimate.totalCost);
    const tokensStr = this.costCalculator.formatTokens(tokenCount);

    if (tokenCount >= this.config.criticalThreshold) {
      this.outputChannel.logWarning(
        `CRITICAL: ${source} has ${tokensStr} tokens (threshold: ${this.costCalculator.formatTokens(this.config.criticalThreshold)}). Est. cost: ${costStr}`
      );

      if (this.canNotify()) {
        vscode.window.showErrorMessage(
          `Token Monitor: ${tokensStr} tokens exceeds critical threshold! Est. cost: ${costStr}`,
          'Show Details',
          'Dismiss',
        ).then((action) => {
          if (action === 'Show Details') {
            this.outputChannel.show();
          }
        });
      }
    } else if (tokenCount >= this.config.warningThreshold) {
      this.outputChannel.logWarning(
        `${source} has ${tokensStr} tokens (threshold: ${this.costCalculator.formatTokens(this.config.warningThreshold)}). Est. cost: ${costStr}`
      );

      if (this.canNotify()) {
        vscode.window.showWarningMessage(
          `Token Monitor: ${tokensStr} tokens exceeds warning threshold. Est. cost: ${costStr}`,
          'Show Details',
          'Dismiss',
        ).then((action) => {
          if (action === 'Show Details') {
            this.outputChannel.show();
          }
        });
      }
    }
  }

  private canNotify(): boolean {
    const now = Date.now();
    const cooldownMs = this.config.notificationCooldownSeconds * 1000;
    if (now - this.lastNotificationTime < cooldownMs) {
      return false;
    }
    this.lastNotificationTime = now;
    return true;
  }
}
