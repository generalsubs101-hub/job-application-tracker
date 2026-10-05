// Usage: node build_page.js [YYYY-MM-DD]   (default: today, local)
// Reads applications-log.md and writes a standalone docs/index.html page
// (GitHub Pages friendly: self-contained CSS vars, no sendPrompt dependency).
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'applications-log.md');
const outDir = path.join(__dirname, 'docs');
const now = new Date();
const today = process.argv[2] ||
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(l => l.includes('|'));
lines.shift(); // header
const rows = lines
  .map(l => l.split('|').map(c => c.trim()))
  .filter(c => c.length >= 9 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]))
  .map(c => ({ date: c[0], company: c[1], title: c[2], location: c[3], id: c[4], url: c[5], method: c[6], matched: c[7], status: c[8] }));

const todayRows = rows.filter(r => r.date === today);

// Dedupe across all runs: same job (by LinkedIn Job ID, or company+title if no ID)
// keeps only its most recent row.
const dedupeKey = r => r.id || `${r.company.toLowerCase()}|${r.title.toLowerCase()}`;
const latestByKey = new Map();
rows.forEach(r => latestByKey.set(dedupeKey(r), r));
const displayRows = Array.from(latestByKey.values());

const isApplied = s => /^applied/i.test(s);
const isAttention = s => /^(needs-account|draft-needs-attach|inprogress|failed)/i.test(s);
const isFailed = s => /^failed/i.test(s);
const isNotFit = s => /^skipped-not-fit/i.test(s);
const count = f => todayRows.filter(r => f(r.status)).length;
const total = rows.filter(r => isApplied(r.status)).length;

