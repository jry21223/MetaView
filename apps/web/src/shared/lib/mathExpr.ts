/**
 * mathExpr — a tiny, dependency-free math expression evaluator.
 *
 * Supports:
 *  - binary operators  +  -  *  /  %  ^   (^ is right-associative power)
 *  - unary plus / minus
 *  - parentheses
 *  - the free variable `x` plus arbitrary named parameters (e.g. `a`, `k`)
 *  - constants:  pi  tau  e
 *  - functions:  sin cos tan asin acos atan atan2 sinh cosh tanh
 *                exp log ln log2 log10 sqrt cbrt abs floor ceil round
 *                sign min max pow hypot
 *
 * Used both by the Remotion `MathPlotRenderer` (to sample LLM-supplied curves
 * client-side) and by the interactive Math Widget (live parameter sliders).
 * Everything is pure — no `eval`, no `Function`, no DOM, no external deps.
 */

export class MathExprError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MathExprError";
  }
}

export type Scope = Record<string, number>;

/** A parsed expression: call it with a variable scope to get a numeric value. */
export type CompiledExpr = (scope?: Scope) => number;

const CONSTANTS: Readonly<Scope> = Object.freeze({
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
});

type Fn = (...args: number[]) => number;

const FUNCTIONS: Readonly<Record<string, Fn>> = Object.freeze({
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

// ── Tokenizer ──────────────────────────────────────────────────────────────

type Token =
  | { kind: "num"; value: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" };

const OP_CHARS = new Set(["+", "-", "*", "/", "%", "^"]);

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      tokens.push({ kind: "comma" });
      i += 1;
      continue;
    }
    if (OP_CHARS.has(ch)) {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    // number: 12, 12.5, .5, 1e-3, 2E5
    if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j += 1;
      // exponent part
      if (j < src.length && (src[j] === "e" || src[j] === "E")) {
        let k = j + 1;
        if (k < src.length && (src[k] === "+" || src[k] === "-")) k += 1;
        if (k < src.length && /[0-9]/.test(src[k])) {
          while (k < src.length && /[0-9]/.test(src[k])) k += 1;
          j = k;
        }
      }
      const text = src.slice(i, j);
      const value = Number(text);
      if (!Number.isFinite(value)) {
        throw new MathExprError(`Invalid number: "${text}"`);
      }
      tokens.push({ kind: "num", value });
      i = j;
      continue;
    }
    // identifier: letters, underscores, then letters/digits/underscores
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j += 1;
      tokens.push({ kind: "name", value: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new MathExprError(`Unexpected character "${ch}" at position ${i}`);
  }
  return tokens;
}

// ── Recursive-descent parser → compiled closure ────────────────────────────

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): CompiledExpr {
    const expr = this.parseExpr();
    if (this.pos < this.tokens.length) {
      throw new MathExprError("Unexpected trailing tokens in expression");
    }
    return expr;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new MathExprError("Unexpected end of expression");
    this.pos += 1;
    return t;
  }

  // expr := term (('+' | '-') term)*
  private parseExpr(): CompiledExpr {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        const right = this.parseTerm();
        const l = left;
        left = t.value === "+" ? (s) => l(s) + right(s) : (s) => l(s) - right(s);
      } else break;
    }
    return left;
  }

  // term := power (('*' | '/' | '%') power)*
  private parseTerm(): CompiledExpr {
    let left = this.parsePower();
    for (;;) {
      const t = this.peek();
      if (t && t.kind === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) {
        this.next();
        const right = this.parsePower();
        const l = left;
        if (t.value === "*") left = (s) => l(s) * right(s);
        else if (t.value === "/") left = (s) => l(s) / right(s);
        else left = (s) => l(s) % right(s);
      } else break;
    }
    return left;
  }

  // power := unary ('^' power)?   — right-associative
  private parsePower(): CompiledExpr {
    const base = this.parseUnary();
    const t = this.peek();
    if (t && t.kind === "op" && t.value === "^") {
      this.next();
      const exp = this.parsePower();
      return (s) => Math.pow(base(s), exp(s));
    }
    return base;
  }

  // unary := ('+' | '-') unary | primary
  private parseUnary(): CompiledExpr {
    const t = this.peek();
    if (t && t.kind === "op" && (t.value === "+" || t.value === "-")) {
      this.next();
      const operand = this.parseUnary();
      return t.value === "-" ? (s) => -operand(s) : operand;
    }
    return this.parsePrimary();
  }

  // primary := number | name | name '(' args ')' | '(' expr ')'
  private parsePrimary(): CompiledExpr {
    const t = this.next();
    if (t.kind === "num") {
      const v = t.value;
      return () => v;
    }
    if (t.kind === "lparen") {
      const inner = this.parseExpr();
      const close = this.next();
      if (close.kind !== "rparen") throw new MathExprError('Expected ")"');
      return inner;
    }
    if (t.kind === "name") {
      const name = t.value;
      const lookahead = this.peek();
      if (lookahead && lookahead.kind === "lparen") {
        // function call
        const fn = FUNCTIONS[name];
        if (!fn) throw new MathExprError(`Unknown function "${name}"`);
        this.next(); // consume "("
        const args: CompiledExpr[] = [];
        if (this.peek()?.kind !== "rparen") {
          args.push(this.parseExpr());
          while (this.peek()?.kind === "comma") {
            this.next();
            args.push(this.parseExpr());
          }
        }
        const close = this.next();
        if (close.kind !== "rparen") throw new MathExprError(`Expected ")" after arguments to "${name}"`);
        return (s) => fn(...args.map((a) => a(s)));
      }
      // constant or variable
      if (name in CONSTANTS) {
        const v = CONSTANTS[name];
        return () => v;
      }
      return (s) => {
        const v = s?.[name];
        if (typeof v !== "number") throw new MathExprError(`Unknown variable "${name}"`);
        return v;
      };
    }
    throw new MathExprError("Unexpected token in expression");
  }
}

