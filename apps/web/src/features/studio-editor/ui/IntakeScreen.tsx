import { Player } from "@remotion/player";
import { useRef, useState } from "react";
import { BrandLogoLoop } from "../../../shared/ui/BrandLogoLoop";
import { MetaParticleField } from "../../../shared/ui/MetaParticleField";
import {
  BRAND_LOGO_LOOP_DURATION_FRAMES,
  BRAND_LOGO_LOOP_FPS,
  BRAND_LOGO_LOOP_SIZE,
} from "../../../shared/ui/brandLogoLoopModel";

type IntakeDomain = "algorithm" | "math" | "english" | "general" | "physics";
type IntakeMode = "animation" | "algorithm" | "translation";

const MODE_OPTIONS: Array<{ id: IntakeMode; label: string }> = [
  { id: "animation", label: "动画讲解" },
  { id: "algorithm", label: "算法同步" },
  { id: "translation", label: "翻译拆解" },
];

const TEMPLATE_GALLERY: Array<{
  id: string;
  domain: IntakeDomain;
  title: string;
  desc: string;
  prompt: string;
  icon: "math" | "code" | "text" | "blank";
}> = [
  {
    id: "math-animation",
    domain: "math",
    title: "高数动画",
    desc: "函数、极限、积分的可视化步骤",
    prompt: "生成一个高数动画讲解：用步骤和图像解释函数、极限或积分题。",
    icon: "math",
  },
  {
    id: "algorithm-code",
    domain: "algorithm",
    title: "算法题",
    desc: "代码同步高亮与指针动画",
    prompt: "生成一个算法题讲解：展示代码同步高亮、变量变化和指针移动。",
    icon: "code",
  },
  {
    id: "english-breakdown",
    domain: "english",
    title: "英语拆解",
    desc: "句法、翻译、词汇记忆",
    prompt: "生成一个英语拆解讲解：分层解释句法、翻译和关键词。",
    icon: "text",
  },
  {
    id: "blank-course",
    domain: "general",
    title: "空白课件",
    desc: "从目标开始生成学习路径",
    prompt: "",
    icon: "blank",
  },
];

export interface IntakeContext {
  domain: IntakeDomain;
  template: string;
  title: string;
  raw: string;
  files: Array<{ name: string; size: number }>;
  sourceCode?: string;
  language?: string;
  mode?: IntakeMode;
}

interface IntakeScreenProps {
  onSubmit: (ctx: IntakeContext) => void | Promise<void>;
  isSubmitting?: boolean;
  submitError?: string | null;
}

function Icon({ kind }: { kind: (typeof TEMPLATE_GALLERY)[number]["icon"] }) {
  if (kind === "code") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="m8 9-4 3 4 3" />
        <path d="m16 9 4 3-4 3" />
        <path d="m14 5-4 14" />
      </svg>
    );
  }
  if (kind === "text") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M4 5h7" />
        <path d="M9 5v14" />
        <path d="M13 19l5-14 2 14" />
        <path d="M15 14h4" />
      </svg>
    );
  }
  if (kind === "blank") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
        <path d="M6 4h9l3 3v13H6z" />
        <path d="M15 4v4h4" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
      <path d="M4 18c4-10 8-10 12 0" />
      <path d="M4 6h16" />
    </svg>
  );
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const EXT_TO_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".js": "javascript",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".jsx": "javascript",
  ".java": "java",
  ".cpp": "cpp",
  ".c": "c",
  ".cs": "csharp",
  ".go": "go",
  ".rs": "rust",
  ".rb": "ruby",
  ".swift": "swift",
  ".kt": "kotlin",
  ".php": "php",
  ".r": "r",
  ".m": "objc",
  ".sh": "bash",
};

function languageFromName(name: string): string | undefined {
  const ext = name.slice(name.lastIndexOf(".")).toLowerCase();
  return EXT_TO_LANGUAGE[ext];
}

function inferDomain(
  raw: string,
  mode: IntakeMode,
  codeFile?: File,
): IntakeDomain {
  if (codeFile || mode === "algorithm") return "algorithm";
  if (mode === "translation") return "english";

  const text = raw.toLowerCase();
  if (
    text.includes("排序") ||
    text.includes("算法") ||
    text.includes("二分") ||
    text.includes("search") ||
    text.includes("pointer")
  ) {
    return "algorithm";
  }
  if (
    raw.includes("微分") ||
    raw.includes("积分") ||
    raw.includes("极限") ||
    raw.includes("函数") ||
    raw.includes("傅里叶")
  ) {
    return "math";
  }
  if (
    raw.includes("英语") ||
    raw.includes("翻译") ||
    raw.includes("句法") ||
    text.includes("translate")
  ) {
    return "english";
  }
  if (raw.includes("斜面") || raw.includes("物理") || raw.includes("力")) {
    return "physics";
  }
  return "general";
}

