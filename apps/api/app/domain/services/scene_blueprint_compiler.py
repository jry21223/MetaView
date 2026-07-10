from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    BioCellSceneSnapshot,
    BioProcessSceneSnapshot,
    CallStackCodeTrace,
    CallStackFrame,
    CallStackSceneSnapshot,
    CodeHighlightOverlay,
    GeoMapSceneSnapshot,
    GraphSceneSnapshot,
    Layer,
    LayerTiming,
    MathPlotSnapshot,
    MetaStep,
    Molecule2DSceneSnapshot,
    PlaybookScript,
    ReactionSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.algorithm_layout_compiler import (
    compile_bfs_graph_snapshot,
    compile_binary_search_code_highlight,
    compile_binary_search_code_trace_snapshot,
)
from app.domain.services.biology_layout_compiler import (
    compile_bio_cell_snapshot,
    compile_bio_process_snapshot,
)
from app.domain.services.chemistry_layout_compiler import (
    compile_molecule_2d_snapshot,
    compile_reaction_snapshot,
)
from app.domain.services.geography_layout_compiler import compile_geo_map_snapshot
from app.domain.services.math_layout_compiler import compile_math_plot_snapshot
from app.domain.services.physics_layout_compiler import compile_physics_force_snapshot
from app.domain.services.playbook_quality import estimate_step_frames

_FPS = 30
_DEFAULT_STEP_FRAMES = 180
_SCENE_BLUEPRINT_STEP_COUNT = 8


def compile_scene_blueprint_to_playbook(blueprint: dict[str, Any]) -> PlaybookScript:
    scene_type = _required_str(blueprint, "sceneType")
    title = str(blueprint.get("title") or scene_type.replace("_", " ").title())
    step_frames = _step_frames(blueprint)
    snapshot = _compile_snapshot(scene_type, blueprint)
    code_highlight = _code_highlight(scene_type, blueprint)
    steps = _compile_steps(
        scene_type=scene_type,
        title=title,
        snapshot=snapshot,
        code_highlight=code_highlight,
        step_frames=step_frames,
    )
    visual_intent = [str(item) for item in blueprint.get("visualIntent") or []]
    emphasis_points = [str(item) for item in blueprint.get("emphasisPoints") or []]
    return PlaybookScript(
        fps=_FPS,
        total_frames=steps[-1].end_frame,
        domain=TopicDomain(_required_str(blueprint, "subject")),
        title=title,
        summary=str(blueprint.get("caption") or title),
        steps=steps,
        parameter_controls=[],
        algorithm_id=scene_type,
        initial_data={
            "scene_blueprint": [scene_type],
            "visual_intent": visual_intent,
            "emphasis_points": emphasis_points,
        },
    )


def _required_str(payload: dict[str, Any], key: str) -> str:
    value = payload.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(f"SceneBlueprint requires a non-empty {key}.")
    return value


def _step_frames(blueprint: dict[str, Any]) -> int | None:
    duration_frames = blueprint.get("durationFrames")
    if isinstance(duration_frames, int | float):
        return max(1, round(duration_frames))
    duration_seconds = blueprint.get("durationSeconds")
    if isinstance(duration_seconds, int | float):
        return max(1, round(duration_seconds * _FPS))
    return None


