/* منظومة إدارة المركز — الواجهة (GitHub Pages) */
(function () {
'use strict';
const CFG = window.APP_CONFIG || {};
const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').replace(/[\u064B-\u0652\u0640]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/\s+/g, ' ').trim().toLowerCase();
const digits = (s) => String(s || '').replace(/[٠-٩]/g, (d) => d.charCodeAt(0) - 1632).replace(/[^0-9]/g, '');
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const monthLabel = (m) => { if (!m) return '—'; const [y, mm] = String(m).split('-'); return (MONTHS[+mm - 1] || mm) + ' ' + y; };
const rangeLabel = (a, b) => (a === b ? monthLabel(a) : monthLabel(a) + ' ← ' + monthLabel(b));
const money = (n) => (Math.round((+n || 0) * 1000) / 1000).toLocaleString('en-US', { maximumFractionDigits: 3 }) + ' د.ب';
const pad2 = (n) => String(n).padStart(2, '0');
const todayStr = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const addMonths = (m, k) => { let [y, mm] = m.split('-').map(Number); mm += k; while (mm > 12) { mm -= 12; y++; } while (mm < 1) { mm += 12; y--; } return y + '-' + pad2(mm); };
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const ES = { ACTIVE: 'نشط', MOVED: 'منقول', ENDED: 'منتهي', SUSPENDED: 'موقوف' };
const STATUS_LABEL = { paid: 'مسددة', unpaid: 'غير مسددة', partial: 'مسددة جزئياً', exempt: 'معفاة/مكفولة', none: 'بدون حلقة', archived: 'مؤرشفة' };
const FIELD_LABELS = { name: 'الاسم', nationalId: 'اسم المستخدم', phone: 'الهاتف', phone2: 'هاتف إضافي', familyKey: 'رمز الأسرة', feeStatus: 'حالة الرسوم', notes: 'ملاحظات', status: 'الحالة', teacher: 'المعلمة', program: 'البرنامج', days: 'الأيام', period: 'الفترة', time: 'الوقت', capacity: 'السعة', amount: 'المبلغ', fromMonth: 'من شهر', toMonth: 'إلى شهر', type: 'النوع', groupId: 'الحلقة', studentId: 'الطالبة', studentIds: 'الطالبات', enrollmentId: 'التسجيل', paidDate: 'تاريخ الدفع', method: 'طريقة الدفع', cancelReason: 'سبب الإلغاء', startDate: 'البداية', endDate: 'الانتهاء', value: 'القيمة', version: 'الإصدار', updatedAt: 'آخر تعديل', updatedBy: 'عدّلتها', createdAt: 'أُضيفت', createdBy: 'أضافتها', id: 'الرمز', oldId: 'الرقم القديم' };

const S = { token: null, user: null, data: null, stamp: null, month: null, idx: {}, route: 'dashboard', busy: 0, charts: [], modals: [], pendingRefresh: false,
  f: { q: '', teacher: '', program: '', days: '', period: '', pay: '', status: 'نشطة' }, gf: { teacher: '', period: '' }, auditOffset: 0 };

// ================= الاتصال بالخادم =================
async function api(action, payload, opts) {
  opts = opts || {};
  if (!CFG.API_URL) throw Object.assign(new Error('لم يتم ضبط رابط الخادم في config.js'), { code: 'NO_API' });
  if (!opts.silent) setSync('loading');
  let res;
  try {
    res = await fetch(CFG.API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify({ action, token: S.token, payload: payload || {} }) });
  } catch (e) {
    setSync('error');
    throw Object.assign(new Error('تعذّر الاتصال بالخادم. تحققي من الإنترنت.'), { code: 'NETWORK' });
  }
  let j;
  try { j = await res.json(); } catch (e) { setSync('error'); throw Object.assign(new Error('استجابة غير متوقعة من الخادم (تأكدي من نشر تطبيق الويب بصلاحية "أي شخص")'), { code: 'BAD_RESPONSE' }); }
  setSync('ok');
  if (!j.ok) {
    const err = Object.assign(new Error(j.error || 'خطأ'), { code: j.code, extra: j.extra });
    if (j.code === 'AUTH' && action !== 'login') { logout(true); }
    throw err;
  }
  if (j.stamp) S.stamp = j.stamp;
  return j.data;
}
function setSync(st) {
  const el = $('#sync'); if (!el) return;
  el.classList.toggle('loading', st === 'loading'); el.classList.toggle('error', st === 'error');
  $('#sync-text').textContent = st === 'loading' ? 'جاري المزامنة' : st === 'error' ? 'غير متصل' : 'متزامن';
}

async function loadData(silent) {
  const d = await api('bootstrap', {}, { silent });
  S.data = d; S.user = d.me;
  if (!S.month) S.month = d.thisMonth;
  buildIndex();
}
function buildIndex() {
  const d = S.data, idx = { st: {}, gr: {}, enrBySt: {}, enrByGr: {}, payBySt: {}, enr: {} };
  d.students.forEach((s) => { idx.st[s.id] = s; });
  d.groups.forEach((g) => { idx.gr[g.id] = g; });
  d.enrollments.forEach((e) => { idx.enr[e.id] = e; (idx.enrBySt[e.studentId] = idx.enrBySt[e.studentId] || []).push(e); (idx.enrByGr[e.groupId] = idx.enrByGr[e.groupId] || []).push(e); });
  d.payments.forEach((p) => String(p.studentIds).split(',').forEach((id) => { (idx.payBySt[id] = idx.payBySt[id] || []).push(p); }));
  S.idx = idx;
}
const activeEnr = (sid) => (S.idx.enrBySt[sid] || []).filter((e) => e.status === ES.ACTIVE);
const groupActiveEnr = (gid) => (S.idx.enrByGr[gid] || []).filter((e) => e.status === ES.ACTIVE && S.idx.st[e.studentId] && S.idx.st[e.studentId].status === 'نشطة');
// الحلقة = معلمة + أيام + فترة، وبرنامج كل طالبة محفوظ في تسجيلها (e.program)، وبرنامج الحلقة هو الافتراضي فقط
const enrProg = (e) => (e && e.program) || ((e && S.idx.gr[e.groupId]) || {}).program || '';
const groupProgs = (g) => { if (!g) return []; const c = {}; groupActiveEnr(g.id).forEach((e) => { const p = enrProg(e); c[p] = (c[p] || 0) + 1; }); const k = Object.keys(c).sort((a, b) => a.localeCompare(b, 'ar')); return k.length ? k.map((p) => ({ p, n: c[p] })) : [{ p: g.program, n: 0 }]; };
const groupTitle = (g) => groupProgs(g).map((x) => x.p).join(' + ');
const groupProgsText = (g) => groupProgs(g).map((x) => x.p + ' (' + x.n + ')').join(' · ');
const groupName = (g) => (g ? g.teacher + ' — ' + groupTitle(g) : '—');
const enrName = (e) => { const g = e && S.idx.gr[e.groupId]; return g ? g.teacher + ' — ' + enrProg(e) : '—'; };
const progList = () => `<datalist id="dl-progs">${(S.data.lists.programs || []).map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
const slotKey = (g) => [String(g.teacher).trim(), String(g.days).trim(), g.period].join('|');
function sameSlotClusters() { const c = {}; activeGroups().forEach((g) => { (c[slotKey(g)] = c[slotKey(g)] || []).push(g); }); return Object.values(c).filter((x) => x.length > 1); }
/** تغيير برنامج طالبة داخل حلقتها */
async function changeProgram(e, after) {
  const s = S.idx.st[e.studentId];
  const m = openModal({ title: 'برنامج ' + esc(s ? s.name : ''), body: `<label class="field"><span>البرنامج</span><input id="cp-p" list="dl-progs" value="${esc(enrProg(e))}"/></label>${progList()}<div class="notice info small">يتغير البرنامج فقط، وتبقى الطالبة في نفس الحلقة.</div>`,
    foot: '<button class="btn primary" id="cp-save">حفظ</button><button class="btn" data-close>إلغاء</button>',
    onMount: (el) => { $('#cp-save', el).onclick = async () => { const v = $('#cp-p', el).value.trim(); if (!v) return toast('اكتبي البرنامج', 'warn'); try { await mutate($('#cp-save', el), 'setEnrollmentProgram', { enrollmentId: e.id, version: e.version, program: v }, 'تم تغيير البرنامج ✅'); m.close(); after && after(); } catch (x) {} }; } });
}
const groupWhen = (g) => (g ? g.days + ' · ' + g.period : '');
const activeGroups = () => S.data.groups.filter((g) => g.status === 'فعالة');
const settings = () => S.data.settings || {};
const canDo = (action) => (S.data.constants.supervisorOnly || []).indexOf(action) < 0 || S.user.role === 'supervisor';

function payStatus(s, m) {
  if (s.status !== 'نشطة') return 'archived';
  const en = activeEnr(s.id);
  if (!en.length) return 'none';
  if (s.feeStatus && s.feeStatus !== 'عادية') return 'exempt';
  const pays = (S.idx.payBySt[s.id] || []).filter((p) => p.status === 'فعالة' && p.fromMonth <= m && p.toMonth >= m);
  if (settings().FEE_MODE === 'per_enrollment' && en.length > 1) {
    const cov = en.filter((e) => pays.some((p) => !p.enrollmentId || p.enrollmentId === e.id)).length;
    return cov === en.length ? 'paid' : cov > 0 ? 'partial' : 'unpaid';
  }
  return pays.length ? 'paid' : 'unpaid';
}
const badge = (st) => `<span class="badge b-${st}">${STATUS_LABEL[st]}</span>`;
const periodChip = (p) => `<span class="chip p-${esc(p)}">${esc(p)}</span>`;

function computeStats(m) {
  const d = S.data;
  const act = d.students.filter((s) => s.status === 'نشطة' && activeEnr(s.id).length);
  const st = { students: act.length, paid: 0, unpaid: 0, partial: 0, exempt: 0 };
  act.forEach((s) => { st[payStatus(s, m)]++; });
  const enr = d.enrollments.filter((e) => e.status === ES.ACTIVE && S.idx.st[e.studentId] && S.idx.st[e.studentId].status === 'نشطة');
  st.enrollments = enr.length;
  const ag = activeGroups();
  st.groups = ag.length;
  st.teachers = new Set(ag.map((g) => g.teacher)).size;
  const pays = d.payments.filter((p) => p.status === 'فعالة');
  st.totalCollected = pays.reduce((a, p) => a + (+p.amount || 0), 0);
  const term = { from: settings().TERM_FROM, to: settings().TERM_TO };
  st.termCollected = pays.filter((p) => !(p.toMonth < term.from || p.fromMonth > term.to)).reduce((a, p) => a + (+p.amount || 0), 0);
  st.monthCollected = pays.filter((p) => p.fromMonth === m && p.toMonth === m).reduce((a, p) => a + (+p.amount || 0), 0);
  const need = st.paid + st.unpaid + st.partial;
  st.rate = need ? Math.round((st.paid / need) * 100) : 0;
  return st;
}

// ================= واجهات مساعدة =================
function toast(msg, type, ms) {
  const el = document.createElement('div');
  el.className = 'toast ' + (type || '');
  el.textContent = msg;
  $('#toast-root').appendChild(el);
  setTimeout(() => el.remove(), ms || (type === 'err' ? 6000 : 3200));
}
function openModal(o) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-backdrop';
  wrap.innerHTML = `<div class="modal ${o.size || ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${o.title || ''}</h3><button class="icon-btn" data-close>✕</button></div>
    <div class="modal-body">${o.body || ''}</div>${o.foot ? `<div class="modal-foot">${o.foot}</div>` : ''}</div>`;
  $('#modal-root').appendChild(wrap);
  document.body.style.overflow = 'hidden';
  const m = { el: wrap, close: () => closeModal(m), onClose: o.onClose };
  S.modals.push(m);
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) m.close(); });
  if (o.onMount) o.onMount(wrap.querySelector('.modal'), m);
  return m;
}
function closeModal(m) {
  const i = S.modals.indexOf(m);
  if (i >= 0) S.modals.splice(i, 1);
  m.el.remove();
  if (m.onClose) m.onClose();
  if (!S.modals.length) {
    document.body.style.overflow = '';
    if (S.pendingRefresh) { S.pendingRefresh = false; render(); }
  }
}
function closeAllModals() { S.modals.slice().forEach((m) => { m.onClose = null; m.el.remove(); }); S.modals = []; document.body.style.overflow = ''; }

function confirmBox(msg, o) {
  o = o || {};
  return new Promise((resolve) => {
    let done = false;
    const m = openModal({
      title: o.title || 'تأكيد',
      body: `<p style="margin-top:0">${msg}</p>${o.input ? `<label class="field"><span>${esc(o.input)}</span><input id="cb-input" ${o.required ? 'required' : ''} value="${esc(o.value || '')}"/></label>` : ''}`,
      foot: `<button class="btn ${o.danger ? 'danger' : 'primary'}" id="cb-ok">${esc(o.ok || 'تأكيد')}</button><button class="btn" data-close>${esc(o.cancel || 'إلغاء')}</button>`,
      onClose: () => { if (!done) resolve(false); },
      onMount: (el) => {
        const inp = $('#cb-input', el); if (inp) setTimeout(() => inp.focus(), 50);
        $('#cb-ok', el).onclick = () => {
          const v = inp ? inp.value.trim() : true;
          if (o.required && !v) { inp.focus(); inp.style.borderColor = 'var(--danger)'; return; }
          done = true; m.close(); resolve(v);
        };
      },
    });
  });
}
async function withBusy(btn, fn) {
  if (btn) { btn.disabled = true; btn.classList.add('busy'); }
  try { return await fn(); } finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
}
/** تنفيذ عملية حفظ مع معالجة التعارض والأخطاء ثم تحديث البيانات */
async function mutate(btn, action, payload, okMsg) {
  try {
    const r = await withBusy(btn, () => api(action, payload));
    await loadData(true);
    if (okMsg) toast(okMsg, 'ok');
    render();
    return r;
  } catch (e) {
    if (e.code === 'CONFLICT' || e.code === 'NOT_FOUND') {
      await loadData(true).catch(() => {});
      render();
      await confirmBox(esc(e.message), { title: 'تعارض في التعديل', ok: 'حسناً', cancel: 'إغلاق' });
    } else if (e.code !== 'DUPLICATE' && e.code !== 'DUPLICATE_PAYMENT') {
      toast(e.message, 'err');
    }
    throw e;
  }
}
const optList = (arr, sel, ph) => (ph != null ? `<option value="">${esc(ph)}</option>` : '') + arr.map((v) => { const val = typeof v === 'object' ? v.v : v, lab = typeof v === 'object' ? v.l : v; return `<option value="${esc(val)}" ${String(val) === String(sel) ? 'selected' : ''}>${esc(lab)}</option>`; }).join('');
const monthOptions = (sel) => { const base = S.data.thisMonth; const arr = []; for (let k = -12; k <= 8; k++) { const m = addMonths(base, k); arr.push({ v: m, l: monthLabel(m) }); } if (sel && !arr.some((x) => x.v === sel)) arr.push({ v: sel, l: monthLabel(sel) }); arr.sort((a, b) => (a.v < b.v ? -1 : 1)); return optList(arr, sel); };
const groupOptions = (sel, excludeIds) => optList(activeGroups().filter((g) => !(excludeIds || []).includes(g.id)).sort((a, b) => (a.teacher + a.days).localeCompare(b.teacher + b.days, 'ar')).map((g) => ({ v: g.id, l: `${g.teacher} — ${g.days} (${g.period}) — ${groupTitle(g)}` })), sel, 'اختاري الحلقة');
const waLink = (phone, text) => { let p = digits(phone); if (!p) return ''; if (p.length === 8) p = '973' + p; return 'https://wa.me/' + p + (text ? '?text=' + encodeURIComponent(text) : ''); };
const initials = (n) => String(n || '?').trim().charAt(0);

// ================= التنقل =================
const NAV = [
  { id: 'dashboard', ico: '📊', label: 'الرئيسية', bottom: true },
  { id: 'students', ico: '👩‍🎓', label: 'الطالبات', bottom: true },
  { id: 'groups', ico: '📚', label: 'الحلقات', bottom: true },
  { id: 'payments', ico: '💰', label: 'المدفوعات', bottom: true },
  { id: 'schedule', ico: '🗓️', label: 'جدول المركز' },
  { id: 'reports', ico: '🖨️', label: 'التقارير' },
  { id: 'audit', ico: '📝', label: 'سجل التعديلات' },
  { id: 'settings', ico: '⚙️', label: 'الإعدادات' },
];
function renderNav() {
  $('#side-nav').innerHTML = NAV.map((n) => `<a href="#/${n.id}" class="${S.route === n.id ? 'active' : ''}"><span class="ico">${n.ico}</span>${n.label}</a>`).join('');
  const more = !NAV.find((n) => n.id === S.route && n.bottom);
  $('#bottom-nav').innerHTML = NAV.filter((n) => n.bottom).map((n) => `<a href="#/${n.id}" class="${S.route === n.id ? 'active' : ''}"><span class="ico">${n.ico}</span>${n.label}</a>`).join('')
    + `<a href="#" data-action="more" class="${more ? 'active' : ''}"><span class="ico">☰</span>المزيد</a>`;
}
function showMore() {
  openModal({
    title: 'المزيد',
    body: `<div class="more-grid">${NAV.filter((n) => !n.bottom).map((n) => `<a href="#/${n.id}" data-close><span>${n.ico}</span>${n.label}</a>`).join('')}
      <a href="#" data-action="logout" data-close><span>🚪</span>تسجيل الخروج</a></div>
      <p class="muted small" style="text-align:center;margin-top:16px">مسجلة الدخول باسم: <b>${esc(S.user.name)}</b></p>`,
  });
}
function onRoute() {
  const r = (location.hash.replace(/^#\/?/, '') || 'dashboard').split('?')[0];
  S.route = PAGES[r] ? r : 'dashboard';
  closeAllModals();
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (!S.data) return;
  if (S.modals.length) { S.pendingRefresh = true; }
  renderNav();
  const p = PAGES[S.route];
  $('#page-title').textContent = p.title;
  S.charts.forEach((c) => { try { c.destroy(); } catch (e) {} });
  S.charts = [];
  p.render($('#page'));
}

// ================= الرئيسية =================
function renderDashboard(el) {
  const m = S.month, st = computeStats(m);
  const groups = activeGroups();
  const teachers = {};
  groups.forEach((g) => {
    const t = teachers[g.teacher] = teachers[g.teacher] || { groups: 0, students: 0, unpaid: 0 };
    t.groups++;
    groupActiveEnr(g.id).forEach((e) => { t.students++; const s = S.idx.st[e.studentId]; if (s && payStatus(s, m) === 'unpaid') t.unpaid++; });
  });
  el.innerHTML = `
    <div class="toolbar"><div class="muted">مرحباً <b>${esc(S.user.name)}</b> 👋</div><span class="spacer"></span>
      <select class="input" id="dash-month" style="width:auto">${monthOptions(m)}</select></div>
    <div class="stats">
      <div class="stat click" data-go="students"><span class="ic">👩‍🎓</span><div class="lbl">عدد الطالبات</div><div class="val">${st.students}</div><div class="sub">${st.enrollments} تسجيل في الحلقات</div></div>
      <div class="stat blue click" data-go="groups"><span class="ic">📚</span><div class="lbl">الحلقات / المعلمات</div><div class="val">${st.groups} <small class="muted">/ ${st.teachers}</small></div><div class="sub">حلقة فعالة / معلمة</div></div>
      <div class="stat gold"><span class="ic">💰</span><div class="lbl">إجمالي المحصّل</div><div class="val num">${money(st.totalCollected)}</div><div class="sub">الفصل الحالي: ${money(st.termCollected)}</div></div>
      <div class="stat red click" data-go="payments"><span class="ic">⏳</span><div class="lbl">غير المسددات</div><div class="val">${st.unpaid + st.partial}</div><div class="sub">عن ${monthLabel(m)} · نسبة السداد ${st.rate}%</div></div>
    </div>
    <div class="charts">
      <div class="card"><h3>👩‍🏫 الطالبات حسب المعلمة</h3><div class="chart-box"><canvas id="ch-teachers"></canvas></div></div>
      <div class="card"><h3>📖 حسب البرنامج</h3><div class="chart-box"><canvas id="ch-programs"></canvas></div></div>
    </div>
    <div class="charts">
      <div class="card"><h3>📈 الإيرادات حسب الشهر</h3><div class="chart-box"><canvas id="ch-revenue"></canvas></div></div>
      <div class="card"><h3>✅ حالة السداد — ${monthLabel(m)}</h3><div class="chart-box"><canvas id="ch-paid"></canvas></div></div>
    </div>
    <div class="card"><div class="card-head"><h3>ملخص المعلمات</h3></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>المعلمة</th><th>الحلقات</th><th>الطالبات</th><th>غير المسددات (${monthLabel(m)})</th></tr></thead><tbody>
      ${Object.keys(teachers).sort((a, b) => teachers[b].students - teachers[a].students).map((t) => `<tr class="click" data-teacher="${esc(t)}"><td><b>${esc(t)}</b></td><td>${teachers[t].groups}</td><td>${teachers[t].students}</td><td>${teachers[t].unpaid ? `<span class="badge b-unpaid">${teachers[t].unpaid}</span>` : '<span class="badge b-paid">0</span>'}</td></tr>`).join('')}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h3>🕒 آخر التعديلات</h3><span class="spacer"></span><a href="#/audit" class="btn sm soft">عرض السجل كاملاً</a></div><div id="dash-audit" class="timeline"><div class="muted small">جاري التحميل...</div></div></div>`;
  $('#dash-month', el).onchange = (e) => { S.month = e.target.value; render(); };
  $$('[data-go]', el).forEach((c) => { c.onclick = () => { if (c.dataset.go === 'payments') S.payTab = 'unpaid'; location.hash = '#/' + c.dataset.go; }; });
  $$('[data-teacher]', el).forEach((r) => { r.onclick = () => { S.f = Object.assign({}, S.f, { teacher: r.dataset.teacher, program: '', days: '', period: '', pay: '', q: '' }); location.hash = '#/students'; }; });
  drawCharts(teachers, st, m);
  api('getAudit', { limit: 8 }, { silent: true }).then((r) => { const box = $('#dash-audit'); if (box) box.innerHTML = r.rows.length ? r.rows.map(auditItem).join('') : '<div class="muted small">لا توجد تعديلات بعد</div>'; }).catch(() => {});
}
function drawCharts(teachers, st, m) {
  if (!window.Chart) { setTimeout(() => { if (S.route === 'dashboard' && window.Chart) render(); }, 1200); return; }
  Chart.defaults.font.family = "'IBM Plex Sans Arabic', system-ui, sans-serif";
  Chart.defaults.color = '#5b6d68';
  const palette = ['#0f5c52', '#c9a54b', '#2b6cb0', '#c05621', '#6b46c1', '#2f855a', '#b83280', '#4a5568', '#d69e2e', '#319795', '#9b2c2c', '#553c9a'];
  const tNames = Object.keys(teachers).sort((a, b) => teachers[b].students - teachers[a].students);
  const mk = (id, cfg) => { const c = document.getElementById(id); if (c) S.charts.push(new Chart(c, cfg)); };
  mk('ch-teachers', { type: 'bar', data: { labels: tNames, datasets: [{ label: 'الطالبات', data: tNames.map((t) => teachers[t].students), backgroundColor: '#14786bcc', borderRadius: 8 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  const prog = {};
  S.data.enrollments.forEach((e) => { if (e.status !== ES.ACTIVE) return; const g = S.idx.gr[e.groupId]; const s = S.idx.st[e.studentId]; if (g && s && s.status === 'نشطة') { const p = enrProg(e); prog[p] = (prog[p] || 0) + 1; } });
  mk('ch-programs', { type: 'doughnut', data: { labels: Object.keys(prog), datasets: [{ data: Object.values(prog), backgroundColor: palette, borderWidth: 2 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '62%' } });
  const rev = {};
  S.data.payments.forEach((p) => { if (p.status === 'فعالة') rev[p.fromMonth] = (rev[p.fromMonth] || 0) + (+p.amount || 0); });
  const months = Object.keys(rev).sort();
  mk('ch-revenue', { type: 'bar', data: { labels: months.map(monthLabel), datasets: [{ label: 'د.ب', data: months.map((k) => rev[k]), backgroundColor: '#c9a54bcc', borderRadius: 8 }] }, options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { footer: () => 'حسب شهر بداية الدفعة' } } }, scales: { y: { beginAtZero: true } } } });
  mk('ch-paid', { type: 'doughnut', data: { labels: ['مسددة', 'غير مسددة', 'جزئياً', 'معفاة/مكفولة'], datasets: [{ data: [st.paid, st.unpaid, st.partial, st.exempt], backgroundColor: ['#15803d', '#c62828', '#d97706', '#2b6cb0'], borderWidth: 2 }] }, options: { maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '62%' } });
}

// ================= الطالبات =================
function filteredStudents() {
  const f = S.f, m = S.month, q = norm(f.q), qd = digits(f.q);
  return S.data.students.filter((s) => {
    if (f.status && s.status !== f.status) return false;
    if (q) {
      const hit = norm(s.name).includes(q) || (s.nationalId && norm(s.nationalId).includes(q)) || (qd && ((s.phone || '').includes(qd) || (s.nationalId || '').includes(qd) || String(s.id) === qd || (s.phone2 || '').includes(qd)));
      if (!hit) return false;
    }
    if (f.teacher || f.program || f.days || f.period) {
      const en = f.status === 'مؤرشفة' ? (S.idx.enrBySt[s.id] || []).filter((e) => e.status === ES.SUSPENDED) : activeEnr(s.id);
      const ok = en.some((e) => { const g = S.idx.gr[e.groupId]; return g && (!f.teacher || g.teacher === f.teacher) && (!f.program || enrProg(e) === f.program) && (!f.days || g.days === f.days) && (!f.period || g.period === f.period); });
      if (!ok) return false;
    }
    if (f.pay) { const ps = payStatus(s, m); if (f.pay === 'unpaid' ? !(ps === 'unpaid' || ps === 'partial') : ps !== f.pay) return false; }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
}
function studentRow(s) {
  const en = s.status === 'نشطة' ? activeEnr(s.id) : (S.idx.enrBySt[s.id] || []).filter((e) => e.status === ES.SUSPENDED);
  const tags = en.map((e) => { const g = S.idx.gr[e.groupId]; return g ? `<span class="chip">👩‍🏫 ${esc(g.teacher)} · ${esc(enrProg(e))}</span>${periodChip(g.period)}` : ''; }).join('') || '<span class="muted small">غير مسجلة في حلقة</span>';
  return `<div class="row-card ${s.status !== 'نشطة' ? 'archived' : ''}" data-sid="${esc(s.id)}">
    <div class="rc-main"><div class="avatar">${esc(initials(s.name))}</div><div style="min-width:0"><div class="rc-title">${esc(s.name)}</div><div class="rc-sub"><span class="num">#${esc(s.id)}</span>${s.phone ? ' · <span class="num">' + esc(s.phone) + '</span>' : ''}</div></div></div>
    <div class="rc-tags">${tags}</div>
    <div>${badge(payStatus(s, S.month))}</div></div>`;
}
function renderStudents(el) {
  const L = S.data.lists, f = S.f;
  el.innerHTML = `
    <div class="toolbar">
      <div class="search"><input class="input" id="st-q" placeholder="ابحثي بالاسم أو الهاتف أو اسم المستخدم..." value="${esc(f.q)}" autocomplete="off"/></div>
      <button class="btn primary" id="st-add">＋ إضافة طالبة</button>
      <button class="btn" id="st-export" title="تصدير Excel">⬇️ تصدير</button>
    </div>
    <div class="filters">
      <select data-f="teacher" class="${f.teacher ? 'on' : ''}">${optList(L.teachers, f.teacher, 'كل المعلمات')}</select>
      <select data-f="program" class="${f.program ? 'on' : ''}">${optList(L.programs, f.program, 'كل البرامج')}</select>
      <select data-f="days" class="${f.days ? 'on' : ''}">${optList(L.days, f.days, 'كل الأيام')}</select>
      <select data-f="period" class="${f.period ? 'on' : ''}">${optList(S.data.constants.periods, f.period, 'كل الفترات')}</select>
      <select data-f="pay" class="${f.pay ? 'on' : ''}">${optList([{ v: 'paid', l: 'مسددة' }, { v: 'unpaid', l: 'غير مسددة' }, { v: 'exempt', l: 'معفاة/مكفولة' }, { v: 'none', l: 'بدون حلقة' }], f.pay, 'كل حالات السداد')}</select>
      <select data-f="status" class="${f.status !== 'نشطة' ? 'on' : ''}">${optList([{ v: 'نشطة', l: 'النشطات' }, { v: 'مؤرشفة', l: 'الأرشيف (المحذوفات)' }, { v: '', l: 'الكل' }], f.status)}</select>
      <select id="st-month">${monthOptions(S.month)}</select>
    </div>
    <div class="result-info" id="st-info"></div>
    <div class="list" id="st-list"></div>`;
  const draw = () => {
    const list = filteredStudents();
    const active = Object.keys(f).filter((k) => k !== 'q' && k !== 'status' && f[k]).length + (f.status !== 'نشطة' ? 1 : 0);
    $('#st-info').innerHTML = `<span>${list.length} طالبة</span>${active ? '<button class="btn sm ghost" id="st-clear">✖ مسح الفلاتر</button>' : ''}<span class="spacer"></span><span>حالة السداد عن: <b>${monthLabel(S.month)}</b></span>`;
    const box = $('#st-list');
    box.innerHTML = list.length ? list.slice(0, 400).map(studentRow).join('') : '<div class="empty"><div class="big">🔎</div>لا توجد نتائج</div>';
    const clr = $('#st-clear'); if (clr) clr.onclick = () => { S.f = { q: f.q, teacher: '', program: '', days: '', period: '', pay: '', status: 'نشطة' }; render(); };
  };
  draw();
  $('#st-q').oninput = debounce((e) => { f.q = e.target.value; draw(); }, 120);
  $$('[data-f]', el).forEach((s) => { s.onchange = () => { f[s.dataset.f] = s.value; render(); }; });
  $('#st-month').onchange = (e) => { S.month = e.target.value; render(); };
  $('#st-list').onclick = (e) => { const r = e.target.closest('[data-sid]'); if (r) openStudent(r.dataset.sid); };
  $('#st-add').onclick = () => openStudentForm();
  $('#st-export').onclick = () => exportStudentsCSV(filteredStudents());
}

// ---------- نافذة الطالبة ----------
function openStudent(id, tab) {
  const s = S.idx.st[id];
  if (!s) { toast('الطالبة غير موجودة (ربما حُذفت)', 'err'); return; }
  tab = tab || 'info';
  const all = (S.idx.enrBySt[id] || []).slice().sort((a, b) => (a.status === ES.ACTIVE ? -1 : 1) - (b.status === ES.ACTIVE ? -1 : 1));
  const pays = (S.idx.payBySt[id] || []).slice().sort((a, b) => (b.fromMonth + b.createdAt).localeCompare(a.fromMonth + a.createdAt));
  const ps = payStatus(s, S.month);
  const family = s.familyKey ? S.data.students.filter((x) => x.id !== s.id && x.familyKey === s.familyKey && x.status === 'نشطة') : [];
  const archived = s.status !== 'نشطة';
  const body = `
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:14px">
      <div class="avatar" style="width:52px;height:52px;font-size:20px">${esc(initials(s.name))}</div>
      <div style="flex:1;min-width:0"><div style="font-weight:700;font-size:17px">${esc(s.name)}</div>
      <div class="muted small"><span class="num">#${esc(s.id)}</span> · ${badge(ps)} ${s.feeStatus !== 'عادية' ? `<span class="badge b-exempt">${esc(s.feeStatus)}</span>` : ''} ${archived ? '<span class="badge b-archived">في الأرشيف</span>' : ''}</div></div>
      ${s.phone ? `<a class="icon-btn" href="tel:${esc(s.phone)}" title="اتصال">📞</a><a class="icon-btn" target="_blank" rel="noopener" href="${esc(waLink(s.phone))}" title="واتساب">💬</a>` : ''}
    </div>
    <div class="tabs">${[['info', 'البيانات'], ['groups', 'الحلقات (' + all.filter((e) => e.status === ES.ACTIVE).length + ')'], ['pay', 'المدفوعات (' + pays.filter((p) => p.status === 'فعالة').length + ')'], ['log', 'السجل']].map((t) => `<button data-tab="${t[0]}" class="${tab === t[0] ? 'active' : ''}">${t[1]}</button>`).join('')}</div>
    <div data-pane="info" ${tab !== 'info' ? 'hidden' : ''}>
      <div class="kv">
        <div><small>الهاتف</small><b class="num">${esc(s.phone || '—')}</b></div>
        <div><small>هاتف إضافي</small><b class="num">${esc(s.phone2 || '—')}</b></div>
        <div><small>اسم المستخدم</small><b class="num">${esc(s.nationalId || '—')}</b></div>
        <div><small>حالة الرسوم</small><b>${esc(s.feeStatus || 'عادية')}</b></div>
        <div style="grid-column:1/-1"><small>ملاحظات</small><b>${esc(s.notes || '—')}</b></div>
        <div><small>أُضيفت</small><b class="small">${esc(s.createdBy)} · ${esc(s.createdAt)}</b></div>
        <div><small>آخر تعديل</small><b class="small">${esc(s.updatedBy)} · ${esc(s.updatedAt)}</b></div>
      </div>
      ${family.length ? `<div class="section-title">👨‍👩‍👧 من نفس الأسرة</div><div class="rc-tags">${family.map((x) => `<button class="chip" data-open="${esc(x.id)}" style="border:none;cursor:pointer">${esc(x.name)}</button>`).join('')}</div>` : ''}
    </div>
    <div data-pane="groups" ${tab !== 'groups' ? 'hidden' : ''}>
      ${all.length ? all.map((e) => { const g = S.idx.gr[e.groupId]; const on = e.status === ES.ACTIVE; return `<div class="item ${on ? '' : 'off'}"><div class="grow"><b>${esc(enrName(e))}</b><div class="small muted">${esc(groupWhen(g))} · ${esc(g ? g.time : '')}</div><div class="small muted">${esc(e.status)}${e.startDate ? ' · من ' + esc(e.startDate) : ''}${e.endDate ? ' إلى ' + esc(e.endDate) : ''}${e.notes ? ' · ' + esc(e.notes) : ''}</div></div>
        ${on && !archived ? `<button class="btn sm" data-prog="${esc(e.id)}">📖 البرنامج</button><button class="btn sm soft" data-transfer="${esc(e.id)}">↔️ نقل</button><button class="btn sm danger-ghost" data-end="${esc(e.id)}">إنهاء</button>` : ''}${!on && !archived && e.status !== ES.SUSPENDED ? `<button class="btn sm" data-react="${esc(e.id)}">إعادة تفعيل</button>` : ''}</div>`; }).join('') : '<div class="empty">غير مسجلة في أي حلقة</div>'}
      ${!archived ? '<button class="btn soft block" id="sd-enroll">＋ تسجيل في حلقة أخرى</button>' : ''}
    </div>
    <div data-pane="pay" ${tab !== 'pay' ? 'hidden' : ''}>
      ${pays.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>الفترة</th><th>المبلغ</th><th>النوع</th><th>سجّلتها</th><th></th></tr></thead><tbody>${pays.map((p) => `<tr class="${p.status !== 'فعالة' ? 'cancelled' : ''}"><td>${esc(rangeLabel(p.fromMonth, p.toMonth))}${String(p.studentIds).includes(',') ? ' <span class="chip">عائلي</span>' : ''}${p.enrollmentId && S.idx.enr[p.enrollmentId] ? '<div class="small muted">' + esc(enrName(S.idx.enr[p.enrollmentId])) + '</div>' : ''}</td><td class="num"><b>${money(p.amount)}</b></td><td>${esc(p.type)}${p.method ? '<div class="small muted">' + esc(p.method) + '</div>' : ''}</td><td class="small">${esc(p.createdBy)}<div class="muted">${esc(p.paidDate || p.createdAt.slice(0, 10))}</div></td><td>${p.status === 'فعالة' ? (canDo('cancelPayment') ? `<button class="btn sm danger-ghost" data-cancelpay="${esc(p.id)}">إلغاء</button>` : '') : `<span class="small muted" title="${esc(p.cancelReason)}">ملغاة</span>`}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد دفعات مسجلة</div>'}
      ${!archived ? '<button class="btn primary block" id="sd-pay" style="margin-top:12px">＋ تسجيل دفعة</button>' : ''}
    </div>
    <div data-pane="log" ${tab !== 'log' ? 'hidden' : ''}><div id="sd-log" class="timeline"><div class="loading-screen" style="padding:20px"><div class="spinner"></div></div></div></div>`;
  const foot = archived
    ? `<button class="btn primary" id="sd-restore">♻️ استرجاع من الأرشيف</button>${canDo('deleteStudent') ? '<button class="btn danger-ghost" id="sd-purge">حذف نهائي</button>' : ''}`
    : `<button class="btn primary" id="sd-edit">✏️ تعديل البيانات</button><button class="btn danger-ghost" id="sd-archive">🗑️ حذف</button>`;
  const m = openModal({ title: 'ملف الطالبة', size: 'lg', body, foot, onMount: (el) => {
    const loadLog = () => api('getAudit', { studentId: id, limit: 100 }, { silent: true }).then((r) => { const b = $('#sd-log', el); if (b) b.innerHTML = r.rows.length ? r.rows.map(auditItem).join('') : '<div class="empty">لا يوجد سجل</div>'; }).catch((e) => { const b = $('#sd-log', el); if (b) b.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; });
    let logLoaded = false;
    $$('[data-tab]', el).forEach((b) => { b.onclick = () => { $$('[data-tab]', el).forEach((x) => x.classList.toggle('active', x === b)); $$('[data-pane]', el).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; }); if (b.dataset.tab === 'log' && !logLoaded) { logLoaded = true; loadLog(); } }; });
    if (tab === 'log') { logLoaded = true; loadLog(); }
    const reopen = (t) => { m.close(); openStudent(id, t); };
    $$('[data-open]', el).forEach((b) => { b.onclick = () => { m.close(); openStudent(b.dataset.open); }; });
    const on = (sel, fn) => { const b = $(sel, el); if (b) b.onclick = fn; };
    on('#sd-edit', () => { m.close(); openStudentForm(s); });
    on('#sd-archive', async () => {
      const reason = await confirmBox(`سيتم نقل <b>${esc(s.name)}</b> إلى الأرشيف وإيقاف تسجيلاتها. يمكن استرجاعها لاحقاً، وسيُسجَّل الحذف باسمك.`, { title: 'حذف طالبة', danger: true, ok: 'حذف', input: 'سبب الحذف', required: true });
      if (!reason) return;
      try { await mutate(null, 'archiveStudent', { id, version: s.version, reason }, 'تم نقل الطالبة إلى الأرشيف'); m.close(); } catch (e) {}
    });
    on('#sd-restore', async () => { try { await mutate($('#sd-restore', el), 'restoreStudent', { id }, 'تم استرجاع الطالبة'); reopen('groups'); } catch (e) {} });
    on('#sd-purge', async () => {
      const ok = await confirmBox(`حذف نهائي لـ <b>${esc(s.name)}</b>؟ لا يمكن التراجع (تبقى الدفعات والسجل محفوظة).`, { title: 'حذف نهائي', danger: true, ok: 'حذف نهائي' });
      if (!ok) return;
      try { await mutate(null, 'deleteStudent', { id }, 'تم الحذف النهائي'); m.close(); } catch (e) {}
    });
    on('#sd-enroll', () => openEnrollForm(s, () => reopen('groups')));
    on('#sd-pay', () => openPaymentForm([s.id], () => reopen('pay')));
    $$('[data-transfer]', el).forEach((b) => { b.onclick = () => openTransferForm(S.idx.enr[b.dataset.transfer], () => reopen('groups')); });
    $$('[data-prog]', el).forEach((b) => { b.onclick = () => changeProgram(S.idx.enr[b.dataset.prog], () => reopen('groups')); });
    $$('[data-end]', el).forEach((b) => { b.onclick = async () => {
      const e = S.idx.enr[b.dataset.end]; const g = S.idx.gr[e.groupId];
      const reason = await confirmBox(`إنهاء تسجيل <b>${esc(s.name)}</b> في حلقة <b>${esc(enrName(e))}</b>؟`, { title: 'إنهاء تسجيل', danger: true, ok: 'إنهاء', input: 'السبب (اختياري)' });
      if (reason === false) return;
      try { await mutate(null, 'endEnrollment', { enrollmentId: e.id, version: e.version, reason }, 'تم إنهاء التسجيل'); reopen('groups'); } catch (x) {}
    }; });
    $$('[data-react]', el).forEach((b) => { b.onclick = async () => { try { await mutate(b, 'reactivateEnrollment', { enrollmentId: b.dataset.react }, 'تم إعادة التفعيل'); reopen('groups'); } catch (x) {} }; });
    $$('[data-cancelpay]', el).forEach((b) => { b.onclick = async () => {
      const p = S.data.payments.find((x) => x.id === b.dataset.cancelpay);
      const reason = await confirmBox(`إلغاء دفعة بمبلغ <b>${money(p.amount)}</b> عن ${esc(rangeLabel(p.fromMonth, p.toMonth))}؟`, { title: 'إلغاء دفعة', danger: true, ok: 'إلغاء الدفعة', cancel: 'تراجع', input: 'سبب الإلغاء', required: true });
      if (!reason) return;
      try { await mutate(null, 'cancelPayment', { id: p.id, version: p.version, reason }, 'تم إلغاء الدفعة'); reopen('pay'); } catch (x) {}
    }; });
  } });
}

// ---------- إضافة / تعديل طالبة ----------
function openStudentForm(s) {
  const isNew = !s; s = s || { feeStatus: 'عادية' };
  const body = `<form id="sf">
    <label class="field"><span>اسم الطالبة *</span><input name="name" required value="${esc(s.name)}" autocomplete="off"/></label>
    <div class="grid2">
      <label class="field"><span>الهاتف</span><input name="phone" inputmode="tel" value="${esc(s.phone)}"/></label>
      <label class="field"><span>هاتف إضافي</span><input name="phone2" inputmode="tel" value="${esc(s.phone2)}"/></label>
      <label class="field"><span>اسم المستخدم</span><input name="nationalId" autocomplete="off" value="${esc(s.nationalId)}"/></label>
      <label class="field"><span>حالة الرسوم</span><select name="feeStatus">${optList(S.data.constants.feeStatuses, s.feeStatus)}</select></label>
    </div>
    <label class="field"><span>رمز الأسرة <small class="muted">(لربط الأخوات والأم — افتراضياً رقم الهاتف)</small></span><input name="familyKey" value="${esc(s.familyKey)}"/></label>
    <label class="field"><span>ملاحظات</span><textarea name="notes">${esc(s.notes)}</textarea></label>
    ${isNew ? `<div class="section-title" style="margin-top:4px">التسجيل في الحلقات</div><div id="sf-groups"></div>${progList()}<button type="button" class="btn sm soft" id="sf-addg">＋ حلقة أخرى</button>` : ''}
    <div id="sf-err" class="form-error" hidden style="margin-top:12px"></div></form>`;
  const m = openModal({ title: isNew ? 'إضافة طالبة جديدة' : 'تعديل بيانات: ' + esc(s.name), body,
    foot: `<button class="btn primary" id="sf-save">${isNew ? 'إضافة' : 'حفظ التعديلات'}</button><button class="btn" data-close>إلغاء</button>`,
    onMount: (el) => {
      const addG = () => { const d = document.createElement('div'); d.style.cssText = 'display:flex;gap:6px;margin-bottom:8px'; d.innerHTML = `<select class="input" data-g style="flex:2">${groupOptions('')}</select><input class="input" data-gp list="dl-progs" placeholder="البرنامج" style="flex:1"/><button type="button" class="icon-btn" title="إزالة">✕</button>`; d.querySelector('button').onclick = () => d.remove(); const gs = d.querySelector('[data-g]'), gp = d.querySelector('[data-gp]'); gs.onchange = () => { const g = S.idx.gr[gs.value]; if (g && (!gp.value || gp.dataset.auto === '1')) { gp.value = g.program; gp.dataset.auto = '1'; } }; gp.oninput = () => { gp.dataset.auto = ''; }; $('#sf-groups', el).appendChild(d); };
      if (isNew) { addG(); $('#sf-addg', el).onclick = addG; }
      const save = async (force) => {
        const fd = new FormData($('#sf', el)); const st = Object.fromEntries(fd.entries());
        if (!st.name.trim()) { $('#sf-err', el).hidden = false; $('#sf-err', el).textContent = 'اسم الطالبة مطلوب'; return; }
        if (!isNew) { st.id = s.id; st.version = s.version; }
        const groupIds = isNew ? $$('[data-g]', el).map((x) => x.value).filter(Boolean) : [];
        const groupPrograms = {};
        if (isNew) $$('[data-g]', el).forEach((x) => { const gp = x.parentNode.querySelector('[data-gp]'); if (x.value) groupPrograms[x.value] = (gp && gp.value.trim()) || ((S.idx.gr[x.value] || {}).program || ''); });
        try {
          const r = await mutate($('#sf-save', el), 'saveStudent', { student: st, groupIds, groupPrograms, force }, isNew ? 'تمت إضافة الطالبة ✅' : (null));
          m.close();
          if (!isNew) toast(r.unchanged ? 'لم يتغير شيء' : 'تم حفظ التعديلات ✅', r.unchanged ? '' : 'ok');
          openStudent(r.student.id);
        } catch (e) {
          if (e.code === 'DUPLICATE') {
            const list = (e.extra && e.extra.matches || []).map((x) => `<li><a href="#" data-dup="${esc(x.id)}">${esc(x.name)}</a> <span class="muted small num">#${esc(x.id)} ${esc(x.phone || '')}</span> ${x.status !== 'نشطة' ? '<span class="badge b-archived">مؤرشفة</span>' : ''}</li>`).join('');
            const dm = openModal({ title: '⚠️ يوجد اسم مشابه', body: `<p>${esc(e.message)}</p><ul>${list}</ul><p class="muted small">إذا كانت نفس الطالبة وتريدين تسجيلها في برنامج آخر، افتحي ملفها واضغطي «تسجيل في حلقة أخرى».</p>`,
              foot: '<button class="btn" id="dup-force">إضافة كطالبة جديدة</button><button class="btn primary" data-close>رجوع</button>',
              onMount: (d2) => { $('#dup-force', d2).onclick = () => { dm.close(); save(true); }; $$('[data-dup]', d2).forEach((a) => { a.onclick = (ev) => { ev.preventDefault(); dm.close(); m.close(); openStudent(a.dataset.dup, 'groups'); }; }); } });
          } else if (e.code !== 'CONFLICT') { $('#sf-err', el).hidden = false; $('#sf-err', el).textContent = e.message; }
          else m.close();
        }
      };
      $('#sf-save', el).onclick = () => save(false);
      $('#sf', el).onsubmit = (ev) => { ev.preventDefault(); save(false); };
    } });
}

function openEnrollForm(s, after) {
  const current = activeEnr(s.id).map((e) => e.groupId);
  const m = openModal({ title: 'تسجيل ' + esc(s.name) + ' في حلقة', body: `<label class="field"><span>الحلقة</span><select id="ef-g">${groupOptions('', current)}</select></label><label class="field"><span>البرنامج</span><input id="ef-p" list="dl-progs" placeholder="يُقترح حسب الحلقة"/></label>${progList()}<label class="field"><span>تاريخ البداية</span><input type="date" id="ef-d" value="${todayStr()}"/></label>`,
    foot: '<button class="btn primary" id="ef-save">تسجيل</button><button class="btn" data-close>إلغاء</button>',
    onMount: (el) => { const ep = $('#ef-p', el); let auto = true; ep.oninput = () => { auto = false; }; $('#ef-g', el).onchange = () => { const g = S.idx.gr[$('#ef-g', el).value]; if (g && (auto || !ep.value)) { ep.value = g.program; auto = true; } }; $('#ef-save', el).onclick = async () => { const gid = $('#ef-g', el).value; if (!gid) return toast('اختاري الحلقة', 'warn'); if (!ep.value.trim()) return toast('اكتبي البرنامج', 'warn'); try { await mutate($('#ef-save', el), 'addEnrollment', { studentId: s.id, groupId: gid, program: ep.value.trim(), startDate: $('#ef-d', el).value }, 'تم التسجيل ✅'); m.close(); after && after(); } catch (e) {} }; } });
}
function openTransferForm(e, after) {
  const s = S.idx.st[e.studentId], g = S.idx.gr[e.groupId];
  const m = openModal({ title: 'نقل ' + esc(s.name), body: `<div class="notice info">من: <b>${esc(enrName(e))}</b> — ${esc(groupWhen(g))}</div>
      <label class="field"><span>إلى الحلقة</span><select id="tf-g">${groupOptions('', [e.groupId])}</select></label>
      <label class="field"><span>البرنامج</span><input id="tf-p" list="dl-progs" value="${esc(enrProg(e))}"/></label>${progList()}
      <div class="grid2"><label class="field"><span>تاريخ النقل</span><input type="date" id="tf-d" value="${todayStr()}"/></label><label class="field"><span>السبب (اختياري)</span><input id="tf-r"/></label></div>`,
    foot: '<button class="btn primary" id="tf-save">نقل</button><button class="btn" data-close>إلغاء</button>',
    onMount: (el) => { $('#tf-save', el).onclick = async () => { const gid = $('#tf-g', el).value; if (!gid) return toast('اختاري الحلقة الجديدة', 'warn'); try { await mutate($('#tf-save', el), 'transferEnrollment', { enrollmentId: e.id, version: e.version, toGroupId: gid, program: $('#tf-p', el).value.trim(), date: $('#tf-d', el).value, reason: $('#tf-r', el).value }, 'تم النقل ✅'); m.close(); after && after(); } catch (x) {} }; } });
}

// ================= الحلقات =================
function renderGroups(el) {
  const gf = S.gf, L = S.data.lists;
  const showArch = gf.archived;
  const groups = S.data.groups.filter((g) => (showArch ? g.status !== 'فعالة' : g.status === 'فعالة') && (!gf.teacher || g.teacher === gf.teacher) && (!gf.period || g.period === gf.period))
    .sort((a, b) => a.teacher.localeCompare(b.teacher, 'ar') || a.days.localeCompare(b.days, 'ar'));
  const byTeacher = {};
  groups.forEach((g) => { (byTeacher[g.teacher] = byTeacher[g.teacher] || []).push(g); });
  el.innerHTML = `<div class="toolbar"><div class="filters" style="margin:0;flex:1">
      <select data-gf="teacher" class="${gf.teacher ? 'on' : ''}">${optList(L.teachers, gf.teacher, 'كل المعلمات')}</select>
      <select data-gf="period" class="${gf.period ? 'on' : ''}">${optList(S.data.constants.periods, gf.period, 'كل الفترات')}</select>
      <select data-gf="archived" class="${showArch ? 'on' : ''}">${optList([{ v: '', l: 'الحلقات الفعالة' }, { v: '1', l: 'الحلقات المؤرشفة' }], showArch ? '1' : '')}</select></div>
      <button class="btn primary" id="g-add">＋ حلقة جديدة</button></div>
    ${!showArch && sameSlotClusters().length ? `<div class="notice warn">⚠️ توجد حلقات لنفس المعلمة في نفس الوقت: ${sameSlotClusters().map((c) => esc(c[0].teacher) + ' (' + c.map((g) => esc(g.id)).join(' + ') + ')').join('، ')}. يمكن دمج كل منها في حلقة واحدة مع بقاء برنامج كل طالبة أمام اسمها.${canDo('mergeGroups') ? ' <button class="btn sm primary" id="g-merge" style="margin-inline-start:8px">🔗 دمج الحلقات</button>' : ' (الدمج متاح للمشرفة)'}</div>` : ''}
    ${Object.keys(byTeacher).length ? Object.keys(byTeacher).map((t) => `<div class="section-title">👩‍🏫 ${esc(t)} <span class="muted">(${byTeacher[t].reduce((a, g) => a + groupActiveEnr(g.id).length, 0)} طالبة)</span></div>
      <div class="groups-grid">${byTeacher[t].map((g) => { const n = groupActiveEnr(g.id).length, cap = +g.capacity || 0; return `<div class="group-card" data-gid="${esc(g.id)}">
        <div class="gc-top"><div><div class="gc-teacher">${esc(groupTitle(g))}</div><div class="small muted">${esc(g.days)}</div>${groupProgs(g).length > 1 ? `<div class="small muted">${esc(groupProgsText(g))}</div>` : ''}</div><div class="gc-count">${n}<small>${cap ? 'من ' + cap : 'طالبة'}</small></div></div>
        <div class="rc-tags">${periodChip(g.period)}<span class="chip">🕒 ${esc(g.time || '—')}</span><span class="chip num">${esc(g.id)}</span></div>
        ${cap ? `<div class="progress"><i style="width:${Math.min(100, Math.round((n / cap) * 100))}%"></i></div>` : ''}</div>`; }).join('')}</div>`).join('') : '<div class="empty"><div class="big">📚</div>لا توجد حلقات</div>'}`;
  $$('[data-gf]', el).forEach((s) => { s.onchange = () => { gf[s.dataset.gf] = s.value; render(); }; });
  $('#g-add', el).onclick = () => openGroupForm();
  if ($('#g-merge', el)) $('#g-merge', el).onclick = async () => {
    const list = sameSlotClusters().map((c) => `<li><b>${esc(c[0].teacher)}</b> — ${esc(c[0].days)} ${esc(c[0].period)}: ${c.map((g) => esc(g.id) + ' ' + esc(groupTitle(g))).join(' + ')}</li>`).join('');
    const ok = await confirmBox(`<ul style="margin:0 0 10px;padding-inline-start:18px">${list}</ul>كل مجموعة ستصبح حلقة واحدة (بأقدم رمز). برنامج كل طالبة يبقى محفوظاً أمام اسمها، والدفعات لا تتأثر، والحلقات المدموجة تُؤرشف.`, { title: '🔗 دمج الحلقات التي في نفس الوقت', ok: 'دمج' });
    if (ok) mutate(null, 'mergeGroups', {}, 'تم دمج الحلقات ✅').catch(() => {});
  };
  $$('[data-gid]', el).forEach((c) => { c.onclick = () => openGroup(c.dataset.gid); });
}
function openGroup(id) {
  const g = S.idx.gr[id]; if (!g) return;
  const list = groupActiveEnr(id).map((e) => ({ e, s: S.idx.st[e.studentId] })).sort((a, b) => enrProg(a.e).localeCompare(enrProg(b.e), 'ar') || a.s.name.localeCompare(b.s.name, 'ar'));
  const body = `<div class="kv" style="margin-bottom:14px"><div><small>المعلمة</small><b>${esc(g.teacher)}</b></div><div><small>البرامج</small><b>${esc(groupProgsText(g))}</b></div><div><small>الأيام والفترة</small><b>${esc(g.days)} · ${esc(g.period)}</b></div><div><small>الوقت</small><b>${esc(g.time || '—')}</b></div></div>
    <div class="card-head"><h3>الطالبات (${list.length}${g.capacity ? ' من ' + esc(g.capacity) : ''})</h3><span class="spacer"></span><span class="small muted">السداد عن ${monthLabel(S.month)}</span></div>
    ${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>#</th><th>الاسم</th><th>البرنامج</th><th>الهاتف</th><th>السداد</th><th></th></tr></thead><tbody>${list.map((x, i) => `<tr class="click" data-sid="${esc(x.s.id)}"><td>${i + 1}</td><td><b>${esc(x.s.name)}</b></td><td><button class="chip" data-prog="${esc(x.e.id)}" style="border:none;cursor:pointer" title="تغيير البرنامج">${esc(enrProg(x.e))} ✏️</button></td><td class="num">${esc(x.s.phone || '')}</td><td>${badge(payStatus(x.s, S.month))}</td><td><button class="btn sm soft" data-move="${esc(x.e.id)}">↔️ نقل</button></td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">لا توجد طالبات في هذه الحلقة</div>'}
    <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn soft" id="gd-addst">＋ إضافة طالبة موجودة</button><button class="btn soft" id="gd-new">＋ طالبة جديدة</button><button class="btn" id="gd-print">🖨️ طباعة الكشف</button></div>`;
  const m = openModal({ title: '📚 ' + esc(groupName(g)), size: 'lg', body,
    foot: `<button class="btn primary" id="gd-edit">✏️ تعديل الحلقة</button>${canDo('archiveGroup') ? `<button class="btn danger-ghost" id="gd-arch">${g.status === 'فعالة' ? 'أرشفة الحلقة' : 'استرجاع الحلقة'}</button>` : ''}`,
    onMount: (el) => {
      const reopen = () => { m.close(); openGroup(id); };
      $$('tr[data-sid]', el).forEach((r) => { r.onclick = (ev) => { if (ev.target.closest('[data-move]') || ev.target.closest('[data-prog]')) return; m.close(); openStudent(r.dataset.sid, 'groups'); }; });
      $$('[data-prog]', el).forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); changeProgram(S.idx.enr[b.dataset.prog], reopen); }; });
      $$('[data-move]', el).forEach((b) => { b.onclick = () => openTransferForm(S.idx.enr[b.dataset.move], reopen); });
      $('#gd-edit', el).onclick = () => { m.close(); openGroupForm(g); };
      $('#gd-print', el).onclick = () => printGroups([g]);
      $('#gd-new', el).onclick = () => { m.close(); openStudentForm(); setTimeout(() => { const sel = $('[data-g]'); if (sel) { sel.value = g.id; sel.dispatchEvent(new Event('change')); } }, 30); };
      $('#gd-addst', el).onclick = () => {
        const pm = openModal({ title: 'إضافة طالبة إلى ' + esc(groupName(g)), body: `<label class="field"><span>البرنامج</span><input id="gp-prog" list="dl-progs" value="${esc(g.program)}"/></label>${progList()}<div id="gp-picker"></div>`, foot: '<button class="btn primary" id="gp-save">إضافة</button><button class="btn" data-close>إلغاء</button>',
          onMount: (pel) => {
            const picker = studentPicker($('#gp-picker', pel), { multi: true, exclude: list.map((x) => x.s.id) });
            $('#gp-save', pel).onclick = async () => {
              const ids = picker.get(); if (!ids.length) return toast('اختاري طالبة', 'warn');
              const prog = $('#gp-prog', pel).value.trim(); if (!prog) return toast('اكتبي البرنامج', 'warn');
              const btn = $('#gp-save', pel);
              try { for (const sid of ids) { await withBusy(btn, () => api('addEnrollment', { studentId: sid, groupId: g.id, program: prog })); } await loadData(true); render(); toast('تمت الإضافة ✅', 'ok'); pm.close(); reopen(); }
              catch (e) { toast(e.message, 'err'); await loadData(true); render(); }
            };
          } });
      };
      if ($('#gd-arch', el)) $('#gd-arch', el).onclick = async () => {
        const ok = await confirmBox(g.status === 'فعالة' ? 'أرشفة هذه الحلقة؟ (يجب أن تكون بدون طالبات)' : 'استرجاع هذه الحلقة؟', { danger: g.status === 'فعالة' });
        if (!ok) return;
        try { await mutate(null, 'archiveGroup', { id: g.id }, 'تم'); m.close(); } catch (e) {}
      };
    } });
}
function openGroupForm(g) {
  const isNew = !g; g = g || { period: 'مسائي' };
  const L = S.data.lists;
  const body = `<form id="gf">
    <div class="grid2">
      <label class="field"><span>المعلمة *</span><input name="teacher" list="dl-t" required value="${esc(g.teacher)}"/></label>
      <label class="field"><span>البرنامج الافتراضي *</span><input name="program" list="dl-p" required value="${esc(g.program)}"/></label>
      <label class="field"><span>الأيام *</span><input name="days" list="dl-d" required value="${esc(g.days)}"/></label>
      <label class="field"><span>الفترة *</span><select name="period">${optList(S.data.constants.periods, g.period)}</select></label>
      <label class="field"><span>الوقت</span><input name="time" placeholder="مثال: 4:00 م - 7:00 م" value="${esc(g.time)}"/></label>
      <label class="field"><span>السعة (عدد الطالبات الأقصى)</span><input name="capacity" inputmode="numeric" value="${esc(g.capacity)}"/></label>
    </div>
    <label class="field"><span>ملاحظات</span><input name="notes" value="${esc(g.notes)}"/></label>
    <datalist id="dl-t">${L.teachers.map((v) => `<option value="${esc(v)}">`).join('')}</datalist><datalist id="dl-p">${L.programs.map((v) => `<option value="${esc(v)}">`).join('')}</datalist><datalist id="dl-d">${L.days.map((v) => `<option value="${esc(v)}">`).join('')}</datalist>
    <div class="notice info small">الحلقة = معلمة + أيام + فترة. يمكن أن تضم طالبات من برامج مختلفة في نفس الوقت، ويُحدَّد برنامج كل طالبة عند تسجيلها (البرنامج الافتراضي يُقترح تلقائياً).<br>«مختلط» = مثل السبت صباحاً والخميس مساءً. اكتبي التفاصيل في خانة الوقت.</div>
    <div id="gf-err" class="form-error" hidden></div></form>`;
  const m = openModal({ title: isNew ? 'حلقة جديدة' : 'تعديل الحلقة ' + esc(g.id), body, foot: `<button class="btn primary" id="gf-save">حفظ</button><button class="btn" data-close>إلغاء</button>`,
    onMount: (el) => {
      const per = $('[name=period]', el), time = $('[name=time]', el);
      per.onchange = () => { if (!time.value) time.value = per.value === 'صباحي' ? '9:00 ص - 12:00 م' : per.value === 'مسائي' ? '4:00 م - 7:00 م' : ''; };
      $('#gf-save', el).onclick = async () => {
        const data = Object.fromEntries(new FormData($('#gf', el)).entries());
        if (!isNew) { data.id = g.id; data.version = g.version; }
        try { const r = await mutate($('#gf-save', el), 'saveGroup', { group: data }, 'تم حفظ الحلقة ✅'); m.close(); openGroup(r.group.id); }
        catch (e) { if (e.code !== 'CONFLICT') { $('#gf-err', el).hidden = false; $('#gf-err', el).textContent = e.message; } else m.close(); }
      };
    } });
}

