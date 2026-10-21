// =====================================================================
// Shared helpers for BOTH admin panels:
//   /admin/ai     -> public/admin-ai.html     (AI agent only)
//   /admin/manual -> public/admin-manual.html (manual add/edit only)
// Kept in one file so a fix here applies to both panels at once.
// =====================================================================

const keyInput = document.getElementById('adminKey');
const statusEl = document.getElementById('statusMsg');

function headers() {
  return { 'Content-Type': 'application/json', 'x-admin-key': keyInput.value };
}

const escHtml = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function showStatus(message, type) {
  if (!statusEl) return;
  statusEl.innerHTML = `<div class="status-msg ${type}">${escHtml(message)}</div>`;
  setTimeout(() => { statusEl.innerHTML = ''; }, 5000);
}

// Remember the admin key in this browser (sessionStorage only — cleared when
// the tab closes) so you don't have to retype it switching between the two
// panels.
(function restoreKey() {
  const saved = sessionStorage.getItem('thereport_admin_key');
  if (saved && keyInput) keyInput.value = saved;
})();
if (keyInput) keyInput.addEventListener('input', () => sessionStorage.setItem('thereport_admin_key', keyInput.value));

// ---------- News list (shared by both panels) ----------
// `filterFn` lets each panel show a different subset by default
// (e.g. the AI panel highlights createdBy === 'ai-gemini').
async function loadNewsList({ listEl, totalEl, filterLangId, filterCatId, filterFn, onAfterRender } = {}) {
  try {
    const res = await fetch('/api/news', { headers: headers() });
    const data = await res.json();
    window.__allNews = data.news || [];

    let allNews = data.news || [];
    if (totalEl) totalEl.textContent = allNews.length;

    const filterLang = filterLangId ? document.getElementById(filterLangId)?.value : '';
    const filterCat = filterCatId ? document.getElementById(filterCatId)?.value : '';
    if (filterLang) allNews = allNews.filter(n => n.language === filterLang);
    if (filterCat) allNews = allNews.filter(n => n.category === filterCat);
    if (typeof filterFn === 'function') allNews = allNews.filter(filterFn);

    if (!listEl) return;
    if (allNews.length === 0) {
      listEl.innerHTML = '<p style="color:#5B6786; text-align:center; padding: 20px;">No news stories found.</p>';
      return;
    }

    listEl.innerHTML = allNews.map(n => `
      <div class="news-row">
        ${n.image ? `<img src="${escHtml(n.image)}" alt="" onerror="this.style.display='none'">` : '<div style="width:80px;height:80px;background:linear-gradient(135deg, #0A2557, #123166);border-radius:12px;"></div>'}
        <div class="news-info">
          <div class="news-title ${n.language === 'urdu' ? 'urdu' : ''}">${escHtml(n.title)}</div>
          <div class="${n.language === 'urdu' ? 'urdu' : ''}" style="font-size:0.85rem;color:#5B6786;margin:4px 0">${escHtml((n.excerpt || '').slice(0, 160))}</div>
          <div class="news-meta">
            <span class="badge ${escHtml(n.language)}">${escHtml((n.language || '').toUpperCase())}</span>
            <span>📁 ${escHtml(n.category)}</span>
            <span>📅 ${escHtml(n.date || 'N/A')}</span>
            ${n.status === 'draft' ? '<span style="background:#fff3cd;color:#856404;padding:2px 8px;border-radius:8px;font-weight:700">📝 DRAFT</span>' : ''}
            ${n.trending ? '<span style="background:#ffe3df;color:#C2211D;padding:2px 8px;border-radius:8px;font-weight:700">🔥 TRENDING</span>' : ''}
            ${n.createdBy === 'ai-gemini' ? '<span style="background:#e7f0ff;color:#0A2557;padding:2px 8px;border-radius:8px;font-weight:700">🤖 AI</span>' : '<span style="background:#e9edf5;color:#0A2557;padding:2px 8px;border-radius:8px;font-weight:700">✍️ Manual</span>'}
            ${n.video ? '<span>🎬 video</span>' : ''}
            ${n.sourceUrl ? `<a href="${escHtml(n.sourceUrl)}" target="_blank" rel="noopener">🔗 source</a>` : ''}
          </div>
        </div>
        <div class="news-actions">
          ${n.status === 'draft' ? `<button data-id="${escHtml(n.id)}" class="pub">✅ Publish</button>` : `<button data-id="${escHtml(n.id)}" class="unpub secondary">↩️ Unpublish</button><a href="/news/${encodeURIComponent(n.id)}" target="_blank" class="secondary" style="text-align:center;text-decoration:none;padding:8px 12px;border-radius:10px;font-weight:700">👁️ View</a>`}
          <button data-id="${escHtml(n.id)}" class="trend secondary">${n.trending ? '🔥 Unmark Trending' : '🔥 Mark Trending'}</button>
          <button data-id="${escHtml(n.id)}" class="edit secondary">✏️ Edit</button>
          <button data-id="${escHtml(n.id)}" class="del danger">🗑️ Delete</button>
        </div>
        <div class="edit-slot" id="edit-${escHtml(n.id)}" style="flex-basis:100%"></div>
      </div>
    `).join('');

    listEl.querySelectorAll('.pub').forEach(btn => btn.addEventListener('click', async () => {
      const res = await fetch('/api/news/' + btn.dataset.id, { method: 'PUT', headers: headers(), body: JSON.stringify({ status: 'published' }) });
      if (res.ok) { showStatus('✅ Published! It is now live on the website.', 'success'); loadNewsList(lastListCtx); }
      else showStatus('❌ Could not publish (check the admin key).', 'error');
    }));
    listEl.querySelectorAll('.unpub').forEach(btn => btn.addEventListener('click', async () => {
      const res = await fetch('/api/news/' + btn.dataset.id, { method: 'PUT', headers: headers(), body: JSON.stringify({ status: 'draft' }) });
      if (res.ok) { showStatus('↩️ Moved back to drafts.', 'success'); loadNewsList(lastListCtx); }
      else showStatus('❌ Could not update.', 'error');
    }));
    listEl.querySelectorAll('.trend').forEach(btn => btn.addEventListener('click', async () => {
      const n = (window.__allNews || []).find(x => x.id === btn.dataset.id);
      const res = await fetch('/api/news/' + btn.dataset.id, { method: 'PUT', headers: headers(), body: JSON.stringify({ trending: !(n && n.trending) }) });
      if (res.ok) { loadNewsList(lastListCtx); }
      else showStatus('❌ Could not update.', 'error');
    }));
    listEl.querySelectorAll('.edit').forEach(btn => btn.addEventListener('click', () => openEditor(btn.dataset.id)));
    listEl.querySelectorAll('.del').forEach(btn => btn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to delete this news story?')) return;
      const res = await fetch('/api/news/' + btn.dataset.id, { method: 'DELETE', headers: headers() });
      if (res.ok) { showStatus('✅ News deleted successfully!', 'success'); loadNewsList(lastListCtx); }
      else showStatus('❌ Error deleting news.', 'error');
    }));

    if (typeof onAfterRender === 'function') onAfterRender(allNews);
  } catch (err) {
    if (listEl) listEl.innerHTML = '<p style="color:#721c24;">Error loading news: ' + escHtml(err.message) + '</p>';
  }
}