def _compile_steps(
    scene_type: str,
    title: str,
    snapshot: Any,
    code_highlight: CodeHighlightOverlay | None,
    step_frames: int | None,
) -> list[MetaStep]:
    base_caption = str(getattr(snapshot, "caption", "") or title)
    captions = _step_captions(scene_type, title, base_caption)
    captions = [*captions, *([base_caption] * _SCENE_BLUEPRINT_STEP_COUNT)][
        :_SCENE_BLUEPRINT_STEP_COUNT
    ]
    steps: list[MetaStep] = []
    frame_cursor = 0
    for index, caption in enumerate(captions, start=1):
        step_snapshot = snapshot.model_copy(deep=True)
        step_code_highlight = code_highlight.model_copy(deep=True) if code_highlight else None
        if step_code_highlight is not None:
            step_code_highlight = _sync_code_highlight_state(
                scene_type,
                step_snapshot,
                step_code_highlight,
            )
        duration = (
            step_frames
            if step_frames is not None
            else max(_DEFAULT_STEP_FRAMES, estimate_step_frames(caption, _FPS))
        )
        frame_cursor += duration
        steps.append(
            MetaStep(
                step_id=f"{scene_type}_{index:02d}",
                end_frame=frame_cursor,
                title=f"{title} · {index}",
                voiceover_text=caption,
                animation_hint=step_snapshot.kind,
                snapshot=step_snapshot,
                layers=[Layer(timing=LayerTiming(), body=step_snapshot)],
                code_highlight=step_code_highlight,
                tokens=[],
            )
        )
    return steps


def _sync_code_highlight_state(
    scene_type: str,
    snapshot: Any,
    code_highlight: CodeHighlightOverlay,
) -> CodeHighlightOverlay:
    variables = dict(code_highlight.variables)
    if scene_type == "bfs_graph" and isinstance(snapshot, GraphSceneSnapshot):
        current = snapshot.current_node_id or next(iter(snapshot.active_node_ids), "done")
        queue = list(dict.fromkeys([*snapshot.queue_node_ids, *snapshot.frontier_node_ids]))
        variables.update(
            {
                "current": current,
                "queue": f"[{', '.join(queue)}]",
                "visited": f"{{{', '.join(snapshot.visited_node_ids)}}}",
            }
        )
    elif scene_type == "recursion_stack" and isinstance(snapshot, CallStackSceneSnapshot):
        current_frame = next(
            (frame for frame in snapshot.frames if frame.id == snapshot.current_frame_id),
            None,
        )
        if current_frame is not None:
            variables.update(current_frame.variables)
    return code_highlight.model_copy(update={"variables": variables})


