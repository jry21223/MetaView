import type {
  TeachingDeckInput,
  TeachingDeckProject,
  TeachingDeckRenderer,
  TeachingDeckSlide,
  TeachingDeckSlideKind,
  TeachingDeckValidationIssue,
} from "../../../entities/teaching-deck/types";

export const DEFAULT_TEACHING_DECK_INPUT: TeachingDeckInput = {
  topic: "椭圆及其标准方程",
  grade: "高中二年级",
  durationMinutes: 25,
  teachingGoals: [
    "理解椭圆的定义",
    "理解椭圆标准方程的建立过程",
    "能判断焦点所在坐标轴",
  ].join("\n"),
  sourceMaterial: "",
};

export const TEACHING_DECK_SLIDE_KIND_LABELS: Record<
  TeachingDeckSlideKind,
  string
> = {
  cover: "封面",
  objectives: "学习目标",
  context: "情境导入",
  concept: "概念讲解",
  dynamic_explanation: "动态演示",
  derivation: "推导过程",
  example: "典型例题",
  exercise: "随堂练习",
  summary: "课堂总结",
};

export const TEACHING_DECK_RENDERER_LABELS: Record<
  TeachingDeckRenderer,
  string
> = {
  pptmaster: "原生 PPT",
  metaview: "MetaView 动态页",
};