/**
 * Parse a math expression string into a reusable compiled closure.
 * Throws {@link MathExprError} on a malformed expression.
 */
export function compileExpr(source: string): CompiledExpr {
  const trimmed = (source ?? "").trim();
  if (!trimmed) throw new MathExprError("Empty expression");
  return new Parser(tokenize(trimmed)).parse();
}

/**
 * Parse and evaluate in one shot. Returns `NaN` on a malformed expression
 * (use {@link compileExpr} directly when you need to distinguish parse errors).
 */
export function evalExpr(source: string, scope?: Scope): number {
  try {
    return compileExpr(source)(scope);
  } catch {
    return NaN;
  }
}

/** Returns true if the expression parses without error. */
export function isValidExpr(source: string): boolean {
  try {
    compileExpr(source);
    return true;
  } catch {
    return false;
  }
}

export interface SamplePoint {
  x: number;
  y: number;
}

/**
 * Sample a compiled expression across `[xMin, xMax]` at `steps + 1` evenly
 * spaced points. Non-finite results are returned as `{ x, y: NaN }` so callers
 * can break a plotted path at discontinuities.
 */
export function sampleExpr(
  fn: CompiledExpr,
  xMin: number,
  xMax: number,
  steps = 240,
  extraScope?: Scope,
): SamplePoint[] {
  const n = Math.max(1, Math.floor(steps));
  const out: SamplePoint[] = [];
  const lo = Math.min(xMin, xMax);
  const hi = Math.max(xMin, xMax);
  const span = hi - lo || 1;
  for (let i = 0; i <= n; i += 1) {
    const x = lo + (span * i) / n;
    let y: number;
    try {
      y = fn({ ...extraScope, x });
    } catch {
      y = NaN;
    }
    out.push({ x, y: Number.isFinite(y) ? y : NaN });
  }
  return out;
}
