/**
 * Quick node smoke tests for education-preprocess.js (load via vm).
 * Run: node test-education-preprocess.mjs
 */
import fs from "fs";
import vm from "vm";

const code = fs.readFileSync(new URL("./education-preprocess.js", import.meta.url), "utf8");
const sandbox = { window: {}, console };
vm.runInContext(code, vm.createContext(sandbox));
const EP = sandbox.window.EducationPreprocess;
const M = EP.EDU_ROW_MARKER;
const show = (s) => s.replaceAll(M, " |R| ");

const voltus = fs.readFileSync(
  new URL(
    "../resume_optimizer/OUTPUT_BATCH_9_05122026/Curated/voltus_sales_analytics_intern_remote_usa_2026/kirk_corwin_resume_updated_3.md",
    import.meta.url,
  ),
  "utf8",
);

let ok = 0;
let fail = 0;
function assert(name, cond) {
  if (cond) {
    ok += 1;
    console.log("OK", name);
  } else {
    fail += 1;
    console.log("FAIL", name);
  }
}

const compact = EP.preprocessResumeMarkdown(voltus, { joinFocusToExpected: false });
const ultra = EP.preprocessResumeMarkdown(voltus, { joinFocusToExpected: true });

assert("compact has NSC marker", compact.includes(`North Seattle College`) && compact.includes(M));
assert("compact Focus on own line", compact.includes("\nFocus: statistics"));
assert("ultra merges Focus to right", ultra.includes(M) && !/\nFocus: statistics/.test(ultra.split("## Leadership")[0]));

const synthetic = `## Education

University of Example — Boston, MA — B.S. Computer Science
May 2024 | GPA 3.85
Relevant coursework: algorithms, systems

## Skills
`;
const synOut = EP.preprocessResumeMarkdown(synthetic, { joinFocusToExpected: false });
assert("synthetic join", show(synOut).includes("University of Example") && show(synOut).includes("May 2024"));

const noJoin = `## Work experience

North Seattle College Club president

## Education

Foo College — B.S. X
Bar line
`;
const noJoinOut = EP.preprocessResumeMarkdown(noJoin, { joinFocusToExpected: false });
const lead = noJoinOut.split("## Leadership")[0] || noJoinOut;
assert("experience not joined", !lead.includes(M) || lead.indexOf(M) > lead.indexOf("## Education"));

const bullets = `## Education

- B.S. CS, Example University, 2024
- High school diploma
`;
const bulOut = EP.preprocessResumeMarkdown(bullets, { joinFocusToExpected: false });
assert("bullets unchanged", !bulOut.includes(M));

const forced = `## Education

Custom School — Degree <!-- edu-join-next -->
2020 | Award winner

## Done
`;
const forcedOut = EP.preprocessResumeMarkdown(forced, { joinFocusToExpected: false });
assert("forced join", forcedOut.includes("Custom School") && forcedOut.includes(M) && forcedOut.includes("Award winner"));

console.log(`\n${ok} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
