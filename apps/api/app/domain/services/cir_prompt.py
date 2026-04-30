from __future__ import annotations

from app.domain.models.topic import TopicDomain

_DOMAIN_GUIDANCE: dict[TopicDomain, str] = {
    TopicDomain.ALGORITHM: """
VISUAL RULES for algorithms:
- Use visual_kind="array" for sorting, searching, two-pointer, sliding-window, DP table problems.
- Use visual_kind="graph" ONLY for explicit tree/graph traversal (BFS, DFS, BST operations).
- Each token represents ONE array element or tree node. Label = the actual value (number/char).
- emphasis="primary"  → elements currently being compared or accessed
- emphasis="accent"   → elements that are finalized/sorted
- emphasis="secondary" → elements visited but not finalized
- For multi-step algorithms, show every meaningful state change as a separate step.
  Example for [5,3,1]: step1=initial, step2=after first comparison, step3=after swap, ...
""",
    TopicDomain.CODE: """
VISUAL RULES for code explanation:
- Use visual_kind="array" to show data structures (stacks, queues, arrays, hash maps).
- Represent each data structure slot as a token with label=value.
- Steps should correspond to key execution moments: initialization, loop iteration,
  function call, return.
- Use token value field for data structure keys when relevant.
""",
    TopicDomain.MATH: """
VISUAL RULES for math:
- Use visual_kind="array" to show equation terms, matrix rows, or sequence elements.
- Each token label = one mathematical term (e.g. "3x²", "-2x", "+5", "=0").
- Steps should show one transformation at a time: expand → simplify → factor → solve.
- For sequences/series, show terms explicitly as tokens.
- For geometry: describe shapes via tokens labeled with vertices or measurements.
""",
    TopicDomain.PHYSICS: """
VISUAL RULES for physics:
- Use visual_kind="array" to show forces, components, or quantities.
- Token labels = physical quantities with units (e.g. "F=10N", "θ=30°", "a=5m/s²").
- Steps: given → free-body diagram → apply law → solve → verify.
- Use emphasis="primary" for the quantity being solved in each step.
""",
    TopicDomain.CHEMISTRY: """
VISUAL RULES for chemistry:
- Use visual_kind="array" to show reactants, products, or molecular components.
- Token labels = chemical symbols or compound formulas (e.g. "H₂O", "CO₂", "→").
- Steps: reactants → reaction → products → balance.
""",
    TopicDomain.BIOLOGY: """
VISUAL RULES for biology:
- Use visual_kind="array" to show biological components or process stages.
- Steps should clearly separate: structure → function → process → outcome.
""",
    TopicDomain.GEOGRAPHY: """
VISUAL RULES for geography:
- Use visual_kind="array" to show regions, factors, or process stages.
- Steps should show temporal or causal progression.
""",
}

_CIRDOCUMENT_SCHEMA = """{
  "version": "0.1.0",
  "title": "string — concise topic title (≤ 40 chars)",
  "domain": "algorithm | math | code | physics | chemistry | biology | geography",
  "summary": "string — 1–2 sentence overview of what will be visualized",
  "steps": [
    {
      "id": "step_01",
      "title": "string — step title (≤ 30 chars)",
      "narration": "string — voiceover text (2–4 sentences, spoken to a student)",
      "visual_kind": "array | graph",
      "tokens": [
        {
          "id": "string — unique id like t0, t1, node_root",
          "label": "string — display label (≤ 8 chars)",
          "value": "string | null",
          "emphasis": "primary | secondary | accent"
        }
      ],
      "annotations": []
    }
  ]
}"""


def build_cir_prompt(prompt: str, domain_hint: TopicDomain) -> tuple[str, str]:
    """Return (system_prompt, user_prompt) for CIR generation.

    The domain_hint is a keyword-based guess; the LLM decides the final
    CirDocument.domain value and may override the hint.
    """
    domain_guidance = _DOMAIN_GUIDANCE.get(domain_hint, _DOMAIN_GUIDANCE[TopicDomain.ALGORITHM])

    system = f"""You are an expert educational animator. \
Your job is to convert a student's question into a step-by-step visual teaching script \
(CIR format).

## CRITICAL OUTPUT RULES
1. Output ONLY valid JSON. No markdown fences, no explanations, no extra text.
2. The JSON must match the schema exactly and be parseable by Python json.loads().
3. Produce exactly 4–8 steps. More steps = better granularity of explanation.
4. Every step must have a distinct visual state — no duplicate token configurations.

## CirDocument JSON Schema
{_CIRDOCUMENT_SCHEMA}

## Allowed visual_kind values
Only use: "array" or "graph"
- "array" → for linear structures, formulas, processes (default for most topics)
- "graph" → ONLY for explicit tree or graph data structures

## Domain Classification
Keyword analysis suggests: **{domain_hint.value}**
You may change this if the topic clearly belongs to a different domain.
{domain_guidance}

## Narration Output Format
Output the "narration" field as a JSON array (NOT a plain string):
- String elements are literal text.
- {{"t":"tokenId"}} inserts that token's label at runtime.
- A conditional branch is a nested array: [ [condition, segments], ..., [{{}}, segments] ]
  where condition is {{"a":"t0","op":"lt","b":"t1"}} (token vs token) or \
{{"a":"t0","op":"gt","v":5}} (token vs fixed value).
  Supported ops: lt gt eq lte gte neq. The LAST branch MUST use {{}} as the default fallback.
- Only reference token ids from the SAME step's tokens list.
Example (bubble sort compare step):
["Compare ",{{"t":"t0"}}," and ",{{"t":"t1"}},". ",
  [[{{"a":"t0","op":"lt","b":"t1"}},[{{"t":"t0"}}," < ",{{"t":"t1"}},", no swap."]],
   [{{"a":"t0","op":"gt","b":"t1"}},[{{"t":"t0"}}," > ",{{"t":"t1"}},", swap them."]],
   [{{}},[{{"t":"t0"}}," equals ",{{"t":"t1"}},", no swap."]]]]

## Narration Quality Rules
- Narration must explain WHY this step matters, not just WHAT it shows.
- Write as if speaking directly to a student: clear, friendly, educational.
- Vary sentence length. Avoid starting every sentence the same way.

## Token Quality Rules
- Labels must be concise (≤ 8 characters). Use actual values, not descriptions.
- For arrays: each token = one element. Show ALL elements in EVERY step (tokens stay consistent).
- Change emphasis per step to highlight what's happening, not the entire array.
"""

    user = prompt
    return system, user
