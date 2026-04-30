import * as vscode from 'vscode';
import { CostEstimate } from './costCalculator';
import { CostCalculator } from './costCalculator';

export class OutputChannelManager implements vscode.Disposable {
  private readonly channel: vscode.OutputChannel;
  private sessionTotalTokens = 0;
  private sessionEstimateCount = 0;
  private sessionTotalCost = 0;

  constructor(private readonly costCalculator: CostCalculator) {
    this.channel = vscode.window.createOutputChannel('Token Cost Monitor');
  }

  logEstimate(source: string, estimate: CostEstimate): void {
    this.sessionEstimateCount++;
    this.sessionTotalTokens += estimate.inputTokens;
    this.sessionTotalCost += estimate.totalCost;

    const timestamp = new Date().toLocaleTimeString();
    this.channel.appendLine(`[${timestamp}] ${source}`);
    this.channel.appendLine(`  Input tokens:     ${this.costCalculator.formatTokens(estimate.inputTokens)}`);
    this.channel.appendLine(`  Est. output:      ${this.costCalculator.formatTokens(estimate.projectedOutputTokens)}`);
    this.channel.appendLine(`  Input cost:       ${this.costCalculator.formatCost(estimate.inputCost)}`);
    this.channel.appendLine(`  Output cost:      ${this.costCalculator.formatCost(estimate.projectedOutputCost)}`);
    this.channel.appendLine(`  Total est. cost:  ${this.costCalculator.formatCost(estimate.totalCost)}`);
    this.channel.appendLine('');
  }

  logWarning(message: string): void {
    const timestamp = new Date().toLocaleTimeString();
    this.channel.appendLine(`[${timestamp}] ⚠ WARNING: ${message}`);
    this.channel.appendLine('');
  }

  showSessionReport(): void {
    this.channel.appendLine('═══════════════════════════════════════');
    this.channel.appendLine('         SESSION COST REPORT');
    this.channel.appendLine('═══════════════════════════════════════');
    this.channel.appendLine(`  Estimates run:    ${this.sessionEstimateCount}`);
    this.channel.appendLine(`  Total tokens:     ${this.costCalculator.formatTokens(this.sessionTotalTokens)}`);
    this.channel.appendLine(`  Total est. cost:  ${this.costCalculator.formatCost(this.sessionTotalCost)}`);
    this.channel.appendLine('═══════════════════════════════════════');
    this.channel.appendLine('');
    this.channel.show(true);
  }

  show(): void {
    this.channel.show(true);
  }

  dispose(): void {
    this.channel.dispose();
  }
}
