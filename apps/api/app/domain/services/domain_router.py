from __future__ import annotations

from app.domain.models.topic import TopicDomain

# Ordered by priority: earlier entries win on ambiguous prompts
_KEYWORD_MAP: list[tuple[TopicDomain, frozenset[str]]] = [
    (TopicDomain.ALGORITHM, frozenset({
        "排序", "查找", "搜索", "遍历", "递归", "动态规划", "贪心", "回溯",
        "二分", "快排", "归并", "堆", "栈", "队列", "链表", "树", "图",
        "sort", "search", "binary", "dfs", "bfs", "dp", "greedy", "recursive",
        "algorithm", "traverse", "hash", "pointer", "sliding window",
    })),
    (TopicDomain.CODE, frozenset({
        "代码", "源码", "函数", "变量", "python", "cpp", "c++",
        "javascript", "java", "class", "def ", "for ", "while ", "return",
        "code", "source", "function", "variable", "loop",
    })),
    (TopicDomain.MATH, frozenset({
        "积分", "导数", "微分", "极限", "矩阵", "向量", "概率", "统计",
        "方程", "函数", "坐标", "几何", "三角", "对数",
        "integral", "derivative", "matrix", "vector", "probability",
        "equation", "calculus", "geometry", "trigonometry",
    })),
    (TopicDomain.PHYSICS, frozenset({
        "力", "速度", "加速度", "能量", "动量", "电路", "电场", "磁场",
        "波", "光", "热力学", "受力", "摩擦", "斜面",
        "force", "velocity", "acceleration", "energy", "circuit",
        "electric", "magnetic", "wave", "optics", "physics",
    })),
    (TopicDomain.CHEMISTRY, frozenset({
        "分子", "原子", "化学键", "反应", "氧化", "还原", "酸碱",
        "有机", "元素", "化合物", "催化",
        "molecule", "atom", "bond", "reaction", "oxidation",
        "chemistry", "organic", "element", "compound",
    })),
    (TopicDomain.BIOLOGY, frozenset({
        "细胞", "基因", "蛋白质", "有丝分裂", "减数分裂", "遗传",
        "生态", "进化", "细菌", "病毒", "酶",
        "cell", "gene", "protein", "mitosis", "genetics",
        "biology", "evolution", "ecology", "bacteria", "enzyme",
    })),
    (TopicDomain.GEOGRAPHY, frozenset({
        "地图", "区域", "气候", "水循环", "板块", "人口", "城市",
        "河流", "山脉", "季风", "洋流", "生态系统",
        "map", "region", "climate", "hydrological", "plate",
        "geography", "population", "terrain", "monsoon",
    })),
]


def keyword_hint(prompt: str) -> TopicDomain:
    """Return a domain hint based on keyword matching.

    Result is a best-effort guess passed to the LLM as a hint.
    The LLM makes the final domain decision via CirDocument.domain.
    """
    lowered = prompt.lower()
    for domain, keywords in _KEYWORD_MAP:
        if any(kw in lowered for kw in keywords):
            return domain
    return TopicDomain.ALGORITHM
