# Markdown → PDF (browser)

Paste Markdown, pick a layout, download a **US Letter** PDF. Output is a **real text PDF** ([pdfmake](https://pdfmake.github.io/docs/) + [marked](https://marked.js.org/))—selectable text and links, not a screenshot—so it tends to work better with ATS parsers than canvas-based tools.

## Layout modes

| Button | Use case |
| ------ | -------- |
| **Cover letter** | Standard margins and spacing |
| **Resume** | Same as cover letter (no one-page hacks) |
| **Resume (compact)** | Narrow side margins, moderate vertical tightening, education lines split left/right |
| **Resume (ultra compact)** | Maximum tightening for one-page fits |

Default download names: `resume.pdf` (all resume modes) and `cover_letter.pdf`. Edit **Save as** before downloading.

## Run locally

```bash
python -m http.server 8765
```

Open [http://localhost:8765](http://localhost:8765). Some browsers block CDN scripts on `file://`; use a local server if scripts fail to load.

## GitHub Pages

This folder is static—no build step.

### Option A: Project site (`username.github.io/md_to_pdf_web/`)

1. Create a public repo (e.g. `md_to_pdf_web`) and push **the contents of this folder** (not the parent monorepo).
2. **Settings → Pages → Build and deployment → Source:** Deploy from branch.
3. Branch: `main`, folder: `/ (root)`.
4. Open `https://<username>.github.io/md_to_pdf_web/`.

If assets 404, add a one-line base path in `index.html` script tags (only needed when not served from repo root)—see [Pages docs](https://docs.github.com/en/pages).

### Option B: User/org site (`username.github.io`)

Copy these files into the repo that backs your user site (often `username.github.io` on branch `main`), at the site root or under a subpath.

### Tips

- Add an empty `.nojekyll` at the site root if GitHub Pages ignores files (included in this repo).
- For offline or strict CSP, vendor `marked`, `pdfmake`, and `vfs_fonts` from the versions in `index.html` and switch script `src` to relative paths.

## Education layout (compact / ultra only)

Preprocessing runs **only** under `## Education` (also `## Education and Training`, `## Academic Background`, `## Academics`). It does not rewrite other sections.

### Automatic heuristics

Within Education, consecutive lines are classified (no school names hardcoded):

| Line type | Examples |
| --------- | -------- |
| Institution | Contains University/College + degree or `—` / `\|` separators |
| Meta | `Expected graduation`, `Graduated`, `GPA`, `Class of`, `May 2024`, etc. |
| Detail | `Focus:`, `Relevant coursework:`, or short follow-up prose |

- **Compact:** institution + meta → one PDF row (school left, dates/GPA right). Detail lines stay below.
- **Ultra:** same, plus detail lines are appended on the right column to save vertical space.

If institution + meta do not both match, lines are left unchanged.

### Optional HTML comments

| Comment | Effect |
| ------- | ------ |
| `<!-- edu-join-next -->` | Force-join the next line to the right column |
| `<!-- edu-join-next:2 -->` | Join the next two lines to the right |
| `<!-- edu-no-join -->` | Skip auto-join for this line and the next |
| `<!-- edu-compact-off -->` | Disable all education joins for that Education section |

Comments are stripped before rendering.

### Tests

```bash
node test-education-preprocess.mjs
```

## Notes

- **Page size:** US Letter. Standard modes use ~0.75" margins; compact modes use ~0.25" side margins.
- Very large documents can be slow in the browser.
- If preprocessing throws, the app falls back to the original Markdown (see browser console).
