import type {
  TeachingDeckDraft,
  TeachingSlideIntent,
} from "../../entities/teachingDeck/types";

const encoder = new TextEncoder();
const SLIDE_WIDTH = 12_192_000;
const SLIDE_HEIGHT = 6_858_000;

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
  crc: number;
  offset: number;
}

export function buildTeachingDeckPptx(deck: TeachingDeckDraft): Blob {
  const files = buildPptxFiles(deck);
  return new Blob([buildStoredZip(files)], {
    type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  });
}

export function downloadTeachingDeckPptx(deck: TeachingDeckDraft): void {
  const blob = buildTeachingDeckPptx(deck);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${safeFilename(deck.title)}-MetaView-教学课件.pptx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function buildPptxFiles(deck: TeachingDeckDraft): Record<string, string> {
  const files: Record<string, string> = {
    "[Content_Types].xml": contentTypesXml(deck.slides.length),
    "_rels/.rels": rootRelsXml(),
    "docProps/app.xml": appPropsXml(deck),
    "docProps/core.xml": corePropsXml(deck),
    "ppt/presentation.xml": presentationXml(deck.slides.length),
    "ppt/_rels/presentation.xml.rels": presentationRelsXml(deck.slides.length),
    "ppt/slideMasters/slideMaster1.xml": slideMasterXml(),
    "ppt/slideMasters/_rels/slideMaster1.xml.rels": slideMasterRelsXml(),
    "ppt/slideLayouts/slideLayout1.xml": slideLayoutXml(),
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels": slideLayoutRelsXml(),
    "ppt/theme/theme1.xml": themeXml(),
  };

  deck.slides.forEach((slideItem, index) => {
    const slideNumber = index + 1;
    files[`ppt/slides/slide${slideNumber}.xml`] = slideXml(
      slideItem,
      deck,
      slideNumber,
    );
    files[`ppt/slides/_rels/slide${slideNumber}.xml.rels`] = slideRelsXml();
  });
  return files;
}

function contentTypesXml(slideCount: number): string {
  const slides = Array.from({ length: slideCount }, (_, index) =>
    `<Override PartName="/ppt/slides/slide${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`,
  ).join("");
  return xml(`
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>
  <Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>
  <Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
  ${slides}
</Types>`);
}

function rootRelsXml(): string {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`);
}

function appPropsXml(deck: TeachingDeckDraft): string {
  return xml(`
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>MetaView Teaching Deck MVP</Application>
  <PresentationFormat>Widescreen</PresentationFormat>
  <Slides>${deck.slides.length}</Slides>
  <Notes>0</Notes>
  <HiddenSlides>0</HiddenSlides>
  <MMClips>0</MMClips>
  <ScaleCrop>false</ScaleCrop>
  <Company>MetaView</Company>
  <AppVersion>1.0</AppVersion>
</Properties>`);
}

function corePropsXml(deck: TeachingDeckDraft): string {
  const created = "2026-08-11T00:00:00Z";
  return xml(`
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${escapeXml(deck.title)}</dc:title>
  <dc:creator>MetaView</dc:creator>
  <cp:lastModifiedBy>MetaView</cp:lastModifiedBy>
  <dc:subject>${escapeXml(`${deck.grade} ${deck.subject}`)}</dc:subject>
  <dc:description>${escapeXml(deck.objective)}</dc:description>
  <dcterms:created xsi:type="dcterms:W3CDTF">${created}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${created}</dcterms:modified>
</cp:coreProperties>`);
}

function presentationXml(slideCount: number): string {
  const slideIds = Array.from({ length: slideCount }, (_, index) =>
    `<p:sldId id="${256 + index}" r:id="rId${index + 2}"/>`,
  ).join("");
  return xml(`
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>
  <p:sldIdLst>${slideIds}</p:sldIdLst>
  <p:sldSz cx="${SLIDE_WIDTH}" cy="${SLIDE_HEIGHT}" type="screen16x9"/>
  <p:notesSz cx="6858000" cy="9144000"/>
  <p:defaultTextStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:defaultTextStyle>
</p:presentation>`);
}

function presentationRelsXml(slideCount: number): string {
  const slideRels = Array.from({ length: slideCount }, (_, index) =>
    `<Relationship Id="rId${index + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${index + 1}.xml"/>`,
  ).join("");
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>
  ${slideRels}
</Relationships>`);
}

