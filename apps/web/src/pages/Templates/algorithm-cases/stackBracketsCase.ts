import type {
  AlgorithmRange,
  MetaStep,
  PlaybookScript,
} from "../../../features/playbook/engine/types";
import type {
  TemplatePreviewFollowups,
  TemplatePreviewParams,
} from "../templatePreviewCases";
import {
  algorithmQuestions,
  algorithmStep,
  buildAlgorithmPlaybook,
  defineAlgorithmPreviewCase,
  stringParam,
} from "./helpers";

/**
 * 栈 · 括号匹配。
 *
 * 数据结构可视化里最经典的栈案例：逐字符扫描表达式，左括号入栈、右括号
 * 与栈顶配对出栈。主序列是表达式本身（位置与扫描指针）；栈画成主序列右侧
 * 的竖直槽位列（栈底在下、栈顶在上、空槽可见），已匹配的括号对是下方的结果轨道。
 */
export const STACK_BRACKET_PRESETS = [
  { id: "nested", expression: "{[()]}", label: "{[()]}  嵌套", spoken: "花括号里套着方括号，方括号里再套着圆括号" },
  { id: "sequence", expression: "()[]{}", label: "()[]{}  并列", spoken: "圆括号、方括号、花括号三对依次并列" },
  { id: "crossed", expression: "([)]", label: "([)]  交叉错配", spoken: "圆括号还没闭合就先闭合了方括号，两对交叉" },
  { id: "unclosed", expression: "(()", label: "(()  少一个右括号", spoken: "两个左圆括号，却只有一个右圆括号" },
  { id: "extra-close", expression: "())", label: "())  多一个右括号", spoken: "一对圆括号后面又多了一个右圆括号" },
] as const;

/** Spoken names for the six bracket glyphs: narration must stay readable by TTS. */
const CHAR_NAMES: Record<string, string> = {
  "(": "左圆括号",
  ")": "右圆括号",
  "[": "左方括号",
  "]": "右方括号",
  "{": "左花括号",
  "}": "右花括号",
};

export function bracketName(char: string): string {
  return CHAR_NAMES[char] ?? char;
}

export type StackBracketPresetId = (typeof STACK_BRACKET_PRESETS)[number]["id"];

const PRESET_IDS = STACK_BRACKET_PRESETS.map((preset) => preset.id);
const DEFAULT_PRESET: StackBracketPresetId = "nested";

export const STACK_BRACKET_CODE = [
  "function isValid(s: string): boolean {",
  "  const stack: string[] = [];",
  '  const pair = { ")": "(", "]": "[", "}": "{" };',
  "  for (let i = 0; i < s.length; i++) {",
  "    const ch = s[i];",
  '    if (ch === "(" || ch === "[" || ch === "{") { stack.push(ch); continue; }',
  "    if (stack.length === 0) return false;",
  "    if (stack.at(-1) !== pair[ch]) return false;",
  "    stack.pop();",
  "  }",
  "  return stack.length === 0;",
  "}",
] as const;

const OPENERS = new Set(["(", "[", "{"]);
const PAIR: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

export type StackBracketEventKind = "push" | "pop" | "mismatch" | "underflow";

export interface StackBracketEvent {
  /** Index of the character just read. */
  index: number;
  char: string;
  kind: StackBracketEventKind;
  /** Index of the opener popped or conflicting with this character (null when the stack was empty). */
  partnerIndex: number | null;
  /** Indices currently on the stack after this event (bottom → top). */
  stack: number[];
  /** Matched [open, close] index pairs so far. */
  pairs: Array<[number, number]>;
}

export type StackBracketVerdict = "valid" | "mismatch" | "underflow" | "unclosed";

export interface StackBracketTrace {
  expression: string;
  events: StackBracketEvent[];
  verdict: StackBracketVerdict;
  /** Openers left on the stack after the scan (only non-empty for `unclosed`). */
  leftover: number[];
}

export function resolveBracketPreset(params: TemplatePreviewParams): StackBracketPresetId {
  return stringParam(params, "expression", PRESET_IDS, DEFAULT_PRESET) as StackBracketPresetId;
}

export function bracketExpression(presetId: StackBracketPresetId): string {
  return STACK_BRACKET_PRESETS.find((preset) => preset.id === presetId)!.expression;
}

function bracketSpoken(presetId: StackBracketPresetId): string {
  return STACK_BRACKET_PRESETS.find((preset) => preset.id === presetId)!.spoken;
}

