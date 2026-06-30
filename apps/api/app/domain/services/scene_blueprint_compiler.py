from __future__ import annotations

from typing import Any

from app.domain.models.playbook import (
    BioCellCallout,
    BioCellSceneSnapshot,
    BioCellStructure,
    BioProcessConnection,
    BioProcessSceneSnapshot,
    BioProcessStep,
    CodeHighlightOverlay,
    GeoMapFlow,
    GeoMapLayer,
    GeoMapSceneSnapshot,
    GeoPressureCenter,
    GraphSceneEdge,
    GraphSceneNode,
    GraphSceneSnapshot,
    Layer,
    LayerTiming,
    MathPlotCurve,
    MathPlotSnapshot,
    MetaStep,
    Molecule2DAtom,
    Molecule2DBond,
    Molecule2DCallout,
    Molecule2DSceneSnapshot,
    PhysicsForceSceneSnapshot,
    PhysicsSceneObject,
    PhysicsSceneVector,
    PlaybookScript,
    ReactionArrow,
    ReactionElectronFlow,
    ReactionParticipant,
    ReactionSceneSnapshot,
)
from app.domain.models.topic import TopicDomain
from app.domain.services.molecule_preset_resolver import (
    resolve_molecule_preset_by_smiles_for_renderer,
    resolve_molecule_preset_for_renderer,
)
from app.domain.services.rdkit_molecule_compiler import compile_molecule_snapshot_from_smiles

_FPS = 30
_DEFAULT_STEP_FRAMES = 180
_SCENE_BLUEPRINT_STEP_COUNT = 8
_GLUCOSE_SMILES = "OC[C@H]1O[C@@H](O)[C@H](O)[C@H](O)[C@@H]1O"


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


def _step_frames(blueprint: dict[str, Any]) -> int:
    duration_frames = blueprint.get("durationFrames")
    if isinstance(duration_frames, int | float):
        return max(1, round(duration_frames))
    duration_seconds = blueprint.get("durationSeconds")
    if isinstance(duration_seconds, int | float):
        return max(1, round(duration_seconds * _FPS))
    return _DEFAULT_STEP_FRAMES