function slideMasterXml(): string {
  return xml(`
<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>${emptyShapeTree()}</p:cSld>
  <p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/>
  <p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst>
  <p:txStyles>
    <p:titleStyle><a:lvl1pPr><a:defRPr sz="3200" b="1"/></a:lvl1pPr></p:titleStyle>
    <p:bodyStyle><a:lvl1pPr><a:defRPr sz="2000"/></a:lvl1pPr></p:bodyStyle>
    <p:otherStyle><a:defPPr><a:defRPr lang="zh-CN"/></a:defPPr></p:otherStyle>
  </p:txStyles>
</p:sldMaster>`);
}

function slideMasterRelsXml(): string {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>
</Relationships>`);
}

function slideLayoutXml(): string {
  return xml(`
<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1">
  <p:cSld name="Blank">${emptyShapeTree()}</p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sldLayout>`);
}

function slideLayoutRelsXml(): string {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>
</Relationships>`);
}

function slideRelsXml(): string {
  return xml(`
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
</Relationships>`);
}

function themeXml(): string {
  return xml(`
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="MetaView Teaching">
  <a:themeElements>
    <a:clrScheme name="MetaView">
      <a:dk1><a:srgbClr val="161A18"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="5D655F"/></a:dk2><a:lt2><a:srgbClr val="F4F1EA"/></a:lt2>
      <a:accent1><a:srgbClr val="82976F"/></a:accent1><a:accent2><a:srgbClr val="9FB48D"/></a:accent2>
      <a:accent3><a:srgbClr val="D6D1C2"/></a:accent3><a:accent4><a:srgbClr val="E9A23B"/></a:accent4>
      <a:accent5><a:srgbClr val="9AA39D"/></a:accent5><a:accent6><a:srgbClr val="394533"/></a:accent6>
      <a:hlink><a:srgbClr val="567247"/></a:hlink><a:folHlink><a:srgbClr val="6D766F"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="MetaView"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme>
    <a:fmtScheme name="MetaView"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="12700"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme>
  </a:themeElements>
</a:theme>`);
}

function slideXml(
  slideItem: TeachingSlideIntent,
  deck: TeachingDeckDraft,
  slideNumber: number,
): string {
  const isCover = slideItem.kind === "cover";
  const isDynamic = slideItem.renderer === "metaview";
  const titleY = isCover ? 1_560_000 : 920_000;
  const titleHeight = isCover ? 1_250_000 : 760_000;
  const titleSize = isCover ? 3_600 : 2_600;
  const bodyY = isCover ? 3_050_000 : 2_020_000;
  const bodyHeight = isCover ? 1_800_000 : 3_650_000;
  const dynamicLines = isDynamic
    ? [
        "MetaView 动态页：请在教学课件工作台点击“用 MetaView 生成此页”继续生成动态内容。",
        slideItem.presenterNote,
      ]
    : [];
  const bodyLines = [...slideItem.keyPoints, ...dynamicLines.filter(Boolean)];
  const tagText = isDynamic
    ? "METAVIEW · DYNAMIC"
    : `PPTMASTER · ${slideItem.kind.toUpperCase()}`;
  const accent = isDynamic ? "82976F" : "5D655F";

  return xml(`
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:bg><p:bgPr><a:solidFill><a:srgbClr val="F4F1EA"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>
    <p:spTree>
      ${groupRoot()}
      ${textBoxXml(2, "Deck label", 850_000, 430_000, 10_400_000, 280_000, [tagText], 900, accent, true)}
      ${textBoxXml(3, "Slide title", 850_000, titleY, 10_500_000, titleHeight, [slideItem.title], titleSize, "161A18", true)}
      ${textBoxXml(4, "Slide body", 1_020_000, bodyY, 10_000_000, bodyHeight, bodyLines, isCover ? 1_700 : 1_650, "39433F", false, !isCover)}
      ${textBoxXml(5, "Teaching goal", 850_000, 6_180_000, 9_500_000, 300_000, [`教学目标：${slideItem.teachingGoal}`], 900, "7B847D", false)}
      ${textBoxXml(6, "Page number", 10_650_000, 6_180_000, 700_000, 300_000, [`${String(slideNumber).padStart(2, "0")} / ${String(deck.slides.length).padStart(2, "0")}`], 900, "7B847D", false)}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:sld>`);
}

