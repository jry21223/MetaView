import type { ReviewIssue } from "../../entities/pipeline/types";

/**
 * Map deterministic issue codes from the backend reviewer into friendly zh-CN
 * messages. Codes not in the table fall back to the raw `issue.message`.
 */
export const ISSUE_MESSAGE_MAP: Record<string, string> = {
  math_geometry_requires_scene: "数学几何步骤应使用 2D scene 而非 formula",
  math_array_visual_kind: "math 域禁止用 array 列项",
  scene_missing_payload: "scene 步骤缺少 scene 字段",
  scene_empty_geometry: "scene 中没有可见几何对象",
  function_missing_curves: "function 步骤缺少曲线表达式",
  formula_missing_latex: "formula 步骤缺少公式本体",
  duplicate_identical_layer: "同 step 内连续重复的相同 layer",
  execution_map_orphan_checkpoint: "execution_map 含有指向未知 step 的 checkpoint",
  "parse.invalid_json": "LLM 输出不是合法 JSON",
  "parse.invalid_shape": "LLM 输出顶层结构错误",
  "parse.validation_error": "LLM 输出字段不符合 schema",
  "parse.missing_cir": "LLM 输出缺少 cir 字段",
  "capability.text_only_required": "当前请求只能生成文本，无法进入可视化讲解流程",
};

/**
 * Suggested prompt nudges for each issue code, used by the PromptDoctor pills.
 */
export const ISSUE_SUGGESTION_MAP: Record<string, string> = {
  math_geometry_requires_scene: "在 prompt 中加：'请用 2D 坐标系画出区域和向量场'",
  math_array_visual_kind: "Math 题不要用数组列项；改成 'function 作图' 或 'scene 几何'",
  scene_empty_geometry: "明确说出要画什么几何对象（区域 / 曲线 / 向量场）",
  function_missing_curves: "给出具体函数表达式，例如 f(x)=x²-2x",
  formula_missing_latex: "需要写出公式本体（KaTeX）",
  duplicate_identical_layer: "不要重复同一种 layer；每一层有不同职责",
  "parse.invalid_json": "LLM 输出 JSON 格式有误。换种描述方式或简化问题",
  "capability.text_only_required":
    "补充希望展示的画面，或改用当前支持的可视化讲解方式",
};

export function humanizeIssue(issue: ReviewIssue): string {
  return ISSUE_MESSAGE_MAP[issue.code] ?? issue.message ?? issue.code;
}

export function suggestionForIssue(issue: ReviewIssue): string | null {
  const mapped = ISSUE_SUGGESTION_MAP[issue.code];
  if (mapped) return mapped;

  const suggestion = issue.suggestion?.trim();
  if (!suggestion) return null;

  // Backend suggestions are diagnostic payloads and may be English-only.
  // Keep those available in technical details instead of leaking them into
  // the default zh-CN recovery UI.
  return /[\u3400-\u9fff]/.test(suggestion)
    ? suggestion
    : "调整题目要求后重试；详细原因可在下方展开查看";
}
