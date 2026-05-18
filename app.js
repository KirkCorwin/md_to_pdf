/* global marked, pdfMake */

/** @type {"cover"|"resume"|"resume-compact"|"resume-ultra"} */
const MODES = ["cover", "resume", "resume-compact", "resume-ultra"];

const FILENAMES = {
  cover: "cover_letter.pdf",
  resume: "resume.pdf",
  "resume-compact": "resume.pdf",
  "resume-ultra": "resume.pdf",
};

/** @type {(typeof MODES)[number]} */
let mode = "resume";

/** US Letter width (pt) minus left+right margin */
function contentWidthForMargins(sideMarginPt) {
  return 612 - 2 * sideMarginPt;
}

const COVER_LAYOUT = {
  pageMargins: [54, 54, 54, 54],
  contentWidth: contentWidthForMargins(54),
  defaultStyle: { fontSize: 10.5, lineHeight: 1.22 },
  heading: { h1: 15, h2: 12.5, h3: 11.5, other: 11, marginTop: [0, 12, 12], marginBottom: 4 },
  paragraphMargin: [0, 0, 0, 6],
  listMargin: [0, 0, 0, 8],
  listItemMargin: [0, 0, 0, 2],
  hrMargin: [0, 6, 0, 10],
  blockquoteMargin: [14, 4, 10, 8],
  tableMargin: [0, 0, 0, 10],
  codeBlockMargin: [0, 4, 0, 10],
};

/** One-page: tight margins, line spacing, block gaps; education + focus on right column */
const RESUME_ULTRA_LAYOUT = {
  pageMargins: [18, 18, 18, 18],
  contentWidth: contentWidthForMargins(18),
  defaultStyle: { fontSize: 10.5, lineHeight: 1.12 },
  heading: { h1: 15, h2: 12.5, h3: 11.5, other: 11, marginTop: [0, 4, 4], marginBottom: 1 },
  paragraphMargin: [0, 0, 0, 2],
  listMargin: [0, 0, 0, 2],
  listItemMargin: [0, 0, 0, 0],
  hrMargin: [0, 2, 0, 3],
  blockquoteMargin: [10, 2, 8, 3],
  tableMargin: [0, 0, 0, 3],
  codeBlockMargin: [0, 2, 0, 3],
  compactEducationRows: true,
};

function blendNumber(loose, tight, t) {
  return loose + (tight - loose) * t;
}

function blendMargin(loose, tight, t) {
  return loose.map((v, i) => Math.round(blendNumber(v, tight[i], t)));
}

/** Interpolate vertical spacing between standard (resume/cover) and ultra (t = 0.5 → half the condensing). */
function blendLayout(loose, tight, t) {
  const lineHeight = Math.round(blendNumber(loose.defaultStyle.lineHeight, tight.defaultStyle.lineHeight, t) * 100) / 100;
  return {
    pageMargins: [...tight.pageMargins],
    contentWidth: tight.contentWidth,
    defaultStyle: { fontSize: loose.defaultStyle.fontSize, lineHeight },
    heading: {
      h1: loose.heading.h1,
      h2: loose.heading.h2,
      h3: loose.heading.h3,
      other: loose.heading.other,
      marginTop: blendMargin(loose.heading.marginTop, tight.heading.marginTop, t),
      marginBottom: Math.round(blendNumber(loose.heading.marginBottom, tight.heading.marginBottom, t)),
    },
    paragraphMargin: blendMargin(loose.paragraphMargin, tight.paragraphMargin, t),
    listMargin: blendMargin(loose.listMargin, tight.listMargin, t),
    listItemMargin: blendMargin(loose.listItemMargin, tight.listItemMargin, t),
    hrMargin: blendMargin(loose.hrMargin, tight.hrMargin, t),
    blockquoteMargin: blendMargin(loose.blockquoteMargin, tight.blockquoteMargin, t),
    tableMargin: blendMargin(loose.tableMargin, tight.tableMargin, t),
    codeBlockMargin: blendMargin(loose.codeBlockMargin, tight.codeBlockMargin, t),
    compactEducationRows: Boolean(tight.compactEducationRows),
  };
}