// Remember the last options loadNewsList was called with, so buttons inside
// the rendered list (publish/delete/etc.) can refresh with the same filters.
let lastListCtx = null;
const _loadNewsList = loadNewsList;
loadNewsList = function (ctx) { lastListCtx = ctx || lastListCtx; return _loadNewsList(lastListCtx); };

const CATEGORY_OPTIONS = [
  ['business', '💼 Business / کاروبار'],
  ['technology', '💻 Technology / ٹیکنالوجی'],
  ['entertainment', '🎬 Entertainment / تفریح'],
  ['sports', '⚽ Sports / کھیل'],
  ['health', '❤️ Health / صحت'],
  ['science', '🔬 Science'],
  ['international', '🌍 International / انٹرنیشنل'],
  ['unique', '✨ Unique & Amazing / منفرد'],
];

// ---------- Edit a story ----------
function openEditor(id) {
  const n = (window.__allNews || []).find(x => x.id === id);
  const slot = document.getElementById('edit-' + id);
  if (!n || !slot) return;
  if (slot.innerHTML) { slot.innerHTML = ''; return; } // toggle
  const u = n.language === 'urdu' ? 'urdu' : '';
  const dir = n.language === 'urdu' ? 'dir="rtl"' : '';
  const catOptions = CATEGORY_OPTIONS.map(([v, label]) => `<option value="${v}" ${n.category === v ? 'selected' : ''}>${label}</option>`).join('');
  slot.innerHTML = `
    <div class="edit-box">
      <label>Title</label><input class="e-title ${u}" ${dir} value="${escHtml(n.title)}">
      <label>Description (card)</label><textarea class="e-excerpt ${u}" ${dir}>${escHtml(n.excerpt)}</textarea>
      <label>Full Story</label><textarea class="e-body big ${u}" ${dir}>${escHtml(n.body || '')}</textarea>
      <label>Category</label><select class="e-cat">${catOptions}</select>
      <label>Image URL</label><input class="e-image" value="${escHtml(n.image || '')}" placeholder="https://...">
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:6px">
        <button type="button" class="e-save">💾 Save</button>
        ${n.status === 'draft' ? '<button type="button" class="e-save-pub">✅ Save &amp; Publish</button>' : ''}
        <button type="button" class="e-cancel secondary">Cancel</button>
      </div>
    </div>`;
  const save = async (publish) => {
    const upd = {
      title: slot.querySelector('.e-title').value.trim(),
      excerpt: slot.querySelector('.e-excerpt').value.trim(),
      body: slot.querySelector('.e-body').value.trim(),
      category: slot.querySelector('.e-cat').value,
    };
    const img = slot.querySelector('.e-image').value.trim();
    if (img) upd.image = img;
    if (publish) upd.status = 'published';
    if (!upd.title || !upd.excerpt) return showStatus('❌ Title and description are required', 'error');
    const res = await fetch('/api/news/' + id, { method: 'PUT', headers: headers(), body: JSON.stringify(upd) });
    if (res.ok) { showStatus(publish ? '✅ Saved and published!' : '💾 Saved.', 'success'); loadNewsList(lastListCtx); }
    else showStatus('❌ Could not save.', 'error');
  };
  slot.querySelector('.e-save').onclick = () => save(false);
  slot.querySelector('.e-save-pub')?.addEventListener('click', () => save(true));
  slot.querySelector('.e-cancel').onclick = () => { slot.innerHTML = ''; };
}

