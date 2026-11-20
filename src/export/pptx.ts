import type {
  ImageElement,
  LineElement,
  RectElement,
  Slide,
  SlideElement,
  TextElement,
} from '../slides/layout';
import { LINE_HEIGHT } from '../slides/layout';
import { XML_DECL, xmlEscape as x } from './xml';
import { zip, type ZipEntry } from './zip';

/**
 * In-house PPTX (Office Open XML) writer for the slide model. Every element becomes a native,
 * editable PowerPoint shape: text boxes keep their paragraphs and runs (PowerPoint wraps them),
 * rectangles and lines are preset shapes, images are embedded PNGs. Nothing is fetched.
 *
 * The namespace and relationship-type URLs below are identifiers required by the format; they
 * are listed in scripts/url-allowlist.json and never requested.
 */

const NS_A = 'http://schemas.openxmlformats.org/drawingml/2006/main';
const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const NS_P = 'http://schemas.openxmlformats.org/presentationml/2006/main';
const NS_CT = 'http://schemas.openxmlformats.org/package/2006/content-types';
const NS_RELS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const NS_CORE = 'http://schemas.openxmlformats.org/package/2006/metadata/core-properties';
const NS_DC = 'http://purl.org/dc/elements/1.1/';
const NS_DCTERMS = 'http://purl.org/dc/terms/';
const NS_XSI = 'http://www.w3.org/2001/XMLSchema-instance';
const NS_APP = 'http://schemas.openxmlformats.org/officeDocument/2006/extended-properties';
const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
const REL_CORE =
  'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties';
const CT = 'application/vnd.openxmlformats-officedocument.';
const PML = `xmlns:a="${NS_A}" xmlns:r="${NS_R}" xmlns:p="${NS_P}"`;

const EMU_PER_IN = 914400;
const emu = (inches: number) => Math.round(inches * EMU_PER_IN);
const color = (hex: string) => hex.replace('#', '').toUpperCase();

export interface PptxOptions {
  title: string;
  /** BCP 47 tag for spell-checking, e.g. "en-US" or "fr-FR". */
  lang: string;
  headingFont: string;
  bodyFont: string;
  /** Creation time, written to docProps/core.xml. */
  created: Date;
}