/** Pure single-pass stack scan; stops at the first failure like the code does. */
export function stackBracketTrace(expression: string): StackBracketTrace {
  const chars = [...expression];
  const stack: number[] = [];
  const pairs: Array<[number, number]> = [];
  const events: StackBracketEvent[] = [];
  let verdict: StackBracketVerdict = "valid";

  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index]!;
    if (OPENERS.has(char)) {
      stack.push(index);
      events.push({ index, char, kind: "push", partnerIndex: null, stack: [...stack], pairs: [...pairs] });
      continue;
    }
    const top = stack.at(-1);
    if (top == null) {
      events.push({ index, char, kind: "underflow", partnerIndex: null, stack: [], pairs: [...pairs] });
      verdict = "underflow";
      break;
    }
    if (chars[top] !== PAIR[char]) {
      events.push({ index, char, kind: "mismatch", partnerIndex: top, stack: [...stack], pairs: [...pairs] });
      verdict = "mismatch";
      break;
    }
    stack.pop();
    pairs.push([top, index]);
    events.push({ index, char, kind: "pop", partnerIndex: top, stack: [...stack], pairs: [...pairs] });
  }

  if (verdict === "valid" && stack.length > 0) verdict = "unclosed";
  return { expression, events, verdict, leftover: verdict === "unclosed" ? [...stack] : [] };
}

/** Characters of every pair matched before the current step: they read as consumed. */
function consumedIndices(
  pairs: ReadonlyArray<readonly [number, number]>,
  currentPair?: readonly [number, number] | null,
): number[] {
  return pairs
    .filter((pair) => !currentPair || pair[0] !== currentPair[0])
    .flatMap(([open, close]) => [open, close]);
}

function bracketSnapshot(args: {
  chars: readonly string[];
  cursor: number | null;
  /** Intro shows the cursor without lighting the cell: nothing has been read yet. */
  cursorActive?: boolean;
  stack: readonly number[];
  pairs: ReadonlyArray<readonly [number, number]>;
  entering?: number | null;
  leaving?: number | null;
  conflict?: number | null;
  scanRange?: [number, number] | null;
  currentPair?: readonly [number, number] | null;
}): MetaStep["snapshot"] {
  const elementStates: Record<number, Array<"entering" | "leaving">> = {};
  if (args.entering != null) elementStates[args.entering] = ["entering"];
  for (const index of [...consumedIndices(args.pairs, args.currentPair), ...(args.leaving == null ? [] : [args.leaving])]) {
    if (index === args.cursor) continue;
    elementStates[index] = [...(elementStates[index] ?? []).filter((state) => state !== "leaving"), "leaving"];
  }
  const pointers: Record<string, number> = {};
  if (args.cursor != null) pointers.i = args.cursor;
  if (args.conflict != null) pointers.top = args.conflict;

  const ranges: AlgorithmRange[] = [];
  if (args.scanRange) {
    ranges.push({
      id: "scan-range",
      start: args.scanRange[0],
      end: args.scanRange[1],
      role: "search_range",
      label: "待扫描",
      emphasis: "secondary",
    });
  }
  if (args.currentPair) {
    ranges.push({
      id: "matched-pair",
      start: args.currentPair[0],
      end: args.currentPair[1],
      role: "current_subarray",
      label: "配对",
      emphasis: "primary",
    });
  }

  const topIndex = args.stack.at(-1);
  return {
    kind: "algorithm_array",
    array_values: [...args.chars],
    active_indices: args.cursor == null || args.cursorActive === false ? [] : [args.cursor],
    swap_indices: [],
    sorted_indices: [],
    pointers,
    ranges,
    element_states: elementStates,
    auxiliary_lanes: [
      {
        id: "bracket-stack",
        role: "stack",
        label: "STACK · 栈顶在上",
        items: args.stack.map((index) => ({
          id: `stack-${index}`,
          label: args.chars[index]!,
          value: `i=${index}`,
          index,
          emphasis: index === topIndex ? (args.conflict != null ? "accent" : "primary") : "secondary",
        })),
      },
      {
        id: "matched-pairs",
        role: "result",
        label: "MATCHED",
        items: args.pairs.map(([open, close], position) => ({
          id: `pair-${open}-${close}`,
          label: `${args.chars[open]}${args.chars[close]}`,
          value: `${open}·${close}`,
          emphasis: position === args.pairs.length - 1 ? "accent" : "muted",
        })),
      },
    ],
  };
}

