/** Small expression evaluator for deterministic template kernels.
 *
 * Supported syntax: numbers, named variables, + - * / % ^ **, parentheses,
 * constants pi/e, and a conservative function allow-list. It deliberately
 * does not use eval/Function.
 */

type Token =
  | { kind: "number"; value: number }
  | { kind: "identifier"; value: string }
  | { kind: "operator"; value: string }
  | { kind: "left" }
  | { kind: "right" }
  | { kind: "comma" }
  | { kind: "eof" };

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  acos: Math.acos,
  asin: Math.asin,
  atan: Math.atan,
  ceil: Math.ceil,
  cos: Math.cos,
  exp: Math.exp,
  floor: Math.floor,
  ln: Math.log,
  log: Math.log,
  max: Math.max,
  min: Math.min,
  round: Math.round,
  sign: Math.sign,
  sin: Math.sin,
  sqrt: Math.sqrt,
  tan: Math.tan,
};

const CONSTANTS: Record<string, number> = {
  e: Math.E,
  pi: Math.PI,
};

class TokenStream {
  private readonly tokens: Token[];
  private cursor = 0;

  constructor(expression: string) {
    this.tokens = tokenize(expression);
  }

  peek(): Token {
    return this.tokens[this.cursor] ?? { kind: "eof" };
  }

  consume(): Token {
    const token = this.peek();
    this.cursor += 1;
    return token;
  }

  expect(kind: Token["kind"]): Token {
    const token = this.consume();
    if (token.kind !== kind) {
      throw new Error(`expected ${kind}, got ${describeToken(token)}`);
    }
    return token;
  }
}

function describeToken(token: Token): string {
  if ("value" in token) return `${token.kind}(${String(token.value)})`;
  return token.kind;
}

function tokenize(rawExpression: string): Token[] {
  const expression = rawExpression.replaceAll("**", "^");
  const tokens: Token[] = [];
  let index = 0;
  while (index < expression.length) {
    const char = expression[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = expression.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/);
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) });
      index += number[0].length;
      continue;
    }
    const identifier = expression.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      tokens.push({ kind: "identifier", value: identifier[0].toLowerCase() });
      index += identifier[0].length;
      continue;
    }
    if ("+-*/%^".includes(char)) {
      tokens.push({ kind: "operator", value: char });
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
    throw new Error(`unsupported character ${JSON.stringify(char)} at index ${index}`);
  }
  tokens.push({ kind: "eof" });
  return tokens;
}

export function evaluateExpression(
  expression: string,
  variables: Record<string, number> = {},
): number {
  const normalizedVariables = Object.fromEntries(
    Object.entries(variables).map(([key, value]) => [key.toLowerCase(), value]),
  );
  const stream = new TokenStream(expression);
  const value = parseAdditive(stream, normalizedVariables);
  const trailing = stream.consume();
  if (trailing.kind !== "eof") {
    throw new Error(`unexpected trailing token ${describeToken(trailing)}`);
  }
  if (!Number.isFinite(value)) {
    throw new Error(`expression produced a non-finite result: ${expression}`);
  }
  return value;
}

function parseAdditive(stream: TokenStream, variables: Record<string, number>): number {
  let value = parseMultiplicative(stream, variables);
  while (true) {
    const next = stream.peek();
    if (next.kind !== "operator" || !["+", "-"].includes(next.value)) break;
    const operator = stream.consume() as Extract<Token, { kind: "operator" }>;
    const right = parseMultiplicative(stream, variables);
    value = operator.value === "+" ? value + right : value - right;
  }
  return value;
}

function parseMultiplicative(stream: TokenStream, variables: Record<string, number>): number {
  let value = parsePower(stream, variables);
  while (true) {
    const next = stream.peek();
    if (next.kind !== "operator" || !["*", "/", "%"].includes(next.value)) break;
    const operator = stream.consume() as Extract<Token, { kind: "operator" }>;
    const right = parsePower(stream, variables);
    if ((operator.value === "/" || operator.value === "%") && right === 0) {
      throw new Error("division by zero");
    }
    if (operator.value === "*") value *= right;
    else if (operator.value === "/") value /= right;
    else value %= right;
  }
  return value;
}

function parsePower(stream: TokenStream, variables: Record<string, number>): number {
  const left = parseUnary(stream, variables);
  const next = stream.peek();
  if (next.kind === "operator" && next.value === "^") {
    stream.consume();
    return left ** parsePower(stream, variables);
  }
  return left;
}

function parseUnary(stream: TokenStream, variables: Record<string, number>): number {
  const token = stream.peek();
  if (token.kind === "operator" && (token.value === "+" || token.value === "-")) {
    stream.consume();
    const value = parseUnary(stream, variables);
    return token.value === "-" ? -value : value;
  }
  return parsePrimary(stream, variables);
}

function parsePrimary(stream: TokenStream, variables: Record<string, number>): number {
  const token = stream.consume();
  if (token.kind === "number") return token.value;
  if (token.kind === "left") {
    const value = parseAdditive(stream, variables);
    stream.expect("right");
    return value;
  }
  if (token.kind !== "identifier") {
    throw new Error(`expected number, identifier, or '(', got ${describeToken(token)}`);
  }
  const name = token.value;
  if (stream.peek().kind === "left") {
    stream.consume();
    const args: number[] = [];
    if (stream.peek().kind !== "right") {
      while (true) {
        args.push(parseAdditive(stream, variables));
        if (stream.peek().kind !== "comma") break;
        stream.consume();
      }
    }
    stream.expect("right");
    const fn = FUNCTIONS[name];
    if (!fn) throw new Error(`unsupported function ${name}`);
    const result = fn(...args);
    if (!Number.isFinite(result)) throw new Error(`function ${name} returned non-finite value`);
    return result;
  }
  if (name in variables) return variables[name];
  if (name in CONSTANTS) return CONSTANTS[name];
  throw new Error(`unknown variable ${name}`);
}

export function derivativeAt(expression: string, x: number): number {
  const scale = Math.max(1, Math.abs(x));
  const h = Math.max(1e-6, scale * 1e-5);
  const yPlus = evaluateExpression(expression, { x: x + h });
  const yMinus = evaluateExpression(expression, { x: x - h });
  const result = (yPlus - yMinus) / (2 * h);
  if (!Number.isFinite(result)) throw new Error("derivative estimate is non-finite");
  return result;
}

export function sampleParametric(
  expressionX: string,
  expressionY: string,
  tMin: number,
  tMax: number,
  count: number,
): Array<{ t: number; x: number; y: number }> {
  if (!(tMax > tMin)) throw new Error("t_max must be greater than t_min");
  if (!Number.isInteger(count) || count < 2 || count > 64) {
    throw new Error("sample count must be an integer between 2 and 64");
  }
  return Array.from({ length: count }, (_, index) => {
    const t = tMin + ((tMax - tMin) * index) / (count - 1);
    return {
      t,
      x: evaluateExpression(expressionX, { t }),
      y: evaluateExpression(expressionY, { t }),
    };
  });
}

export function formatNumber(value: number, digits = 6): string {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  return Number(normalized.toFixed(digits)).toString();
}