/** Builds a .pptx from slides. `images` maps an image element's `source` to PNG bytes. */
export function buildPptx(
  slides: Slide[],
  images: Record<string, Uint8Array>,
  opts: PptxOptions,
): Uint8Array<ArrayBuffer> {
  if (!slides.length) throw new Error('Nothing to export: the deck has no slides.');
  const enc = new TextEncoder();
  const files: ZipEntry[] = [];
  const add = (name: string, xml: string) => files.push({ name, data: enc.encode(XML_DECL + xml) });

  // One media file per image source, shared by every slide that shows it (e.g. the logo).
  const media = new Map<string, string>();
  for (const s of slides) {
    for (const e of s.elements) {
      if (e.kind === 'image' && images[e.source] && !media.has(e.source)) {
        media.set(e.source, `image${media.size + 1}.png`);
      }
    }
  }

  add('[Content_Types].xml', contentTypes(slides.length));
  add(
    '_rels/.rels',
    rels([
      ['officeDocument', 'ppt/presentation.xml'],
      [REL_CORE, 'docProps/core.xml'],
      ['extended-properties', 'docProps/app.xml'],
    ]),
  );
  add('docProps/core.xml', core(opts));
  add(
    'docProps/app.xml',
    `<Properties xmlns="${NS_APP}"><Application>PwnPoint</Application><Slides>${slides.length}</Slides></Properties>`,
  );
  add('ppt/presentation.xml', presentation(slides.length));
  add(
    'ppt/_rels/presentation.xml.rels',
    rels([
      ['slideMaster', 'slideMasters/slideMaster1.xml'],
      ...slides.map((_, i): [string, string] => ['slide', `slides/slide${i + 1}.xml`]),
      ['presProps', 'presProps.xml'],
      ['viewProps', 'viewProps.xml'],
      ['theme', 'theme/theme1.xml'],
      ['tableStyles', 'tableStyles.xml'],
    ]),
  );
  add('ppt/presProps.xml', `<p:presentationPr ${PML}/>`);
  add('ppt/viewProps.xml', `<p:viewPr ${PML}/>`);
  add(
    'ppt/tableStyles.xml',
    `<a:tblStyleLst xmlns:a="${NS_A}" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>`,
  );
  add('ppt/theme/theme1.xml', theme(opts));
  add('ppt/slideMasters/slideMaster1.xml', master());
  add(
    'ppt/slideMasters/_rels/slideMaster1.xml.rels',
    rels([
      ['slideLayout', '../slideLayouts/slideLayout1.xml'],
      ['theme', '../theme/theme1.xml'],
    ]),
  );
  add(
    'ppt/slideLayouts/slideLayout1.xml',
    `<p:sldLayout ${PML} preserve="1" type="blank"><p:cSld name="Blank">${spTree('')}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`,
  );
  add(
    'ppt/slideLayouts/_rels/slideLayout1.xml.rels',
    rels([['slideMaster', '../slideMasters/slideMaster1.xml']]),
  );

  slides.forEach((s, i) => {
    const slideRels: [string, string][] = [['slideLayout', '../slideLayouts/slideLayout1.xml']];
    const relIds = new Map<string, string>();
    for (const e of s.elements) {
      const file = e.kind === 'image' ? media.get(e.source) : undefined;
      if (file && !relIds.has(file)) {
        slideRels.push(['image', `../media/${file}`]);
        relIds.set(file, `rId${slideRels.length}`);
      }
    }
    const rid = (e: ImageElement) => relIds.get(media.get(e.source) ?? '');
    add(`ppt/slides/slide${i + 1}.xml`, slide(s, rid, opts.lang));
    add(`ppt/slides/_rels/slide${i + 1}.xml.rels`, rels(slideRels));
  });
  for (const [source, file] of media) {
    const bytes = images[source];
    if (bytes) files.push({ name: `ppt/media/${file}`, data: bytes });
  }
  return zip(files);
}

function rels(list: [string, string][]): string {
  const items = list.map(([type, target], i) => {
    const t = type.startsWith('http') ? type : REL + type;
    return `<Relationship Id="rId${i + 1}" Type="${t}" Target="${x(target)}"/>`;
  });
  return `<Relationships xmlns="${NS_RELS}">${items.join('')}</Relationships>`;
}

function contentTypes(slideCount: number): string {
  const o = (part: string, type: string) => `<Override PartName="${part}" ContentType="${type}"/>`;
  return (
    `<Types xmlns="${NS_CT}">` +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="png" ContentType="image/png"/>' +
    o('/ppt/presentation.xml', `${CT}presentationml.presentation.main+xml`) +
    o('/ppt/slideMasters/slideMaster1.xml', `${CT}presentationml.slideMaster+xml`) +
    o('/ppt/slideLayouts/slideLayout1.xml', `${CT}presentationml.slideLayout+xml`) +
    Array.from({ length: slideCount }, (_, i) =>
      o(`/ppt/slides/slide${i + 1}.xml`, `${CT}presentationml.slide+xml`),
    ).join('') +
    o('/ppt/theme/theme1.xml', `${CT}theme+xml`) +
    o('/ppt/presProps.xml', `${CT}presentationml.presProps+xml`) +
    o('/ppt/viewProps.xml', `${CT}presentationml.viewProps+xml`) +
    o('/ppt/tableStyles.xml', `${CT}presentationml.tableStyles+xml`) +
    o('/docProps/core.xml', 'application/vnd.openxmlformats-package.core-properties+xml') +
    o('/docProps/app.xml', `${CT}extended-properties+xml`) +
    '</Types>'
  );
}

function core(opts: PptxOptions): string {
  const when = opts.created.toISOString().replace(/\.\d{3}Z$/, 'Z');
  return (
    `<cp:coreProperties xmlns:cp="${NS_CORE}" xmlns:dc="${NS_DC}" xmlns:dcterms="${NS_DCTERMS}" xmlns:xsi="${NS_XSI}">` +
    `<dc:title>${x(opts.title)}</dc:title>` +
    `<dcterms:created xsi:type="dcterms:W3CDTF">${when}</dcterms:created>` +
    `<dcterms:modified xsi:type="dcterms:W3CDTF">${when}</dcterms:modified>` +
    '</cp:coreProperties>'
  );
}

