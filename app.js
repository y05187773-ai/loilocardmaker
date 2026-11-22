'use strict';

const STORE_KEY = 'loilo-thinking-card-v1';
const ASPECTS = { '16:9': [1920, 1080], '4:3': [1600, 1200], '3:4': [1200, 1600] };
const SIZES = { s: 0.85, m: 1, l: 1.2 };
const DEFAULTS = {
  mode: 'thinking',
  tool: 'venn2', tag: '問い', title: '', counts: {}, labels: {},
  survey: { title: '', text: '', scale: 'four', perPage: 3, comment: false, commentText: '感想や、次にがんばりたいことを書きましょう', required: true },
  test: { title: '', text: '', perPage: 1, marks: 'kana', answerKey: true, showScore: false, points: 1, required: true },
  aspect: '16:9', theme: 'color', size: 'm', showName: false, showDate: false, ruled: false,
  portfolio: { nameRule: 'roster', pdfRule: 'order', pdfPer: 1, pdfCrop: true, group: 'child', paper: 'a4p', perPage: 2, title: '学習評価資料', klass: '', sheet: true, memo: true, abc: true, confidential: true, showDate: false, scores: true, scoreNames: '', kanten: '知識・技能,思考・判断・表現,主体的に学習に取り組む態度' },
  ai: {
    test: { goal: 'create', grade: '3', subject: '算数', unit: '', count: 5, level: 'normal', type: 'mix', explain: true, extra: '' },
    survey: { goal: 'create', grade: '3', subject: '国語', purpose: '', count: 3, free: 1, extra: '' },
  },
};
const SAMPLES = {
  survey: {
    title: '今日の学習のふり返り',
    text: 'めあてを達成できましたか\n自分の考えを伝えることができましたか\n友だちの考えを聞いて、考えが広がりましたか\n自由：今日の学習でわかったことを書きましょう',
  },
  test: {
    title: 'たしかめテスト',
    text: '7×8は？｜答：56\n6×9は？｜答：54\n日本の首都はどこですか？｜*東京｜大阪｜京都｜名古屋｜解説：国会や中央省庁がある都市です\n水がこおる温度は何度ですか？｜答：0度／0℃\n昆虫をすべて選びましょう｜*アリ｜クモ｜*チョウ｜ダンゴムシ\n今日の学習で一番心に残ったことを書きましょう',
  },
};

let st = load();

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
    return {
      ...DEFAULTS, ...s,
      counts: { ...(s.counts || {}) }, labels: { ...(s.labels || {}) },
      survey: { ...DEFAULTS.survey, ...(s.survey || {}) }, test: { ...DEFAULTS.test, ...(s.test || {}) },
      portfolio: { ...DEFAULTS.portfolio, ...(s.portfolio || {}), ...(s.portfolio?.title === '学びのあしあと' ? { title: DEFAULTS.portfolio.title } : {}), ...(s.portfolio?.pdfRule === 'auto' ? { pdfRule: 'order' } : {}) },
      ai: { test: { ...DEFAULTS.ai.test, ...(s.ai?.test || {}) }, survey: { ...DEFAULTS.ai.survey, ...(s.ai?.survey || {}) } },
    };
  } catch {
    return structuredClone(DEFAULTS);
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(st)); } catch { /* 保存できなくても動作は続ける */ }
}

/* "survey.title" のようなパスで値を読み書き */
const getPath = (p) => p.split('.').reduce((o, k) => o?.[k], st);
function setPath(p, v) {
  const ks = p.split('.');
  const last = ks.pop();
  ks.reduce((o, k) => o[k], st)[last] = v;
}

const $ = (id) => document.getElementById(id);
const currentTool = () => TOOLS.find((t) => t.id === st.tool) || TOOLS[0];
const countOf = (t) => (t.count ? (st.counts[t.id] ?? t.count.default) : undefined);
const labelKey = (t) => `${t.id}:${countOf(t) ?? ''}`;
function labelsOf(t) {
  const saved = st.labels[labelKey(t)] || [];
  return t.fields(countOf(t)).map((f, i) => saved[i] ?? f[1]);
}