function textBoxXml(
  id: number,
  name: string,
  x: number,
  y: number,
  cx: number,
  cy: number,
  lines: string[],
  fontSize: number,
  color: string,
  bold: boolean,
  bullets = false,
): string {
  const paragraphs = lines
    .map((line) => paragraphXml(line, fontSize, color, bold, bullets))
    .join("");
  return `<p:sp>
    <p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>
    <p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>
    <p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${paragraphs}</p:txBody>
  </p:sp>`;
}

function paragraphXml(
  text: string,
  fontSize: number,
  color: string,
  bold: boolean,
  bullet: boolean,
): string {
  const bulletXml = bullet ? '<a:buChar char="•"/>' : '<a:buNone/>';
  return `<a:p><a:pPr marL="${bullet ? 342900 : 0}" indent="${bullet ? -171450 : 0}">${bulletXml}</a:pPr><a:r><a:rPr lang="zh-CN" sz="${fontSize}"${bold ? ' b="1"' : ""}><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/></a:rPr><a:t>${escapeXml(text)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${fontSize}"/></a:p>`;
}

function emptyShapeTree(): string {
  return `<p:spTree>${groupRoot()}</p:spTree>`;
}

function groupRoot(): string {
  return `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>`;
}

function buildStoredZip(files: Record<string, string>): Uint8Array {
  const localChunks: Uint8Array[] = [];
  const entries: ZipEntry[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const bytes = encoder.encode(content);
    const crc = crc32(bytes);
    const header = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x0800, true);
    view.setUint16(8, 0, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, bytes.length, true);
    view.setUint32(22, bytes.length, true);
    view.setUint16(26, nameBytes.length, true);
    view.setUint16(28, 0, true);
    header.set(nameBytes, 30);
    localChunks.push(header, bytes);
    entries.push({ name, bytes, crc, offset });
    offset += header.length + bytes.length;
  }

  const centralChunks: Uint8Array[] = [];
  let centralSize = 0;
  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const header = new Uint8Array(46 + nameBytes.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x02014b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 20, true);
    view.setUint16(8, 0x0800, true);
    view.setUint16(10, 0, true);
    view.setUint16(12, 0, true);
    view.setUint16(14, 0, true);
    view.setUint32(16, entry.crc, true);
    view.setUint32(20, entry.bytes.length, true);
    view.setUint32(24, entry.bytes.length, true);
    view.setUint16(28, nameBytes.length, true);
    view.setUint16(30, 0, true);
    view.setUint16(32, 0, true);
    view.setUint16(34, 0, true);
    view.setUint16(36, 0, true);
    view.setUint32(38, 0, true);
    view.setUint32(42, entry.offset, true);
    header.set(nameBytes, 46);
    centralChunks.push(header);
    centralSize += header.length;
  }

  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(4, 0, true);
  endView.setUint16(6, 0, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  endView.setUint16(20, 0, true);

  return concatBytes([...localChunks, ...centralChunks, end]);
}

function concatBytes(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) !== 0
        ? 0xedb88320 ^ (value >>> 1)
        : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || "教学课件";
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function xml(body: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${body.trim()}`;
}
