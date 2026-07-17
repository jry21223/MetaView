import type { SubjectVisualKitSubject } from "../../../web/src/features/playbook/engine/assets/assetRegistry";

export interface CreateVisualLessonPromptInput {
  topic: string;
  subject?: SubjectVisualKitSubject;
  audience?: string;
  duration_seconds?: number;
}

export interface MetaViewPromptResult {
  [key: string]: unknown;
  messages: Array<{
    role: "user";
    content: {
      type: "text";
      text: string;
    };
  }>;
}

function suggestedManifestUri(subject: SubjectVisualKitSubject | undefined): string {
  if (subject === "geography") return "metaview://kits/geography-basic/manifest";
  if (subject === "physics") return "metaview://kits/physics-basic/manifest";
  return "metaview://subjects";
}

export function createVisualLessonPrompt(input: CreateVisualLessonPromptInput): MetaViewPromptResult {
  const subjectLine = input.subject ? `Subject hint: ${input.subject}` : "Subject hint: infer with MetaView capabilities";
  const audienceLine = input.audience ? `Audience: ${input.audience}` : "Audience: choose an appropriate school level";
  const durationLine = input.duration_seconds
    ? `Target duration: ${input.duration_seconds} seconds`
    : "Target duration: choose the shortest useful lesson duration";
  const manifestUri = suggestedManifestUri(input.subject);

  return {
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: [
            "Use MetaView as a controlled education-visualization compiler.",
            `Topic: ${input.topic}`,
            subjectLine,
            audienceLine,
            durationLine,
            "",
            "Workflow:",
            "1. Read metaview://subjects and the relevant visual-kit manifest.",
            `2. Prefer ${manifestUri} when it matches the subject.`,
            "3. Call metaview.compile_scene_blueprint before any PlaybookScript work when that tool is available.",
            "4. Resolve assets through MetaView semantic roles; do not choose raw coordinates or paths yourself.",
            "5. Build or request PlaybookScript only through MetaView's SkillRegistry / AssetRegistry / renderer pipeline.",
            "6. Run visual quality validation before render preview or export.",
            "",
            "Boundaries:",
            "- Do not hand-author SVG, canvas drawing, HTML iframe rendering, or alternate renderer output.",
            "- Do not bypass PlaybookScript as MetaView's rendering contract.",
            "- Treat asset manifests as controlled context, not as permission to place raw SVG freely.",
          ].join("\n"),
        },
      },
    ],
  };
}
