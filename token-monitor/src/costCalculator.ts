import { ConfigManager } from './configManager';

export interface CostEstimate {
  inputTokens: number;
  projectedOutputTokens: number;
  inputCost: number;
  projectedOutputCost: number;
  totalCost: number;
}

export class CostCalculator {
  constructor(private readonly config: ConfigManager) {}

  estimate(inputTokens: number): CostEstimate {
    const projectedOutputTokens = Math.round(inputTokens * this.config.estimatedOutputRatio);
    const inputCost = (inputTokens / 1_000_000) * this.config.costPerMillionInputTokens;
    const projectedOutputCost = (projectedOutputTokens / 1_000_000) * this.config.costPerMillionOutputTokens;

    return {
      inputTokens,
      projectedOutputTokens,
      inputCost,
      projectedOutputCost,
      totalCost: inputCost + projectedOutputCost,
    };
  }

  formatCost(dollars: number): string {
    if (dollars < 0.001) {
      return `$${dollars.toFixed(6)}`;
    }
    if (dollars < 0.01) {
      return `$${dollars.toFixed(4)}`;
    }
    return `$${dollars.toFixed(3)}`;
  }

  formatTokens(count: number): string {
    return count.toLocaleString('en-US');
  }
}
