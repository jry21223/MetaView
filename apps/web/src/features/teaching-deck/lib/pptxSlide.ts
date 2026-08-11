import type { TeachingDeckProject, TeachingDeckSlide } from "../../../entities/teaching-deck/types";
import { esc, groupBase } from "./pptxPackage";

const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

export function slideXml(project: TeachingDeckProject, slide: TeachingDeckSlide, runUrl: string | null): string {
  let id = 2;
  const shapes = [
    rect(id++, 0, 0, 12192000, 6858000, "FAF8F3"),
    rect(id++, 0, 0, 152400, 6858000, "82976F"),
    textBox(id++, 685800, 457200, 10820400, 914400, [slide.title], 2800, "161A18", true),
    textBox(id++, 685800, 1371600, 10820400, 457200, [`第 ${slide.order} 页 · ${slide.renderer === "metaview" ? "MetaView dynamic" : "PPTMaster native"} · ${project.input.grade}`], 1050, "82976F"),
    textBox(id++, 685800, 1981200, 10820400, 762000, [slide.teachingGoal], 1500, "5D655F"),
    textBox(id++, 914400, 2895600, 10134600, 2590800, slide.points.length ? slide.points : ["待补充内容"], 1650, "161A18", false, true),
  ];

  if (slide.renderer === "metaview") {
    shapes.push(textBox(id++, 685800, 5715000, 10820400, 762000, [
      `MetaView 动态页 · ${slide.visualStrategy || "待指定视觉策略"}`,
      slide.metaViewRunId ? `Run ID: ${slide.metaViewRunId}` : "Run 尚未生成",
      ...(runUrl ? [runUrl] : []),
    ], 1000, "5D655F", false, false, Boolean(runUrl)));
  } else {
    shapes.push(textBox(id++, 685800, 5867400, 10820400, 457200, ["PPTMaster native slide · editable OOXML"], 900, "9AA39D"));
  }

  return `${XML}<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld name="${esc(slide.title)}"><p:spTree>${groupBase()}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

export function slideRels(runUrl: string | null): string {
  const hyperlink = runUrl ? `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(runUrl)}" TargetMode="External"/>` : "";
  return `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>${hyperlink}</Relationships>`;
}

function rect(id: number, x: number, y: number, cx: number, cy: number, fill: string): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rectangle ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr/><a:lstStyle/><a:p/></p:txBody></p:sp>`;
}

function textBox(
  id: number,
  x: number,
  y: number,
  cx: number,
  cy: number,
  lines: string[],
  size: number,
  color: string,
  bold = false,
  bullet = false,
  hyperlinkLast = false,
): string {
  const paragraphs = lines.map((line, index) => {
    const ppr = bullet ? '<a:pPr marL="342900" indent="-228600"><a:buChar char="•"/></a:pPr>' : '<a:pPr/>';
    const link = hyperlinkLast && index === lines.length - 1 ? '<a:hlinkClick r:id="rId2"/>' : "";
    return `<a:p>${ppr}<a:r><a:rPr lang="zh-CN" sz="${size}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill>${link}</a:rPr><a:t>${esc(line)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${size}"/></a:p>`;
  }).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0"/><a:lstStyle/>${paragraphs}</p:txBody></p:sp>`;
}