/** Tight side margins; ~50% of ultra’s line/gap condensing; education split; Focus on own line */
const RESUME_COMPACT_LAYOUT = blendLayout(COVER_LAYOUT, RESUME_ULTRA_LAYOUT, 0.5);

/** Resume preprocess: separates school (left) from joined sub-lines (right) for pdfmake columns */
const EDU_ROW_MARKER = "\u001E";

function layoutForMode(docMode) {
  switch (docMode) {
    case "resume-compact":
      return RESUME_COMPACT_LAYOUT;
    case "resume-ultra":
      return RESUME_ULTRA_LAYOUT;
    case "resume":
    case "cover":
    default:
      return COVER_LAYOUT;
  }
}

function preprocessProfileForMode(docMode) {
  if (docMode === "resume-compact") {
    return { joinFocusToExpected: false };
  }
  if (docMode === "resume-ultra") {
    return { joinFocusToExpected: true };
  }
  return null;
}

const el = {
  form: document.getElementById("pdf-form"),
  md: document.getElementById("md"),
  download: document.getElementById("download"),
  filenameOut: document.getElementById("filename-out"),
  modeButtons: {
    cover: document.getElementById("mode-cover"),
    resume: document.getElementById("mode-resume"),
    "resume-compact": document.getElementById("mode-resume-compact"),
    "resume-ultra": document.getElementById("mode-resume-ultra"),
  },
};

function setMode(next) {
  if (!MODES.includes(next)) return;
  mode = next;
  for (const id of MODES) {
    el.modeButtons[id].classList.toggle("active", mode === id);
  }
  el.filenameOut.value = FILENAMES[mode];
}