function codeHighlight(
  activeLine: number,
  variables: Record<string, string>,
  operationLabel: string,
  activeLines: number[] = [activeLine],
): NonNullable<MetaStep["code_highlight"]> {
  return {
    language: "typescript",
    lines: [...STACK_BRACKET_CODE],
    active_lines: activeLines,
    active_line: activeLine,
    variables,
    operation_label: operationLabel,
  };
}

function stackText(chars: readonly string[], stack: readonly number[]): string {
  return stack.length ? `[${stack.map((index) => chars[index]).join(", ")}]` : "[]";
}

/** Bottom-to-top stack contents in spoken form for narration. */
function stackSpoken(chars: readonly string[], stack: readonly number[]): string {
  return stack.length
    ? `从底到顶依次是${stack.map((index) => bracketName(chars[index]!)).join("、")}`
    : "已经空了";
}

function verdictTitle(verdict: StackBracketVerdict): string {
  if (verdict === "valid") return "栈为空，表达式合法";
  if (verdict === "unclosed") return "扫描结束但栈非空";
  return "提前返回 false";
}

function verdictNarration(trace: StackBracketTrace, chars: readonly string[]): string {
  const { verdict } = trace;
  if (verdict === "valid") {
    return `扫描完 ${chars.length} 个字符，栈恰好为空：每个右括号都找到了最近的、类型相同的左括号。返回 true。整个过程每个字符只入栈、出栈各最多一次，时间复杂度 O(n)，栈的额外空间最坏也是 O(n)。`;
  }
  if (verdict === "unclosed") {
    return `所有字符都读完了，但栈里还剩 ${trace.leftover.length} 个左括号，${stackSpoken(chars, trace.leftover)}：它们没有等到自己的右括号。栈非空就返回 false——合法性不只看每一次配对，也看扫描结束时是否清空。`;
  }
  if (verdict === "underflow") {
    return "遇到右括号时栈已经为空，没有任何左括号可以与它配对，函数在这里直接返回 false，后面的字符不再需要读取。";
  }
  return "栈顶的左括号与当前右括号类型不同。栈只允许与最近一个尚未闭合的左括号配对，所以交叉的括号一定失败，函数在这里直接返回 false。";
}

