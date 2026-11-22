'use strict';
/* ポートフォリオ画面の操作（app.js から呼ばれる。st・$・toast・withBusy は app.js 側） */

let pfPreviewTimer = null;
const pfOpts = () => ({ ...st.portfolio });
const pfEsc = (v) => String(v ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

function pfSetStatus(msg) { $('pfStatus').textContent = msg; }

async function pfHandleFiles(files) {
  if (!files.length) return;
  pfSetStatus('読み込み中…');
  const r = await pfAddFiles(files, {
    unit: $('pfUnit').value, rule: st.portfolio.nameRule,
    pdfRule: st.portfolio.pdfRule, pdfPer: st.portfolio.pdfPer, crop: st.portfolio.pdfCrop !== false, onProgress: pfSetStatus,
  });
  const unmatched = PF.items.filter((it) => !it.child).length;
  const overN = pfOverLimit().size;
  const pdfNote = !r.pdfPages ? ''
    : st.portfolio.nameRule !== 'roster' ? `PDF ${r.pdfPages}ページは、ファイル名・フォルダ名の人に割り当てました。`
    : r.pdfByOrder ? `PDFのページを名簿の順に割り当てました（${r.pdfByOrder}ページ）。ずれていたら、5の表でずれ始めたページの名前を直すと、うしろも自動でずれます。`
    : !PF.roster.length && st.portfolio.pdfRule !== 'none' ? `PDF ${r.pdfPages}ページを読み込みました。名簿を入れて「名前を振り直す」と、名簿の順に割り当てられます。`
    : `PDF ${r.pdfPages}ページを読み込みました。`;
  pfSetStatus([
    `${r.ok}枚を読み込みました（合計 ${PF.items.length}枚）。`,
    pdfNote,
    r.ng ? `${r.ng}件は読み込めませんでした。` : '',
    r.skipped ? `画像・PDF以外の${r.skipped}件は読み飛ばしました。` : '',
    unmatched ? `名前が決まっていない画像が${unmatched}枚あります（5の表で選べます）。` : '',
    overN ? `1人${PF_MAX_PER_CHILD}枚をこえた${overN}枚は、PDFに入りません（5の表で確かめてください）。` : '',
  ].join(''));
  $('pfUnit').value = '';
  pfUiUpdate();
}

function pfChildOptions() {
  return pfChildOrder().filter((n) => n !== '');
}

function pfRenderUnits() {
  const ol = $('pfUnits');
  if (!PF.units.length) {
    ol.innerHTML = '<li class="empty">画像を読み込むと、ここに単元がならびます</li>';
    return;
  }
  ol.innerHTML = PF.units.map((u, i) => {
    const n = PF.items.filter((it) => it.unit === u).length;
    return `<li data-i="${i}"><button type="button" data-mv="-1" ${i === 0 ? 'disabled' : ''} aria-label="上へ">↑</button><button type="button" data-mv="1" ${i === PF.units.length - 1 ? 'disabled' : ''} aria-label="下へ">↓</button><input type="text" value="${pfEsc(u)}" aria-label="単元名"><span class="cnt">${n}枚</span></li>`;
  }).join('');
  $('pfUnitList').innerHTML = PF.units.map((u) => `<option value="${pfEsc(u)}">`).join('');
}

function pfRenderTable() {
  const tbl = $('pfTable');
  $('pfItemCount').textContent = PF.items.length ? `${PF.items.length}枚` : '';
  if (!PF.items.length) {
    tbl.innerHTML = '<tr><td>まだ読み込んでいません</td></tr>';
    return;
  }
  const children = pfChildOptions();

  const order = (it) => PF.units.indexOf(it.unit);
  const rows = [...PF.items].sort((a, b) => order(a) - order(b) || pfNatural(a.path, b.path));
  const over = pfOverLimit();
  $('pfOverWarn').hidden = !over.size;
  if (over.size) {
    const who = [...new Set(PF.items.filter((it) => over.has(it.id)).map((it) => it.child))];
    $('pfOverWarn').innerHTML = `1人${PF_MAX_PER_CHILD}枚までです。<b>${who.map(pfEsc).join('、')}</b> の${over.size}枚は${PF_MAX_PER_CHILD}枚をこえているので、PDFに入りません（名前を直すか、✕で消してください）。`;
  }
  tbl.innerHTML = '<tr><th></th><th>単元</th><th>名前</th><th>ファイル</th><th></th></tr>' + rows.map((it) => {
    const opts = [`<option value="">${PF_UNSORTED}</option>`, ...children.map((c) => `<option ${c === it.child ? 'selected' : ''}>${pfEsc(c)}</option>`)].join('');
    const note = it.orderSrc && it.manual ? '<span class="order-note fixed">手で直した</span>'
      : it.byOrder && it.child ? '<span class="order-note">名簿の順で割り当て</span>' : '';
    return `<tr data-id="${it.id}" class="${over.has(it.id) ? 'over' : ''}"><td><button type="button" class="thumb" aria-label="大きく見る"><img src="${it.thumb}" alt=""></button></td>`
      + `<td><input type="text" list="pfUnitList" data-f="unit" value="${pfEsc(it.unit)}"></td>`
      + `<td class="${it.child ? '' : 'nomatch'}"><select data-f="child">${opts}</select>${over.has(it.id) ? `<span class="order-note over">${PF_MAX_PER_CHILD}枚をこえています</span>` : note}</td>`
      + `<td class="fname">${pfEsc(it.path)}</td><td><button type="button" class="del" aria-label="削除">✕</button></td></tr>`;
  }).join('');
}

/* 提出物（PDF）ごとの休み・未提出 */
function pfRenderAbsent() {
  const per = pfPer();
  const list = pfOrderSummary(per);
  const sec = $('pfAbsentSec');
  sec.hidden = !list.length;
  if (!list.length) return;
  $('pfAbsentList').innerHTML = list.map((m) => {
    for (const n of [...m.absent]) if (!PF.roster.some((r) => r.name === n)) m.absent.delete(n);
    const chips = PF.roster.map((r) => {
      const on = m.absent.has(r.name);
      return `<button type="button" class="chip ${on ? 'on' : ''}" data-name="${pfEsc(r.name)}" aria-pressed="${on}">${r.num != null ? `<small>${r.num}</small>` : ''}${pfEsc(r.name)}</button>`;
    }).join('');
    const diff = m.need - m.pages;
    const state = !diff ? `<span class="ok">✓ ${m.pages}ページ・${m.need / per}人分　ぴったりです</span>`
      : diff > 0 ? `<span class="ng">${m.pages}ページですが、名簿の順番では${m.need}ページ（${m.need / per}人）分です。あと${diff / per}人、休み・未提出の子を選んでください（または、ずれ始めたページの名前を5の表で直してください）。</span>`
      : `<span class="ng">${m.pages}ページあり、名簿の順番の${m.need}ページより多いです。選びすぎていないか、5の表で確かめてください。</span>`;
    return `<div class="pf-absent-item" data-src="${pfEsc(m.src)}">`
      + `<div class="pf-absent-head"><b>${pfEsc(m.unit)}</b><span class="fname">${pfEsc(m.name)}</span>`
      + `<span class="count-note">休み・未提出 ${m.absent.size}人</span>${m.absent.size ? '<button type="button" class="link-btn" data-clear>すべて外す</button>' : ''}</div>`
      + `<div class="chips">${chips}</div><p class="pf-absent-state">${state}</p></div>`;
  }).join('');
}
const pfPer = () => Math.max(1, st.portfolio.pdfPer || 1);

function pfRenderPreview() {
  clearTimeout(pfPreviewTimer);
  pfPreviewTimer = setTimeout(() => {
    const box = $('pfPreview');
    const o = pfOpts();
    box.innerHTML = '';
    if (!PF.items.length) {
      box.innerHTML = '<div class="pf-empty">左の「2」から提出物の画像を読み込むと、<br>ここにポートフォリオのページがならびます。</div>';
      $('pfPageCount').textContent = '';
      return;
    }
    const groups = pfBuildGroups(o);
    const total = groups.reduce((a, g) => a + g.pages.length, 0);
    $('pfPageCount').textContent = `${o.group === 'unit' ? '単元' : '子ども'} ${groups.length}　/　全${total}ページ`;
    const scale = 0.3;
    for (const g of groups) {
      const h = document.createElement('div');
      h.className = 'pf-group-title';
      h.textContent = `${g.key}（${g.pages.length}ページ）`;
      box.appendChild(h);
      for (const p of g.pages) box.appendChild(pfRenderCanvas(p, o, scale));
    }
  }, 180);
}

function pfUiUpdate() {
  pfRenderAbsent();
  pfRenderUnits();
  pfRenderTable();
  pfRenderPreview();
  $('pfZip').hidden = st.portfolio.group !== 'child';
  $('pfPer').closest('.field').hidden = st.portfolio.group === 'child';
  $('pageStyle').textContent = `@page { size: A4 ${st.portfolio.paper === 'a4l' ? 'landscape' : 'portrait'}; margin: 0; }`;
}

/* 拡大表示 */
let pfZoomId = null;
function pfZoomRows() {
  return [...$('pfTable').querySelectorAll('tr[data-id]')].map((tr) => Number(tr.dataset.id));
}
function pfZoom(id) {
  const it = PF.items.find((x) => x.id === id);
  if (!it) return;
  pfZoomId = id;
  const cv = $('pfZoomCanvas');
  cv.width = it.bmp.width;
  cv.height = it.bmp.height;
  cv.getContext('2d').drawImage(it.bmp, 0, 0);
  const ids = pfZoomRows();
  const i = ids.indexOf(id);
  const opts = [`<option value="">${PF_UNSORTED}</option>`, ...pfChildOptions().map((c) => `<option ${c === it.child ? 'selected' : ''}>${pfEsc(c)}</option>`)].join('');
  $('pfZoomInfo').innerHTML = `<span>${i + 1} / ${ids.length}　${pfEsc(it.name)}</span><label>名前 <select>${opts}</select></label>`;
  $('pfZoomPrev').disabled = i <= 0;
  $('pfZoomNext').disabled = i >= ids.length - 1;
  $('pfZoom').hidden = false;
}
function pfZoomStep(d) {
  const ids = pfZoomRows();
  const j = ids.indexOf(pfZoomId) + d;
  if (j >= 0 && j < ids.length) pfZoom(ids[j]);
}
function pfZoomClose() {
  $('pfZoom').hidden = true;
  pfZoomId = null;
}

function pfFileBase() {
  return ((st.portfolio.title || 'ポートフォリオ').trim() || 'ポートフォリオ').replace(/[\\/:*?"<>|\n\r]/g, '').slice(0, 40);
}

/* 名前を振り直す（PDF は、ファイル名の名前 → 名簿の順番） */
function pfReassignAll() {
  const rule = st.portfolio.nameRule;
  const per = Math.max(1, st.portfolio.pdfPer || 1);
  const pdfs = new Map();
  for (const it of PF.items) {
    if (it.pdfKey) {
      if (!pdfs.has(it.pdfKey)) pdfs.set(it.pdfKey, []);
      pdfs.get(it.pdfKey).push(it);
      continue;
    }
    it.child = pfGuessChild(it.path, rule);
  }
  for (const [key, its] of pdfs) {
    const path = its[0].pdfPath || its[0].path.replace(/#\d+$/, '');
    its.sort((a, b) => pfNatural(a.path, b.path));
    if (rule !== 'roster') {
      const who = pfGuessChild(path, rule);
      its.forEach((it) => { it.child = who; it.manual = false; it.byOrder = false; it.orderSrc = null; });
      continue;
    }
    // ファイル名・フォルダ名に名簿の名前があれば PDF 全体をその子に、なければ名簿の順番（または未分類）
    const who = pfGuessChild(path, 'roster');
    const useOrder = !who && PF.roster.length && st.portfolio.pdfRule !== 'none';
    its.forEach((it) => {
      it.manual = false;
      it.byOrder = false;
      it.orderSrc = useOrder ? key : null;
      it.child = useOrder ? '' : who;
    });
    if (useOrder) pfFillOrder(its, per);
  }
}

function pfUiInit() {
  let rosterTimer = null;
  $('pfRoster').addEventListener('input', (e) => {
    PF.roster = pfParseRoster(e.target.value);
    if (st.portfolio.nameRule === 'roster') {
      PF.items.forEach((it) => { if (!it.child && !it.orderSrc) it.child = pfGuessChild(it.path, 'roster'); });
      pfRefillOrder(Math.max(1, st.portfolio.pdfPer || 1));
    }
    clearTimeout(rosterTimer);
    rosterTimer = setTimeout(pfUiUpdate, 300);
  });

  $('pfPickFiles').addEventListener('click', () => $('pfFiles').click());
  $('pfPickFolder').addEventListener('click', () => $('pfFolder').click());
  for (const id of ['pfFiles', 'pfFolder']) {
    $(id).addEventListener('change', async (e) => {
      const files = [...e.target.files].map((file) => ({ file, path: file.webkitRelativePath || file.name }));
      e.target.value = '';
      await pfHandleFiles(files);
    });
  }
  const drop = $('pfDrop');
  drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('over'));
  drop.addEventListener('drop', async (e) => {
    e.preventDefault();
    drop.classList.remove('over');
    await pfHandleFiles(await pfFilesFromDrop(e.dataTransfer));
  });

  $('pfReassign').addEventListener('click', () => {
    pfReassignAll();
    const n = PF.items.filter((it) => !it.child).length;
    toast(n ? `振り直しました（未分類 ${n}枚）` : '振り直しました');
    pfUiUpdate();
  });
  $('pfClearAll').addEventListener('click', () => {
    if (PF.items.length && !window.confirm('読み込んだ画像をすべて消しますか？')) return;
    pfClear();
    pfSetStatus('');
    pfUiUpdate();
  });

  // 単元のならび順・名前の変更
  $('pfUnits').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mv]');
    if (!b) return;
    const i = Number(b.closest('li').dataset.i);
    const j = i + Number(b.dataset.mv);
    [PF.units[i], PF.units[j]] = [PF.units[j], PF.units[i]];
    pfUiUpdate();
  });
  $('pfUnits').addEventListener('change', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    const i = Number(e.target.closest('li').dataset.i);
    const from = PF.units[i];
    const to = e.target.value.trim() || PF_NO_UNIT;
    PF.items.forEach((it) => { if (it.unit === from) it.unit = to; });
    if (PF.units.includes(to) && to !== from) PF.units.splice(i, 1); else PF.units[i] = to;
    pfUiUpdate();
  });

  // 画像ごとの修正
  $('pfTable').addEventListener('change', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const it = PF.items.find((x) => x.id === Number(tr.dataset.id));
    if (!it) return;
    if (e.target.dataset.f === 'unit') {
      it.unit = e.target.value.trim() || PF_NO_UNIT;
      if (!PF.units.includes(it.unit)) PF.units.push(it.unit);
      pfPruneUnits();
    } else if (e.target.dataset.f === 'child') {
      it.child = e.target.value;
      it.byOrder = false;
      if (it.orderSrc) {
        // 名簿の順番で割り当てたPDF：ここを起点に、うしろのページを続きの人からずらす
        it.manual = true;
        if (pfAbsentOf(it.orderSrc).delete(it.child)) toast(`この提出物の「休み・未提出」から${it.child}さんを外しました`);
        const before = new Map(PF.items.map((x) => [x.id, x.child]));
        pfRefillOrder(Math.max(1, st.portfolio.pdfPer || 1));
        const moved = PF.items.filter((x) => x.id !== it.id && before.get(x.id) !== x.child).length;
        if (moved) toast(`うしろの${moved}ページも順にずらしました`);
      }
    }
    pfUiUpdate();
  });
  $('pfTable').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    if (e.target.closest('.thumb')) {
      pfZoom(Number(tr.dataset.id));
      return;
    }
    if (!e.target.closest('.del')) return;
    const it = PF.items.find((x) => x.id === Number(tr.dataset.id));
    pfRemoveItem(Number(tr.dataset.id));
    if (it?.orderSrc) pfRefillOrder(Math.max(1, st.portfolio.pdfPer || 1));
    pfUiUpdate();
  });

  // 提出物ごとの休み・未提出
  $('pfAbsentList').addEventListener('click', (e) => {
    const box = e.target.closest('.pf-absent-item');
    if (!box) return;
    const ab = pfAbsentOf(box.dataset.src);
    const b = e.target.closest('.chip');
    if (b) {
      const n = b.dataset.name;
      if (ab.has(n)) ab.delete(n); else ab.add(n);
    } else if (e.target.closest('[data-clear]')) {
      ab.clear();
    } else return;
    pfRefillOrder(pfPer());
    pfUiUpdate();
  });

  // 拡大表示（前後のページへ ← →、閉じる Esc）
  const zoom = $('pfZoom');
  zoom.addEventListener('click', (e) => {
    if (e.target.closest('[data-zoom]')) pfZoomStep(Number(e.target.closest('[data-zoom]').dataset.zoom));
    else if (e.target === zoom || e.target.closest('.zoom-close')) pfZoomClose();
  });
  zoom.addEventListener('change', (e) => {
    if (e.target.tagName !== 'SELECT') return;
    const row = $('pfTable').querySelector(`tr[data-id="${pfZoomId}"] select[data-f="child"]`);
    if (!row) return;
    row.value = e.target.value;
    row.dispatchEvent(new Event('change', { bubbles: true }));
    pfZoom(pfZoomId);
  });
  document.addEventListener('keydown', (e) => {
    if (zoom.hidden || e.target.tagName === 'SELECT') return;
    if (e.key === 'Escape') pfZoomClose();
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); pfZoomStep(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); pfZoomStep(-1); }
  });

  // 書き出し
  $('pfPdf').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (!PF.items.length) throw new Error('画像が読み込まれていません');
    const o = pfOpts();
    const pages = pfBuildGroups(o).flatMap((g) => g.pages);
    const btn = $('pfPdf');
    const pdf = await pfPagesToPdf(pages, o, (d, t) => { btn.textContent = `作成中… ${d}/${t}`; });
    btn.textContent = 'PDFで保存';
    downloadBlob(pdf, `${pfFileBase()}.pdf`);
    toast(`PDF（${pages.length}ページ）を保存しました`);
  }).finally(() => { $('pfPdf').textContent = 'PDFで保存'; }));

  $('pfZip').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (!PF.items.length) throw new Error('画像が読み込まれていません');
    const o = { ...pfOpts(), group: 'child' };
    const groups = pfBuildGroups(o);
    const btn = $('pfZip');
    const files = [];
    const used = new Set();
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i];
      btn.textContent = `作成中… ${i + 1}/${groups.length}人`;
      const pdf = await pfPagesToPdf(g.pages, o);
      const num = String(g.num ?? i + 1).padStart(2, '0');
      let name = `${num}_${g.key}`.replace(/[\\/:*?"<>|\n\r]/g, '');
      while (used.has(name)) name += '_';
      used.add(name);
      files.push({ name: `${name}.pdf`, data: new Uint8Array(await pdf.arrayBuffer()) });
    }
    downloadBlob(zipStore(files, 'application/zip'), `${pfFileBase()}_子ども別.zip`);
    toast(`${files.length}人分のPDFをZIPで保存しました`);
  }).finally(() => { $('pfZip').textContent = '子どもごとのPDF（ZIP）'; }));

  $('pfPrint').addEventListener('click', (e) => withBusy(e.currentTarget, async () => {
    if (!PF.items.length) throw new Error('画像が読み込まれていません');
    const o = pfOpts();
    const area = $('pfPrintArea');
    area.innerHTML = '';
    const urls = [];
    for (const p of pfBuildGroups(o).flatMap((g) => g.pages)) {
      const url = URL.createObjectURL(await canvasBlob(pfRenderCanvas(p, o), 'image/jpeg', 0.9));
      urls.push(url);
      const img = document.createElement('img');
      img.src = url;
      area.appendChild(img);
    }
    await Promise.all([...area.querySelectorAll('img')].map((img) => img.decode().catch(() => {})));
    document.body.classList.add('pf-printing');
    const done = () => {
      document.body.classList.remove('pf-printing');
      area.innerHTML = '';
      urls.forEach((u) => URL.revokeObjectURL(u));
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  }));
}