/** Safe local download name: basename only, .pdf extension */
function sanitizeDownloadFilename(raw) {
  let name = (raw || "").trim().replace(/^.*[/\\]/, "");
  name = name.replace(/[<>:"|?*\x00-\x1f]/g, "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  if (!/\.pdf$/i.test(name)) name += ".pdf";
  return name;
}

function getDownloadFilename() {
  const sanitized = sanitizeDownloadFilename(el.filenameOut.value);
  if (sanitized) return sanitized;
  return FILENAMES[mode];
}

function safeHref(href) {
  if (!href || typeof href !== "string") return null;
  const u = href.trim().replace(/\s+/g, "").toLowerCase();
  if (u.startsWith("javascript:") || u.startsWith("vbscript:") || u.startsWith("data:")) return null;
  return href;
}

/** Collapse pdfmake `text` child: single plain string stays string */
function collapseTextChild(parts) {
  if (!parts || parts.length === 0) return "";
  if (parts.length === 1 && typeof parts[0] === "string") return parts[0];
  return parts;
}

function stripHtmlBlock(raw) {
  if (!raw || typeof raw !== "string") return "";
  return raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Compact / ultra resume: join education sub-lines; optional Focus on right column (ultra only).
 * @param {{ joinFocusToExpected: boolean }} profile
 */
function preprocessResumeMarkdown(md, profile) {
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    while (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (!next || next.startsWith("##") || next.startsWith("- ")) break;

      const base = line.trimEnd().replace(/  +$/, "");
      const baseTrim = base.trim();

      const joinSchool =
        (baseTrim.includes("North Seattle College") && /^Expected graduation:/i.test(next)) ||
        (baseTrim.includes("Whitman College") && /^Graduated Spring/i.test(next)) ||
        ((baseTrim.includes("Whitman College") || /^Graduated Spring/i.test(baseTrim)) &&
          /^Statistics and quantitative/i.test(next));

      const joinFocus =
        profile.joinFocusToExpected &&
        line.includes(EDU_ROW_MARKER) &&
        /^Focus:/i.test(next);

      if (joinSchool || joinFocus) {
        if (line.includes(EDU_ROW_MARKER)) {
          const splitIdx = line.indexOf(EDU_ROW_MARKER);
          const left = line.slice(0, splitIdx);
          const right = line
            .slice(splitIdx + 1)
            .trimEnd()
            .replace(/  +$/, "");
          line = `${left}${EDU_ROW_MARKER}${right} | ${next}`;
        } else {
          line = `${base}${EDU_ROW_MARKER}${next}`;
        }
        i += 1;
        continue;
      }
      break;
    }
    out.push(line);
    // Compact: Focus stays on its own line below the split row
    if (
      !profile.joinFocusToExpected &&
      line.includes(EDU_ROW_MARKER) &&
      i + 1 < lines.length
    ) {
      const peek = lines[i + 1].trim();
      if (peek && !peek.startsWith("##") && !peek.startsWith("- ")) {
        out.push("");
      }
    }
  }
  return out.join("\n");
}

/** Resume: school on the left, joined graduation/coursework flush right */
function resumeEducationSplitRow(text, layout) {
  if (!layout.compactEducationRows || typeof text !== "string" || !text.includes(EDU_ROW_MARKER)) {
    return null;
  }
  const splitIdx = text.indexOf(EDU_ROW_MARKER);
  const left = text.slice(0, splitIdx).trim();
  const right = text.slice(splitIdx + 1).trim();
  if (!left || !right) return null;
  return {
    columns: [
      { text: left, width: "*", alignment: "left" },
      { text: right, width: "auto", alignment: "right" },
    ],
    columnGap: 12,
    margin: layout.paragraphMargin,
  };
}

function flattenInline(tokens) {
  if (!tokens || !tokens.length) return [];
  const out = [];
  for (const t of tokens) {
    switch (t.type) {
      case "text":
        out.push(t.text ?? "");
        break;
      case "strong": {
        const inner = flattenInline(t.tokens);
        out.push({ text: collapseTextChild(inner), bold: true });
        break;
      }
      case "em": {
        const inner = flattenInline(t.tokens);
        out.push({ text: collapseTextChild(inner), italics: true });
        break;
      }
      case "codespan":
        out.push({ text: t.text ?? "", fontSize: 9.5, background: "#eeeeee", margin: [1, 1, 1, 1] });
        break;
      case "link": {
        const inner = collapseTextChild(flattenInline(t.tokens));
        const href = safeHref(t.href);
        const label = inner === "" ? t.href || "" : inner;
        if (href) {
          out.push({
            text: label,
            link: href,
            color: "#0b57d0",
            decoration: "underline",
          });
        } else {
          out.push(label);
        }
        break;
      }
      case "image":
        out.push({
          text: `[Image: ${t.text || "untitled"}]`,
          italics: true,
          color: "#555555",
        });
        break;
      case "br":
        out.push("\n");
        break;
      case "escape":
        out.push(t.text ?? "");
        break;
      case "del": {
        const inner = flattenInline(t.tokens);
        out.push({ text: collapseTextChild(inner), decoration: "lineThrough" });
        break;
      }
      case "html": {
        const plain = stripHtmlBlock(t.raw || t.text || "");
        if (plain) out.push(plain);
        break;
      }
      default:
        if (typeof t.text === "string" && t.text) out.push(t.text);
        else if (t.raw) out.push(stripHtmlBlock(t.raw) || t.raw);
        break;
    }
  }
  return out;
}

function normalizeParagraphText(parts) {
  const filtered = parts.filter((p) => {
    if (p == null || p === "") return false;
    // Keep hard breaks and lone spaces between inline nodes (links, emphasis).
    // Stripping all trim()-empty strings removed "\n" from <br> tokens and " "
    // between tokens, which pdfmake then glued together with no separator.
    if (typeof p === "string") {
      if (p === "\n" || p === " ") return true;
      if (p.trim() === "") return false;
    }
    return true;
  });
  if (filtered.length === 0) return "";
  return collapseTextChild(filtered);
}

function cellToPdfText(cell) {
  const toks = cell.tokens?.length ? cell.tokens : [{ type: "text", text: cell.text ?? "" }];
  return normalizeParagraphText(flattenInline(toks));
}

function hrLine(layout) {
  return {
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 0,
        x2: layout.contentWidth,
        y2: 0,
        lineWidth: 0.75,
        lineColor: "#333333",
      },
    ],
    margin: layout.hrMargin,
  };
}