/* ---------- カード生成 ---------- */
function buildPages() {
  const [W, H] = ASPECTS[st.aspect] || ASPECTS['16:9'];
  const common = {
    W, H, theme: st.theme, scale: SIZES[st.size] ?? 1,
    showName: st.showName, showDate: st.showDate, ruled: st.ruled,
  };
  let svgs;
  if (st.mode === 'survey') {
    svgs = renderSurveyPages({ ...common, ...st.survey, scale: common.scale, answerScale: st.survey.scale });
  } else if (st.mode === 'test') {
    svgs = renderTestPages({ ...common, ...st.test });
  } else {
    const t = currentTool();
    svgs = [renderCard({ ...common, tool: t, labels: labelsOf(t), n: countOf(t), title: st.title, tag: st.tag })];
  }
  return { svgs, W, H };
}

function baseName() {
  const title = st.mode === 'survey' ? st.survey.title : st.mode === 'test' ? st.test.title : st.title;
  const fallback = { thinking: currentTool().name, survey: 'アンケート', test: 'テスト' }[st.mode];
  return ((title || '').trim() || fallback).replace(/[\\/:*?"<>|\n\r]/g, '').slice(0, 40);
}
const pngName = (i, n) => (n > 1 ? `${baseName()}_${String(i + 1).padStart(2, '0')}.png` : `${baseName()}.png`);

/* ---------- UI 構築 ---------- */
function buildToolGrid() {
  const grid = $('toolGrid');
  grid.innerHTML = '';
  let lastGroup = null;
  for (const t of TOOLS) {
    if (t.group !== lastGroup) {
      lastGroup = t.group;
      const h = document.createElement('h3');
      h.className = 'tool-group-title';
      h.textContent = TOOL_GROUPS.find((g) => g.id === t.group)?.name || '';
      grid.appendChild(h);
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'tool-btn';
    btn.setAttribute('role', 'radio');
    btn.dataset.id = t.id;
    btn.title = `思考スキル：${t.skill}`;
    btn.innerHTML = renderCard({ tool: t, labels: [], n: t.count?.default, W: 240, H: 135, theme: 'color' })
      + '<span class="t-name"></span><span class="t-sub"></span>';
    btn.querySelector('.t-name').textContent = t.name;
    btn.querySelector('.t-sub').textContent = t.sub;
    btn.addEventListener('click', () => {
      st.tool = t.id;
      syncToolSelection();
      buildToolOptions();
      update();
    });
    grid.appendChild(btn);
  }
}

function buildScaleSeg() {
  const seg = $('scaleSeg');
  seg.innerHTML = Object.entries(SCALES).map(([k, v]) => `<button type="button" data-v="${k}">${v.name}</button>`).join('');
}

function syncToolSelection() {
  document.querySelectorAll('.tool-btn').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === st.tool)));
}

function buildToolOptions() {
  const t = currentTool();
  const cf = $('countField');
  const cs = $('countSelect');
  if (t.count) {
    cf.hidden = false;
    $('countLabel').textContent = t.count.label;
    cs.innerHTML = t.count.options.map((v) => `<option value="${v}">${v}</option>`).join('');
    cs.value = String(countOf(t));
  } else {
    cf.hidden = true;
  }
  buildLabelFields();
}

function buildLabelFields() {
  const t = currentTool();
  const box = $('labelFields');
  box.innerHTML = '';
  const fields = t.fields(countOf(t));
  const values = labelsOf(t);
  fields.forEach(([name, def], i) => {
    const wrapEl = document.createElement('div');
    wrapEl.className = 'field';
    const id = `lbl-${i}`;
    const lab = document.createElement('label');
    lab.htmlFor = id;
    lab.textContent = name;
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.id = id;
    inp.value = values[i];
    inp.placeholder = def || '（空欄でラベルなし）';
    inp.addEventListener('input', () => {
      const key = labelKey(t);
      const arr = st.labels[key] ? [...st.labels[key]] : [];
      arr[i] = inp.value;
      st.labels[key] = arr;
      update();
    });
    wrapEl.append(lab, inp);
    box.appendChild(wrapEl);
  });
  if (fields.length % 2 === 1) box.lastElementChild.classList.add('wide');
}