def _compile_steps(
    scene_type: str,
    title: str,
    snapshot: Any,
    code_highlight: CodeHighlightOverlay | None,
    step_frames: int,
) -> list[MetaStep]:
    base_caption = str(getattr(snapshot, "caption", "") or title)
    captions = _step_captions(scene_type, title, base_caption)
    captions = [*captions, *([base_caption] * _SCENE_BLUEPRINT_STEP_COUNT)][
        :_SCENE_BLUEPRINT_STEP_COUNT
    ]
    steps: list[MetaStep] = []
    for index, caption in enumerate(captions, start=1):
        step_snapshot = snapshot.model_copy(deep=True)
        step_code_highlight = code_highlight.model_copy(deep=True) if code_highlight else None
        steps.append(
            MetaStep(
                step_id=f"{scene_type}_{index:02d}",
                end_frame=index * step_frames,
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
            "monsoon_flow 箭头从海洋指向陆地，表示夏季风把暖湿空气推向东亚大陆。",
            (
                "moisture_particles 让水汽输送可见，学生能看到降水来源不是"
                "凭空出现，而是随季风进入陆地。"
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
            "速度矢量分解为水平 vx 和竖直 vy，水平分量保持稳定，竖直分量会随时间增大。",
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
            "细胞结构先看 bio_cell_scene 的整体轮廓，细胞膜定义了细胞内部与外部的边界。",
            "细胞核位于细胞内部，callout 标出它储存 DNA，是遗传信息的核心位置。",
            "DNA 资产放在细胞核附近，说明遗传信息不是抽象文字，而是细胞结构中的实际内容。",
            "线粒体结构被单独标注，用来说明细胞能量释放与细胞器分工有关。",
            "核糖体显示蛋白质合成的工作点，和细胞核中的遗传信息形成过程关系。",
            "多个结构同时出现时，callout 帮助学生把名称、位置和功能一一对应。",
            "这一帧把膜、核、线粒体、核糖体和 DNA 放在同一层级中，形成细胞结构地图。",
            "结论回到细胞结构：细胞不是文字列表，而是由多个有位置、有功能的结构协同工作。",
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
            "当前节点高亮表示算法正在处理的位置，visited 集合记录已经确认访问的节点。",
            "队列显示 frontier，说明 BFS 按先进先出的顺序扩展下一层节点。",
            "从当前节点伸出的 active edge 表示本轮要检查的相邻关系。",
            "新节点进入队列后，图上的状态变化和代码行可以同步解释。",
            "visited 集合不断增长，帮助区分已经处理过和等待处理的节点。",
            "这一帧把图结构、队列和访问状态放在同一个可视布局里。",
            "结论回到 BFS：它按层扩展图节点，用队列保证先发现的节点先被处理。",
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
    if scene_type == "cell_structure":
        return _cell_structure_snapshot(blueprint)
    if scene_type == "dna_replication":
        return _dna_replication_snapshot(blueprint)
    if scene_type == "molecule_2d_water":
        return _water_molecule_snapshot(blueprint)
    if scene_type == "molecule_2d_methane":
        return _methane_molecule_snapshot(blueprint)
    if scene_type == "molecule_2d_glucose":
        return _glucose_molecule_snapshot(blueprint)
    if scene_type == "reaction_synthesis_water":
        return _water_synthesis_reaction_snapshot(blueprint)
    if scene_type == "derivative_tangent":
        return _derivative_tangent_snapshot(blueprint)
    if scene_type == "bfs_graph":
        return _bfs_graph_snapshot(blueprint)
    raise ValueError(f"Unsupported SceneBlueprint sceneType: {scene_type}")


def _east_asia_monsoon_snapshot(blueprint: dict[str, Any]) -> GeoMapSceneSnapshot:
    return GeoMapSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "geography-earth-basic"),
        map_region="east_asia",
        layers=[
            GeoMapLayer(
                id="map",
                semantic_role="map_layer",
                label="East Asia map",
                asset_id="east-asia-land-110m",
            ),
            GeoMapLayer(id="land", semantic_role="land", label="heated continent"),
            GeoMapLayer(
                id="ocean",
                semantic_role="ocean",
                label="western Pacific",
                asset_id="east-asia-ocean-background",
            ),
        ],
        flows=[
            GeoMapFlow(
                id="summer-monsoon",
                semantic_role="monsoon_flow",
                **{"from": (78, 68)},
                to=(42, 38),
                label="summer monsoon",
                asset_id="monsoon-wind-arrow",
                strength=1.1,
            ),
        ],
        pressure_centers=[
            GeoPressureCenter(id="land-low", kind="low", x=38, y=35, label="land low"),
            GeoPressureCenter(id="ocean-high", kind="high", x=76, y=64, label="ocean high"),
        ],
        particle_preset="moisture_particles",
        caption=str(
            blueprint.get("caption")
            or "Land-sea thermal contrast reverses seasonal wind direction."
        ),
    )


def _projectile_motion_snapshot(blueprint: dict[str, Any]) -> PhysicsForceSceneSnapshot:
    return PhysicsForceSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "physics-basic"),
        objects=[
            PhysicsSceneObject(
                id="body", label="projectile", x=30, y=42, asset_id="projectile-body-dot"
            ),
        ],
        vectors=[
            PhysicsSceneVector(
                id="vx", target="body", semantic_role="velocity", dx=28, dy=0, label="v_x"
            ),
            PhysicsSceneVector(
                id="vy", target="body", semantic_role="velocity", dx=0, dy=18, label="v_y"
            ),
            PhysicsSceneVector(
                id="g", target="body", semantic_role="acceleration", dx=0, dy=24, label="g"
            ),
            PhysicsSceneVector(
                id="force", target="body", semantic_role="force", dx=-16, dy=8, label="F"
            ),
        ],
        trajectory=[(18, 34), (31.5, 36.8), (45, 45), (58.5, 58.8), (72, 78)],
        formula_latex="x=v_0t,\\quad y=\\frac12gt^2",
        caption=str(
            blueprint.get("caption")
            or "Horizontal velocity stays constant while vertical acceleration bends the path."
        ),
    )


def _cell_structure_snapshot(blueprint: dict[str, Any]) -> BioCellSceneSnapshot:
    return BioCellSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "biology-basic"),
        cell_type="animal",
        structures=[
            BioCellStructure(
                id="cell",
                semantic_role="cell",
                label="cell membrane",
                x=50,
                y=52,
                width=66,
                height=50,
                asset_id="cell-outline",
            ),
            BioCellStructure(
                id="nucleus",
                semantic_role="nucleus",
                label="nucleus",
                x=47,
                y=48,
                width=20,
                height=18,
                asset_id="nucleus",
            ),
            BioCellStructure(
                id="mitochondrion",
                semantic_role="mitochondrion",
                label="mitochondrion",
                x=67,
                y=59,
                width=16,
                height=10,
                asset_id="mitochondrion",
            ),
            BioCellStructure(
                id="ribosome",
                semantic_role="ribosome",
                label="ribosome",
                x=36,
                y=61,
                width=8,
                height=7,
                asset_id="ribosome",
            ),
            BioCellStructure(
                id="dna",
                semantic_role="dna",
                label="DNA",
                x=47,
                y=48,
                width=8,
                height=12,
                asset_id="dna-helix",
            ),
        ],
        callouts=[
            BioCellCallout(
                id="nucleus-callout", target_id="nucleus", label="stores DNA", side="left"
            ),
            BioCellCallout(
                id="mitochondrion-callout",
                target_id="mitochondrion",
                label="releases energy",
                side="right",
            ),
        ],
        caption=str(
            blueprint.get("caption")
            or "Animal cells contain specialized organelles with distinct functions."
        ),
    )