function listItemToEntry(li, layout) {
  const stack = [];
  const task = li.task === true;
  const checked = li.checked === true;

  for (const sub of li.tokens || []) {
    if (sub.type === "paragraph") {
      let text = normalizeParagraphText(flattenInline(sub.tokens));
      if (task) {
        const box = checked ? "☑ " : "☐ ";
        if (text === "") {
          text = box.trimEnd();
        } else if (typeof text === "string") {
          text = box + text;
        } else {
          text = { text: [box, text] };
        }
      }
      if (text !== "") stack.push({ text, margin: layout.listItemMargin });
    } else if (sub.type === "list") {
      stack.push(blockListToPdf(sub, layout));
    } else {
      const text = normalizeParagraphText(flattenInline([sub]));
      if (text !== "") stack.push({ text });
    }
  }
  if (stack.length === 0) return "";
  if (stack.length === 1) return stack[0].text !== undefined ? stack[0].text : stack[0];
  return { stack, margin: layout.listItemMargin };
}

function blockListToPdf(tok, layout) {
  const entries = tok.items
    .map((li) => listItemToEntry(li, layout))
    .filter((e) => e !== "" && e != null && !(typeof e === "object" && e.text === ""));
  if (!entries.length) return null;
  if (tok.ordered) return { ol: entries, margin: layout.listMargin };
  return { ul: entries, margin: layout.listMargin };
}

function headingFontSize(depth, layout) {
  const h = layout.heading;
  if (depth <= 1) return h.h1;
  if (depth === 2) return h.h2;
  if (depth === 3) return h.h3;
  return h.other;
}

function headingMarginTop(depth, layout) {
  const tops = layout.heading.marginTop;
  if (depth <= 1) return tops[0];
  if (depth === 2) return tops[1];
  return tops[2] ?? tops[1];
}

function normalizeTableRows(header, rows) {
  const n = header.length;
  if (!n) return [];
  const out = [];
  for (const row of rows || []) {
    const cells = row.slice(0, n);
    while (cells.length < n) {
      cells.push({ text: "", tokens: [{ type: "text", text: "" }] });
    }
    out.push(cells);
  }
  return out;
}

function blocksToContent(blockTokens, layout) {
  const content = [];
  for (const tok of blockTokens) {
    switch (tok.type) {
      case "space":
        break;
      case "hr":
        content.push(hrLine(layout));
        break;
      case "heading": {
        const inToks = tok.tokens?.length ? tok.tokens : [{ type: "text", text: tok.text ?? "" }];
        const text = normalizeParagraphText(flattenInline(inToks));
        if (text === "") break;
        const depth = tok.depth || 1;
        content.push({
          text,
          fontSize: headingFontSize(depth, layout),
          bold: true,
          margin: [0, headingMarginTop(depth, layout), 0, layout.heading.marginBottom],
        });
        break;
      }
      case "paragraph": {
        const text = normalizeParagraphText(flattenInline(tok.tokens));
        if (text === "") break;
        const eduRow = resumeEducationSplitRow(text, layout);
        if (eduRow) {
          content.push(eduRow);
        } else {
          content.push({ text, margin: layout.paragraphMargin, alignment: "left" });
        }
        break;
      }
      case "list": {
        const node = blockListToPdf(tok, layout);
        if (node) content.push(node);
        break;
      }
      case "blockquote": {
        const inner = blocksToContent(tok.tokens || [], layout);
        if (inner.length) {
          content.push({
            stack: inner,
            margin: layout.blockquoteMargin,
            italics: true,
          });
        }
        break;
      }
      case "code": {
        const body = (tok.text ?? "").replace(/\r\n/g, "\n");
        if (!body.trim()) break;
        content.push({
          text: body,
          style: "codeBlock",
        });
        break;
      }
      case "html": {
        const plain = stripHtmlBlock(tok.raw || "");
        if (plain) content.push({ text: plain, margin: layout.paragraphMargin });
        break;
      }
      case "table": {
        const colCount = tok.header?.length || 0;
        if (!colCount) break;
        const widths = tok.header.map(() => "*");
        const body = [];
        body.push(
          tok.header.map((c) => ({
            text: cellToPdfText(c),
            bold: true,
            fillColor: "#f2f2f2",
            margin: [4, 4, 4, 4],
          })),
        );
        const fixedRows = normalizeTableRows(tok.header, tok.rows);
        for (const row of fixedRows) {
          body.push(
            row.map((c) => ({
              text: cellToPdfText(c),
              margin: [4, 4, 4, 4],
            })),
          );
        }
        content.push({
          table: { headerRows: 1, widths, body },
          layout: "lightHorizontalLines",
          margin: layout.tableMargin,
        });
        break;
      }
      default:
        if (tok.raw) {
          const plain = stripHtmlBlock(tok.raw);
          if (plain) content.push({ text: plain, margin: layout.paragraphMargin });
        }
        break;
    }
  }
  return content;
}