function syncControls() {
  $('titleInput').value = st.title;
  $('tagSelect').value = st.tag;
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const v = getPath(el.dataset.bind);
    if (el.type === 'checkbox') el.checked = !!v;
    else el.value = v ?? '';
  });
  document.querySelectorAll('.seg').forEach((seg) => {
    const v = getPath(seg.dataset.key);
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === v)));
  });
  document.querySelectorAll('.modes button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.mode === st.mode)));
  document.querySelectorAll('[data-for]').forEach((el) => { el.hidden = el.dataset.for !== st.mode; });
  document.querySelectorAll('[data-not-for]').forEach((el) => { el.hidden = el.dataset.notFor === st.mode; });
  $('lookNum').textContent = st.mode === 'thinking' ? '3' : '2';
  const sc = SCALES[st.survey.scale];
  $('scalePreview').textContent = sc ? `選択肢：${sc.labels.map((l) => l.replace('\n', ' ')).join(' ／ ')}` : '';
  document.querySelector('[data-bind="survey.commentText"]').disabled = !st.survey.comment;
  document.querySelectorAll('.ai-block').forEach((blk) => {
    const review = st.ai[blk.dataset.for].goal === 'review';
    blk.querySelectorAll('[data-ai-create]').forEach((el) => { el.hidden = review; });
  });
}

let current = { svgs: [], W: 0, H: 0 };
function update() {
  if (st.mode === 'portfolio') {
    pfUiUpdate();
    save();
    return;
  }
  current = buildPages();
  const { svgs } = current;
  const box = $('preview');
  box.innerHTML = '';
  svgs.forEach((svg, i) => {
    const fig = document.createElement('figure');
    fig.className = 'page';
    fig.innerHTML = svg;
    if (svgs.length > 1) {
      const bar = document.createElement('figcaption');
      bar.innerHTML = `<span>${i + 1}枚目</span><button type="button" data-act="save">保存</button><button type="button" data-act="copy">コピー</button>`;
      bar.querySelector('[data-act="save"]').addEventListener('click', (e) => withBusy(e.currentTarget, () => savePng(i)));
      bar.querySelector('[data-act="copy"]').addEventListener('click', (e) => withBusy(e.currentTarget, () => copyPng(i)));
      fig.appendChild(bar);
    }
    box.appendChild(fig);
  });
  box.classList.toggle('multi', svgs.length > 1);
  $('pageCount').textContent = `カード ${svgs.length}枚`;
  $('btnCopy').hidden = svgs.length > 1;
  $('btnSave').textContent = svgs.length > 1 ? `画像で保存（PNG ${svgs.length}枚）` : '画像で保存（PNG）';
  const orient = st.aspect === '3:4' ? 'portrait' : 'landscape';
  $('pageStyle').textContent = `@page { size: A4 ${orient}; margin: 10mm; }`;
  renderLoiloTable();
  renderAiPrompt();
  save();
}

/* ---------- ロイロ取り込み用 Excel ---------- */
const testPoints = () => (Number.isFinite(st.test.points) && st.test.points > 0 ? Math.min(100, st.test.points) : 1);
function loiloRows(kind) {
  if (kind === 'test') return testToLoiloRows(parseTest(st.test.text), { points: testPoints(), required: st.test.required });
  const items = parseSurvey(st.survey.text);
  if (st.survey.comment && st.survey.commentText?.trim()) items.push({ q: st.survey.commentText.trim(), free: true });
  return surveyToLoiloRows(items, { scale: st.survey.scale, required: st.survey.required });
}

