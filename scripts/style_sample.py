"""
Show user a clean rewrite of section 2.3 as a style sample before full rewrite.
"""
# -*- coding: utf-8 -*-
from docx import Document
from docx.shared import Pt

DOC = '/Users/jerry/Downloads/MetaView_商业计划书_中国国际大学生创新大赛参赛版_v2.docx'
doc = Document(DOC)

# Find paragraph index for 2.3 content
target = None
for i, para in enumerate(doc.paragraphs):
    if 'MetaView 以 LLM 驱动的结构化教学脚本生成' in para.text:
        target = para
        break

if not target:
    print("ERROR: 2.3 paragraph not found")
    exit(1)

SAMPLE = (
    'MetaView 的核心是一条端到端的自动化教学动画生成管线：'
    '用户以自然语言、代码片段或数学公式提交一道题目，'
    '系统自动识别学科领域，调用大语言模型生成一份结构化的教学中间表示'
    '（CIR，定义「讲什么」——标题、步骤、视觉类型、讲解词），'
    '同时生成执行映射（ExecutionMap，定义「什么时候讲、对应哪行代码」），'
    '两者装配为统一的描述文件——教学脚本（PlaybookScript），'
    '再由前端渲染引擎（Remotion）逐帧驱动为可交互的教学动画，'
    '支持参数面板调节、步骤跳转、语音合成朗读和视频文件导出。'
    '\n\n'
    '与通用 AI 对话工具不同，MetaView 不是让模型直接输出最终动画，'
    '而是在模型和画面之间插入了一层结构化契约：'
    '模型只输出严格符合规范的 JSON 数据，'
    '画面渲染和交互逻辑由系统注入。'
    '这从根本上规避了大模型长文本截断和幻觉扩散的问题，'
    '也让同一份教学脚本可以驱动不同的输出形式——'
    '当前稳定支持交互播放和 MP4 视频导出，'
    '架构预留了扩展至幻灯片、HTML5 课件、静态图序列等输出通道。'
    '\n\n'
    '平台同时提供一条更精细的生成路径（智能体模式）：'
    '大模型通过绘图工具链逐步构建画面——规划大纲、添加曲线、放置数组标记、写入公式——'
    '每一步都经几何自检和结构校验，最终由独立评审模型复核后输出。'
    '两条路径共享同一套教学脚本规范，走同一套渲染出口，'
    '用户可根据题目复杂度和质量要求灵活选择。'
)

# Clear existing and set sample
runs = target.runs
for run in runs:
    run.text = ''
runs[0].text = SAMPLE

# Save as a separate preview file
PREVIEW = '/Users/jerry/Downloads/MetaView_BP_风格确认_2.3示例.docx'
doc.save(PREVIEW)
print(f'Preview saved to: {PREVIEW}')
print()
print('=== 替换前（旧版） ===')
print('MetaView 以 LLM 驱动的结构化教学脚本生成与 Remotion 帧驱动渲染引擎为核心，构建"输入知识点 → 学科路由 → 生成 CIR 教学蓝图 → 输出 PlaybookScript → Remotion 交互播放 / MP4 视频导出"的端到端管线...')
print()
print('=== 替换后（新版） ===')
print(SAMPLE)
