import { encodingForModel } from 'js-tiktoken';

type Encoding = ReturnType<typeof encodingForModel>;

export class TokenCounter {
  private encoding: Encoding | null = null;

  private getEncoding(): Encoding {
    if (!this.encoding) {
      this.encoding = encodingForModel('gpt-4o');
    }
    return this.encoding;
  }

  countTokens(text: string): number {
    if (!text) {
      return 0;
    }
    const enc = this.getEncoding();
    return enc.encode(text).length;
  }

  dispose(): void {
    this.encoding = null;
  }
}
