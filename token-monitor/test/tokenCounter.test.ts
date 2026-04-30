import { TokenCounter } from '../src/tokenCounter';

describe('TokenCounter', () => {
  let counter: TokenCounter;

  beforeAll(() => {
    counter = new TokenCounter();
  });

  afterAll(() => {
    counter.dispose();
  });

  test('returns 0 for empty string', () => {
    expect(counter.countTokens('')).toBe(0);
  });

  test('returns 0 for undefined/null-ish input', () => {
    expect(counter.countTokens(undefined as unknown as string)).toBe(0);
  });

  test('counts tokens for simple text', () => {
    const tokens = counter.countTokens('Hello, world!');
    expect(tokens).toBeGreaterThan(0);
    expect(tokens).toBeLessThan(10);
  });

  test('longer text produces more tokens', () => {
    const short = counter.countTokens('Hi');
    const long = counter.countTokens('This is a much longer piece of text that should produce significantly more tokens than just a simple greeting.');
    expect(long).toBeGreaterThan(short);
  });

  test('counts tokens for code', () => {
    const code = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;
    const tokens = counter.countTokens(code);
    expect(tokens).toBeGreaterThan(10);
    expect(tokens).toBeLessThan(100);
  });

  test('is deterministic', () => {
    const text = 'The quick brown fox jumps over the lazy dog.';
    const first = counter.countTokens(text);
    const second = counter.countTokens(text);
    expect(first).toBe(second);
  });
});