export function buildStackBracketsScript(params: TemplatePreviewParams): PlaybookScript {
  const presetId = resolveBracketPreset(params);
  const expression = bracketExpression(presetId);
  const chars = [...expression];
  const trace = stackBracketTrace(expression);
  const lastIndex = chars.length - 1;

  const steps: MetaStep[] = [
    algorithmStep(0, {
      step_id: "bracket-intro",
      title: "准备一个空栈",
      voiceover_text: `要判断这个表达式的括号是否匹配：${bracketSpoken(presetId)}。规则只有一条：每个右括号必须与最近一个尚未闭合的左括号类型相同。“最近的尚未闭合”正是后进先出，所以用栈来记录还没配对的左括号，从左到右逐字符扫描。`,
      snapshot: bracketSnapshot({
        chars,
        cursor: 0,
        cursorActive: false,
        stack: [],
        pairs: [],
        scanRange: [0, lastIndex],
      }),
      code_highlight: codeHighlight(
        1,
        { s: expression, n: String(chars.length), stack: "[]" },
        "initialize empty stack",
        [0, 1, 2],
      ),
    }),
  ];

  trace.events.forEach((event) => {
    const stackAfter = stackText(chars, event.stack);
    const nextScan: [number, number] | null = event.index < lastIndex ? [event.index + 1, lastIndex] : null;
    if (event.kind === "push") {
      steps.push(algorithmStep(steps.length, {
        step_id: `bracket-read-${event.index}`,
        title: `读入 ${event.char}，入栈`,
        voiceover_text: `第 ${event.index} 个字符是${bracketName(event.char)}。它还没有配对对象，先压入栈顶等待。此时栈里${stackSpoken(chars, event.stack)}，栈顶总是最近一个尚未闭合的左括号。`,
        snapshot: bracketSnapshot({
          chars,
          cursor: event.index,
          stack: event.stack,
          pairs: event.pairs,
          entering: event.index,
          scanRange: nextScan,
        }),
        code_highlight: codeHighlight(
          5,
          { i: String(event.index), ch: event.char, stack: stackAfter },
          "push opener",
          [4, 5],
        ),
      }));
      return;
    }
    if (event.kind === "pop") {
      const partner = event.partnerIndex!;
      steps.push(algorithmStep(steps.length, {
        step_id: `bracket-read-${event.index}`,
        title: `读入 ${event.char}，与栈顶 ${chars[partner]} 配对`,
        voiceover_text: `第 ${event.index} 个字符是${bracketName(event.char)}。栈顶是第 ${partner} 个字符${bracketName(chars[partner]!)}，类型正好相同，于是弹出栈顶，两者完成配对。弹出后栈${event.stack.length ? `里${stackSpoken(chars, event.stack)}` : "已经空了"}。`,
        // No scan range here: it would sit flush against the pair box and
        // draw a double border. The cursor already shows where we are.
        snapshot: bracketSnapshot({
          chars,
          cursor: event.index,
          stack: event.stack,
          pairs: event.pairs,
          leaving: partner,
          currentPair: [partner, event.index],
        }),
        code_highlight: codeHighlight(
          8,
          {
            i: String(event.index),
            ch: event.char,
            top: chars[partner]!,
            "pair[ch]": PAIR[event.char]!,
            stack: stackAfter,
          },
          "pop matching opener",
          [6, 7, 8],
        ),
      }));
      return;
    }
    if (event.kind === "mismatch") {
      const partner = event.partnerIndex!;
      steps.push(algorithmStep(steps.length, {
        step_id: `bracket-read-${event.index}`,
        title: `读入 ${event.char}，栈顶是 ${chars[partner]}：不匹配`,
        voiceover_text: `第 ${event.index} 个字符是${bracketName(event.char)}，需要配对的是${bracketName(PAIR[event.char]!)}，可栈顶却是第 ${partner} 个字符${bracketName(chars[partner]!)}。栈只能和最近一个尚未闭合的左括号配对，类型不同就说明括号交叉了，立即返回 false。`,
        snapshot: bracketSnapshot({
          chars,
          cursor: event.index,
          stack: event.stack,
          pairs: event.pairs,
          conflict: partner,
        }),
        code_highlight: codeHighlight(
          7,
          {
            i: String(event.index),
            ch: event.char,
            top: chars[partner]!,
            "pair[ch]": PAIR[event.char]!,
            result: "false",
          },
          "mismatch, return false",
          [6, 7],
        ),
      }));
      return;
    }
    steps.push(algorithmStep(steps.length, {
      step_id: `bracket-read-${event.index}`,
      title: `读入 ${event.char}，栈已空`,
      voiceover_text: `第 ${event.index} 个字符是${bracketName(event.char)}，但栈里已经没有任何左括号。没有可配对的对象，函数立即返回 false。`,
      snapshot: bracketSnapshot({
        chars,
        cursor: event.index,
        stack: [],
        pairs: event.pairs,
      }),
      code_highlight: codeHighlight(
        6,
        { i: String(event.index), ch: event.char, "stack.length": "0", result: "false" },
        "empty stack, return false",
        [6],
      ),
    }));
  });

  const lastEvent = trace.events.at(-1);
  const finalStack = trace.verdict === "unclosed" ? trace.leftover : lastEvent?.stack ?? [];
  steps.push(algorithmStep(steps.length, {
    step_id: "bracket-result",
    title: verdictTitle(trace.verdict),
    voiceover_text: verdictNarration(trace, chars),
    snapshot: bracketSnapshot({
      chars,
      cursor: null,
      stack: finalStack,
      pairs: lastEvent?.pairs ?? [],
    }),
    code_highlight: codeHighlight(
      trace.verdict === "valid" || trace.verdict === "unclosed" ? 10 : trace.verdict === "underflow" ? 6 : 7,
      {
        stack: stackText(chars, finalStack),
        pairs: String(lastEvent?.pairs.length ?? 0),
        result: trace.verdict === "valid" ? "true" : "false",
      },
      trace.verdict === "valid" ? "stack empty, return true" : "return false",
    ),
  }));

  return buildAlgorithmPlaybook({
    title: "栈与括号匹配：后进先出如何配对",
    summary: "逐字符扫描表达式，左括号入栈、右括号与栈顶配对出栈，用一条真实的栈轨道解释为什么后进先出恰好对应“最近的尚未闭合”。",
    algorithmId: "stack_bracket_matching",
    steps,
    controls: [{
      id: "expression",
      label: "表达式",
      value: presetId,
      description: "切换表达式后重新逐字符扫描并重建栈的变化。",
    }],
    initialData: {
      expression: chars,
      preset: [presetId],
      result: [trace.verdict === "valid" ? "true" : "false"],
    },
  });
}