// ---------- AI agent: start in background, then poll its status ----------
let pollTimer = null;

function renderAgent(st, agentStatusEl) {
  if (!st || !agentStatusEl) return;
  const list = (arr) => arr && arr.length ? `<ul>${arr.map(x => `<li>${escHtml(x)}</li>`).join('')}</ul>` : '';
  if (st.running) {
    const secs = Math.round((Date.now() - new Date(st.startedAt)) / 1000);
    agentStatusEl.innerHTML = `<div class="agent-box run">⏳ Agent is working… (${secs}s)</div>`;
    return;
  }
  if (st.ok === null) { agentStatusEl.innerHTML = ''; return; }
  const when = st.finishedAt ? new Date(st.finishedAt).toLocaleString() : '';
  agentStatusEl.innerHTML = st.ok
    ? `<div class="agent-box ok">🤖 ${escHtml(st.message)} <small>(${escHtml(when)}, ${escHtml(st.trigger)})</small>${list(st.addedTitles)}
         ${st.notes.length ? '<div style="margin-top:6px">ℹ️ Notes:</div>' + list(st.notes) : ''}
         ${st.errors.length ? '<div style="margin-top:6px;color:#856404">⚠️ Some stories were skipped:</div>' + list(st.errors) : ''}</div>`
    : `<div class="agent-box err">❌ ${escHtml(st.message)} <small>(${escHtml(when)})</small>${list(st.errors)}</div>`;
}

async function pollAgent(runBtn, agentStatusEl) {
  clearTimeout(pollTimer);
  try {
    const res = await fetch('/api/news/fetch/status', { headers: headers() });
    if (!res.ok) return;
    const st = await res.json();
    renderAgent(st, agentStatusEl);
    if (st.running) {
      runBtn.disabled = true; runBtn.textContent = '⏳ Agent is working...';
      pollTimer = setTimeout(() => pollAgent(runBtn, agentStatusEl), 3000);
    } else {
      if (runBtn.disabled) loadNewsList(lastListCtx); // just finished → show new drafts
      runBtn.disabled = false; runBtn.textContent = '🤖 Run AI agent now';
    }
  } catch (e) {
    pollTimer = setTimeout(() => pollAgent(runBtn, agentStatusEl), 5000);
  }
}

function wireAgentRunner(runBtn, agentStatusEl) {
  if (!runBtn) return;
  runBtn.addEventListener('click', async () => {
    if (!keyInput.value) return showStatus('❌ Enter the admin key at the top first.', 'error');
    runBtn.disabled = true; runBtn.textContent = '⏳ Starting...';
    try {
      const agentOpts = {};
      const agentLang = document.getElementById('agentLang')?.value;
      const agentCat = document.getElementById('agentCategory')?.value;
      const agentDate = document.getElementById('agentDate')?.value;
      if (agentLang && agentLang !== 'both') agentOpts.language = agentLang;
      if (agentCat) agentOpts.category = agentCat;
      if (agentDate) agentOpts.date = agentDate;

      const res = await fetch('/api/news/fetch/run', { method: 'POST', headers: headers(), body: JSON.stringify(agentOpts) });
      let data = {};
      try { data = await res.json(); } catch { throw new Error('Server returned ' + res.status + ' (not JSON). Is the Node app running?'); }
      if (res.status === 401) throw new Error('Wrong admin key.');
      if (!res.ok && res.status !== 409) throw new Error(data.error || ('Failed (' + res.status + ')'));
      pollAgent(runBtn, agentStatusEl);
    } catch (err) {
      showStatus('❌ ' + err.message, 'error');
      runBtn.disabled = false; runBtn.textContent = '🤖 Run AI agent now';
    }
  });
}

// Reload once the admin key actually changes (not on every keystroke/focus
// click), so typing it in doesn't repeatedly collapse an open editor.
function wireKeyReload(onChange) {
  let lastKey = keyInput.value;
  const fire = () => { if (keyInput.value === lastKey) return; lastKey = keyInput.value; onChange(); };
  keyInput.addEventListener('change', fire);
  keyInput.addEventListener('input', () => { clearTimeout(window.__kt); window.__kt = setTimeout(fire, 600); });
}