interface SlideSeed {
  kind: TeachingDeckSlideKind;
  title: string;
  teachingGoal: string;
  points: string[];
  renderer?: TeachingDeckRenderer;
  visualStrategy?: string;
  durationSeconds?: number;
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function compactText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function sourceExcerpt(sourceMaterial: string): string | null {
  const compact = compactText(sourceMaterial);
  if (!compact) return null;
  return compact.length > 140 ? `${compact.slice(0, 137)}…` : compact;
}

export function splitTeachingGoals(value: string): string[] {
  return value
    .split(/[\n；;]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizedInput(input: TeachingDeckInput): TeachingDeckInput {
  return {
    topic: input.topic.trim() || "未命名课题",
    grade: input.grade.trim() || "未指定年级",
    durationMinutes: Math.min(90, Math.max(10, Math.round(input.durationMinutes || 25))),
    teachingGoals: input.teachingGoals.trim(),
    sourceMaterial: input.sourceMaterial.trim(),
  };
}

function buildEllipseSlides(input: TeachingDeckInput): SlideSeed[] {
  const goals = splitTeachingGoals(input.teachingGoals);
  const excerpt = sourceExcerpt(input.sourceMaterial);

  return [
    {
      kind: "cover",
      title: "椭圆及其标准方程",
      teachingGoal: "建立本节课主题与学习预期。",
      points: [input.grade, `${input.durationMinutes} 分钟单课时`],
    },
    {
      kind: "objectives",
      title: "本节学习目标",
      teachingGoal: "让学生明确本节课需要理解和掌握的内容。",
      points:
        goals.length > 0
          ? goals
          : ["理解椭圆定义", "理解标准方程的建立过程", "判断焦点所在坐标轴"],
    },
    {
      kind: "context",
      title: "从生活中的椭圆开始",
      teachingGoal: "通过熟悉的形状激活直观经验，并提出轨迹问题。",
      points: [
        "观察行星轨道、椭圆跑道与倾斜圆形投影",
        "这些图形看起来相似，但数学上应怎样严格定义？",
        ...(excerpt ? [`材料线索：${excerpt}`] : []),
      ],
    },
    {
      kind: "concept",
      title: "椭圆的定义",
      teachingGoal: "准确理解定义中的固定点、动点和距离和不变。",
      points: [
        "平面内到两个定点 F₁、F₂ 的距离之和等于常数的点的轨迹叫作椭圆",
        "两个定点叫作焦点，F₁F₂ 叫作焦距",
        "该常数必须大于两焦点之间的距离",
      ],
    },
    {
      kind: "dynamic_explanation",
      title: "绳长法：椭圆如何形成",
      teachingGoal: "让学生看见动点运动、两段距离变化与距离和不变之间的因果关系。",
      points: [
        "固定两个焦点 F₁、F₂",
        "动点 P 运动时，PF₁ 与 PF₂ 分别变化",
        "PF₁ + PF₂ 始终等于同一常数，轨迹逐渐形成椭圆",
      ],
      renderer: "metaview",
      visualStrategy: "moving_point_with_distance_lines",
      durationSeconds: 25,
    },
    {
      kind: "concept",
      title: "建立平面直角坐标系",
      teachingGoal: "把几何定义转化为可计算的代数关系。",
      points: [
        "以两焦点所在直线为 x 轴，以焦点中点为原点",
        "设 F₁(-c, 0)、F₂(c, 0)，动点 P(x, y)",
        "由定义得到 PF₁ + PF₂ = 2a，其中 a > c > 0",
      ],
    },
    {
      kind: "derivation",
      title: "由距离关系推导标准方程",
      teachingGoal: "不跳步地理解从距离和到标准方程的代数变形。",
      points: [
        "写出两个距离公式并代入 PF₁ + PF₂ = 2a",
        "逐步移项、平方并整理，消去根式",
        "令 b² = a² - c²，得到 x²/a² + y²/b² = 1",
      ],
      renderer: "metaview",
      visualStrategy: "stepwise_symbolic_derivation",
      durationSeconds: 35,
    },
    {
      kind: "concept",
      title: "标准方程中的 a、b、c",
      teachingGoal: "建立方程参数、焦点位置和几何形状之间的对应关系。",
      points: [
        "x²/a² + y²/b² = 1，且 a > b > 0 时，焦点在 x 轴上",
        "a 是长半轴长，b 是短半轴长，c 是半焦距",
        "三者满足 c² = a² - b²",
      ],
    },
    {
      kind: "example",
      title: "典型例题",
      teachingGoal: "通过标准方程读取长短轴与焦点信息。",
      points: [
        "已知椭圆 x²/25 + y²/9 = 1",
        "a = 5，b = 3，因此 c = 4",
        "焦点为 (-4, 0)、(4, 0)，焦点在 x 轴上",
      ],
    },
    {
      kind: "exercise",
      title: "随堂练习",
      teachingGoal: "检验学生能否独立读取方程参数并确定焦点。",
      points: [
        "求椭圆 x²/16 + y²/7 = 1 的长半轴、短半轴和焦点坐标",
        "先判断焦点所在坐标轴，再计算 c² = a² - b²",
        "答案：a = 4，b = √7，c = 3，焦点为 (±3, 0)",
      ],
    },
    {
      kind: "summary",
      title: "课堂总结",
      teachingGoal: "把定义、建系、推导与参数关系收束为一条知识链。",
      points: [
        "几何定义：到两个焦点的距离和不变",
        "代数表达：建立坐标系后由距离公式推导标准方程",
        "参数关系：c² = a² - b²，较大分母对应焦点所在轴",
      ],
    },
  ];
}

function buildGenericSlides(input: TeachingDeckInput): SlideSeed[] {
  const goals = splitTeachingGoals(input.teachingGoals);
  const excerpt = sourceExcerpt(input.sourceMaterial);
  const topic = input.topic;

  return [
    {
      kind: "cover",
      title: topic,
      teachingGoal: "建立课程主题与学习预期。",
      points: [input.grade, `${input.durationMinutes} 分钟单课时`],
    },
    {
      kind: "objectives",
      title: "本节学习目标",
      teachingGoal: "让学生明确本节课需要理解、应用和检验的内容。",
      points:
        goals.length > 0
          ? goals
          : [`理解${topic}的核心概念`, `能够解释${topic}的关键过程`, `完成一道基础应用题`],
    },
    {
      kind: "context",
      title: "问题从哪里来",
      teachingGoal: "用一个可观察的问题激活已有经验。",
      points: [
        `从真实情境或已有知识中提出与“${topic}”相关的问题`,
        "先让学生描述现象，再区分直觉判断与严格结论",
        ...(excerpt ? [`材料线索：${excerpt}`] : []),
      ],
    },
    {
      kind: "concept",
      title: "核心概念",
      teachingGoal: `建立“${topic}”的准确概念边界。`,
      points: [
        "给出必要定义或基本事实",
        "区分容易混淆的相邻概念",
        "用一个最小反例说明概念边界",
      ],
    },
    {
      kind: "dynamic_explanation",
      title: "过程是怎样发生的",
      teachingGoal: `通过状态变化解释“${topic}”的形成或运行过程。`,
      points: [
        "先展示初始状态和关键对象",
        "逐步改变一个变量，保持其他条件清楚可见",
        "把观察到的变化收束为可复述的因果关系",
      ],
      renderer: "metaview",
      visualStrategy: "state_transition_with_causal_focus",
      durationSeconds: 25,
    },
    {
      kind: "concept",
      title: "建立表示方法",
      teachingGoal: "把直观过程转换为符号、结构图或可操作步骤。",
      points: [
        "明确每个符号或结构的含义",
        "说明表示方法成立所需的条件",
        "保持视觉对象与符号命名一致",
      ],
    },
    {
      kind: "derivation",
      title: "关键结论如何得到",
      teachingGoal: `分步解释“${topic}”的关键结论，避免只给最终答案。`,
      points: [
        "从已知条件出发",
        "每一步只做一个可检查的变换",
        "在结论出现后回到原问题进行验证",
      ],
      renderer: "metaview",
      visualStrategy: "stepwise_reasoning_with_verification",
      durationSeconds: 35,
    },
    {
      kind: "concept",
      title: "条件、性质与常见误区",
      teachingGoal: "帮助学生识别结论的适用范围。",
      points: [
        "列出结论成立的必要条件",
        "对比一个正确用法和一个常见误用",
        "说明遇到新题时应先检查什么",
      ],
    },
    {
      kind: "example",
      title: "典型例题",
      teachingGoal: "把概念和过程迁移到一个标准问题。",
      points: [
        "先标出已知条件和目标",
        "选择与本节核心概念直接对应的方法",
        "完成后用另一种方式快速核验结果",
      ],
    },
    {
      kind: "exercise",
      title: "随堂练习",
      teachingGoal: "检验学生能否独立完成基础迁移。",
      points: [
        `围绕“${topic}”设置一道只改变一个条件的练习`,
        "要求写出判断依据，而不只填写结果",
        "保留一项可供教师课堂追问的变式",
      ],
    },
    {
      kind: "summary",
      title: "课堂总结",
      teachingGoal: "形成可复习、可迁移的知识结构。",
      points: [
        "一句话复述核心概念",
        "用三步概括关键过程",
        "指出下一次遇到同类问题时的第一检查项",
      ],
    },
  ];
}

function isEllipseTopic(topic: string): boolean {
  return /椭圆|ellipse/i.test(topic);
}

function buildSlides(projectId: string, seeds: SlideSeed[]): TeachingDeckSlide[] {
  return seeds.map((seed, index) => ({
    id: `${projectId}-slide-${String(index + 1).padStart(2, "0")}`,
    order: index + 1,
    kind: seed.kind,
    title: seed.title,
    teachingGoal: seed.teachingGoal,
    points: [...seed.points],
    renderer: seed.renderer ?? "pptmaster",
    visualStrategy: seed.visualStrategy,
    durationSeconds: seed.durationSeconds,
    metaViewRunId: null,
    dynamicState: "idle",
    dynamicError: null,
  }));
}

export function buildTeachingDeck(
  rawInput: TeachingDeckInput,
  now = new Date(),
): TeachingDeckProject {
  const input = normalizedInput(rawInput);
  const timestamp = now.toISOString();
  const projectId = `deck-${now.getTime().toString(36)}-${hashText(input.topic)}`;
  const seeds = isEllipseTopic(input.topic)
    ? buildEllipseSlides(input)
    : buildGenericSlides(input);

  return {
    schemaVersion: "0.1.0",
    id: projectId,
    title: `${input.topic} 教学课件`,
    input,
    slides: buildSlides(projectId, seeds),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function normalizeTeachingDeckSlideOrder(
  slides: TeachingDeckSlide[],
): TeachingDeckSlide[] {
  return slides.map((slide, index) => ({ ...slide, order: index + 1 }));
}

export function createBlankTeachingDeckSlide(
  projectId: string,
  order: number,
): TeachingDeckSlide {
  return {
    id: `${projectId}-slide-${Date.now().toString(36)}-${order}`,
    order,
    kind: "concept",
    title: "新页面",
    teachingGoal: "说明这一页希望学生理解什么。",
    points: ["补充一个关键事实或教学步骤"],
    renderer: "pptmaster",
    metaViewRunId: null,
    dynamicState: "idle",
    dynamicError: null,
  };
}

export function buildMetaViewPrompt(
  project: TeachingDeckProject,
  slide: TeachingDeckSlide,
): string {
  const facts = slide.points.map((point, index) => `${index + 1}. ${point}`).join("\n");
  return [
    "你正在为一套课堂教学 PPT 生成其中一页动态讲解。",
    `课程主题：${project.input.topic}`,
    `学段年级：${project.input.grade}`,
    `课件页码：第 ${slide.order} 页，共 ${project.slides.length} 页`,
    `页面标题：${slide.title}`,
    `教学目标：${slide.teachingGoal}`,
    `视觉策略：${slide.visualStrategy || "根据教学目标选择最清楚的可视化策略"}`,
    `建议时长：${slide.durationSeconds ?? 25} 秒`,
    "必须呈现的事实：",
    facts || "1. 根据教学目标补充最少且必要的事实",
    "输出要求：",
    "- 使用 MetaView 现有 PlaybookScript / DirectorScript 渲染链路。",
    "- 使用 16:9 教学画布，画面先建立对象，再展示变化，最后收束结论。",
    "- 让运动、公式或状态变化服务于因果解释，不增加无关装饰。",
    "- 文字保持课堂投影可读；公式推导不得跳过关键等价变形。",
    "- 只生成这一页的动态讲解，不重复封面、学习目标或整套课件。",
  ].join("\n");
}

export function validateTeachingDeck(
  project: TeachingDeckProject,
): TeachingDeckValidationIssue[] {
  const issues: TeachingDeckValidationIssue[] = [];
  if (!project.input.topic.trim()) {
    issues.push({ code: "missing_topic", message: "课程主题不能为空。" });
  }
  if (project.slides.length < 6) {
    issues.push({ code: "deck_too_short", message: "课件少于 6 页，教学链路可能不完整。" });
  }
  if (project.slides.length > 20) {
    issues.push({ code: "deck_too_long", message: "课件超过 20 页，MVP 导出前建议压缩。" });
  }

  for (const slide of project.slides) {
    if (!slide.title.trim()) {
      issues.push({
        code: "missing_slide_title",
        slideId: slide.id,
        message: `第 ${slide.order} 页缺少标题。`,
      });
    }
    if (!slide.teachingGoal.trim()) {
      issues.push({
        code: "missing_teaching_goal",
        slideId: slide.id,
        message: `第 ${slide.order} 页缺少教学目标。`,
      });
    }
    if (slide.kind !== "cover" && slide.points.filter((point) => point.trim()).length === 0) {
      issues.push({
        code: "missing_slide_points",
        slideId: slide.id,
        message: `第 ${slide.order} 页没有可展示的内容。`,
      });
    }
    if (slide.renderer === "metaview" && !slide.visualStrategy?.trim()) {
      issues.push({
        code: "dynamic_slide_without_strategy",
        slideId: slide.id,
        message: `第 ${slide.order} 页是动态页，但没有视觉策略。`,
      });
    }
  }
  return issues;
}