function renderLoiloTable() {
  if (st.mode !== 'test' && st.mode !== 'survey') return;
  const kind = st.mode;
  const table = $(kind === 'test' ? 'loiloTableTest' : 'loiloTableSurvey');
  const rows = loiloRows(kind);
  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  if (!rows.length) {
    table.innerHTML = '<tr><td>問題を入力すると、ここに表示されます</td></tr>';
    return;
  }
  const head = kind === 'test' ? '<tr><th>#</th><th>形式</th><th>問題</th><th>正答・選択肢</th><th>配点</th></tr>' : '<tr><th>#</th><th>形式</th><th>質問</th><th>選択肢</th></tr>';
  const body = rows.map((r, i) => {
    let detail;
    let warn = false;
    if (r.type === 'radio' || r.type === 'checkbox') {
      const corr = String(r.correct ?? '').split(',').filter(Boolean).map(Number);
      detail = r.values.map((v, j) => (corr.includes(j + 1) ? `<b>◎${esc(v)}</b>` : esc(v))).join(' ／ ');
      if (kind === 'test' && !corr.length) { detail += '<br>（正答なし：採点されません）'; warn = true; }
    } else if (r.type.startsWith('short:')) {
      detail = `正答：${r.values.map(esc).join(' ／ ')}`;
    } else {
      detail = kind === 'test' ? (r.score ? '記述（採点あり）' : '記述（採点なし）') : '自由記述';
    }
    if (r.explain) detail += `<br><span style="color:#6B7280">解説：${esc(r.explain)}</span>`;
    const type = `<td class="type">${esc(LOILO_TYPE_NAMES[r.type] || r.type)}<code>${esc(r.type)}</code></td>`;
    const pts = kind === 'test' ? `<td>${r.score ?? '－'}</td>` : '';
    return `<tr><td>${i + 1}</td>${type}<td>${esc(r.q)}</td><td${warn ? ' class="warn"' : ''}>${detail}</td>${pts}</tr>`;
  }).join('');
  table.innerHTML = head + body;
}

function saveLoiloXlsx(kind) {
  const rows = loiloRows(kind);
  if (!rows.length) throw new Error('問題が入力されていません');
  if (rows.length > 300) throw new Error('ロイロのカード1枚に取り込めるのは300問までです');
  downloadBlob(buildLoiloXlsx(rows), `${baseName()}.xlsx`);
  toast(`取り込み用Excel（${rows.length}問）を保存しました`);
}

/* ---------- AIに相談 ---------- */
function aiPrompt(kind) {
  if (kind === 'test') return buildTestPrompt(st.ai.test, st.test.text);
  const labels = (SCALES[st.survey.scale] || SCALES.four).labels.map((l) => l.replace('\n', ' '));
  return buildSurveyPrompt(st.ai.survey, st.survey.text, labels);
}

function renderAiPrompt() {
  if (st.mode !== 'test' && st.mode !== 'survey') return;
  $(`aiPrompt-${st.mode}`).value = aiPrompt(st.mode);
}

function copyText(t) {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = t;
    ta.style.cssText = 'position:fixed;opacity:0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    if (!ok) throw new Error('コピーできませんでした。「できたプロンプトを見る」から手動でコピーしてください');
  };
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(t).catch(fallback);
  return Promise.resolve().then(fallback);
}

function bindAi() {
  document.querySelectorAll('[data-subjects]').forEach((sel) => {
    sel.innerHTML = SUBJECTS.map((v) => `<option>${v}</option>`).join('');
  });
  // リンクはそのまま新しいタブで開き、同時にプロンプトをコピーする
  document.querySelectorAll('[data-ai-open]').forEach((a) => a.addEventListener('click', () => {
    const name = AI_LINKS[a.dataset.aiOpen].name;
    copyText(aiPrompt(a.dataset.kind))
      .then(() => toast(`コピーしました。${name}の入力欄に貼り付けて送信してください`))
      .catch((e) => toast(e.message));
  }));
  document.querySelectorAll('[data-ai-copy]').forEach((b) => b.addEventListener('click', () => {
    copyText(aiPrompt(b.dataset.aiCopy)).then(() => toast('プロンプトをコピーしました')).catch((e) => toast(e.message));
  }));
  document.querySelectorAll('[data-ai-import]').forEach((b) => b.addEventListener('click', () => {
    const kind = b.dataset.aiImport;
    const area = $(`aiPaste-${kind}`);
    const lines = extractAiLines(area.value);
    if (!lines) { toast('取り込める行が見つかりませんでした'); return; }
    const cur = st[kind].text.trim();
    if (b.dataset.how === 'replace') {
      if (cur && !window.confirm('今の内容を、AIの回答で置きかえますか？')) return;
      st[kind].text = lines;
    } else {
      st[kind].text = cur ? `${cur}\n${lines}` : lines;
    }
    area.value = '';
    syncControls();
    update();
    toast(`${lines.split('\n').length}行を取り込みました。内容を確かめてください`);
  }));
}

let timer;
const updateSoon = () => { clearTimeout(timer); timer = setTimeout(update, 150); };

/* ---------- 書き出し ---------- */
let toastTimer;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2800);
}

