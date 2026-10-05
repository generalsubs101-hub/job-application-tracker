// Usage: node build_widget.js [YYYY-MM-DD]   (default: today, local)
// Reads applications-log.md (pipe-separated) and prints self-contained widget HTML to stdout.
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'applications-log.md');
const lettersDir = path.join(__dirname, 'letters');
const now = new Date();
const today = process.argv[2] ||
  `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter(l => l.includes('|'));
const header = lines.shift();
const rows = lines
  .map(l => l.split('|').map(c => c.trim()))
  .filter(c => c.length >= 9 && /^\d{4}-\d{2}-\d{2}$/.test(c[0]))
  .map(c => ({ date: c[0], company: c[1], title: c[2], location: c[3], id: c[4], url: c[5], method: c[6], matched: c[7], status: c[8] }));

const todayRows = rows.filter(r => r.date === today);

// Dedupe across all runs: same job (by LinkedIn Job ID, or company+title if no ID)
// keeps only its most recent row. rows[] is in file order (oldest first), so the
// last write for a key is the latest status.
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

// Pull out "cover letter ready at letters/<file>.md" references and inline their content
// so the widget can offer a copy button without any filesystem access at view time.
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
const actions = r => {
  const btns = [];
  if (isNotFit(r.status)) {
    btns.push(`<button class="act" data-act="apply-anyway" data-company="${esc(r.company)}" data-title="${esc(r.title)}" data-url="${esc(r.url)}" data-id="${esc(r.id)}" data-matched="${esc(r.matched)}">Apply anyway</button>`);
    btns.push(`<button class="act" data-act="fix-cv" data-company="${esc(r.company)}" data-title="${esc(r.title)}" data-url="${esc(r.url)}" data-matched="${esc(r.matched)}">Fix CV for this</button>`);
  }
  if (isAttention(r.status)) {
    btns.push(`<button class="act" data-act="retry" data-company="${esc(r.company)}" data-title="${esc(r.title)}" data-url="${esc(r.url)}" data-id="${esc(r.id)}" data-status="${esc(r.status)}">Retry</button>`);
  }
  const lp = letterPathByKey.get(dedupeKey(r)) || letterPathOf(r.matched);
  if (lp) {
    btns.push(`<button class="act" data-act="copy-letter" data-letter="${esc(lp)}">Copy cover letter</button>`);
  }
  return btns.join(' ');
};
const tr = r => `<tr data-status="${isApplied(r.status) ? 'applied' : isAttention(r.status) ? 'attention' : 'skipped'}" data-q="${esc((r.company + ' ' + r.title + ' ' + r.location + ' ' + r.matched).toLowerCase())}">
<td data-label="Company">${esc(r.company)}</td><td data-label="Job">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>` : esc(r.title)}</td>
<td data-label="Location">${esc(r.location)}</td><td data-label="Method">${esc(r.method)}</td><td class="m" data-label="Matched CV points">${esc(r.matched)}</td><td data-label="Status">${badge(r.status)}</td><td class="act-cell" data-label="Actions">${actions(r)}</td></tr>`;

const html = `<style>
.w{font:14px/1.4 system-ui,sans-serif;color:var(--text-primary)}
.w h3{margin:0 0 4px}.w .sub{opacity:.7;margin-bottom:10px}
.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:10px}
.stat{border:1px solid var(--border);border-radius:8px;padding:8px 12px;min-width:90px}
.stat b{display:block;font-size:20px}
.bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.bar input,.bar select{padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:transparent;color:inherit}
.bar input{flex:1;min-width:160px}
.tw{width:100%}
table{width:100%;border-collapse:collapse;table-layout:fixed}
th,td{text-align:left;padding:6px 8px;border-bottom:1px solid var(--border);vertical-align:top;overflow-wrap:break-word}
th{font-size:12px;opacity:.7}
col.c-company{width:13%}col.c-job{width:15%}col.c-loc{width:11%}col.c-method{width:9%}col.c-matched{width:25%}col.c-status{width:15%}col.c-act{width:12%}
.m{font-size:12px}
.b{padding:2px 8px;border-radius:10px;font-size:12px;display:inline-block}
.ok{background:var(--bg-success);color:var(--text-success)}.warn{background:var(--bg-warning);color:var(--text-warning)}.skip{background:var(--surface-1);color:var(--text-secondary)}
a{color:inherit}
.act-cell{display:flex;flex-direction:column;gap:4px;align-items:stretch}
button.act{font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:transparent;color:inherit;cursor:pointer;width:100%;white-space:normal;text-align:center}
button.act:hover{background:var(--surface-1)}
button.act:active{transform:scale(0.98)}
@media (max-width:720px){
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
<div class="w">
<h3>LinkedIn QA job applications</h3>
<div class="sub">Run date ${esc(today)} &middot; ${total} applied all-time</div>
<div class="stats">
<div class="stat"><b>${count(isApplied)}</b>applied today</div>
<div class="stat"><b>${count(isAttention)}</b>need attention</div>
<div class="stat"><b>${count(s => !isApplied(s) && !isAttention(s))}</b>skipped</div>
<div class="stat"><b>${todayRows.length}</b>reviewed</div>
</div>
<div class="bar"><input id="q" placeholder="Search company, title, location..."><select id="f"><option value="">All statuses</option><option value="applied">Applied</option><option value="attention">Needs attention</option><option value="skipped">Skipped</option></select><select id="d"><option value="today">Today</option><option value="all">All runs</option></select></div>
<div class="tw"><table><colgroup><col class="c-company"><col class="c-job"><col class="c-loc"><col class="c-method"><col class="c-matched"><col class="c-status"><col class="c-act"></colgroup><thead><tr><th>Company</th><th>Job</th><th>Location</th><th>Method</th><th>Matched CV points</th><th>Status</th><th>Actions</th></tr></thead>
<tbody id="t">${displayRows.slice().reverse().map(r => tr(r).replace('<tr ', `<tr data-day="${r.date === today ? 'today' : 'old'}" `)).join('\n') || '<tr><td colspan="7">No applications logged yet.</td></tr>'}</tbody></table></div>
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
  if (act === 'apply-anyway') {
    sendPrompt('Apply anyway to ' + b.dataset.company + ' - ' + b.dataset.title + ' (Job ID ' + b.dataset.id + '): ' + b.dataset.url + '. I reviewed the skip reason (' + b.dataset.matched + ') and want to proceed despite it.');
  } else if (act === 'fix-cv') {
    sendPrompt('Review my CV against the ' + b.dataset.company + ' - ' + b.dataset.title + ' posting (' + b.dataset.url + '). It was skipped for this gap: ' + b.dataset.matched + '. Tell me what is missing and ask me what is true before adding anything to the CV.');
  } else if (act === 'retry') {
    sendPrompt('Retry applying to ' + b.dataset.company + ' - ' + b.dataset.title + ' (Job ID ' + b.dataset.id + '): ' + b.dataset.url + '. Previous attempt status: ' + b.dataset.status + '.');
  } else if (act === 'copy-letter') {
    const text = LETTERS[b.dataset.letter] || '';
    const done = () => { const old = b.textContent; b.textContent = 'Copied'; setTimeout(() => b.textContent = old, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(done);
    } else {
      const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy'); document.body.removeChild(ta); done();
    }
  }
});
</script>`;
process.stdout.write(html);
