import type { TopicDomain } from "./types";

export interface DomainMetricCard {
  label: string;
  value: string;
  description: string;
}

export interface DomainPresentation {
  domain: TopicDomain;
  navLabel: string;
  studioTitle: string;
  studioDescription: string;
  emptyTitle: string;
  emptyDescription: string;
  sceneNodes: string[];
  metrics: [DomainMetricCard, DomainMetricCard];
}

export const domainLabels: Record<TopicDomain, string> = {
  algorithm: "Algorithms",
  math: "Mathematics",
  code: "Code",
  physics: "Physics",
  chemistry: "Chemistry",
  biology: "Biology",
  geography: "Geography",
};

export const domainPresets: Record<TopicDomain, string> = {
  algorithm: "请可视化讲解二分查找的边界收缩过程，突出 left / mid / right 的变化。",
  math: "请可视化讲解定积分如何通过分割区间逼近曲线下方面积。",
  code: "请根据这段源码讲解算法状态如何变化，并突出循环边界与关键变量。",
  physics: "请根据题图讲解斜面小球的受力、加速度和运动轨迹。",
  chemistry: "请可视化讲解分子结构中化学键的变化以及反应机理。",
  biology: "请可视化讲解细胞有丝分裂各阶段的结构变化和调控过程。",
  geography: "请可视化讲解水循环中的蒸发、降水与径流如何在区域内演化。",
};

const domainPresentations: Record<TopicDomain, DomainPresentation> = {
  algorithm: {
    domain: "algorithm",
    navLabel: "Algorithms",
    studioTitle: "Algorithm Process Lab",
    studioDescription: "突出状态、边界、递推和复杂度，把算法过程拆成可追踪的教学镜头。",
    emptyTitle: "State transitions, pointer shifts and proof-by-iteration.",
    emptyDescription: "空态预览会展示算法模块计划中的关键状态节点，实际渲染后将替换为生成视频。",
    sceneNodes: ["Input", "State", "Transition", "Result"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "State Trace",
        description: "每一步变量变化必须能被定位、对齐和讲解。",
      },
      {
        label: "Default Flow",
        value: "3 Scenes",
        description: "通常拆成建模、推进和结果收束三个镜头。",
      },
    ],
  },
  math: {
    domain: "math",
    navLabel: "Mathematics",
    studioTitle: "Mathematical Derivation Deck",
    studioDescription: "适合公式推导、几何关系、积分区域和线性变换的分镜化讲解。",
    emptyTitle: "Objects, transformations and mathematical closure.",
    emptyDescription: "在没有视频结果时，预览区会先展示当前数学主题的推导骨架。",
    sceneNodes: ["Object", "Rule", "Transform", "Conclusion"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Continuity",
        description: "公式和图像之间保持连续变形，避免跳步。",
      },
      {
        label: "Primary Medium",
        value: "Formula + Graph",
        description: "坐标系、符号和结论页共同组成完整解释链。",
      },
    ],
  },
  code: {
    domain: "code",
    navLabel: "Code",
    studioTitle: "Source Walkthrough Console",
    studioDescription: "从 Python 或 C++ 源码提取结构、控制流与关键变量，生成讲解动画。",
    emptyTitle: "Control flow, data structures and code-aligned animation.",
    emptyDescription: "空态时先呈现源码讲解蓝图，渲染完成后再展示对应视频与脚本输出。",
    sceneNodes: ["Function", "Structure", "Loop", "Return"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Code Alignment",
        description: "代码块与动画镜头一一对应，而不是只展示最终结果。",
      },
      {
        label: "Input Mode",
        value: "Python / C++",
        description: "优先识别循环、递归、边界条件和关键数据结构。",
      },
    ],
  },
  physics: {
    domain: "physics",
    navLabel: "Physics",
    studioTitle: "Physics Modeling Station",
    studioDescription: "先做受力或电路建模，再进入动态演化和结果校核，而不是只复刻题图。",
    emptyTitle: "Objects, laws, constraints and measurable motion.",
    emptyDescription: "题图、受力、电路和运动过程会以建模优先的方式组织到预览骨架中。",
    sceneNodes: ["Object", "Constraint", "Law", "Trajectory"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Physical Law",
        description: "方向、单位和变化趋势必须符合实际物理关系。",
      },
      {
        label: "Image Support",
        value: "Enabled",
        description: "适合接入题图进行对象、约束和已知量提取。",
      },
    ],
  },
  chemistry: {
    domain: "chemistry",
    navLabel: "Chemistry",
    studioTitle: "Molecular Structure Bay",
    studioDescription: "围绕结构识别、反应推进和机理解释组织化学动画。",
    emptyTitle: "Atoms, bonds, transition states and products.",
    emptyDescription: "未出视频前会先展示当前化学主题的结构节点与反应流程蓝图。",
    sceneNodes: ["Atom", "Bond", "Transition", "Product"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Bond Change",
        description: "强调键连接、构型变化和反应前后的可追踪重组。",
      },
      {
        label: "Primary Medium",
        value: "Molecule",
        description: "核心镜头围绕球棍结构和过渡过程展开。",
      },
    ],
  },
  biology: {
    domain: "biology",
    navLabel: "Biology",
    studioTitle: "Biological Process Grid",
    studioDescription: "强调层级、阶段和调控路径，适合细胞、遗传与生态过程。",
    emptyTitle: "Structures, stages and cause-effect pathways.",
    emptyDescription: "空态预览会把生命过程拆成结构定位、流转和功能结论三个层次。",
    sceneNodes: ["Structure", "Stage", "Signal", "Outcome"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Process Levels",
        description: "避免把不同尺度的对象压到同一个镜头里。",
      },
      {
        label: "Primary Medium",
        value: "Cell + Flow",
        description: "结构图和流程箭头配合讲清调控与功能变化。",
      },
    ],
  },
  geography: {
    domain: "geography",
    navLabel: "Geography",
    studioTitle: "Geospatial Observatory",
    studioDescription: "从空间底图出发，展示区域格局、流向变化和时间演化。",
    emptyTitle: "Regions, drivers, flows and spatiotemporal change.",
    emptyDescription: "没有视频时，地图台会先呈现区域底图思路和地理过程的分析节点。",
    sceneNodes: ["Region", "Driver", "Change", "Pattern"],
    metrics: [
      {
        label: "Teaching Focus",
        value: "Map Consistency",
        description: "所有变化都围绕同一空间底图和坐标理解展开。",
      },
      {
        label: "Primary Medium",
        value: "Map + Timeline",
        description: "适合水循环、人口迁移、板块和区域演化解释。",
      },
    ],
  },
};

export const genericPresentation = {
  kicker: "Multi-Subject Render Studio",
  title: "Prompt-driven lecture films for algorithms, math, science and source code.",
  description: "输入题目、源码或题图后，系统会自动路由学科模块并生成后端渲染视频。",
};

export function getDomainPresentation(
  domain: TopicDomain | null | undefined,
): DomainPresentation | null {
  if (!domain) {
    return null;
  }
  return domainPresentations[domain];
}