def _dna_replication_snapshot(blueprint: dict[str, Any]) -> BioProcessSceneSnapshot:
    return BioProcessSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "biology-basic"),
        process_id="dna_replication",
        steps=[
            BioProcessStep(
                id="template",
                semantic_role="dna",
                label="template DNA",
                x=22,
                y=48,
                width=18,
                height=38,
                asset_id="dna-helix",
            ),
            BioProcessStep(
                id="fork",
                semantic_role="process_step",
                label="replication fork",
                x=50,
                y=48,
                width=24,
                height=24,
                asset_id="replication-fork",
                description="strand separation and base pairing",
            ),
            BioProcessStep(
                id="copy",
                semantic_role="dna",
                label="new strands",
                x=78,
                y=48,
                width=18,
                height=38,
                asset_id="dna-helix",
            ),
        ],
        connections=[
            BioProcessConnection(
                id="template-to-fork",
                **{"from": "template"},
                to="fork",
                semantic_role="flow_arrow",
                label="unzip",
                asset_id="core-flow-arrow",
            ),
            BioProcessConnection(
                id="fork-to-copy",
                **{"from": "fork"},
                to="copy",
                semantic_role="flow_arrow",
                label="copy",
                asset_id="core-flow-arrow",
            ),
        ],
        callouts=[
            BioCellCallout(id="base-pairing", target_id="fork", label="base pairing", side="top"),
        ],
        caption=str(
            blueprint.get("caption")
            or "DNA replication copies each strand by complementary base pairing."
        ),
    )


def _molecule_snapshot(
    blueprint: dict[str, Any],
    default_molecule_id: str,
) -> Molecule2DSceneSnapshot:
    pack_id = str(blueprint.get("packId") or "chemistry-basic")
    molecule_id = str(blueprint.get("moleculeId") or default_molecule_id)
    smiles = str(blueprint["smiles"]) if blueprint.get("smiles") else None
    preset = (
        resolve_molecule_preset_by_smiles_for_renderer(pack_id, smiles)
        or resolve_molecule_preset_for_renderer(pack_id, molecule_id)
    )
    if preset is not None:
        return Molecule2DSceneSnapshot(
            pack_id=pack_id,
            molecule_id=preset.molecule_id,
            smiles=preset.smiles or smiles,
            molecule_asset_id=preset.molecule_asset_id,
            atoms=[
                atom.model_copy(update={"asset_id": "atom-core"}) for atom in preset.atoms
            ],
            bonds=[
                bond.model_copy(update={"asset_id": "bond-line"}) for bond in preset.bonds
            ],
            callouts=preset.callouts,
            formula_latex=preset.formula_latex,
            caption=str(blueprint.get("caption") or preset.caption),
        )

    return Molecule2DSceneSnapshot(
        pack_id=pack_id,
        molecule_id=molecule_id,
        smiles=smiles,
        molecule_asset_id="water-molecule-preset",
        atoms=[
            Molecule2DAtom(id="o", element="O", x=50, y=42, asset_id="atom-core", label="oxygen"),
            Molecule2DAtom(
                id="h1", element="H", x=35, y=62, asset_id="atom-core", label="hydrogen"
            ),
            Molecule2DAtom(
                id="h2", element="H", x=65, y=62, asset_id="atom-core", label="hydrogen"
            ),
        ],
        bonds=[
            Molecule2DBond(id="oh1", **{"from": "o"}, to="h1", order=1, asset_id="bond-line"),
            Molecule2DBond(id="oh2", **{"from": "o"}, to="h2", order=1, asset_id="bond-line"),
        ],
        callouts=[
            Molecule2DCallout(id="bent-shape", target_id="o", label="bent geometry", side="top"),
            Molecule2DCallout(id="polar-bond", target_id="h2", label="polar bonds", side="right"),
        ],
        formula_latex="H_2O",
        caption=str(
            blueprint.get("caption")
            or "Water is a bent polar molecule built from structured atom and bond data."
        ),
    )


def _water_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return _molecule_snapshot(blueprint, "water")


def _methane_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return _molecule_snapshot({**blueprint, "smiles": blueprint.get("smiles") or "C"}, "methane")