function pruneEmptyContent(nodes) {
  return nodes.filter((node) => {
    if (node == null) return false;
    if (node.canvas || node.table || node.stack || node.ul || node.ol) {
      if (node.ul && Array.isArray(node.ul) && node.ul.length === 0) return false;
      if (node.ol && Array.isArray(node.ol) && node.ol.length === 0) return false;
      if (node.stack && Array.isArray(node.stack) && node.stack.length === 0) return false;
      return true;
    }
    if (node.text !== undefined) {
      const t = node.text;
      if (t === "" || (typeof t === "string" && t.trim() === "")) return false;
    }
    return true;
  });
}

function markdownToDocDefinition(md, titleHint, docMode = "cover") {
  const layout = layoutForMode(docMode);
  const eduProfile = preprocessProfileForMode(docMode);
  const source = eduProfile ? preprocessResumeMarkdown(md, eduProfile) : md;

  marked.setOptions({ mangle: false, headerIds: false, gfm: true });
  let tokens;
  try {
    tokens = marked.lexer(source);
  } catch (e) {
    throw new Error(`Markdown could not be parsed: ${e.message || e}`);
  }
  let content = blocksToContent(tokens, layout);
  content = pruneEmptyContent(content);
  if (!content.length) {
    throw new Error("Nothing left to put in the PDF after parsing (empty or unsupported Markdown).");
  }
  return {
    pageSize: "LETTER",
    pageMargins: layout.pageMargins,
    info: {
      title: titleHint || "Document",
      producer: "md_to_pdf_web (pdfmake)",
    },
    content,
    defaultStyle: {
      font: "Roboto",
      fontSize: layout.defaultStyle.fontSize,
      lineHeight: layout.defaultStyle.lineHeight,
      color: "#111111",
    },
    styles: {
      codeBlock: {
        fontSize: 9,
        preserveLeadingSpaces: true,
        margin: layout.codeBlockMargin,
        background: "#f5f5f5",
      },
    },
  };
}

function getPdfMake() {
  return typeof pdfMake !== "undefined" ? pdfMake : typeof window !== "undefined" ? window.pdfMake : undefined;
}

function downloadPdf() {
  const raw = el.md.value.trim();
  if (!raw) {
    window.alert("Paste some Markdown first.");
    return;
  }

  const pm = getPdfMake();
  if (typeof marked === "undefined" || !pm || typeof pm.createPdf !== "function") {
    window.alert("Libraries failed to load. Check your network or open via a local server (see README).");
    return;
  }

  const filename = getDownloadFilename();
  const titleBase = filename.replace(/\.pdf$/i, "");
  el.download.disabled = true;
  el.md.readOnly = true;

  try {
    const docDefinition = markdownToDocDefinition(raw, titleBase, mode);
    pm.createPdf(docDefinition).download(filename);
  } catch (err) {
    console.error(err);
    window.alert(`PDF failed: ${err.message || err}`);
  } finally {
    el.download.disabled = false;
    el.md.readOnly = false;
  }
}

for (const id of MODES) {
  el.modeButtons[id].addEventListener("click", () => setMode(id));
}

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  downloadPdf();
});

/** Enter = generate (form submit path + explicit handler). Shift+Enter = newline. IME-safe. */
el.md.addEventListener("keydown", (e) => {
  if (e.key !== "Enter" || e.isComposing) return;
  if (e.shiftKey) return;
  e.preventDefault();
  if (!e.repeat) downloadPdf();
});

setMode("resume");
