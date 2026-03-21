import { useEffect, useRef, useState } from "react";

export interface CodeStep {
  id: string;
  title: string;
  codeSnippet: string | null;
  codeStartLine: number | null;
  codeEndLine: number | null;
  estimatedDuration: number;
  narration: string;
}

interface CodeHighlightPanelProps {
  steps: CodeStep[];
  currentTime: number;
  fullCode?: string;
}

export function CodeHighlightPanel({ steps, currentTime, fullCode }: CodeHighlightPanelProps) {
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const highlightedLineRef = useRef<HTMLDivElement>(null);

  // 根据当前视频时间计算应该在哪个步骤
  const currentStepIndex = useMemo(() => {
    let accumulatedTime = 0;

    for (let i = 0; i < steps.length; i++) {
      accumulatedTime += steps[i].estimatedDuration;
      if (currentTime < accumulatedTime) {
        return i;
      }
    }
    return steps.length - 1;
  }, [currentTime, steps]);

  // 滚动到 highlighted 代码行
  useEffect(() => {
    if (highlightedLineRef.current && codeContainerRef.current) {
      highlightedLineRef.current.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }, [currentStepIndex]);

  // 解析完整代码并高亮指定行
  const renderHighlightedCode = () => {
    if (!fullCode) {
      // 如果没有完整代码，显示步骤代码片段
      return steps[currentStepIndex]?.codeSnippet || "// 暂无代码";
    }

    const lines = fullCode.split("\n");
    const startLine = steps[currentStepIndex]?.codeStartLine || 1;
    const endLine = steps[currentStepIndex]?.codeEndLine || lines.length;

    return (
      <div className="code-lines">
        {lines.map((line, index) => {
          const lineNumber = index + 1;
          const isHighlighted = lineNumber >= startLine && lineNumber <= endLine;
          
          return (
            <div
              key={index}
              ref={isHighlighted ? highlightedLineRef : null}
              className={`code-line ${isHighlighted ? "highlighted" : ""}`}
            >
              <span className="line-number">{lineNumber}</span>
              <span className="line-content">{line || " "}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const currentStep = steps[currentStepIndex];

  return (
    <div className="code-highlight-panel">
      <div className="code-header">
        <span className="code-kicker">Code</span>
        <h3>代码同步</h3>
        <div className="step-indicator">
          步骤 {currentStepIndex + 1} / {steps.length}
        </div>
      </div>

      {currentStep && (
        <div className="step-info">
          <strong>{currentStep.title}</strong>
          <p className="step-narration">{currentStep.narration}</p>
        </div>
      )}

      <div className="code-container" ref={codeContainerRef}>
        <pre className="code-block">
          <code>{renderHighlightedCode()}</code>
        </pre>
      </div>

      <div className="code-controls">
        <div className="progress-bar">
          <div 
            className="progress-fill"
            style={{ 
              width: `${((currentStepIndex + 1) / steps.length) * 100}%` 
            }}
          />
        </div>
      </div>
    </div>
  );
}
assName="progress-bar">
          <div 
            className="progress-fill"
            style={{ 
              width: `${((currentStepIndex + 1) / steps.length) * 100}%` 
            }}
          />
        </div>
      </div>
    </div>
  );
}