export function IntakeScreen({
  onSubmit,
  isSubmitting = false,
  submitError = null,
}: IntakeScreenProps) {
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<IntakeMode>("animation");
  const [files, setFiles] = useState<Array<{ name: string; size: number }>>([]);
  const [fileObjects, setFileObjects] = useState<File[]>([]);
  const [thinking, setThinking] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const pending = isSubmitting || Boolean(thinking);

  const handleFiles = (list: FileList | null) => {
    if (!list) return;
    const arr = Array.from(list);
    setFileObjects((prev) => [...prev, ...arr]);
    setFiles((prev) => [
      ...prev,
      ...arr.map((f) => ({ name: f.name, size: f.size })),
    ]);
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    setFileObjects((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    if (!input.trim() && files.length === 0) return;

    setThinking("正在理解题目…");
    const codeFile = fileObjects.find((f) => languageFromName(f.name));
    let sourceCode: string | undefined;
    let language: string | undefined;

    if (codeFile) {
      try {
        sourceCode = await readFileAsText(codeFile);
        language = languageFromName(codeFile.name);
      } catch {
        sourceCode = undefined;
        language = undefined;
      }
    }

    const domain = inferDomain(input, mode, codeFile);
    setThinking("提交中…");

    try {
      await onSubmit({
        domain,
        template: mode,
        title: input.trim().slice(0, 40) || "未命名",
        raw: input,
        files,
        sourceCode,
        language,
        mode,
      });
    } catch {
      // The shell exposes the submission error through submitError; stay on intake.
    } finally {
      setThinking("");
    }
  };

  const pickTemplate = (tpl: (typeof TEMPLATE_GALLERY)[number]) => {
    if (pending) return;
    const raw = tpl.prompt || tpl.title;
    void Promise.resolve(onSubmit({
      domain: tpl.domain,
      template: tpl.id,
      title: tpl.title,
      raw,
      files: [],
      mode,
    })).catch(() => undefined);
  };

  return (
    <>
      <main className="mv-intake-body">
        <section className="mv-intake-hero" aria-label="MetaView intake">
          <div className="mv-intake-hero-visual">
            <MetaParticleField variant="singularity" />
            <div
              className="mv-brand-loop-shell"
              role="img"
              aria-label="MetaView logo animation"
            >
              <Player
                component={BrandLogoLoop}
                durationInFrames={BRAND_LOGO_LOOP_DURATION_FRAMES}
                fps={BRAND_LOGO_LOOP_FPS}
                compositionWidth={BRAND_LOGO_LOOP_SIZE}
                compositionHeight={BRAND_LOGO_LOOP_SIZE}
                autoPlay
                loop
                controls={false}
                clickToPlay={false}
                acknowledgeRemotionLicense
                style={{ width: "100%", height: "100%" }}
              />
            </div>
          </div>
          <h1 className="mv-intake-title">把题目变成可播放的讲解</h1>
          <p className="mv-intake-sub">
            输入题目、代码或截图说明，MetaView 会生成带动画、步骤和追问的学习播放器。
          </p>
        </section>

        <section className="mv-intake-composer" aria-label="生成输入">
          <div className="mv-intake-attachment-tab">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
              <path d="m21.4 11.6-8.5 8.5a5 5 0 0 1-7.1-7.1l9.2-9.2a3.4 3.4 0 0 1 4.8 4.8l-9.2 9.2a1.8 1.8 0 1 1-2.5-2.5l8.5-8.5" />
            </svg>
            附件
          </div>

          {files.length > 0 && (
            <div className="mv-intake-files">
              {files.map((f, i) => (
                <div key={`${f.name}-${i}`} className="mv-intake-file">
                  <span className="mv-file-name">{f.name}</span>
                  <button type="button" onClick={() => removeFile(i)}>
                    删除
                  </button>
                </div>
              ))}
            </div>
          )}

          <textarea
            className="mv-intake-input"
            rows={4}
            placeholder="输入一道题，或粘贴代码/截图说明..."
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              const el = e.target;
              el.style.height = "auto";
              el.style.height = `${el.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submit();
              }
            }}
            style={{ resize: "none", overflow: "hidden", minHeight: 108 }}
          />

          <div className="mv-intake-actions">
            <div className="mv-intake-toolrow">
              <button
                className="mv-intake-tool"
                type="button"
                aria-label="上传附件"
                onClick={() => fileRef.current?.click()}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M5 19h14V5H5z" />
                  <path d="m8 15 2.5-3 2 2.2 2.4-3.2L19 16" />
                  <circle cx="9" cy="9" r="1.2" />
                </svg>
              </button>
              <input
                ref={fileRef}
                type="file"
                multiple
                style={{ display: "none" }}
                onChange={(e) => {
                  handleFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <div className="mv-intake-modes" aria-label="生成模式">
                {MODE_OPTIONS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    className={`mv-intake-mode${mode === option.id ? " is-active" : ""}`}
                    onClick={() => setMode(option.id)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mv-intake-submitrow">
              {(thinking || submitError) && (
                <span
                  className={`mv-intake-thinking${submitError ? " mv-intake-error" : ""}`}
                >
                  {submitError ?? thinking}
                </span>
              )}
              <button
                className="mv-send mv-intake-send"
                type="button"
                onClick={() => void submit()}
                disabled={pending || (!input.trim() && files.length === 0)}
              >
                生成
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        <section className="mv-intake-templates" aria-label="常用模板">
          {TEMPLATE_GALLERY.map((tpl) => (
            <button
              key={tpl.id}
              className="mv-tpl-card"
              type="button"
              disabled={pending}
              onClick={() => pickTemplate(tpl)}
            >
              <span className="mv-tpl-head">
                <span className="mv-tpl-title">{tpl.title}</span>
                <Icon kind={tpl.icon} />
              </span>
              <span className="mv-tpl-desc">{tpl.desc}</span>
            </button>
          ))}
        </section>

      </main>
    </>
  );
}