// ---------- منتقي الطالبات ----------
function studentPicker(container, o) {
  o = o || {};
  let picked = (o.initial || []).slice();
  container.innerHTML = `<div class="picker"><input class="input" placeholder="اكتبي اسم الطالبة أو رقم الهاتف..." autocomplete="off"/><div class="picker-results" hidden></div></div><div class="picked"></div><div class="fam small"></div>`;
  const inp = $('input', container), res = $('.picker-results', container), pk = $('.picked', container), fam = $('.fam', container);
  const draw = () => {
    pk.innerHTML = picked.map((id) => `<span class="chip">${esc(S.idx.st[id] ? S.idx.st[id].name : id)} <button type="button" data-rm="${esc(id)}">✕</button></span>`).join('');
    $$('[data-rm]', pk).forEach((b) => { b.onclick = () => { picked = picked.filter((x) => x !== b.dataset.rm); draw(); }; });
    const keys = new Set(picked.map((id) => S.idx.st[id] && S.idx.st[id].familyKey).filter(Boolean));
    const sugg = S.data.students.filter((s) => s.status === 'نشطة' && keys.has(s.familyKey) && !picked.includes(s.id));
    fam.innerHTML = o.multi && sugg.length ? 'من نفس الأسرة: ' + sugg.map((s) => `<button type="button" class="chip" style="border:none;cursor:pointer" data-add="${esc(s.id)}">＋ ${esc(s.name)}</button>`).join(' ') : '';
    $$('[data-add]', fam).forEach((b) => { b.onclick = () => { picked.push(b.dataset.add); draw(); o.onChange && o.onChange(picked); }; });
    o.onChange && o.onChange(picked);
  };
  inp.oninput = () => {
    const q = norm(inp.value), qd = digits(inp.value);
    if (!q) { res.hidden = true; return; }
    const hits = S.data.students.filter((s) => s.status === 'نشطة' && !picked.includes(s.id) && !(o.exclude || []).includes(s.id) && (norm(s.name).includes(q) || (qd && (s.phone || '').includes(qd)))).slice(0, 12);
    res.innerHTML = hits.length ? hits.map((s) => `<div data-id="${esc(s.id)}"><b>${esc(s.name)}</b> <span class="muted small num">${esc(s.phone || '')}</span><div class="small muted">${activeEnr(s.id).map((e) => esc(groupName(S.idx.gr[e.groupId]))).join(' | ')}</div></div>`).join('') : '<div class="muted">لا نتائج</div>';
    res.hidden = false;
    $$('[data-id]', res).forEach((d) => { d.onclick = () => { if (!o.multi) picked = []; picked.push(d.dataset.id); inp.value = ''; res.hidden = true; draw(); }; });
  };
  inp.onblur = () => setTimeout(() => { res.hidden = true; }, 200);
  draw();
  return { get: () => picked.slice() };
}

