export class SafeMathExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SafeMathExpressionError";
  }
}

export type MathScope = Record<string, number>;
export type CompiledMathExpression = (scope: MathScope) => number;

const CONSTANTS: Readonly<MathScope> = Object.freeze({
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
});

type MathFunction = (...args: number[]) => number;

const FUNCTIONS: Readonly<Record<string, MathFunction>> = Object.freeze({
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  exp: Math.exp,
  log: Math.log,
  ln: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
  hypot: Math.hypot,
});

type Token =
  | { kind: "number"; value: number }
  | { kind: "name"; value: string }
  | { kind: "operator"; value: string }
  | { kind: "left" }
  | { kind: "right" }
  | { kind: "comma" };

const OPERATOR_CHARS = new Set(["+", "-", "*", "/", "%", "^"]);

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "left" });
      index += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "right" });
      index += 1;
      continue;
    }
    if (char === ",") {
      tokens.push({ kind: "comma" });
      index += 1;
      continue;
    }
    if (OPERATOR_CHARS.has(char)) {
      tokens.push({ kind: "operator", value: char });
      index += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let end = index;
      while (end < source.length && /[0-9.]/.test(source[end])) end += 1;
      if (end < source.length && /[eE]/.test(source[end] ?? "")) {
        let exponentEnd = end + 1;
        if (/[+-]/.test(source[exponentEnd] ?? "")) exponentEnd += 1;
        if (/[0-9]/.test(source[exponentEnd] ?? "")) {
          while (/[0-9]/.test(source[exponentEnd] ?? "")) exponentEnd += 1;
          end = exponentEnd;
        }
      }
      const raw = source.slice(index, end);
      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new SafeMathExpressionError(`Invalid number ${JSON.stringify(raw)}.`);
      }
      tokens.push({ kind: "number", value });
      index = end;
      continue;
    }
    if (/[A-Za-z_]/.test(char)) {
      let end = index + 1;
      while (/[A-Za-z0-9_]/.test(source[end] ?? "")) end += 1;
      tokens.push({ kind: "name", value: source.slice(index, end) });
      index = end;
      continue;
    }
    throw new SafeMathExpressionError(
      `Unexpected character ${JSON.stringify(char)} at position ${index}.`,
    );
  }
  if (tokens.length === 0) {
    throw new SafeMathExpressionError("Empty expression.");
  }
  if (tokens.length > 256) {
    throw new SafeMathExpressionError("Expression has too many tokens.");
  }
  return tokens;
}

class Parser {
  private position = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): CompiledMathExpression {
    const expression = this.parseExpression();
    if (this.position !== this.tokens.length) {
      throw new SafeMathExpressionError("Unexpected trailing tokens.");
    }
    return expression;
  }

  private peek(): Token | undefined {
    return this.tokens[this.position];
  }

  private next(): Token {
    const token = this.peek();
    if (!token) throw new SafeMathExpressionError("Unexpected end of expression.");
    this.position += 1;
    return token;
  }

  private parseExpression(): CompiledMathExpression {
    let left = this.parseTerm();
    for (;;) {
      const token = this.peek();
      if (
        !token ||
        token.kind !== "operator" ||
        (token.value !== "+" && token.value !== "-")
      ) {
        return left;
      }
      this.next();
      const right = this.parseTerm();
      const previous = left;
      left =
        token.value === "+"
          ? (scope) => previous(scope) + right(scope)
          : (scope) => previous(scope) - right(scope);
    }
  }

  private parseTerm(): CompiledMathExpression {
    let left = this.parsePower();
    for (;;) {
      const token = this.peek();
      if (
        !token ||
        token.kind !== "operator" ||
        !["*", "/", "%"].includes(token.value)
      ) {
        return left;
      }
      this.next();
      const right = this.parsePower();
      const previous = left;
      if (token.value === "*") {
        left = (scope) => previous(scope) * right(scope);
      } else if (token.value === "/") {
        left = (scope) => previous(scope) / right(scope);
      } else {
        left = (scope) => previous(scope) % right(scope);
      }
    }
  }

  private parsePower(): CompiledMathExpression {
    const base = this.parseUnary();
    const token = this.peek();
    if (
      !token ||
      token.kind !== "operator" ||
      token.value !== "^"
    ) {
      return base;
    }
    this.next();
    const exponent = this.parsePower();
    return (scope) => Math.pow(base(scope), exponent(scope));
  }

  private parseUnary(): CompiledMathExpression {
    const token = this.peek();
    if (
      token &&
      token.kind === "operator" &&
      (token.value === "+" || token.value === "-")
    ) {
      this.next();
      const operand = this.parseUnary();
      return token.value === "-"
        ? (scope) => -operand(scope)
        : operand;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): CompiledMathExpression {
    const token = this.next();
    if (token.kind === "number") {
      return () => token.value;
    }
    if (token.kind === "left") {
      const expression = this.parseExpression();
      if (this.next().kind !== "right") {
        throw new SafeMathExpressionError('Expected ")".');
      }
      return expression;
    }
    if (token.kind !== "name") {
      throw new SafeMathExpressionError("Unexpected token.");
    }
    const name = token.value;
    if (this.peek()?.kind === "left") {
      const fn = FUNCTIONS[name];
      if (!fn) {
        throw new SafeMathExpressionError(`Unknown function ${JSON.stringify(name)}.`);
      }
      this.next();
      const args: CompiledMathExpression[] = [];
      if (this.peek()?.kind !== "right") {
        args.push(this.parseExpression());
        while (this.peek()?.kind === "comma") {
          this.next();
          args.push(this.parseExpression());
        }
      }
      if (this.next().kind !== "right") {
        throw new SafeMathExpressionError(`Expected ")" after ${name}.`);
      }
      return (scope) => fn(...args.map((argument) => argument(scope)));
    }
    if (name in CONSTANTS) {
      return () => CONSTANTS[name];
    }
    return (scope) => {
      const value = scope[name];
      if (!Number.isFinite(value)) {
        throw new SafeMathExpressionError(
          `Unknown or non-finite variable ${JSON.stringify(name)}.`,
        );
      }
      return value;
    };
  }
}

export function compileSafeMathExpression(
  source: string,
): CompiledMathExpression {
  const trimmed = source.trim();
  if (trimmed.length > 512) {
    throw new SafeMathExpressionError("Expression is too long.");
  }
  return new Parser(tokenize(trimmed)).parse();
}

export function extractSafeMathIdentifiers(source: string): Set<string> {
  const tokens = tokenize(source.trim());
  return new Set(
    tokens
      .filter((token): token is Extract<Token, { kind: "name" }> =>
        token.kind === "name")
      .map((token) => token.value)
      .filter((name) => !(name in CONSTANTS) && !(name in FUNCTIONS)),
  );
}
