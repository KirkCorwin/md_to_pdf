/**
 * Education-section preprocessor for compact / ultra resume PDF modes.
 * Scoped to ## Education (and aliases); heuristic line joins + HTML comment overrides.
 */
/* global window */
(function (global) {
  const EDU_ROW_MARKER = "\u001E";

  const EDUCATION_HEADING_RE =
    /^##\s+(Education|Education and Training|Academic Background|Academics)\s*$/i;
  const ANY_H2_RE = /^##\s+/;

  const INSTITUTION_RE =
    /\b(College|University|Institute|Polytechnic|School of|Academy)\b/i;
  const DEGREE_RE =
    /\b(B\.?\s*S\.?|B\.?\s*A\.?|M\.?\s*S\.?|M\.?\s*A\.?|M\.?\s*Eng\.?|Ph\.?\s*D\.?|Bachelor|Master of|Associate of|Associate's)\b/i;
  const META_PREFIX_RE =
    /^(Expected graduation|Graduated|GPA|Class of|Anticipated|Completion date|Degree awarded)/i;
  const GPA_RE = /\bGPA\s*[:.]?\s*[\d.]+/i;
  const META_DATE_RE =
    /\b((?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s+20\d{2}|(?:Spring|Summer|Fall|Winter)\s+20\d{2}|20\d{2}\s*[-–—]\s*(?:Present|Current|20\d{2}))\b/i;
  const DETAIL_PREFIX_RE =
    /^(Focus|Relevant coursework|Coursework|Honors|Thesis|Capstone|Minor|Concentration|Activities|Specialization)\s*:/i;

  const EDU_COMMENT_RE =
    /<!--\s*edu-(join-next(?::(\d+))?|no-join|compact-off)\s*-->/gi;

  function trimTrailingHardBreak(raw) {
    return (raw || "").trimEnd().replace(/  +$/, "");
  }

  function extractEduComments(line) {
    let joinNext = 0;
    let noJoin = false;
    let compactOff = false;
    const clean = line.replace(EDU_COMMENT_RE, (match, kind, countStr) => {
      if (kind && kind.startsWith("join-next")) {
        joinNext = countStr ? Math.max(1, parseInt(countStr, 10) || 1) : 1;
      } else if (match.includes("no-join")) {
        noJoin = true;
      } else if (match.includes("compact-off")) {
        compactOff = true;
      }
      return "";
    });
    return {
      cleanLine: trimTrailingHardBreak(clean),
      joinNext,
      noJoin,
      compactOff,
    };
  }

  function isInstitutionLine(text) {
    const t = (text || "").trim();
    if (!t || t.startsWith("- ") || t.startsWith("##")) return false;
    const hasInst = INSTITUTION_RE.test(t);
    const hasDegree = DEGREE_RE.test(t);
    const hasSep = /[—–|]/.test(t);
    if (hasInst && (hasDegree || hasSep)) return true;
    if (hasDegree && hasSep && t.length > 20) return true;
    return false;
  }

  function isMetaLine(text) {
    const t = (text || "").trim();
    if (!t || isInstitutionLine(t)) return false;
    if (META_PREFIX_RE.test(t)) return true;
    if (GPA_RE.test(t) && t.length < 140) return true;
    if (META_DATE_RE.test(t) && t.length < 140 && !isInstitutionLine(t)) return true;
    return false;
  }

  function isDetailLine(text, afterMeta) {
    const t = (text || "").trim();
    if (!t || t.startsWith("##") || t.startsWith("- ")) return false;
    if (isInstitutionLine(t) || isMetaLine(t)) return false;
    if (DETAIL_PREFIX_RE.test(t)) return true;
    if (afterMeta && t.length > 0 && t.length < 160) return true;
    return false;
  }

  function isEducationHeading(line) {
    return EDUCATION_HEADING_RE.test((line || "").trim());
  }

  function isSectionBreak(line) {
    const t = (line || "").trim();
    return !t || ANY_H2_RE.test(t) || t.startsWith("- ");
  }

  function appendToRight(markedLine, addition) {
    const idx = markedLine.indexOf(EDU_ROW_MARKER);
    if (idx === -1) return `${markedLine}${EDU_ROW_MARKER}${addition}`;
    const left = markedLine.slice(0, idx);
    const right = markedLine.slice(idx + 1).trimEnd().replace(/  +$/, "");
    return `${left}${EDU_ROW_MARKER}${right} | ${addition}`;
  }

  function buildMarkedRow(left, rightParts) {
    const rights = rightParts.filter(Boolean).map((s) => s.trim()).filter(Boolean);
    if (!left || !rights.length) return left || "";
    return `${left}${EDU_ROW_MARKER}${rights.join(" | ")}`;
  }

  /**
   * Process lines inside ## Education when joins are enabled.
   * @param {string[]} lines
   * @param {number} start
   * @param {{ joinFocusToExpected: boolean }} profile
   * @returns {{ out: string[], end: number }}
   */
  function processEducationBlock(lines, start, profile) {
    const out = [];
    let i = start;

    while (i < lines.length) {
      const raw = lines[i];
      const trimmed = raw.trim();

      if (ANY_H2_RE.test(trimmed)) break;

      const { cleanLine, joinNext, noJoin, compactOff } = extractEduComments(raw);

      if (compactOff) {
        out.push(cleanLine);
        i += 1;
        continue;
      }

      if (noJoin) {
        out.push(cleanLine);
        if (i + 1 < lines.length && !isSectionBreak(lines[i + 1])) {
          out.push(extractEduComments(lines[i + 1]).cleanLine);
          i += 2;
        } else {
          i += 1;
        }
        continue;
      }

      if (joinNext > 0) {
        const left = cleanLine;
        const rights = [];
        let j = 0;
        while (j < joinNext && i + 1 + j < lines.length) {
          const nextRaw = lines[i + 1 + j];
          if (isSectionBreak(nextRaw)) break;
          rights.push(extractEduComments(nextRaw).cleanLine);
          j += 1;
        }
        if (left && rights.length) {
          out.push(buildMarkedRow(left, rights));
          i += 1 + rights.length;
          continue;
        }
      }

      const baseTrim = cleanLine.trim();
      if (!baseTrim) {
        out.push(raw);
        i += 1;
        continue;
      }

      if (isInstitutionLine(baseTrim) && i + 1 < lines.length) {
        const nextParsed = extractEduComments(lines[i + 1]);
        const nextTrim = nextParsed.cleanLine.trim();
        if (isMetaLine(nextTrim)) {
          let marked = buildMarkedRow(cleanLine, [nextParsed.cleanLine]);
          let consumed = i + 1;

          if (profile.joinFocusToExpected) {
            while (consumed + 1 < lines.length) {
              const peekParsed = extractEduComments(lines[consumed + 1]);
              const peekTrim = peekParsed.cleanLine.trim();
              if (isSectionBreak(peekParsed.cleanLine)) break;
              if (isInstitutionLine(peekTrim)) break;
              if (isDetailLine(peekTrim, true)) {
                marked = appendToRight(marked, peekParsed.cleanLine);
                consumed += 1;
              } else {
                break;
              }
            }
          }

          out.push(marked);

          if (
            !profile.joinFocusToExpected &&
            consumed + 1 < lines.length
          ) {
            const peek = lines[consumed + 1].trim();
            if (peek && !isSectionBreak(peek)) {
              out.push("");
            }
          }

          i = consumed + 1;
          continue;
        }
      }

      if (cleanLine.includes(EDU_ROW_MARKER) && profile.joinFocusToExpected && i + 1 < lines.length) {
        const peekParsed = extractEduComments(lines[i + 1]);
        const peekTrim = peekParsed.cleanLine.trim();
        if (isDetailLine(peekTrim, true) && !isSectionBreak(peekParsed.cleanLine)) {
          out.push(appendToRight(cleanLine, peekParsed.cleanLine));
          i += 2;
          continue;
        }
      }

      out.push(cleanLine);
      i += 1;
    }

    return { out, end: i };
  }

  /**
   * @param {string} md
   * @param {{ joinFocusToExpected: boolean }} profile
   */
  function preprocessResumeMarkdown(md, profile) {
    const lines = md.split(/\r?\n/);
    const out = [];
    let inEducation = false;
    let joinsDisabled = false;
    let pendingJoinOff = false;
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];
      const trimmed = line.trim();
      const parsed = extractEduComments(line);

      if (isEducationHeading(trimmed)) {
        inEducation = true;
        joinsDisabled = pendingJoinOff;
        pendingJoinOff = false;
        out.push(line);
        i += 1;
        continue;
      }

      if (inEducation && ANY_H2_RE.test(trimmed)) {
        inEducation = false;
        joinsDisabled = false;
        pendingJoinOff = false;
        out.push(line);
        i += 1;
        continue;
      }

      if (!inEducation) {
        if (parsed.compactOff) pendingJoinOff = true;
        out.push(parsed.cleanLine);
        i += 1;
        continue;
      }

      if (joinsDisabled || parsed.compactOff) {
        joinsDisabled = true;
        out.push(parsed.cleanLine);
        i += 1;
        continue;
      }

      const block = processEducationBlock(lines, i, profile);
      out.push(...block.out);
      i = block.end;
    }

    return out.join("\n");
  }

  function safePreprocessResumeMarkdown(md, profile) {
    try {
      return preprocessResumeMarkdown(md, profile);
    } catch (err) {
      console.warn("Education preprocess failed; using original markdown.", err);
      return md;
    }
  }

  global.EducationPreprocess = {
    EDU_ROW_MARKER,
    preprocessResumeMarkdown,
    safePreprocessResumeMarkdown,
    isInstitutionLine,
    isMetaLine,
    isDetailLine,
  };
})(typeof window !== "undefined" ? window : globalThis);