def _step_captions(scene_type: str, title: str, base_caption: str) -> list[str]:
    scene_label = title.replace("_", " ")
    presets: dict[str, list[str]] = {
        "east_asia_monsoon": [
            (
                "东亚季风先看底图：东亚大陆和西太平洋被放在同一张 "
                "geo_map_scene 上，海陆位置是后续判断的坐标基准。"
            ),
            "map 上的陆地在夏季升温快，低压中心标出大陆一侧，说明近地面空气更容易向这里汇聚。",
            "map 上的西太平洋升温慢，海洋高压中心和海面图层一起说明海陆热力差异的方向。",
            "wind flow 箭头表示季风把空气在海陆之间输送，方向由当前布局输入决定。",
            (
                "wind_stream 或 moisture_particles 让空气/水汽输送可见，学生能看到"
                "降水来源不是凭空出现，而是随季风进入陆地。"
            ),
            "map 上的高压和低压标签同时保留，帮助比较海洋向陆地输送空气的压力梯度。",
            "map 把海陆、气压和风向合在一起：东亚夏季风来自海陆热力差异驱动的环流。",
            (
                "结论回到东亚季风 map：大陆低压吸引海洋湿空气，"
                "西太平洋高压提供输送方向，所以夏季风带来水汽和降水。"
            ),
        ],
        "projectile_motion": [
            "平抛运动先看 physics_force_scene 中的 projectile 物体，它是整个受力和轨迹分析的对象。",
            "projectile 的轨迹曲线显示物体一边水平前进，一边竖直下落，路径因此弯成抛物线。",
            "physics_force_scene 的 vector 层把速度、加速度或外力分开标出，帮助比较不同方向的量。",
            "projectile 旁边的 g 向下加速度箭头说明竖直变化来自重力，而不是水平速度突然改变。",
            "projectile 的 motion trail 历史点展示平抛过程，越往后竖直间隔越大，说明下落越来越快。",
            "projectile 附近的 force 矢量帮助区分速度方向、加速度方向和受力方向。",
            "projectile 公式 x=v0t 与 y=1/2gt^2 对应同一条轨迹：水平匀速，竖直匀加速。",
            (
                "结论回到平抛运动：projectile 同时遵守水平匀速和竖直重力加速，"
                "所以轨迹、vx、vy 和 g 必须一起读。"
            ),
        ],
        "cell_structure": [
            "cell 结构先看 bio_cell_scene 的整体轮廓，细胞膜定义了细胞内部与外部的边界。",
            "cell 的细胞核位于内部，callout 标出它储存 DNA，是遗传信息的核心位置。",
            "cell 中的 DNA 资产放在细胞核附近，说明遗传信息不是抽象文字。",
            "cell 的线粒体结构被单独标注，用来说明细胞能量释放与细胞器分工有关。",
            "cell 里的核糖体显示蛋白质合成的工作点，和细胞核中的遗传信息形成过程关系。",
            "cell 多个结构同时出现时，callout 帮助学生把名称、位置和功能一一对应。",
            "这一帧把 cell 的膜、核、线粒体、核糖体和 DNA 放在同一层级中。",
            "结论回到 cell 结构：细胞不是文字列表，而是由多个有位置、有功能的结构协同工作。",
        ],
        "dna_replication": [
            (
                "DNA 复制先看 bio_process_scene 的三段过程：模板 DNA、复制叉和新链"
                "被放在同一条流程线上。"
            ),
            "template DNA 资产表示被读取的原始双链，它提供后续互补配对的结构基础。",
            (
                "replication fork 资产标出双链打开的位置，说明复制不是整条链瞬间完成，"
                "而是从复制叉推进。"
            ),
            "flow_arrow 从模板指向复制叉，表示解旋和读取方向，过程关系不再靠文字猜测。",
            "复制叉到 new strands 的 flow_arrow 表示互补碱基配对后形成新链。",
            "base pairing callout 固定在复制叉上，把关键规则和发生位置连起来。",
            "三段 DNA 资产共同说明复制结果：每条原链都作为模板生成一条互补新链。",
            (
                "结论回到 DNA replication：模板链、复制叉、碱基配对和新链生成"
                "必须作为一个连续过程阅读。"
            ),
        ],
        "molecule_2d_water": [
            "水分子先看 molecule_2d_scene，氧原子和氢原子来自结构化 atom 数据。",
            "两个 O-H 键由 bond 数据生成，分子图不是手画 SVG，而是结构数据驱动的结果。",
            "弯曲构型让水分子的极性有了几何基础，H2O 不是一条直线。",
            "氧原子处于中心位置，两个氢原子形成夹角，学生可以直接读出连接关系。",
            "highlight 强调极性部分，说明电荷分布与分子形状相关。",
            "公式 H2O 与二维结构同时出现，把符号表达和空间结构连起来。",
            "这一帧展示 atom、bond 和 formula 如何共同说明同一个水分子。",
            "结论回到水分子：结构化原子和化学键决定它的二维形状，也支持后续讨论极性和氢键。",
        ],
        "molecule_2d_methane": [
            "甲烷分子先看 molecule_2d_scene，SMILES C 被解析到 methane structured preset。",
            "中心碳原子和四个氢原子来自结构化 atom 数据，不是手画分子图。",
            "四条 C-H 键由 bond 数据生成，说明甲烷的连接关系由结构数据决定。",
            "tetrahedral geometry callout 把甲烷的空间构型和二维教学图对应起来。",
            "公式 CH4 与 SMILES C 同时出现，帮助学生连接结构式和机器可读输入。",
            "renderer 只消费 atom、bond 和 callout 数据，具体布局由 deterministic preset 给出。",
            "这一帧把 methane molecule、SMILES C 和 tetrahedral geometry 放在同一视觉解释中。",
            (
                "结论回到 Methane molecule：SMILES-addressable preset 让甲烷通过"
                "结构数据渲染，而不是靠 LLM 手画。"
            ),
        ],
        "molecule_2d_glucose": [
            "葡萄糖分子先看 molecule_2d_scene，SMILES 输入由 RDKit 解析成结构化分子图。",
            "RDKit 给出 C6H12O6 分子式，并生成可缩放到 renderer 视口的二维坐标。",
            "图中的碳原子和氧原子来自 RDKit atom graph，氢原子通过分子式体现为隐式氢。",
            "每条 bond 都来自 RDKit 连接关系，renderer 只负责把结构数据画出来。",
            "SMILES 字段留在 snapshot 中，说明这个分子不是手写 SVG 或图片资产。",
            "atom-core 和 bond-line 仍然来自 chemistry-basic，保证视觉语言统一。",
            "这一帧把 glucose molecule、SMILES、atoms 和 bonds 放进同一个 deterministic layout。",
            "结论回到 Glucose molecule：复杂分子应从 SMILES/RDKit 结构数据渲染。",
        ],
        "reaction_synthesis_water": [
            "合成水反应先看 reaction_scene，氢气和氧气作为 reactants 放在反应箭头左侧。",
            "reaction_arrow 资产表示反应方向，从反应物指向生成物，避免用纯文字代替反应关系。",
            "electron_flow 资产标出成键过程中的电子流向，让反应机制成为可见层。",
            "生成物 H2O 放在 products 区域，和左侧反应物形成一条守恒关系。",
            "balanced atoms callout 强调配平后的原子数守恒，不只是把公式背下来。",
            "公式 2H2 + O2 -> 2H2O 与图中 reactants、arrow 和 products 一一对应。",
            "这一帧把 reaction_scene 中的反应物、生成物、反应箭头和电子流合成一个确定性布局。",
            "结论回到 Water synthesis reaction：反应式、箭头方向、电子流和原子守恒必须一起阅读。",
        ],
        "derivative_tangent": [
            "导数切线先看 math_plot 上的函数曲线，它给斜率判断提供可视坐标。",
            "标记点 x=1 固定在曲线上，说明导数讨论的是某一点附近的瞬时变化。",
            "切线穿过该点，它的倾斜程度就是这个点的局部变化率。",
            "曲线和切线放在同一坐标系中，帮助比较整体函数和局部线性近似。",
            "公式 f'(1)=2 对应切线斜率，学生能把代数结果映射到图像角度。",
            "如果观察点移动，切线方向会改变，这说明导数是随位置变化的函数。",
            "这一帧把函数、点、切线和公式合成一个确定性布局。",
            "结论回到导数切线：导数就是曲线在指定点的切线斜率，而不是整条曲线的平均变化。",
        ],
        "bfs_graph": [
            "BFS 图先看 graph_scene 中的节点和边，起点 S 是遍历过程的入口。",
            "BFS graph 的当前节点高亮表示算法正在处理的位置，visited 集合记录已经确认访问的节点。",
            "BFS graph 的队列显示 frontier，说明 BFS 按先进先出的顺序扩展下一层节点。",
            "BFS graph 从当前节点伸出的 active edge 表示本轮要检查的相邻关系。",
            "BFS graph 新节点进入队列后，图上的状态变化和代码行可以同步解释。",
            "BFS graph 的 visited 集合不断增长，帮助区分已经处理过和等待处理的节点。",
            "BFS graph 这一帧把图结构、队列和访问状态放在同一个可视布局里。",
            "结论回到 BFS：它按层扩展图节点，用队列保证先发现的节点先被处理。",
        ],
        "recursion_stack": [
            "递归栈先看 call_stack_scene：每一次 factorial 调用都会压入一个 call frame。",
            "factorial(4) 是当前 active frame，call-frame 资产标出正在执行的调用。",
            "factorial(3) 和 factorial(2) 是等待返回的 stack frames，说明乘法还没有结算。",
            "右侧 active-line 资产高亮 return n * factorial(n - 1)，对应新的递归调用。",
            "每个 frame 的 n 值显示当前调用保存的局部变量，避免把所有 n 混成同一个值。",
            "递归继续向 base case 推进，直到 factorial(1) 返回后才逐层弹栈。",
            "代码轨道和 call stack 同步，帮助学生把源代码行和运行时栈帧对应起来。",
            "结论回到递归栈：递归不是重复文字，而是一组等待返回的 call frames。",
        ],
        "binary_search": [
            "Binary search 先看 code_trace_scene：数组窗口、代码行和指针状态在同一帧同步。",
            "Binary search 的 low 和 high 指针标出当前仍可能包含目标值的有序区间。",
            (
                "Binary search 的 mid 指针落在中点 11 上，"
                "active-line 资产高亮本轮计算 midpoint 的代码。"
            ),
            (
                "Binary search 的当前 active index 对应 nums[mid]，"
                "它把代码里的下标访问映射到数组格子。"
            ),
            (
                "Binary search 如果 nums[mid] 小于 target，下一轮会丢弃左半区间；"
                "大于 target 则丢弃右半区间。"
            ),
            "Binary search 的变量面板显示 target、low、mid 和 high，避免把控制流藏在文字讲解里。",
            "Binary search 这一帧把搜索窗口、指针和分支判断编译成确定性布局。",
            "结论回到 Binary search：每次比较中点后，搜索范围都会缩小一半。",
        ],
    }
    return presets.get(
        scene_type,
        [
            f"{scene_label} 先建立主要视觉对象，{base_caption}",
            f"{scene_label} 的第二步强调核心资产和布局关系，避免用占位数组替代学科图像。",
            f"{scene_label} 的第三步把关键标签和主题层连接起来，让读者知道应该看哪里。",
            f"{scene_label} 的第四步展示主要变化方向，保持 renderer 输出和语义角色一致。",
            f"{scene_label} 的第五步解释数据或结构之间的因果关系。",
            f"{scene_label} 的第六步把公式、标签或 callout 与主视觉对应起来。",
            f"{scene_label} 的第七步复核视觉结论，确认没有偏离主题。",
            f"{scene_label} 的结论回到问题本身：{base_caption}",
        ],
    )