export function buildStackBracketsFollowups(params: TemplatePreviewParams): TemplatePreviewFollowups {
  const presetId = resolveBracketPreset(params);
  const expression = bracketExpression(presetId);
  const chars = [...expression];
  const trace = stackBracketTrace(expression);

  const followups: TemplatePreviewFollowups = {
    "bracket-intro": algorithmQuestions(
      "bracket-intro",
      ["为什么用栈而不是计数器？", "只数左右括号的个数分不出 ([)] 这种交叉；栈保存的是“哪一个左括号还没闭合”，配对时才能检查类型。"],
      ["栈顶代表什么？", "栈顶永远是最近一个尚未闭合的左括号，下一个右括号只能和它配对。"],
      ["扫描的顺序重要吗？", "重要。从左到右读，才能保证先入栈的是更外层的括号，后入栈的内层括号先被配对。"],
    ),
  };

  trace.events.forEach((event) => {
    const stepId = `bracket-read-${event.index}`;
    if (event.kind === "push") {
      followups[stepId] = algorithmQuestions(
        stepId,
        ["为什么左括号直接入栈？", "左括号此刻还看不到自己的右括号，只能先记下来等待，栈就是这份等待名单。"],
        ["现在栈里有几个元素？", `${event.stack.length} 个：${stackText(chars, event.stack)}，最后压入的在最上面，是栈顶。`],
        ["下一个字符若是右括号会怎样？", `它会和栈顶 ${event.char} 比较类型：相同就弹出配对，不同就直接返回 false。`],
      );
      return;
    }
    if (event.kind === "pop") {
      const partner = event.partnerIndex!;
      followups[stepId] = algorithmQuestions(
        stepId,
        ["这一对为什么能配上？", `右括号 ${event.char} 需要的左括号是 ${PAIR[event.char]}，栈顶正好是第 ${partner} 个字符 ${chars[partner]}。`],
        ["为什么要弹出栈顶？", "配对完成的左括号已经闭合，不能再被后面的右括号使用，必须离开等待名单。"],
        ["弹出后栈顶变成了谁？", event.stack.length ? `变成第 ${event.stack.at(-1)} 个字符 ${chars[event.stack.at(-1)!]}，也就是外一层的括号。` : "栈已经为空，说明当前没有未闭合的括号。"],
      );
      return;
    }
    if (event.kind === "mismatch") {
      const partner = event.partnerIndex!;
      followups[stepId] = algorithmQuestions(
        stepId,
        ["为什么不能跳过栈顶去找更早的左括号？", "括号必须正确嵌套，内层先闭合。跳过栈顶等于允许交叉，那正是要判定为非法的情况。"],
        ["冲突的两个字符是哪两个？", `第 ${event.index} 个字符 ${event.char} 与栈顶第 ${partner} 个字符 ${chars[partner]}。`],
        ["后面的字符还要读吗？", "不用。一旦出现类型不匹配，整个表达式已经不可能合法，提前返回可以省掉剩余扫描。"],
      );
      return;
    }
    followups[stepId] = algorithmQuestions(
      stepId,
      ["栈为空意味着什么？", "此前的左括号都已闭合，这个右括号找不到任何等待中的左括号。"],
      ["这和“多一个右括号”是一回事吗？", "是。栈空时遇到右括号，说明右括号比左括号多，表达式不可能合法。"],
      ["代码里对应哪一行？", "stack.length === 0 的判断：先检查空栈，再比较类型，避免读取不存在的栈顶。"],
    );
  });

  followups["bracket-result"] = algorithmQuestions(
    "bracket-result",
    ["最终结论是什么？", trace.verdict === "valid" ? `${expression} 合法，返回 true。` : `${expression} 不合法，返回 false。`],
    ["为什么结束时还要检查栈是否为空？", "配对全部成功只说明右括号都有着落；栈里若还剩左括号，就是有左括号没有闭合。"],
    ["时间和空间复杂度是多少？", "每个字符最多入栈、出栈各一次，时间 O(n)；最坏情况全是左括号，栈占 O(n) 空间。"],
  );

  return followups;
}

export const STACK_BRACKETS_PREVIEW_CASE = defineAlgorithmPreviewCase({
  id: "stack-brackets",
  posterAlt: "栈与括号匹配：表达式扫描指针、栈轨道与已配对的括号",
  posterStepIndex: 4,
  defaultParams: { expression: DEFAULT_PRESET },
  controls: [
    {
      id: "expression",
      kind: "select",
      label: "表达式",
      description: "切换表达式，重新逐字符扫描并观察栈的变化。",
      resetPlayback: true,
      options: STACK_BRACKET_PRESETS.map((preset) => ({
        label: preset.label,
        value: preset.id,
      })),
    },
  ],
  buildScript: buildStackBracketsScript,
  buildFollowups: buildStackBracketsFollowups,
});