// ================= المدفوعات =================
function renderPayments(el) {
  const m = S.month, st = computeStats(m), tab = S.payTab || 'unpaid';
  const unpaid = S.data.students.filter((s) => { const p = payStatus(s, m); return p === 'unpaid' || p === 'partial'; }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  const pays = S.data.payments.filter((p) => p.fromMonth <= m && p.toMonth >= m).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const center = settings().CENTER_NAME || '';
  el.innerHTML = `<div class="toolbar"><select class="input" id="pm-month" style="width:auto">${monthOptions(m)}</select><span class="spacer"></span><button class="btn primary" id="pm-add">＋ تسجيل دفعة</button></div>
    <div class="stats">
      <div class="stat"><span class="ic">✅</span><div class="lbl">مسددة</div><div class="val">${st.paid}</div><div class="sub">نسبة السداد ${st.rate}%</div></div>
      <div class="stat red"><span class="ic">⏳</span><div class="lbl">غير مسددة</div><div class="val">${st.unpaid + st.partial}</div><div class="sub">${st.partial ? st.partial + ' جزئياً' : 'عن ' + monthLabel(m)}</div></div>
      <div class="stat blue"><span class="ic">🤝</span><div class="lbl">معفاة / مكفولة</div><div class="val">${st.exempt}</div></div>
      <div class="stat gold"><span class="ic">💰</span><div class="lbl">محصّل هذا الشهر</div><div class="val num">${money(st.monthCollected)}</div><div class="sub">إجمالي الفصل: ${money(st.termCollected)}</div></div>
    </div>
    <div class="tabs"><button data-pt="unpaid" class="${tab === 'unpaid' ? 'active' : ''}">غير المسددات (${unpaid.length})</button><button data-pt="list" class="${tab === 'list' ? 'active' : ''}">الدفعات المغطية للشهر (${pays.filter((p) => p.status === 'فعالة').length})</button></div>
    <div id="pm-body"></div>`;
  const body = $('#pm-body', el);
  if (tab === 'unpaid') {
    body.innerHTML = unpaid.length ? `<div class="toolbar"><span class="muted small">اضغطي 💬 لإرسال تذكير واتساب جاهز</span><span class="spacer"></span><button class="btn sm" id="pm-print">🖨️ طباعة الكشف</button></div><div class="list">${unpaid.map((s) => {
      const msg = `السلام عليكم ورحمة الله، نذكّركم بلطف بسداد رسوم شهر ${monthLabel(m)} للطالبة ${s.name}${center ? ' في ' + center : ''}. جزاكم الله خيراً.`;
      return `<div class="row-card" data-sid="${esc(s.id)}"><div class="rc-main"><div class="avatar">${esc(initials(s.name))}</div><div style="min-width:0"><div class="rc-title">${esc(s.name)}</div><div class="rc-sub num">${esc(s.phone || 'بدون هاتف')}</div></div></div>
        <div class="rc-tags">${activeEnr(s.id).map((e) => `<span class="chip">${esc(groupName(S.idx.gr[e.groupId]))}</span>`).join('')}${s.notes ? `<span class="chip">📝 ${esc(s.notes.slice(0, 40))}</span>` : ''}</div>
        <div style="display:flex;gap:6px">${s.phone ? `<a class="icon-btn" target="_blank" rel="noopener" href="${esc(waLink(s.phone, msg))}" data-stop>💬</a>` : ''}<button class="btn sm primary" data-quickpay="${esc(s.id)}">💵 دفع</button></div></div>`;
    }).join('')}</div>` : '<div class="empty"><div class="big">🎉</div>جميع الطالبات مسددات لهذا الشهر</div>';
    const pr = $('#pm-print', body); if (pr) pr.onclick = () => printUnpaid(m);
  } else {
    body.innerHTML = pays.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>الطالبة</th><th>المبلغ</th><th>الفترة</th><th>النوع</th><th>سجّلتها</th><th></th></tr></thead><tbody>${pays.map((p) => {
      const names = String(p.studentIds).split(',').map((id) => S.idx.st[id] ? S.idx.st[id].name : '#' + id);
      return `<tr class="${p.status !== 'فعالة' ? 'cancelled' : ''} click" data-sid="${esc(String(p.studentIds).split(',')[0])}"><td><b>${esc(names[0])}</b>${names.length > 1 ? `<div class="small muted">+ ${esc(names.slice(1).join('، '))}</div>` : ''}</td><td class="num"><b>${money(p.amount)}</b></td><td class="small">${esc(rangeLabel(p.fromMonth, p.toMonth))}</td><td>${esc(p.type)}</td><td class="small">${esc(p.createdBy)}<div class="muted">${esc(p.paidDate || '')}</div></td><td>${p.status === 'فعالة' ? '' : '<span class="small muted">ملغاة</span>'}</td></tr>`;
    }).join('')}</tbody></table></div>` : '<div class="empty">لا توجد دفعات تغطي هذا الشهر</div>';
  }
  $('#pm-month', el).onchange = (e) => { S.month = e.target.value; render(); };
  $('#pm-add', el).onclick = () => openPaymentForm([]);
  $$('[data-pt]', el).forEach((b) => { b.onclick = () => { S.payTab = b.dataset.pt; render(); }; });
  $$('[data-quickpay]', el).forEach((b) => { b.onclick = (ev) => { ev.stopPropagation(); openPaymentForm([b.dataset.quickpay], null, m); }; });
  $$('[data-stop]', el).forEach((a) => { a.onclick = (ev) => ev.stopPropagation(); });
  $$('[data-sid]', body).forEach((r) => { r.onclick = (ev) => { if (ev.target.closest('[data-quickpay],[data-stop]')) return; openStudent(r.dataset.sid, 'pay'); }; });
}

function openPaymentForm(studentIds, after, month) {
  const set = settings(), month0 = month || S.month;
  const perEnr = set.FEE_MODE === 'per_enrollment';
  const body = `<form id="pf">
    <div class="field"><span>الطالبة / الطالبات *</span><div id="pf-picker"></div></div>
    <div class="seg"><label><input type="radio" name="mode" value="month" checked>شهر واحد</label><label><input type="radio" name="mode" value="term">${esc(set.TERM_NAME || 'الفصل')}</label><label><input type="radio" name="mode" value="custom">فترة مخصصة</label></div>
    <div class="grid2" id="pf-months">
      <label class="field"><span id="pf-from-l">الشهر</span><select name="fromMonth">${monthOptions(month0)}</select></label>
      <label class="field" id="pf-to-w" hidden><span>إلى شهر</span><select name="toMonth">${monthOptions(month0)}</select></label>
    </div>
    <div id="pf-term" class="notice info" hidden>يغطي من ${esc(monthLabel(set.TERM_FROM))} إلى ${esc(monthLabel(set.TERM_TO))}</div>
    <div id="pf-enr-w" hidden><label class="field"><span>عن أي برنامج؟</span><select name="enrollmentId" id="pf-enr"></select></label></div>
    <div class="grid2">
      <label class="field"><span>المبلغ (د.ب) *</span><input name="amount" inputmode="decimal" required/><small id="pf-hint" class="small muted" hidden></small></label>
      <label class="field"><span>تاريخ الدفع</span><input type="date" name="paidDate" value="${todayStr()}"/></label>
      <label class="field"><span>طريقة الدفع</span><select name="method">${optList(S.data.lists.methods, S.data.lists.methods[0] || '')}</select></label>
      <label class="field"><span>ملاحظات</span><input name="notes" placeholder="مثال: عن نفسها وبناتها"/></label>
    </div>
    <div id="pf-err" class="form-error" hidden></div></form>`;
  let picker;
  const m = openModal({ title: '💵 تسجيل دفعة', body, foot: '<button class="btn primary" id="pf-save">حفظ الدفعة</button><button class="btn" data-close>إلغاء</button>',
    onMount: (el) => {
      const f = $('#pf', el);
      let amountTouched = false;
      $('[name=amount]', f).oninput = () => { amountTouched = true; };
      const mode = () => f.querySelector('[name=mode]:checked').value;
      const sync = () => {
        const md = mode(), ids = picker ? picker.get() : studentIds;
        $('#pf-months', el).hidden = md === 'term';
        $('#pf-term', el).hidden = md !== 'term';
        $('#pf-to-w', el).hidden = md !== 'custom';
        $('#pf-from-l', el).textContent = md === 'custom' ? 'من شهر' : 'الشهر';
        const ens = ids.length === 1 ? activeEnr(ids[0]) : [];
        const prevEnr = $('#pf-enr', el).value;
        $('#pf-enr-w', el).hidden = !(perEnr && ens.length > 1);
        $('#pf-enr', el).innerHTML = optList(ens.map((e) => ({ v: e.id, l: enrName(e) })), ens.some((e) => e.id === prevEnr) ? prevEnr : '', 'كل البرامج');
        recalc();
      };
      // المبلغ الافتراضي: في نظام «رسوم لكل برنامج» يُضرب في عدد البرامج النشطة
      const recalc = () => {
        if (amountTouched) return;
        const md = mode(), ids = picker ? picker.get() : studentIds;
        const fee = +(md === 'term' ? set.FEE_TERM : set.FEE_MONTHLY) || 0;
        let units = Math.max(1, ids.length);
        if (perEnr) units = $('#pf-enr', el).value ? 1 : ids.reduce((n, id) => n + Math.max(1, activeEnr(id).length), 0) || 1;
        $('[name=amount]', f).value = md === 'custom' ? '' : (fee * units || '');
        const h = $('#pf-hint', el);
        h.hidden = !(perEnr && units > 1 && md !== 'custom');
        h.textContent = `المبلغ المقترح = ${units} برنامج × ${fee} د.ب`;
      };
      $('#pf-enr', el).onchange = recalc;
      picker = studentPicker($('#pf-picker', el), { multi: true, initial: studentIds, onChange: () => sync() });
      $$('[name=mode]', f).forEach((r) => { r.onchange = sync; });
      sync();
      const save = async (force) => {
        const fd = Object.fromEntries(new FormData(f).entries()), ids = picker.get(), md = mode();
        const err = (t) => { $('#pf-err', el).hidden = false; $('#pf-err', el).textContent = t; };
        if (!ids.length) return err('اختاري الطالبة');
        let from = fd.fromMonth, to = fd.toMonth;
        if (md === 'month') to = from;
        if (md === 'term') { from = set.TERM_FROM; to = set.TERM_TO; }
        const type = ids.length > 1 ? 'عائلي' : md === 'term' ? 'فصلي' : md === 'month' ? 'شهري' : 'أخرى';
        const payload = { studentIds: ids, type, fromMonth: from, toMonth: to, amount: fd.amount, paidDate: fd.paidDate, method: fd.method, notes: fd.notes, enrollmentId: fd.enrollmentId || '', force };
        try { await mutate($('#pf-save', el), 'addPayment', payload, 'تم تسجيل الدفعة ✅'); m.close(); after && after(); }
        catch (e) {
          if (e.code === 'DUPLICATE_PAYMENT') {
            const ov = (e.extra && e.extra.overlap || []).map((x) => `<li>${money(x.amount)} — ${esc(rangeLabel(x.fromMonth, x.toMonth))} (${esc(x.type)}) سجّلتها ${esc(x.createdBy)}</li>`).join('');
            const ok = await confirmBox(`${esc(e.message)}<ul>${ov}</ul>`, { title: '⚠️ دفعة مكررة؟', ok: 'نعم، سجّلي دفعة إضافية', cancel: 'رجوع' });
            if (ok) save(true);
          } else if (e.code !== 'CONFLICT') err(e.message);
        }
      };
      $('#pf-save', el).onclick = () => save(false);
      f.onsubmit = (ev) => { ev.preventDefault(); save(false); };
    } });
}

// ================= جدول المركز =================
function scheduleModel() {
  const groups = activeGroups();
  const rows = {};
  groups.forEach((g) => {
    const add = (day, period, label) => { const r = rows[day] = rows[day] || { 'صباحي': [], 'مسائي': [] }; r[period].push({ g, label }); };
    if (g.period === 'مختلط') {
      const t = String(g.time || '');
      const parts = String(g.days).split(/\s*و\s*/).filter(Boolean);
      if (parts.length === 2) { add(g.days, 'صباحي', parts[0]); add(g.days, 'مسائي', parts[1]); }
      else { add(g.days, 'صباحي', t); add(g.days, 'مسائي', t); }
    } else add(g.days, g.period === 'صباحي' ? 'صباحي' : 'مسائي', '');
  });
  const order = ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'];
  const rank = (d) => { const i = order.findIndex((o) => d.startsWith(o)); return i < 0 ? 99 : i; };
  return Object.keys(rows).sort((a, b) => rank(a) - rank(b)).map((d) => ({ day: d, cells: rows[d] }));
}
function renderSchedule(el) {
  const model = scheduleModel();
  const slot = (x) => `<div class="slot" data-gid="${esc(x.g.id)}"><b>${esc(x.g.teacher)}</b><span class="small">${esc(groupTitle(x.g))} · ${groupActiveEnr(x.g.id).length} طالبة</span>${x.label ? `<div class="small muted">${esc(x.label)}</div>` : ''}</div>`;
  el.innerHTML = `<div class="toolbar"><span class="muted small">يتحدث تلقائياً من بيانات الحلقات</span><span class="spacer"></span><button class="btn" id="sc-print">🖨️ طباعة الجدول</button></div>
    <div class="card"><div class="sched"><div class="h">الأيام</div><div class="h">☀️ الفترة الصباحية</div><div class="h">🌙 الفترة المسائية</div>
    ${model.map((r) => `<div class="d">${esc(r.day)}</div><div class="c" data-label="☀️ صباحي">${r.cells['صباحي'].map(slot).join('') || '<span class="muted small">—</span>'}</div><div class="c" data-label="🌙 مسائي">${r.cells['مسائي'].map(slot).join('') || '<span class="muted small">—</span>'}</div>`).join('')}
    </div></div>`;
  $('#sc-print', el).onclick = printSchedule;
  $$('[data-gid]', el).forEach((s) => { s.onclick = () => openGroup(s.dataset.gid); });
}

// ================= التقارير والطباعة =================
function printHTML(html) {
  $('#print-area').innerHTML = html;
  setTimeout(() => { window.print(); }, 150);
}
const pHead = (title, sub) => `<div class="p-head"><div><h1>${esc(settings().CENTER_NAME || '')}</h1><h2>${esc(title)}</h2></div><div class="small">${esc(sub || '')}<br>تاريخ الطباعة: ${todayStr()}</div></div>`;
function printGroups(groups) {
  printHTML(groups.map((g) => {
    const list = groupActiveEnr(g.id).map((e) => Object.assign({}, S.idx.st[e.studentId], { _prog: enrProg(e) })).sort((a, b) => a._prog.localeCompare(b._prog, 'ar') || a.name.localeCompare(b.name, 'ar'));
    return `<div class="p-page">${pHead('كشف أسماء الحلقة', settings().TERM_NAME)}
      <div class="p-meta"><span><b>المعلمة:</b> ${esc(g.teacher)}</span><span><b>البرامج:</b> ${esc(groupProgsText(g))}</span><span><b>الأيام:</b> ${esc(g.days)} (${esc(g.period)})</span><span><b>الوقت:</b> ${esc(g.time)}</span><span><b>العدد:</b> ${list.length}</span></div>
      <table class="p-tbl"><thead><tr><th style="width:30px">م</th><th>اسم الطالبة</th><th>البرنامج</th><th>اسم المستخدم</th><th>الهاتف</th><th style="width:18%">ملاحظات</th></tr></thead><tbody>
      ${list.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s._prog)}</td><td>${esc(s.nationalId)}</td><td>${esc(s.phone)}</td><td></td></tr>`).join('')}</tbody></table>
      <div class="p-foot"><span>توقيع المعلمة: ..................</span><span>توقيع الإدارة: ..................</span></div></div>`;
  }).join(''));
}
function printSchedule() {
  const model = scheduleModel();
  const cell = (arr) => arr.map((x) => `<div><b>${esc(x.g.teacher)}</b> — ${esc(groupTitle(x.g))}${x.label ? ' (' + esc(x.label) + ')' : ''}</div>`).join('') || '—';
  printHTML(`<div class="p-page">${pHead('جدول أوقات المركز', settings().TERM_NAME)}<table class="p-tbl"><thead><tr><th>الأيام</th><th>الفترة الصباحية</th><th>الفترة المسائية</th></tr></thead><tbody>${model.map((r) => `<tr><td><b>${esc(r.day)}</b></td><td>${cell(r.cells['صباحي'])}</td><td>${cell(r.cells['مسائي'])}</td></tr>`).join('')}</tbody></table></div>`);
}
function printUnpaid(m) {
  const list = S.data.students.filter((s) => { const p = payStatus(s, m); return p === 'unpaid' || p === 'partial'; }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  printHTML(`<div class="p-page">${pHead('كشف غير المسددات — ' + monthLabel(m), list.length + ' طالبة')}<table class="p-tbl"><thead><tr><th>م</th><th>الاسم</th><th>الهاتف</th><th>الحلقة</th><th>ملاحظات</th></tr></thead><tbody>${list.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td>${esc(s.phone)}</td><td>${activeEnr(s.id).map((e) => esc(enrName(e))).join('<br>')}</td><td>${esc(s.notes)}</td></tr>`).join('')}</tbody></table></div>`);
}
function printStats() {
  const st = computeStats(S.month);
  const rows = activeGroups().sort((a, b) => a.teacher.localeCompare(b.teacher, 'ar')).map((g) => `<tr><td>${esc(g.teacher)}</td><td>${esc(groupProgsText(g))}</td><td>${esc(g.days)} (${esc(g.period)})</td><td>${groupActiveEnr(g.id).length}</td></tr>`).join('');
  printHTML(`<div class="p-page">${pHead('الإحصائية العامة للمركز', settings().TERM_NAME)}
    <table class="p-tbl" style="margin-bottom:14px"><tbody><tr><th>عدد الطالبات</th><td>${st.students}</td><th>عدد التسجيلات</th><td>${st.enrollments}</td></tr><tr><th>عدد الحلقات</th><td>${st.groups}</td><th>عدد المعلمات</th><td>${st.teachers}</td></tr><tr><th>إجمالي المحصّل</th><td>${money(st.totalCollected)}</td><th>محصّل الفصل الحالي</th><td>${money(st.termCollected)}</td></tr><tr><th>مسددات ${monthLabel(S.month)}</th><td>${st.paid}</td><th>غير مسددات</th><td>${st.unpaid + st.partial}</td></tr></tbody></table>
    <table class="p-tbl"><thead><tr><th>المعلمة</th><th>البرنامج</th><th>الأيام والفترة</th><th>عدد الطالبات</th></tr></thead><tbody>${rows}</tbody></table></div>`);
}
function downloadCSV(name, rows) {
  const csv = '\ufeff' + rows.map((r) => r.map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name + '.csv';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}
function exportStudentsCSV(list) {
  const m = S.month;
  downloadCSV('الطالبات-' + todayStr(), [['الرقم', 'الاسم', 'اسم المستخدم', 'الهاتف', 'هاتف إضافي', 'الحلقات', 'حالة الرسوم', 'السداد ' + monthLabel(m), 'مجموع المدفوع', 'ملاحظات', 'الحالة']]
    .concat(list.map((s) => [s.id, s.name, s.nationalId, s.phone, s.phone2, activeEnr(s.id).map((e) => { const g = S.idx.gr[e.groupId]; return g ? g.teacher + ' - ' + enrProg(e) + ' - ' + g.days + ' ' + g.period : ''; }).join(' | '), s.feeStatus, STATUS_LABEL[payStatus(s, m)],
      (S.idx.payBySt[s.id] || []).filter((p) => p.status === 'فعالة').reduce((a, p) => a + (+p.amount || 0) / String(p.studentIds).split(',').length, 0), s.notes, s.status])));
}
function exportPaymentsCSV() {
  downloadCSV('الدفعات-' + todayStr(), [['الرمز', 'الطالبات', 'النوع', 'من', 'إلى', 'المبلغ', 'تاريخ الدفع', 'الطريقة', 'ملاحظات', 'الحالة', 'سجّلتها', 'وقت التسجيل']]
    .concat(S.data.payments.map((p) => [p.id, String(p.studentIds).split(',').map((id) => S.idx.st[id] ? S.idx.st[id].name : id).join(' + '), p.type, p.fromMonth, p.toMonth, p.amount, p.paidDate, p.method, p.notes, p.status, p.createdBy, p.createdAt])));
}
function renderReports(el) {
  const card = (ico, t, d, ctrl) => `<div class="card"><h3>${ico} ${t}</h3><p class="muted small" style="margin-top:-6px">${d}</p>${ctrl}</div>`;
  el.innerHTML = `<div class="groups-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">
    ${card('📋', 'كشوف الحلقات (تقرير الوزارة)', 'كشف لكل حلقة في صفحة مستقلة مع خانات التوقيع.', `<select class="input" id="rp-g" style="margin-bottom:8px"><option value="">كل الحلقات</option>${activeGroups().map((g) => `<option value="${esc(g.id)}">${esc(groupName(g))} — ${esc(g.days)} ${esc(g.period)}</option>`).join('')}</select><button class="btn primary block" id="rp-groups">🖨️ طباعة</button>`)}
    ${card('🗓️', 'جدول أوقات المركز', 'الحلقات موزعة على الأيام والفترات.', '<button class="btn primary block" id="rp-sched">🖨️ طباعة</button>')}
    ${card('⏳', 'كشف غير المسددات', 'حسب الشهر المختار.', `<select class="input" id="rp-m" style="margin-bottom:8px">${monthOptions(S.month)}</select><button class="btn primary block" id="rp-unpaid">🖨️ طباعة</button>`)}
    ${card('📊', 'الإحصائية العامة', 'الأعداد والمبالغ وتوزيع الطالبات على الحلقات.', '<button class="btn primary block" id="rp-stats">🖨️ طباعة</button>')}
    ${card('⬇️', 'تصدير إلى Excel', 'ملفات CSV تفتح مباشرة في Excel أو Google Sheets.', '<button class="btn block" id="rp-xs" style="margin-bottom:8px">بيانات الطالبات</button><button class="btn block" id="rp-xp">سجل الدفعات</button>')}
  </div>`;
  $('#rp-groups').onclick = () => { const id = $('#rp-g').value; printGroups(id ? [S.idx.gr[id]] : activeGroups().sort((a, b) => a.teacher.localeCompare(b.teacher, 'ar'))); };
  $('#rp-sched').onclick = printSchedule;
  $('#rp-unpaid').onclick = () => printUnpaid($('#rp-m').value);
  $('#rp-stats').onclick = printStats;
  $('#rp-xs').onclick = () => exportStudentsCSV(S.data.students.filter((s) => s.status === 'نشطة'));
  $('#rp-xp').onclick = exportPaymentsCSV;
}

// ================= سجل التعديلات =================
const ACTION_ICONS = { 'إضافة طالبة': '➕', 'تعديل بيانات طالبة': '✏️', 'حذف (أرشفة) طالبة': '🗑️', 'استرجاع طالبة': '♻️', 'حذف نهائي': '⛔', 'تسجيل في حلقة': '📚', 'نقل طالبة': '↔️', 'إنهاء تسجيل': '⏹️', 'إعادة تفعيل تسجيل': '▶️', 'تسجيل دفعة': '💵', 'إلغاء دفعة': '❌', 'إضافة حلقة': '🆕', 'تعديل حلقة': '🛠️', 'أرشفة حلقة': '📦', 'استرجاع حلقة': '📤', 'تسجيل دخول': '🔑', 'تغيير كلمة المرور': '🔒', 'تعديل إعداد': '⚙️', 'تعديل قائمة': '📃', 'إضافة إلى قائمة': '📃', 'حذف من قائمة': '📃', 'ترحيل البيانات': '🚚' };
function kvTable(o) {
  if (!o) return '';
  let obj; try { obj = typeof o === 'string' ? JSON.parse(o) : o; } catch (e) { return esc(o); }
  return Object.keys(obj).filter((k) => typeof obj[k] !== 'object').map((k) => `<div><span class="muted">${esc(FIELD_LABELS[k] || k)}:</span> ${esc(obj[k])}</div>`).join('');
}
function auditItem(r) {
  const det = r.before || r.after ? `<details><summary>التفاصيل</summary><div class="grid2" style="margin-top:6px">${r.before ? `<div><b>قبل</b>${kvTable(r.before)}</div>` : ''}${r.after ? `<div><b>بعد</b>${kvTable(r.after)}</div>` : ''}</div></details>` : '';
  return `<div class="tl"><div class="dot">${ACTION_ICONS[r.action] || '•'}</div><div style="flex:1;min-width:0"><div><b>${esc(r.user)}</b> — ${esc(r.action)}</div><div class="small">${esc(r.summary)}</div><div class="meta num">${esc(r.time)}</div>${det}</div></div>`;
}
function renderAudit(el) {
  const af = S.af = S.af || { user: '', action: '', q: '', from: '', to: '' };
  el.innerHTML = `<div class="filters">
      <select data-af="action" class="${af.action ? 'on' : ''}">${optList(Object.keys(ACTION_ICONS), af.action, 'كل العمليات')}</select>
      <input class="input" data-af="user" placeholder="اسم الإدارية" value="${esc(af.user)}" style="width:150px;border-radius:999px;min-height:38px"/>
      <input class="input" type="date" data-af="from" value="${esc(af.from)}" style="width:auto;border-radius:999px;min-height:38px" title="من تاريخ"/>
      <input class="input" type="date" data-af="to" value="${esc(af.to)}" style="width:auto;border-radius:999px;min-height:38px" title="إلى تاريخ"/>
    </div>
    <div class="toolbar"><div class="search"><input class="input" id="au-q" placeholder="بحث في التفاصيل (اسم طالبة، مبلغ...)" value="${esc(af.q)}"/></div></div>
    <div class="card"><div class="result-info" id="au-info"></div><div id="au-list" class="timeline"><div class="loading-screen"><div class="spinner"></div></div></div><button class="btn block soft" id="au-more" hidden>تحميل المزيد</button></div>`;
  let offset = 0;
  const load = async (append) => {
    try {
      const r = await api('getAudit', Object.assign({}, af, { offset, limit: 60 }), { silent: true });
      const box = $('#au-list'); if (!box) return;
      const html = r.rows.map(auditItem).join('');
      box.innerHTML = append ? box.innerHTML + html : (html || '<div class="empty">لا توجد نتائج</div>');
      offset += r.rows.length;
      $('#au-info').textContent = r.total + ' عملية';
      $('#au-more').hidden = offset >= r.total;
    } catch (e) { const box = $('#au-list'); if (box) box.innerHTML = `<div class="form-error">${esc(e.message)}</div>`; }
  };
  load(false);
  $$('[data-af]', el).forEach((i) => { i.onchange = () => { af[i.dataset.af] = i.value.trim(); render(); }; });
  $('#au-q').oninput = debounce((e) => { af.q = e.target.value.trim(); offset = 0; load(false); }, 350);
  $('#au-more').onclick = () => load(true);
}

// ================= الإعدادات =================
function renderSettings(el) {
  const set = settings(), L = S.data.lists;
  const canSet = canDo('saveSetting'), canAdd = canDo('saveListItem'), canDel = canDo('removeListItem');
  const supNote = '<div class="notice info small">🔒 التعديل هنا متاح للمشرفة فقط</div>';
  const listCard = (type, title) => `<div class="card"><div class="card-head"><h3>${title}</h3><span class="spacer"></span>${canAdd ? `<button class="btn sm soft" data-ladd="${type}">＋ إضافة</button>` : ''}</div>
    ${L[type].map((v) => `<div class="item"><div class="grow">${esc(v)}</div>${canAdd ? `<button class="btn sm" data-lren="${type}" data-v="${esc(v)}">✏️ تعديل</button>` : ''}${canDel ? `<button class="btn sm danger-ghost" data-ldel="${type}" data-v="${esc(v)}">حذف</button>` : ''}</div>`).join('') || '<div class="muted small">فارغة</div>'}</div>`;
  el.innerHTML = `
    <div class="card"><h3>🏫 إعدادات المركز والرسوم</h3>${canSet ? '' : supNote}<form id="setf"><fieldset style="border:0;padding:0;margin:0;min-width:0" ${canSet ? '' : 'disabled'}>
      <label class="field"><span>اسم المركز (يظهر في التقارير)</span><input name="CENTER_NAME" value="${esc(set.CENTER_NAME)}"/></label>
      <div class="grid3">
        <label class="field"><span>الرسوم الشهرية (د.ب)</span><input name="FEE_MONTHLY" inputmode="decimal" value="${esc(set.FEE_MONTHLY)}"/></label>
        <label class="field"><span>الرسوم الفصلية (د.ب)</span><input name="FEE_TERM" inputmode="decimal" value="${esc(set.FEE_TERM)}"/></label>
        <label class="field"><span>نظام الرسوم</span><select name="FEE_MODE">${optList([{ v: 'per_student', l: 'رسوم واحدة للطالبة' }, { v: 'per_enrollment', l: 'رسوم لكل برنامج' }], set.FEE_MODE)}</select></label>
        <label class="field"><span>اسم الفصل الحالي</span><input name="TERM_NAME" value="${esc(set.TERM_NAME)}"/></label>
        <label class="field"><span>بداية الفصل</span><select name="TERM_FROM">${monthOptions(set.TERM_FROM)}</select></label>
        <label class="field"><span>نهاية الفصل</span><select name="TERM_TO">${monthOptions(set.TERM_TO)}</select></label>
      </div>${canSet ? '<button class="btn primary" id="set-save" type="submit">حفظ الإعدادات</button>' : ''}</fieldset></form></div>${canAdd ? '' : supNote}
    <div class="groups-grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${listCard('teachers', '👩‍🏫 المعلمات')}${listCard('programs', '📖 البرامج')}${listCard('days', '📅 الأيام')}${listCard('methods', '💳 طرق الدفع')}</div>
    <div class="card"><h3>🔒 تغيير كلمة المرور</h3><form id="pwf" class="grid3">
      <label class="field"><span>كلمة المرور الحالية</span><input type="password" name="oldPassword" autocomplete="current-password" required/></label>
      <label class="field"><span>كلمة المرور الجديدة</span><input type="password" name="newPassword" autocomplete="new-password" minlength="4" required/></label>
      <label class="field"><span>تأكيد كلمة المرور</span><input type="password" name="confirm" autocomplete="new-password" required/></label>
    </form><button class="btn" id="pw-save">تغيير كلمة المرور</button></div>
    <div class="card"><h3>📄 أوراق الشيت</h3><p class="small">ورقة «${esc((S.data.sheets && S.data.sheets.master) || 'قاعدة بيانات المركز')}» وورقة لكل معلمة بأسماء طالباتها تُحدَّث تلقائياً في Google Sheets بعد كل حفظ. استخدمي الزر إذا عُدّل شيء يدوياً في أوراق البيانات.</p>${S.data.sheets && S.data.sheets.error ? `<div class="notice warn small">⚠️ آخر محاولة تحديث للأوراق لم تكتمل (${esc(S.data.sheets.error)}). اضغطي الزر لإعادة المحاولة.</div>` : ''}<button class="btn" id="views-refresh">🔄 تحديث أوراق الشيت الآن</button></div>
    <div class="card"><h3>ℹ️ الجلسة</h3><p class="small">مسجلة الدخول: <b>${esc(S.user.name)}</b> (${S.user.role === 'supervisor' ? 'مشرفة' : 'إدارية'}) · آخر مزامنة: <span class="num">${esc(S.data.serverTime)}</span></p><button class="btn danger-ghost" data-action="logout">🚪 تسجيل الخروج</button></div>`;
  $('#setf').onsubmit = async (ev) => {
    ev.preventDefault();
    const fd = Object.fromEntries(new FormData($('#setf')).entries());
    const changed = Object.keys(fd).filter((k) => String(fd[k]).trim() !== String(set[k] || ''));
    if (!changed.length) return toast('لا توجد تغييرات');
    if (fd.TERM_FROM > fd.TERM_TO) return toast('بداية الفصل يجب أن تكون قبل نهايته', 'err');
    const btn = $('#set-save');
    try { for (const k of changed) await withBusy(btn, () => api('saveSetting', { key: k, value: fd[k] })); toast('تم حفظ الإعدادات ✅', 'ok'); }
    catch (e) { toast(e.message, 'err'); }
    await loadData(true); render();
  };
  $$('[data-ladd]').forEach((b) => { b.onclick = async () => { const v = await confirmBox('أدخلي القيمة الجديدة:', { title: 'إضافة', input: 'القيمة', required: true, ok: 'إضافة' }); if (v) mutate(null, 'saveListItem', { type: b.dataset.ladd, value: v }, 'تمت الإضافة').catch(() => {}); }; });
  $$('[data-lren]').forEach((b) => { b.onclick = async () => { const v = await confirmBox('تعديل الاسم سيُطبَّق على كل الحلقات المرتبطة (مفيد لتصحيح الأخطاء الإملائية).', { title: 'تعديل', input: 'الاسم الجديد', value: b.dataset.v, required: true, ok: 'حفظ' }); if (v && v !== b.dataset.v) mutate(null, 'saveListItem', { type: b.dataset.lren, value: v, oldValue: b.dataset.v }, 'تم التعديل').catch(() => {}); }; });
  $$('[data-ldel]').forEach((b) => { b.onclick = async () => { const ok = await confirmBox(`حذف «${esc(b.dataset.v)}» من القائمة؟`, { danger: true, ok: 'حذف' }); if (ok) mutate(null, 'removeListItem', { type: b.dataset.ldel, value: b.dataset.v }, 'تم الحذف').catch(() => {}); }; });
  $('#views-refresh').onclick = () => mutate($('#views-refresh'), 'refreshSheets', {}, 'تم تحديث أوراق الشيت ✅').catch(() => {});
  $('#pw-save').onclick = async () => {
    const fd = Object.fromEntries(new FormData($('#pwf')).entries());
    if (!fd.oldPassword || !fd.newPassword) return toast('أكملي الحقول', 'warn');
    if (fd.newPassword.length < 4) return toast('كلمة المرور الجديدة 4 أحرف على الأقل', 'warn');
    if (fd.newPassword !== fd.confirm) return toast('كلمتا المرور غير متطابقتين', 'warn');
    try { await withBusy($('#pw-save'), () => api('changePassword', fd)); toast('تم تغيير كلمة المرور ✅', 'ok'); $('#pwf').reset(); } catch (e) { toast(e.message, 'err'); }
  };
}

const PAGES = {
  dashboard: { title: 'الرئيسية', render: renderDashboard },
  students: { title: 'الطالبات', render: renderStudents },
  groups: { title: 'الحلقات', render: renderGroups },
  payments: { title: 'المدفوعات', render: renderPayments },
  schedule: { title: 'جدول المركز', render: renderSchedule },
  reports: { title: 'التقارير والطباعة', render: renderReports },
  audit: { title: 'سجل التعديلات', render: renderAudit },
  settings: { title: 'الإعدادات', render: renderSettings },
};

// ================= الدخول والتشغيل =================
function showLogin() {
  $('#main-view').hidden = true; $('#login-view').hidden = false;
  $('#login-title').textContent = CFG.CENTER_NAME || 'منظومة إدارة المركز';
  if (!CFG.API_URL) { $('#setup-notice').hidden = false; $('#login-user').innerHTML = '<option value="">—</option>'; return; }
  api('users', {}, { silent: true }).then((u) => {
    const last = localStorage.getItem('markaz_last_user') || '';
    $('#login-user').innerHTML = optList(u.map((x) => ({ v: x.username, l: x.name })), last, u.length ? 'اختاري اسمك' : 'لا توجد حسابات — شغّلي setupUsers');
  }).catch((e) => { $('#login-user').innerHTML = '<option value="">تعذّر الاتصال</option>'; const er = $('#login-error'); er.hidden = false; er.textContent = e.message; });
}
async function doLogin(ev) {
  ev.preventDefault();
  const er = $('#login-error'); er.hidden = true;
  const username = $('#login-user').value, password = $('#login-pass').value;
  if (!username) { er.hidden = false; er.textContent = 'اختاري اسمك'; return; }
  try {
    const r = await withBusy($('#login-btn'), () => api('login', { username, password }));
    S.token = r.token; S.user = r.user;
    localStorage.setItem('markaz_session', JSON.stringify({ token: r.token, user: r.user }));
    localStorage.setItem('markaz_last_user', username);
    $('#login-pass').value = '';
    await startApp();
  } catch (e) { er.hidden = false; er.textContent = e.message; }
}
function logout(expired) {
  if (S.token && !expired) api('logout', {}, { silent: true }).catch(() => {});
  S.token = null; S.data = null; localStorage.removeItem('markaz_session');
  closeAllModals(); clearInterval(S.poll);
  if (expired) toast('انتهت الجلسة، سجّلي الدخول مرة أخرى', 'warn');
  showLogin();
}
async function startApp() {
  $('#login-view').hidden = true; $('#main-view').hidden = false;
  $('#page').innerHTML = '<div class="loading-screen"><div class="spinner"></div>جاري تحميل البيانات...</div>';
  try { await loadData(); } catch (e) { if (e.code !== 'AUTH') { $('#page').innerHTML = `<div class="empty"><div class="big">⚠️</div>${esc(e.message)}<br><br><button class="btn primary" data-action="refresh">إعادة المحاولة</button></div>`; } return; }
  $('#brand-name').textContent = settings().CENTER_NAME || 'إدارة المركز';
  $('#brand-user').textContent = S.user.name;
  onRoute();
  clearInterval(S.poll);
  S.poll = setInterval(poll, (CFG.POLL_SECONDS || 30) * 1000);
}
async function poll() {
  if (!S.token || document.hidden || S.busy) return;
  try {
    const r = await api('changes', { stamp: S.stamp }, { silent: true });
    if (r.changed) {
      S.busy = 1;
      await loadData(true);
      S.busy = 0;
      if (S.modals.length) S.pendingRefresh = true; else render();
      toast('🔄 تم تحديث البيانات (تعديلات من إدارية أخرى)');
    }
  } catch (e) { S.busy = 0; }
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-action]'); if (!a) return;
  e.preventDefault();
  const act = a.dataset.action;
  if (act === 'logout') logout(false);
  else if (act === 'more') showMore();
  else if (act === 'refresh') { if (S.token) { if (!S.data) startApp(); else loadData().then(() => { render(); toast('تم التحديث', 'ok'); }).catch((x) => toast(x.message, 'err')); } }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && S.token && S.data) poll(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.modals.length) S.modals[S.modals.length - 1].close(); });
window.addEventListener('hashchange', () => { if (S.data) onRoute(); });
$('#login-form').addEventListener('submit', doLogin);
try { const sess = JSON.parse(localStorage.getItem('markaz_session') || 'null'); if (sess && sess.token) { S.token = sess.token; S.user = sess.user; } } catch (e) {}
if (S.token && CFG.API_URL) startApp(); else showLogin();
window.__markaz = S; // للتشخيص
})();