def _glucose_molecule_snapshot(blueprint: dict[str, Any]) -> Molecule2DSceneSnapshot:
    return compile_molecule_snapshot_from_smiles(
        pack_id=str(blueprint.get("packId") or "chemistry-basic"),
        molecule_id=str(blueprint.get("moleculeId") or "glucose"),
        smiles=str(blueprint.get("smiles") or _GLUCOSE_SMILES),
        atom_asset_id="atom-core",
        bond_asset_id="bond-line",
        caption=str(
            blueprint.get("caption") or "Glucose is rendered from RDKit SMILES structure data."
        ),
    )


def _water_synthesis_reaction_snapshot(blueprint: dict[str, Any]) -> ReactionSceneSnapshot:
    return ReactionSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "chemistry-basic"),
        reaction_id="reaction_synthesis_water",
        reactants=[
            ReactionParticipant(
                id="h2",
                formula_latex="H_2",
                label="hydrogen",
                coefficient=2,
                x=18,
                y=48,
            ),
            ReactionParticipant(
                id="o2",
                formula_latex="O_2",
                label="oxygen",
                coefficient=1,
                x=38,
                y=48,
            ),
        ],
        products=[
            ReactionParticipant(
                id="h2o",
                formula_latex="H_2O",
                label="water",
                coefficient=2,
                x=78,
                y=48,
            ),
        ],
        arrows=[
            ReactionArrow(
                id="main-arrow",
                semantic_role="reaction_arrow",
                **{"from": (48, 48)},
                to=(66, 48),
                label="forms",
                asset_id="reaction-arrow",
            ),
        ],
        electron_flows=[
            ReactionElectronFlow(
                id="electron-shift",
                semantic_role="electron_flow",
                **{"from": (39, 38)},
                to=(58, 36),
                label="bond rearrangement",
                asset_id="electron-flow",
            ),
        ],
        callouts=[
            Molecule2DCallout(
                id="balanced", target_id="main-arrow", label="balanced atoms", side="top"
            ),
        ],
        formula_latex="2H_2 + O_2 \\rightarrow 2H_2O",
        caption=str(
            blueprint.get("caption")
            or "A balanced reaction conserves each atom across reactants and products."
        ),
    )


def _derivative_tangent_snapshot(blueprint: dict[str, Any]) -> MathPlotSnapshot:
    return MathPlotSnapshot(
        pack_id=str(blueprint.get("packId") or "math-basic"),
        asset_id="derivative-tangent-preset",
        curves=[
            MathPlotCurve(
                expression="x^2", label="f(x)=x^2", emphasis="primary", semantic_role="curve"
            ),
            MathPlotCurve(
                expression="2*x - 1",
                label="tangent slope = 2",
                emphasis="accent",
                semantic_role="tangent",
            ),
        ],
        x_min=-1,
        x_max=3,
        y_min=-1,
        y_max=5,
        marker_x=1,
        shade_from=0.85,
        shade_to=1.15,
        x_label="x",
        y_label="f(x)",
        formula_latex="f'(1)=2",
        caption=str(
            blueprint.get("caption") or "The derivative at x=1 is the slope of the tangent line."
        ),
    )


def _bfs_graph_snapshot(blueprint: dict[str, Any]) -> GraphSceneSnapshot:
    return GraphSceneSnapshot(
        pack_id=str(blueprint.get("packId") or "algorithm-code-basic"),
        asset_id="bfs-graph-preset",
        nodes=[
            GraphSceneNode(id="S", label="S", x=-3, y=0),
            GraphSceneNode(id="A", label="A", x=-1, y=0),
            GraphSceneNode(id="B", label="B", x=1.1, y=-1.3),
            GraphSceneNode(id="C", label="C", x=1.1, y=1.3),
            GraphSceneNode(id="D", label="D", x=3, y=0),
        ],
        edges=[
            GraphSceneEdge(id="S-A", source="S", target="A"),
            GraphSceneEdge(id="A-B", source="A", target="B"),
            GraphSceneEdge(id="A-C", source="A", target="C"),
            GraphSceneEdge(id="B-D", source="B", target="D"),
            GraphSceneEdge(id="C-D", source="C", target="D"),
        ],
        directed=True,
        current_node_id="A",
        active_node_ids=["A"],
        visited_node_ids=["S"],
        queue_node_ids=["B", "C"],
        active_edge_ids=["A-B"],
        caption=str(
            blueprint.get("caption")
            or "BFS expands the current node and appends unvisited neighbors to the queue."
        ),
    )


def _code_highlight(scene_type: str, blueprint: dict[str, Any]) -> CodeHighlightOverlay | None:
    if scene_type != "bfs_graph":
        return None
    visual_intent = ", ".join(str(item) for item in blueprint.get("visualIntent") or [])
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