const letterRe = /cover letter ready at (letters\/[\w.\-]+\.md)/i;
const letterContents = {};
const letterPathOf = matched => {
  const m = matched.match(letterRe);
  return m ? m[1] : null;
};
// A letter written on an earlier run must stay attached to a job even after a
// later retry row overwrites its "matched" text without repeating the
// reference, so this is keyed by job (dedupeKey), scanning ALL rows, not just
// each job's latest row.
const letterPathByKey = new Map();
rows.forEach(r => {
  const lp = letterPathOf(r.matched);
  if (lp) {
    letterPathByKey.set(dedupeKey(r), lp);
    if (!(lp in letterContents)) {
      const abs = path.join(__dirname, lp.replace(/^letters\//, 'letters' + path.sep));
      try { letterContents[lp] = fs.readFileSync(abs, 'utf8'); }
      catch { letterContents[lp] = ''; }
    }
  }
});

const badge = s => {
  const cls = isApplied(s) ? 'ok' : isAttention(s) ? 'warn' : 'skip';
  return `<span class="b ${cls}">${esc(s)}</span>`;
};
// This page is static (GitHub Pages, no live Claude session to message), so
// action buttons copy a ready-made prompt to the clipboard instead of calling
// sendPrompt — paste it into Claude Code to act on it.
const actions = r => {
  const btns = [];
  if (r.url) btns.push(`<button class="act" data-act="open" data-url="${esc(r.url)}">Open job</button>`);
  if (isNotFit(r.status)) {
    const applyPrompt = `Apply anyway to ${r.company} - ${r.title} (Job ID ${r.id}): ${r.url}. I reviewed the skip reason (${r.matched}) and want to proceed despite it.`;
    const fixCvPrompt = `Review my CV against the ${r.company} - ${r.title} posting (${r.url}). It was skipped for this gap: ${r.matched}. Tell me what is missing and ask me what is true before adding anything to the CV.`;
    btns.push(`<button class="act" data-act="copy-prompt" data-prompt="${esc(applyPrompt)}" title="Copies a prompt — paste into Claude Code">Apply anyway</button>`);
    btns.push(`<button class="act" data-act="copy-prompt" data-prompt="${esc(fixCvPrompt)}" title="Copies a prompt — paste into Claude Code">Fix CV for this</button>`);
  }
  if (isAttention(r.status)) {
    btns.push(`<button class="act" data-act="open" data-url="${esc(r.url)}">Retry (open)</button>`);
  }
  const lp = letterPathByKey.get(dedupeKey(r)) || letterPathOf(r.matched);
  if (lp) {
    btns.push(`<button class="act" data-act="copy-letter" data-letter="${esc(lp)}">Copy cover letter</button>`);
  }
  return btns.join(' ');
};
const tr = r => `<tr data-day="${r.date === today ? 'today' : 'old'}" data-status="${isApplied(r.status) ? 'applied' : isAttention(r.status) ? 'attention' : 'skipped'}" data-q="${esc((r.company + ' ' + r.title + ' ' + r.location + ' ' + r.matched).toLowerCase())}">
<td data-label="Company">${esc(r.company)}</td><td data-label="Job">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</td>
<td data-label="Location">${esc(r.location)}</td><td data-label="Method">${esc(r.method)}</td><td class="m" data-label="Matched CV points">${esc(r.matched)}</td><td data-label="Status">${badge(r.status)}</td><td class="act-cell" data-label="Actions">${actions(r)}</td></tr>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>LinkedIn QA Job Applications Tracker</title>
<style>
:root{
  --bg:#ffffff;--text-primary:#1a1a1a;--text-secondary:#6b7280;--border:#e5e7eb;--surface-1:#f3f4f6;
  --bg-success:#dcfce7;--text-success:#166534;--bg-warning:#fef3c7;--text-warning:#92400e;
}
@media (prefers-color-scheme: dark){
  :root{
    --bg:#0f1115;--text-primary:#e5e7eb;--text-secondary:#9ca3af;--border:#2a2e37;--surface-1:#1a1d24;
    --bg-success:#14301f;--text-success:#4ade80;--bg-warning:#3a2a0c;--text-warning:#fbbf24;
  }
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text-primary);font:14px/1.4 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.wrap{max-width:1200px;margin:0 auto;padding:24px 16px}
h1{font-size:20px;margin:0 0 4px}
.sub{opacity:.7;margin-bottom:16px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.stat{border:1px solid var(--border);border-radius:8px;padding:8px 14px;min-width:100px}
.stat b{display:block;font-size:22px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px}
.bar input,.bar select{padding:7px 10px;border:1px solid var(--border);border-radius:6px;background:var(--bg);color:inherit;font-size:14px}
.bar input{flex:1;min-width:180px}
.tw{width:100%;overflow-x:auto}
table{width:100%;border-collapse:collapse;table-layout:fixed;min-width:720px}
th,td{text-align:left;padding:8px;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:break-word}
th{font-size:12px;opacity:.7}
col.c-company{width:13%}col.c-job{width:15%}col.c-loc{width:11%}col.c-method{width:9%}col.c-matched{width:25%}col.c-status{width:15%}col.c-act{width:12%}
.m{font-size:12px}
.b{padding:2px 8px;border-radius:10px;font-size:12px;display:inline-block}
.ok{background:var(--bg-success);color:var(--text-success)}.warn{background:var(--bg-warning);color:var(--text-warning)}.skip{background:var(--surface-1);color:var(--text-secondary)}
a{color:inherit}
.act-cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
button.act{font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;width:100%;white-space:normal}
button.act:hover{background:var(--surface-1)}
button.act:active{transform:scale(0.98)}
footer{margin-top:20px;font-size:12px;opacity:.6}
@media (max-width:720px){
  table{min-width:0}
  .bar input{min-width:0}
  colgroup{display:none}
  table,thead,tbody,tr{display:block;width:100%}
  thead{display:none}
  #t tr{border:1px solid var(--border);border-radius:8px;margin-bottom:8px;padding:6px 8px}
  td{display:flex;gap:8px;padding:4px 0;border-bottom:none;width:auto}
  td::before{content:attr(data-label);flex:0 0 42%;font-size:11px;opacity:.65;font-weight:600}
  td.act-cell{flex-direction:column}
  td.act-cell::before{flex:none;margin-bottom:4px}
  .act-cell{width:100%}
}
</style>
</head>
<body>
<div class="wrap">
<h1>LinkedIn QA Job Applications Tracker</h1>
<div class="sub">Run date ${esc(today)} &middot; ${total} applied all-time &middot; one row per job, latest status (deduped across all runs)</div>
<div class="stats">
<div class="stat"><b>${count(isApplied)}</b>applied today</div>
<div class="stat"><b>${count(isAttention)}</b>need attention</div>
<div class="stat"><b>${count(s => !isApplied(s) && !isAttention(s))}</b>skipped</div>
<div class="stat"><b>${todayRows.length}</b>reviewed today</div>
</div>
<div class="bar"><input id="q" placeholder="Search company, title, location..."><select id="f"><option value="">All statuses</option><option value="applied">Applied</option><option value="attention">Needs attention</option><option value="skipped">Skipped</option></select><select id="d"><option value="all">All runs</option><option value="today">Today</option></select></div>
<div class="tw"><table><colgroup><col class="c-company"><col class="c-job"><col class="c-loc"><col class="c-method"><col class="c-matched"><col class="c-status"><col class="c-act"></colgroup><thead><tr><th>Company</th><th>Job</th><th>Location</th><th>Method</th><th>Matched CV points</th><th>Status</th><th>Actions</th></tr></thead>
<tbody id="t">${displayRows.slice().reverse().map(tr).join('\n') || '<tr><td colspan="7">No applications logged yet.</td></tr>'}</tbody></table></div>
<footer>Generated by build_page.js from applications-log.md. Rebuilt daily.</footer>
</div>
<script>
const LETTERS = ${JSON.stringify(letterContents).replace(/</g, '\\u003c')};
const q=document.getElementById('q'),f=document.getElementById('f'),d=document.getElementById('d');
function run(){document.querySelectorAll('#t tr[data-q]').forEach(r=>{
const ok=(!q.value||r.dataset.q.includes(q.value.toLowerCase()))&&(!f.value||r.dataset.status===f.value)&&(d.value==='all'||r.dataset.day==='today');
r.style.display=ok?'':'none';});}
[q,f,d].forEach(e=>e.addEventListener('input',run));run();

document.getElementById('t').addEventListener('click', e => {
  const b = e.target.closest('button.act');
  if (!b) return;
  const act = b.dataset.act;
  const copyToClipboard = text => {
    const done = () => { const old = b.textContent; b.textContent = 'Copied'; setTimeout(() => b.textContent = old, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
    }
  };
  if (act === 'open') {
    if (b.dataset.url) window.open(b.dataset.url, '_blank', 'noopener');
  } else if (act === 'copy-letter') {
    copyToClipboard(LETTERS[b.dataset.letter] || '');
  } else if (act === 'copy-prompt') {
    copyToClipboard(b.dataset.prompt || '');
  }
});
</script>
</body>
</html>
`;

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'index.html'), html);
console.log(`Wrote ${path.join(outDir, 'index.html')} (${html.length} bytes)`);
