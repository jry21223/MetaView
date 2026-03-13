from __future__ import annotations

from app.schemas import TopicDomain


def infer_domain(prompt: str, source_image: str | None = None) -> TopicDomain:
    prompt_lower = prompt.lower()

    if source_image:
        physics_score = _keyword_score(
            prompt_lower,
            [
                "受力",
                "加速度",
                "速度",
                "斜面",
                "小球",
                "碰撞",
                "抛体",
                "电路",
                "电场",
                "磁场",
                "physics",
                "force",
                "velocity",
                "acceleration",
                "circuit",
            ],
        )
        math_score = _keyword_score(
            prompt_lower,
            ["几何", "图形", "角度", "triangle", "geometry", "解析几何"],
        )
        if physics_score >= math_score:
            return TopicDomain.PHYSICS

    scores: dict[TopicDomain, int] = {
        TopicDomain.ALGORITHM: _keyword_score(
            prompt_lower,
            [
                "算法",
                "排序",
                "查找",
                "数组",
                "链表",
                "图论",
                "动态规划",
                "二叉树",
                "递归",
                "acm",
                "leetcode",
                "algorithm",
                "binary",
                "graph",
                "tree",
                "dp",
            ],
        ),
        TopicDomain.MATH: _keyword_score(
            prompt_lower,
            [
                "数学",
                "函数",
                "导数",
                "积分",
                "极限",
                "矩阵",
                "线性代数",
                "概率",
                "几何",
                "微分",
                "theorem",
                "derivative",
                "integral",
                "matrix",
            ],
        ),
        TopicDomain.PHYSICS: _keyword_score(
            prompt_lower,
            [
                "物理",
                "受力",
                "力学",
                "加速度",
                "速度",
                "位移",
                "电路",
                "电压",
                "电流",
                "磁场",
                "波动",
                "physics",
                "force",
                "velocity",
                "acceleration",
                "circuit",
            ],
        ),
        TopicDomain.CHEMISTRY: _keyword_score(
            prompt_lower,
            [
                "化学",
                "分子",
                "原子",
                "离子",
                "反应",
                "滴定",
                "化学键",
                "轨道",
                "chemistry",
                "molecule",
                "bond",
                "reaction",
            ],
        ),
        TopicDomain.BIOLOGY: _keyword_score(
            prompt_lower,
            [
                "生物",
                "细胞",
                "基因",
                "遗传",
                "代谢",
                "神经",
                "生态",
                "biology",
                "cell",
                "gene",
                "ecosystem",
            ],
        ),
        TopicDomain.GEOGRAPHY: _keyword_score(
            prompt_lower,
            [
                "地理",
                "板块",
                "洋流",
                "水循环",
                "气候",
                "人口迁移",
                "城市演化",
                "geography",
                "climate",
                "migration",
                "plate",
            ],
        ),
    }

    best_domain = max(scores, key=scores.get)
    if scores[best_domain] == 0:
        return TopicDomain.ALGORITHM
    return best_domain


def _keyword_score(prompt_lower: str, keywords: list[str]) -> int:
    return sum(1 for keyword in keywords if keyword in prompt_lower)