function presentation(slideCount: number): string {
  const ids = Array.from(
    { length: slideCount },
    (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`,
  ).join('');
  return (
    `<p:presentation ${PML} saveSubsetFonts="1">` +
    '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
    `<p:sldIdLst>${ids}</p:sldIdLst>` +
    '<p:sldSz cx="12192000" cy="6858000"/><p:notesSz cx="6858000" cy="9144000"/>' +
    '</p:presentation>'
  );
}

const GROUP_HEADER =
  '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
  '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
const spTree = (shapes: string) => `<p:spTree>${GROUP_HEADER}${shapes}</p:spTree>`;

function master(): string {
  const style = (tag: string) =>
    `<p:${tag}><a:lvl1pPr><a:defRPr sz="1800"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/></a:defRPr></a:lvl1pPr></p:${tag}>`;
  return (
    `<p:sldMaster ${PML}><p:cSld>` +
    '<p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' +
    `${spTree('')}</p:cSld>` +
    '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>' +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    `<p:txStyles>${style('titleStyle')}${style('bodyStyle')}${style('otherStyle')}</p:txStyles>` +
    '</p:sldMaster>'
  );
}

function theme(opts: PptxOptions): string {
  const clr = (name: string, hex: string) => `<a:${name}><a:srgbClr val="${hex}"/></a:${name}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) =>
    `<a:ln w="${w}" cap="flat" cmpd="sng" algn="ctr">${solid}<a:prstDash val="solid"/><a:miter lim="800000"/></a:ln>`;
  const font = (name: string) =>
    `<a:latin typeface="${x(name)}"/><a:ea typeface=""/><a:cs typeface=""/>`;
  return (
    `<a:theme xmlns:a="${NS_A}" name="PwnPoint"><a:themeElements>` +
    '<a:clrScheme name="PwnPoint">' +
    '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>' +
    '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>' +
    clr('dk2', '1A1D23') +
    clr('lt2', 'E7E9EE') +
    clr('accent1', '0B5CAD') +
    clr('accent2', 'C2410C') +
    clr('accent3', '2E7D32') +
    clr('accent4', 'F2C230') +
    clr('accent5', 'A4161A') +
    clr('accent6', '5B6270') +
    clr('hlink', '0B5CAD') +
    clr('folHlink', '6B3FA0') +
    '</a:clrScheme>' +
    `<a:fontScheme name="PwnPoint"><a:majorFont>${font(opts.headingFont)}</a:majorFont>` +
    `<a:minorFont>${font(opts.bodyFont)}</a:minorFont></a:fontScheme>` +
    '<a:fmtScheme name="PwnPoint">' +
    `<a:fillStyleLst>${solid}${solid}${solid}</a:fillStyleLst>` +
    `<a:lnStyleLst>${line(6350)}${line(12700)}${line(19050)}</a:lnStyleLst>` +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    `<a:bgFillStyleLst>${solid}${solid}${solid}</a:bgFillStyleLst>` +
    '</a:fmtScheme></a:themeElements><a:objectDefaults/><a:extraClrSchemeLst/></a:theme>'
  );
}

function slide(s: Slide, rid: (e: ImageElement) => string | undefined, lang: string): string {
  let id = 1;
  const shapes = s.elements.map((e) => shape(e, ++id, rid, lang)).join('');
  return (
    `<p:sld ${PML}><p:cSld>` +
    `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${color(s.background)}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>` +
    `${spTree(shapes)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`
  );
}

const xfrm = (e: { x: number; y: number; w: number; h: number }, flips = '') =>
  `<a:xfrm${flips}><a:off x="${emu(e.x)}" y="${emu(e.y)}"/><a:ext cx="${emu(e.w)}" cy="${emu(e.h)}"/></a:xfrm>`;

function shape(
  e: SlideElement,
  id: number,
  rid: (e: ImageElement) => string | undefined,
  lang: string,
): string {
  switch (e.kind) {
    case 'text':
      return textShape(e, id, lang);
    case 'rect':
      return rectShape(e, id);
    case 'line':
      return lineShape(e, id);
    case 'image': {
      const r = rid(e);
      return r
        ? `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}" descr="${x(e.alt)}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr>` +
            `<p:blipFill><a:blip r:embed="${r}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
            `<p:spPr>${xfrm(e)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`
        : rectShape({ kind: 'rect', x: e.x, y: e.y, w: e.w, h: e.h, fill: '#e5e7eb' }, id);
    }
  }
}

function rectShape(e: RectElement, id: number): string {
  const r = e.radius ?? 0;
  const geom = r
    ? `<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val ${Math.min(50000, Math.round((r / Math.min(e.w, e.h)) * 100000))}"/></a:avLst></a:prstGeom>`
    : '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>';
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Shape ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(e)}${geom}<a:solidFill><a:srgbClr val="${color(e.fill)}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>`
  );
}

function lineShape(e: LineElement, id: number): string {
  const flips = `${e.x2 < e.x1 ? ' flipH="1"' : ''}${e.y2 < e.y1 ? ' flipV="1"' : ''}`;
  const box = {
    x: Math.min(e.x1, e.x2),
    y: Math.min(e.y1, e.y2),
    w: Math.abs(e.x2 - e.x1),
    h: Math.abs(e.y2 - e.y1),
  };
  return (
    `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="Line ${id}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr>` +
    `<p:spPr>${xfrm(box, flips)}<a:prstGeom prst="line"><a:avLst/></a:prstGeom>` +
    `<a:ln w="${Math.round(e.widthPt * 12700)}"><a:solidFill><a:srgbClr val="${color(e.color)}"/></a:solidFill></a:ln></p:spPr></p:cxnSp>`
  );
}

function textShape(e: TextElement, id: number, lang: string): string {
  const sz = Math.round(e.sizePt * 100);
  const lineSpacing = Math.round(e.sizePt * LINE_HEIGHT * 100);
  const algn = e.align === 'center' ? 'ctr' : e.align === 'right' ? 'r' : 'l';
  const bulletIndent = emu(e.lines.find((l) => l.bullet)?.indent ?? 0.2);
  const runProps = (bold: boolean, mono: boolean, tag = 'a:rPr') =>
    `<${tag} lang="${x(lang)}" sz="${sz}"${bold ? ' b="1"' : ''} dirty="0">` +
    `<a:solidFill><a:srgbClr val="${color(e.color)}"/></a:solidFill>` +
    `<a:latin typeface="${x(mono ? e.monoFamily : e.family)}"/><a:cs typeface="${x(mono ? e.monoFamily : e.family)}"/></${tag}>`;
  const paragraphs = (e.paragraphs.length ? e.paragraphs : [{ runs: [] }]).map((p) => {
    const bullet = p.bullet
      ? ` marL="${bulletIndent}" indent="-${bulletIndent}"><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc><a:buFont typeface="Arial"/><a:buChar char="•"/>`
      : `><a:lnSpc><a:spcPts val="${lineSpacing}"/></a:lnSpc><a:buNone/>`;
    const runs = p.runs
      .filter((r) => r.text)
      .map((r) => `<a:r>${runProps(!!(r.bold || e.bold), !!r.mono)}<a:t>${x(r.text)}</a:t></a:r>`)
      .join('');
    return `<a:p><a:pPr algn="${algn}"${bullet}</a:pPr>${runs}${runProps(!!e.bold, false, 'a:endParaRPr')}</a:p>`;
  });
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${x(e.role)} ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(e)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
    `<p:txBody><a:bodyPr wrap="square" lIns="0" tIns="0" rIns="0" bIns="0" rtlCol="0" anchor="${e.valign === 'middle' ? 'ctr' : 't'}"><a:noAutofit/></a:bodyPr><a:lstStyle/>` +
    `${paragraphs.join('')}</p:txBody></p:sp>`
  );
}