async function withBusy(btn, fn) {
  btn.disabled = true;
  try { await fn(); } catch (e) { if (e?.name !== 'AbortError') toast(e?.message || 'うまくいきませんでした'); } finally { btn.disabled = false; }
}

async function savePng(i) {
  const { svgs, W, H } = current;
  downloadBlob(await svgToPng(svgs[i], W, H), pngName(i, svgs.length));
  toast('画像を保存しました');
}

async function copyPng(i) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('このブラウザではコピーできません。「保存」を使ってください');
  }
  const { svgs, W, H } = current;
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': svgToPng(svgs[i], W, H) })]);
  toast('コピーしました。ロイロノートに貼り付けできます');
}

function bindActions() {
  $('btnPdf').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const { svgs, W, H } = current;
    downloadBlob(await svgsToPdf(svgs, W, H), `${baseName()}.pdf`);
    toast(`PDF（${svgs.length}ページ）を保存しました`);
  }));

  $('btnSave').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    const { svgs, W, H } = current;
    for (let i = 0; i < svgs.length; i++) {
      downloadBlob(await svgToPng(svgs[i], W, H), pngName(i, svgs.length));
      if (svgs.length > 1) await new Promise((r) => setTimeout(r, 350));
    }
    toast(svgs.length > 1 ? `${svgs.length}枚の画像を保存しました` : '画像を保存しました');
  }));

  $('btnCopy').addEventListener('click', (e) => withBusy(e.currentTarget, () => copyPng(0)));

  const probe = typeof File !== 'undefined' ? new File([new Blob()], 'a.png', { type: 'image/png' }) : null;
  if (probe && navigator.canShare?.({ files: [probe] })) {
    $('btnShare').hidden = false;
    $('btnShare').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
      const { svgs, W, H } = current;
      const files = [];
      for (let i = 0; i < svgs.length; i++) {
        files.push(new File([await svgToPng(svgs[i], W, H)], pngName(i, svgs.length), { type: 'image/png' }));
      }
      await navigator.share({ files });
    }));
  }

  $('btnPrint').addEventListener('click', () => window.print());
  document.querySelectorAll('[data-loilo]').forEach((b) => b.addEventListener('click', (e) => withBusy(e.currentTarget, async () => saveLoiloXlsx(b.dataset.loilo))));
}

function bindControls() {
  document.querySelectorAll('.modes button').forEach((b) => b.addEventListener('click', () => {
    st.mode = b.dataset.mode;
    syncControls();
    update();
  }));
  $('titleInput').addEventListener('input', (e) => { st.title = e.target.value; update(); });
  $('tagSelect').addEventListener('change', (e) => { st.tag = e.target.value; update(); });
  $('countSelect').addEventListener('change', (e) => {
    const v = e.target.value;
    st.counts[st.tool] = /^\d+$/.test(v) ? Number(v) : v;
    buildLabelFields();
    update();
  });
  $('resetLabels').addEventListener('click', () => {
    delete st.labels[labelKey(currentTool())];
    buildLabelFields();
    update();
  });
  document.querySelectorAll('[data-bind]').forEach((el) => {
    const ev = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
    el.addEventListener(ev, () => {
      const v = el.type === 'checkbox' ? el.checked : 'num' in el.dataset ? (el.value === '' ? null : Number(el.value)) : el.value;
      setPath(el.dataset.bind, v);
      if (el.type === 'checkbox') syncControls();
      updateSoon();
    });
  });
  document.querySelectorAll('.seg').forEach((seg) => {
    seg.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      setPath(seg.dataset.key, b.dataset.v);
      syncControls();
      update();
    });
  });
  document.querySelectorAll('[data-sample]').forEach((b) => b.addEventListener('click', () => {
    const k = b.dataset.sample;
    const cur = st[k];
    if (cur.text.trim() && !window.confirm('入力中の内容を入力例に置きかえますか？')) return;
    Object.assign(cur, SAMPLES[k]);
    syncControls();
    update();
  }));
}

buildToolGrid();
pfUiInit();
$('toolCount').textContent = `全${TOOLS.length}種類`;
buildScaleSeg();
bindAi();
syncToolSelection();
buildToolOptions();
syncControls();
bindControls();
bindActions();
update();
