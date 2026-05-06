# 渲染管线

> 唯一渲染路径：**LLM → CIR + ExecutionMap → PlaybookScript → Remotion Player**
> 后端不渲染视频；前端通过 Remotion 帧驱动渲染。

## 1. LLM 输出契约

LLM 必须输出**单一 JSON 对象**，包含两层：

```jsonc
{
  "cir": {                    // 描述层（讲什么）
    "version": "0.1.0",
    "title": "...",
    "domain": "algorithm | math | code | physics | chemistry | biology | geography",
    "summary": "...",
    "steps": [
      {
        "id": "step_01",
        "title": "...",
        "narration": [...],   // 见第 3 节：模板数组（不是字符串）
        "visual_kind": "array | graph",
        "tokens": [{ "id": "t0", "label": "5", "emphasis": "primary" }],
        "annotations": []
      }
    ]
  },
  "execution_map": {          // 执行层（什么时候、对哪行代码）
    "duration_s": 18.0,
    "checkpoints": [
      {
        "id": "cp_01",
        "step_index": 0,
        "step_id": "step_01",      // 必须匹配 cir.steps[].id
        "visual_kind": "array",
        "title": "...",
        "summary": "...",
        "start_s": 0.0,
        "end_s": 3.0,
        "code_lines": [0, 1],      // 0-indexed 源码行（可选）
        "focus_tokens": ["t0"],
        "array_focus_indices": [0, 1],
        "array_reference_indices": []
      }
    ]
  }
}
```

### 强约束
- `cir.steps` 长度 4–8，与 `execution_map.checkpoints` **一一对应**（共享 `step_id`）。
- `checkpoint.start_s/end_s` 必须不重叠地分割 `[0, duration_s]`。
- `code_lines` 仅在用户提供 `source_code` 时有意义，否则可全部为 `[]`。
- `narration` 必须是 JSON 数组（不是裸字符串），见第 3 节。

### 兼容旧契约
`run_pipeline._parse_combined_output` 也接受裸 `CirDocument`（无 `cir`/`execution_map` 包装）。
此时 `execution_map=None`，使用固定 60 帧/步、无代码高亮。Mock provider 走这条路径。

## 2. 源码追踪

当 `IntakeContext.sourceCode` 存在时：

1. 前端从扩展名映射 `language`（见 `IntakeScreen.EXT_TO_LANGUAGE`）。
2. `usePipelineSubmit` 把 `sourceCode + language` 传到后端。
3. `build_cir_prompt` 在 system prompt 里以行号方式嵌入源码（`_number_source`，0-indexed）。
4. LLM 在每个 checkpoint 的 `code_lines` 填入相关行号。
5. `playbook_builder._build_code_highlight` 过滤越界行号，构造 `CodeHighlightOverlay`。

**幻觉防御**：超出源码行数范围的 `code_lines` 索引会被静默丢弃，全部越界则该步骤无 highlight。

## 3. Narration 模板

`cir_step.narration` 支持三种格式（按优先级）：

| 输入 | 处理 |
|------|------|
| `list`（直接 JSON 数组） | 用作 `narration_template` |
| `str` 以 `[` 开头 | `json.loads` 后用作模板 |
| `str` 含 `{{token_id}}` | 转换为简化模板 |
| 普通 `str` | 模板为 `None`，`voiceover_text` 用原文 |

### 模板片段
- `"literal"` —— 字面文本
- `{"t":"tokenId"}` —— 替换为 token 的 `label`
- 嵌套数组 = 条件分支：`[ [["条件"], ["分支体"]], ..., [{}, ["默认"]] ]`

`voiceover_text`（给 TTS）由 `_resolve_plain_text` 把模板压平成纯文本：
- token 引用替换为 label
- 条件分支取**首个非空分支**（不真正求值条件，仅作降级文本）

## 4. 时间轴

```
fps = 30 (默认)
end_frame_i = round((checkpoint_i.end_s) * fps)        # 有 execution_map
end_frame_i = (i+1) * 60                               # 无 execution_map（兼容路径）
```

`PlaybookScript.total_frames = max(累计帧数, 1)`。

## 5. 关键文件

| 文件 | 职责 |
|------|------|
| `apps/api/app/domain/services/cir_prompt.py` | 组合 prompt + JSON schema 描述 |
| `apps/api/app/application/use_cases/run_pipeline.py` | LLM 调用、解析、降级 |
| `apps/api/app/domain/services/playbook_builder.py` | CIR + ExecutionMap → PlaybookScript |
| `apps/api/app/domain/models/cir.py` | Pydantic 契约 |
| `apps/api/app/domain/models/playbook.py` | 输出端契约（前端消费） |
| `apps/web/src/features/playbook/engine/player/PlaybookPlayer.tsx` | Remotion 入口 |