def _compile_snapshot(scene_type: str, blueprint: dict[str, Any]):
    if scene_type == "east_asia_monsoon":
        return _east_asia_monsoon_snapshot(blueprint)
    if scene_type == "projectile_motion":
        return _projectile_motion_snapshot(blueprint)
    if scene_type in {"cell_structure", "bio_cell_scene"}:
        return _cell_structure_snapshot(blueprint)
    if scene_type in {"dna_replication", "bio_process_scene"}:
        return _dna_replication_snapshot(blueprint)
    if scene_type in {"molecule_2d_scene", "molecule_2d_water"}:
        return _water_molecule_snapshot(blueprint)
    if scene_type == "molecule_2d_methane":
        return _methane_molecule_snapshot(blueprint)
    if scene_type == "molecule_2d_glucose":
        return _glucose_molecule_snapshot(blueprint)
    if scene_type in {"reaction_scene", "reaction_synthesis_water"}:
        return _water_synthesis_reaction_snapshot(blueprint)
    if scene_type in {"math_plot", "derivative_tangent"}:
        return _derivative_tangent_snapshot(blueprint)
    if scene_type == "bfs_graph":
        return _bfs_graph_snapshot(blueprint)
    if scene_type == "recursion_stack":
        return _recursion_stack_snapshot(blueprint)
    if scene_type == "binary_search":
        return compile_binary_search_code_trace_snapshot(blueprint)
    raise ValueError(f"Unsupported SceneBlueprint sceneType: {scene_type}")


