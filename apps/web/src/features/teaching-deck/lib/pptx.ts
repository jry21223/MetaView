import type { TeachingDeckProject } from "../../../entities/teaching-deck/types";
import { createStoredZip } from "./storedZip";
import {
  appProps,
  contentTypes,
  coreProps,
  layout,
  layoutRels,
  master,
  masterRels,
  presentation,
  presentationRels,
  rootRels,
  theme,
} from "./pptxPackage";
import { slideRels, slideXml } from "./pptxSlide";

interface PptxBuildOptions {
  runUrlBase?: string;
  generatedAt?: Date;
}

export function teachingDeckPptxFilename(project: TeachingDeckProject): string {
  const topic = project.input.topic.trim().replace(/[\\/:*?"<>|：]/g, "-").replace(/\s+/g, " ") || "教学课件";
  return `${topic}-教学课件.pptx`;
}

export function buildTeachingDeckPptx(
  project: TeachingDeckProject,
  options: PptxBuildOptions = {},
): Uint8Array {
  const generatedAt = options.generatedAt ?? new Date();
  const entries = [
    { name: "[Content_Types].xml", content: contentTypes(project.slides.length) },
    { name: "_rels/.rels", content: rootRels() },
    { name: "docProps/app.xml", content: appProps(project.slides.length) },
    { name: "docProps/core.xml", content: coreProps(project, generatedAt) },
    { name: "ppt/presentation.xml", content: presentation(project.slides.length) },
    { name: "ppt/_rels/presentation.xml.rels", content: presentationRels(project.slides.length) },
    { name: "ppt/theme/theme1.xml", content: theme() },
    { name: "ppt/slideMasters/slideMaster1.xml", content: master() },
    { name: "ppt/slideMasters/_rels/slideMaster1.xml.rels", content: masterRels() },
    { name: "ppt/slideLayouts/slideLayout1.xml", content: layout() },
    { name: "ppt/slideLayouts/_rels/slideLayout1.xml.rels", content: layoutRels() },
  ];

  for (const slide of project.slides) {
    const runUrl = slide.metaViewRunId && options.runUrlBase
      ? `${options.runUrlBase.replace(/\/$/, "")}/run/${encodeURIComponent(slide.metaViewRunId)}`
      : null;
    entries.push({ name: `ppt/slides/slide${slide.order}.xml`, content: slideXml(project, slide, runUrl) });
    entries.push({ name: `ppt/slides/_rels/slide${slide.order}.xml.rels`, content: slideRels(runUrl) });
  }

  return createStoredZip(entries, generatedAt);
}