def _east_asia_monsoon_snapshot(blueprint: dict[str, Any]) -> GeoMapSceneSnapshot:
    return compile_geo_map_snapshot(blueprint)


def _projectile_motion_snapshot(blueprint: dict[str, Any]):
    return compile_physics_force_snapshot(blueprint)


def _cell_structure_snapshot(blueprint: dict[str, Any]) -> BioCellSceneSnapshot:
    return compile_bio_cell_snapshot(blueprint)


def _dna_replication_snapshot(blueprint: dict[str, Any]) -> BioProcessSceneSnapshot:
    return compile_bio_process_snapshot(blueprint)


def _molecule_snapshot(
    blueprint: dict[str, Any],
    default_molecule_id: str,
) -> Molecule2DSceneSnapshot:
    return compile_molecule_2d_snapshot(blueprint, default_molecule_id=default_molecule_id)


def _water_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return _molecule_snapshot(blueprint, "water")


def _methane_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return _molecule_snapshot(blueprint, "methane")


def _glucose_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return compile_molecule_2d_snapshot(blueprint, default_molecule_id="glucose")


def _water_synthesis_reaction_snapshot(blueprint: dict[str, Any]) -> ReactionSceneSnapshot:
    return compile_reaction_snapshot(blueprint)


def _derivative_tangent_snapshot(blueprint: dict[str, Any]) -> MathPlotSnapshot:
    return compile_math_plot_snapshot(blueprint)


def _bfs_graph_snapshot(blueprint: dict[str, Any]) -> GraphSceneSnapshot:
    return compile_bfs_graph_snapshot(blueprint)


def _recursion_stack_snapshot(blueprint: dict[str, Any]) -> CallStackSceneSnapshot:
    return CallStackSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "algorithm-code-basic"),
        asset_id="recursion-stack-preset",
        frames=[
            CallStackFrame(
                id="factorial-4",
                label="factorial(4)",
                depth=0,
                state="active",
                asset_id="call-frame",
                variables={"n": "4"},
            ),
            CallStackFrame(
                id="factorial-3",
                label="factorial(3)",
                depth=1,
                state="waiting",
                asset_id="stack-frame",
                variables={"n": "3"},
            ),
            CallStackFrame(
                id="factorial-2",
                label="factorial(2)",
                depth=2,
                state="waiting",
                asset_id="stack-frame",
                variables={"n": "2"},
            ),
        ],
        code_trace=CallStackCodeTrace(
            language="python",
            lines=[
                "def factorial(n):",
                "    if n == 1:",
                "        return 1",
                "    return n * factorial(n - 1)",
            ],
            active_lines=[3],
            active_line=3,
            asset_id="active-line",
        ),
        current_frame_id="factorial-4",
        caption=str(
            blueprint.get("caption")
            or "Recursive calls form a stack frame for each pending multiplication."
        ),
    )


def _code_highlight(scene_type: str, blueprint: dict[str, Any]) -> CodeHighlightOverlay | None:
    visual_intent = ", ".join(str(item) for item in blueprint.get("visualIntent") or [])
    if scene_type == "binary_search":
        return compile_binary_search_code_highlight(blueprint)
    if scene_type == "recursion_stack":
        return CodeHighlightOverlay(
            language="python",
            lines=[
                "def factorial(n):",
                "    if n == 1:",
                "        return 1",
                "    return n * factorial(n - 1)",
            ],
            active_lines=[3],
            active_line=3,
            variables={
                "intent": visual_intent,
                "n": "4",
                "pending": "4 * factorial(3)",
            },
            operation_label="recursive call",
        )
    if scene_type != "bfs_graph":
        return None
    return CodeHighlightOverlay(
        language="typescript",
        lines=[
            "function BFS(start) {",
            "  const queue = [start];",
            "  const visited = new Set([start]);",
            "  const node = queue.shift();",
            "  for (const next of graph[node]) {",
            "    if (!visited.has(next)) queue.push(next);",
            "  }",
            "}",
        ],
        active_lines=[4, 5, 6],
        active_line=6,
        variables={
            "intent": visual_intent,
            "current": "A",
            "queue": "[B, C]",
            "visited": "{S, A}",
        },
        operation_label="enqueue neighbors",
    )
