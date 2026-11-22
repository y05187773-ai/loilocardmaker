'use strict';
/*
 * 提出物ポートフォリオ
 * 書き出した画像をまとめて読み込み、子ども別・単元別に並べて PDF にする。
 * 画像と名簿はブラウザのメモリ上だけで扱い、保存・送信はしない。
 */

const PF = {
  items: [], // { id, path, name, unit, child, bmp, thumb, date }
  units: [], // 単元の並び順
  roster: [], // { num, name, key }
  pdfs: new Map(), // 読み込んだPDFごと（同じファイル名でも別あつかい）：key → { name, unit, absent: Set（休み・未提出の名前） }
  seq: 0,
};
const PF_PAPER = { a4p: [1240, 1754], a4l: [1754, 1240] }; // 150dpi 相当
const PF_PT = { a4p: [595, 842], a4l: [842, 595] };
const PF_UNSORTED = '（未分類）';
const PF_NO_UNIT = '（単元名なし）';
const PF_MAX_PER_CHILD = 8; // 1人あたりの上限（子ども別は1人1ページにまとめる）
const PF_IMAGE_EXT = /\.(png|jpe?g|webp|gif|bmp)$/i;
const PF_PDF_EXT = /\.pdf$/i;
const PF_PDFJS = './vendor/pdfjs/';

// NFKC で康熙部首（⼭⽥など）や全角・半角をそろえ、空白・制御文字・中黒を取りのぞく
const pfKey = (s) => String(s || '').normalize('NFKC').replace(/[\s\u0000-\u001F\u007F\u200B-\u200D\uFEFF・]/g, '');
const pfNatural = (a, b) => a.localeCompare(b, 'ja', { numeric: true });

/* ---------- 名簿 ---------- */
function pfParseRoster(text) {
  return String(text).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.normalize('NFKC').match(/^(\d+)[\s.、:)\]]*\s*(.+)$/);
    const name = (m ? m[2] : l).trim();
    return { num: m ? Number(m[1]) : null, name, key: pfKey(name) };
  }).filter((r) => r.key);
}

/* ---------- 名前・単元の決め方 ---------- */
function pfParentFolder(path) {
  const parts = path.split('/');
  return parts.length > 1 ? parts[parts.length - 2] : '';
}
function pfBaseName(path) {
  return path.split('/').pop().replace(/\.[^.]+$/, '');
}
function pfGuessChild(path, rule) {
  if (rule === 'file' || rule === 'folder') {
    const raw = rule === 'file'
      ? pfBaseName(path).replace(/^[0-9０-９]+[\s_\-－.．]*/, '').replace(/[\s_\-－]*[(（]?\d+[)）]?$/, '').trim()
      : pfParentFolder(path);
    // 名簿に同じ人がいれば、名簿の書き方にそろえる（「佐藤花子」→「佐藤 花子」）
    const hit = PF.roster.find((r) => r.key === pfKey(raw));
    return hit ? hit.name : raw;
  }
  const p = pfKey(path);
  let best = null;
  for (const r of PF.roster) {
    if (r.key.length >= 2 && p.includes(r.key) && (!best || r.key.length > best.key.length)) best = r;
  }
  return best ? best.name : '';
}

/* ---------- 名簿の順番での割り当て ---------- */
const pfAbsentOf = (src) => PF.pdfs.get(src)?.absent || new Set();
const pfOrderList = (src) => { const ab = pfAbsentOf(src); return PF.roster.filter((r) => !ab.has(r.name)); };

/*
 * 1つのPDFのページ（its：ページ順）に、名簿の順番で名前を入れる。
 * 手で直したページ（manual）は動かさず、そこを起点に続きの人から割り当てる
 * （＝1か所直すと、うしろのページが自動でずれる）。
 * 手で「未分類」にしたページは、順番に数えない。
 */
function pfFillOrder(its, per) {
  const list = pfOrderList(its[0]?.orderSrc);
  let slot = 0, prev = null, run = 0;
  for (const it of its) {
    if (it.manual) {
      const idx = list.findIndex((r) => r.name === it.child);
      if (idx >= 0) {
        run = prev === it.child ? run + 1 : 1;
        slot = idx * per + Math.min(run, per);
      }
      prev = it.child;
      continue;
    }
    const r = list[Math.floor(slot / per)];
    it.child = r ? r.name : '';
    it.byOrder = !!r;
    run = prev === it.child ? run + 1 : 1;
    prev = it.child;
    slot++;
  }
}

/* 名簿の順番で割り当てたPDFをすべて割り当て直す */
function pfRefillOrder(per) {
  for (const its of pfOrderGroups().values()) pfFillOrder(its, per);
}
function pfOrderGroups() {
  const m = new Map();
  for (const it of PF.items) {
    if (!it.orderSrc) continue;
    if (!m.has(it.orderSrc)) m.set(it.orderSrc, []);
    m.get(it.orderSrc).push(it);
  }
  for (const its of m.values()) its.sort((a, b) => pfNatural(a.path, b.path));
  return m;
}

/* 名簿の順番で割り当てたPDFの一覧：[{ src, name, unit, absent, pages, need }]（need：人数×1人あたりページ） */
function pfOrderSummary(per) {
  const out = [];
  for (const [src, its] of pfOrderGroups()) {
    const info = PF.pdfs.get(src) || {};
    const pages = its.filter((it) => !(it.manual && !it.child)).length;
    out.push({ src, name: info.name || src, unit: its[0]?.unit || '', absent: pfAbsentOf(src), pages, need: pfOrderList(src).length * per });
  }
  return out;
}

/* ---------- 画像の読み込み ---------- */
async function pfLoadBitmap(file) {
  const bmp = await createImageBitmap(file);
  const max = 1800;
  const sc = Math.min(1, max / Math.max(bmp.width, bmp.height));
  if (sc >= 1) return bmp;
  const cv = document.createElement('canvas');
  cv.width = Math.round(bmp.width * sc);
  cv.height = Math.round(bmp.height * sc);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  bmp.close?.();
  return createImageBitmap(cv);
}
function pfThumb(bmp) {
  const cv = document.createElement('canvas');
  const sc = 120 / Math.max(bmp.width, bmp.height);
  cv.width = Math.max(1, Math.round(bmp.width * sc));
  cv.height = Math.max(1, Math.round(bmp.height * sc));
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', 0.7);
}

/* ---------- PDF（pdf.js をはじめて使うときに読み込む） ---------- */
let pfPdfLib = null;
async function pfLoadPdfJs() {
  if (pfPdfLib) return pfPdfLib;
  const base = new URL(PF_PDFJS, location.href).href;
  const lib = await import(`${base}pdf.min.mjs`);
  lib.GlobalWorkerOptions.workerSrc = `${base}pdf.worker.min.mjs`;
  pfPdfLib = { lib, base };
  return pfPdfLib;
}

/* ---------- カードの位置と、余白の名前 ---------- */
const pfMul = (m1, m2) => [
  m1[0] * m2[0] + m1[2] * m2[1], m1[1] * m2[0] + m1[3] * m2[1],
  m1[0] * m2[2] + m1[2] * m2[3], m1[1] * m2[2] + m1[3] * m2[3],
  m1[0] * m2[4] + m1[2] * m2[5] + m1[4], m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
];

/*
 * ページに貼られたいちばん大きな画像を「カード」とみなし、その範囲を返す（ページに対する割合 0〜1）。
 * 見つからない・ページ全体をおおっている（余白がない）ときは null。
 */
async function pfFindCardRect(page, vp, OPS) {
  const ops = await page.getOperatorList();
  const imgOps = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject, OPS.paintImageXObjectRepeat].filter((x) => x !== undefined));
  let cur = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let best = null;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i], a = ops.argsArray[i];
    if (fn === OPS.save) stack.push(cur);
    else if (fn === OPS.restore) cur = stack.pop() || cur;
    else if (fn === OPS.transform && a?.length === 6) cur = pfMul(cur, a);
    else if (fn === OPS.paintFormXObjectBegin) { stack.push(cur); if (Array.isArray(a?.[0]) && a[0].length === 6) cur = pfMul(cur, a[0]); }
    else if (fn === OPS.paintFormXObjectEnd) cur = stack.pop() || cur;
    else if (imgOps.has(fn)) {
      const pts = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => vp.convertToViewportPoint(cur[0] * x + cur[2] * y + cur[4], cur[1] * x + cur[3] * y + cur[5]));
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      const r = { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
      r.area = (r.x1 - r.x0) * (r.y1 - r.y0);
      if (!best || r.area > best.area) best = r;
    }
  }
  if (!best) return null;
  const W = vp.width, H = vp.height;
  const c = {
    x0: Math.max(0, best.x0 / W), y0: Math.max(0, best.y0 / H),
    x1: Math.min(1, best.x1 / W), y1: Math.min(1, best.y1 / H),
  };
  const frac = (c.x1 - c.x0) * (c.y1 - c.y0);
  if (frac < 0.15 || frac > 0.96) return null;
  return c;
}

/* canvas の一部（割合で指定）を画像にする */
function pfCropBitmap(cv, x0, y0, x1, y1) {
  const sx = Math.max(0, Math.floor(cv.width * x0)), sy = Math.max(0, Math.floor(cv.height * y0));
  const sw = Math.max(1, Math.min(cv.width, Math.ceil(cv.width * x1)) - sx), sh = Math.max(1, Math.min(cv.height, Math.ceil(cv.height * y1)) - sy);
  return createImageBitmap(cv, sx, sy, sw, sh);
}

/*
 * PDF の各ページを画像にする
 * 戻り値：[{ bmp（カード部分または全体）, card }]
 */
async function pfReadPdf(file, onPage, opt = {}) {
  const { lib, base } = await pfLoadPdfJs();
  const task = lib.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    cMapUrl: `${base}cmaps/`, cMapPacked: true, standardFontDataUrl: `${base}standard_fonts/`,
  });
  const doc = await task.promise;
  const pages = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const vp1 = page.getViewport({ scale: 1 });
      const scale = Math.min(3, 1800 / Math.max(vp1.width, vp1.height));
      const vp = page.getViewport({ scale });
      const cv = document.createElement('canvas');
      cv.width = Math.round(vp.width);
      cv.height = Math.round(vp.height);
      const ctx = cv.getContext('2d');
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, cv.width, cv.height);
      await page.render({ canvasContext: ctx, canvas: cv, viewport: vp }).promise;

      let card = null;
      try { card = await pfFindCardRect(page, vp1, lib.OPS); } catch (e) { console.warn('カードの位置がわかりませんでした', e); }

      const pad = 0.004;
      const bmp = card && opt.crop
        ? await pfCropBitmap(cv, card.x0 - pad, card.y0 - pad, card.x1 + pad, card.y1 + pad)
        : await createImageBitmap(cv);
      pages.push({ bmp, card: !!card });
      page.cleanup();
      onPage?.(i, doc.numPages);
    }
  } finally {
    await task.destroy();
  }
  return pages;
}

function pfPushItem(o) {
  if (!PF.units.includes(o.unit)) PF.units.push(o.unit);
  PF.items.push({ id: ++PF.seq, thumb: pfThumb(o.bmp), ...o });
}

/*
 * files: [{ file, path }]
 * opt: { unit, rule, pdfRule: 'order'|'none', pdfPer, crop, onProgress(msg) }
 */
async function pfAddFiles(files, opt) {
  const isPdf = (f) => PF_PDF_EXT.test(f.path) || f.file.type === 'application/pdf';
  const isImg = (f) => PF_IMAGE_EXT.test(f.path) || /^image\//.test(f.file.type);
  const list = files.filter((f) => isPdf(f) || isImg(f)).sort((a, b) => pfNatural(a.path, b.path));
  const res = { ok: 0, ng: 0, skipped: files.length - list.length, pdfPages: 0, pdfByOrder: 0 };
  let n = 0;
  for (const { file, path } of list) {
    n++;
    const folder = pfParentFolder(path);
    try {
      if (isPdf({ file, path })) {
        const pages = await pfReadPdf(file, (i, t) => opt.onProgress?.(`${n}/${list.length}件目のPDFを読み込み中… ${i}/${t}ページ`), { crop: opt.crop !== false });
        const unit = opt.unit.trim() || (opt.rule !== 'folder' && folder) || pfBaseName(path) || PF_NO_UNIT;
        const per = Math.max(1, opt.pdfPer || 1);
        // ファイル名・フォルダ名に名前があれば PDF 全体をその子に。なければ名簿の順番（またはあとで手で選ぶ）
        const who = pfGuessChild(path, opt.rule);
        const useOrder = opt.rule === 'roster' && !who && PF.roster.length && opt.pdfRule !== 'none';
        const pdfKey = `pdf${++PF.seq}`;
        PF.pdfs.set(pdfKey, { name: path.split('/').pop(), absent: new Set() });
        const added = pages.map((pg, i) => {
          pfPushItem({
            path: `${path}#${String(i + 1).padStart(3, '0')}`, name: `${path.split('/').pop()}（${i + 1}ページ）`,
            unit, child: useOrder ? '' : who, byOrder: false, pdfKey, pdfPath: path, orderSrc: useOrder ? pdfKey : null, bmp: pg.bmp,
            date: file.lastModified ? new Date(file.lastModified) : null,
          });
          return PF.items[PF.items.length - 1];
        });
        if (useOrder) {
          pfFillOrder(added, per);
          res.pdfByOrder += added.filter((it) => it.child).length;
        }
        res.ok += pages.length;
        res.pdfPages += pages.length;
      } else {
        const bmp = await pfLoadBitmap(file);
        const unit = opt.unit.trim() || (opt.rule !== 'folder' && folder) || PF_NO_UNIT;
        pfPushItem({
          path, name: path.split('/').pop(), unit, child: pfGuessChild(path, opt.rule), bmp,
          date: file.lastModified ? new Date(file.lastModified) : null,
        });
        res.ok++;
        opt.onProgress?.(`読み込み中… ${n} / ${list.length}`);
      }
    } catch (e) {
      console.warn('読み込めませんでした', path, e);
      res.ng++;
    }
  }
  return res;
}

/* ドラッグ＆ドロップ（フォルダにも対応） */
async function pfFilesFromDrop(dt) {
  const entries = [...dt.items].map((it) => it.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.length) return [...dt.files].map((file) => ({ file, path: file.name }));
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) {
      const file = await new Promise((res, rej) => entry.file(res, rej));
      out.push({ file, path: entry.fullPath.replace(/^\//, '') });
    } else if (entry.isDirectory) {
      const reader = entry.createReader();
      let batch;
      do {
        batch = await new Promise((res, rej) => reader.readEntries(res, rej));
        for (const e of batch) await walk(e);
      } while (batch.length);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

function pfRemoveItem(id) {
  const i = PF.items.findIndex((it) => it.id === id);
  if (i >= 0) {
    const key = PF.items[i].pdfKey;
    PF.items[i].bmp.close?.();
    PF.items.splice(i, 1);
    if (key && !PF.items.some((it) => it.pdfKey === key)) PF.pdfs.delete(key);
  }
  pfPruneUnits();
}
function pfClear() {
  PF.items.forEach((it) => it.bmp.close?.());
  PF.items = [];
  PF.units = [];
  PF.pdfs.clear();
}
function pfPruneUnits() {
  PF.units = PF.units.filter((u) => PF.items.some((it) => it.unit === u));
}

/* ---------- ページ構成 ---------- */
function pfChildOrder() {
  const names = PF.roster.map((r) => r.name);
  for (const it of PF.items) if (it.child && !names.includes(it.child)) names.push(it.child);
  if (PF.items.some((it) => !it.child)) names.push('');
  return names;
}

function pfChunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

/* 観点（カンマ・読点区切り）と、その略称（先頭の1文字。3文字以下ならそのまま） */
function pfKanten(o) {
  const list = String(o.kanten || '').split(/[,、，\n]/).map((x) => x.trim()).filter(Boolean).slice(0, 5);
  const labels = list.length ? list : ['知識・技能', '思考・判断・表現', '主体的に学習に取り組む態度'];
  return labels.map((label) => ({ label, abbr: label.length <= 3 ? label : label[0] }));
}

/* 1人8枚をこえた画像の id（単元の順・ファイル順で9枚目以降）。未分類は数えない */
function pfOverLimit() {
  const unitIdx = (u) => PF.units.indexOf(u);
  const by = new Map();
  for (const it of PF.items) {
    if (!it.child) continue;
    if (!by.has(it.child)) by.set(it.child, []);
    by.get(it.child).push(it);
  }
  const over = new Set();
  for (const its of by.values()) {
    its.sort((a, b) => unitIdx(a.unit) - unitIdx(b.unit) || pfNatural(a.path, b.path));
    its.slice(PF_MAX_PER_CHILD).forEach((it) => over.add(it.id));
  }
  return over;
}

function pfBuildGroups(o) {
  const unitIdx = (u) => PF.units.indexOf(u);
  const over = pfOverLimit();
  const items = PF.items.filter((it) => !over.has(it.id));
  const children = pfChildOrder();
  const childIdx = (c) => children.indexOf(c);
  const groups = [];
  if (o.group === 'unit') {
    for (const u of PF.units) {
      const its = items.filter((it) => it.unit === u)
        .sort((a, b) => childIdx(a.child) - childIdx(b.child) || pfNatural(a.path, b.path));
      if (!its.length) continue;
      const pages = [];
      if (o.sheet) {
        // 評価一覧表：名簿の全員（未提出もふくむ）＋名簿外で提出のある子
        const rows = children.filter((c) => c !== '' || its.some((it) => !it.child)).map((c) => {
          const r = PF.roster.find((x) => x.name === c);
          return { num: r?.num ?? '', name: c || PF_UNSORTED, count: its.filter((it) => it.child === c).length };
        });
        pages.push({ kind: 'evalUnit', heading: u, rows });
      }
      pfChunk(its, o.perPage).forEach((ch) => pages.push({ kind: 'items', heading: u, items: ch, caption: (it) => it.child || PF_UNSORTED }));
      groups.push({ key: u, pages });
    }
  } else {
    for (const name of children) {
      const its = items.filter((it) => it.child === name)
        .sort((a, b) => unitIdx(a.unit) - unitIdx(b.unit) || pfNatural(a.path, b.path));
      if (!its.length) continue;
      const title = name || PF_UNSORTED;
      const r = PF.roster.find((x) => x.name === name);
      const pages = [];
      if (name) {
        // 1人1ページ：評価の表・所見メモ（小）・提出物（最大8枚）
        const units = [];
        for (const it of its) {
          const u = units.find((x) => x.name === it.unit);
          if (u) u.count++; else units.push({ name: it.unit, count: 1 });
        }
        pages.push({ kind: 'childOne', heading: title, units, items: its, caption: (it) => it.unit });
        groups.push({ key: title, num: r?.num ?? null, pages });
        continue;
      }
      if (o.sheet) {
        const units = [];
        for (const it of its) {
          const u = units.find((x) => x.name === it.unit);
          if (u) u.count++; else units.push({ name: it.unit, count: 1 });
        }
        pages.push({ kind: 'evalChild', heading: title, num: r?.num ?? null, units });
      }
      pfChunk(its, o.perPage).forEach((ch) => pages.push({ kind: 'items', heading: title, items: ch, caption: (it) => it.unit }));
      groups.push({ key: title, num: r?.num ?? null, pages });
    }
  }
  // 評価一覧表が1ページに入りきらないときは分ける
  for (const g of groups) {
    const out = [];
    for (const p of g.pages) {
      if (p.kind !== 'evalUnit') { out.push(p); continue; }
      const per = pfEvalRowsPerPage(o);
      const total = p.rows.length;
      const missing = p.rows.filter((r) => !r.count).length;
      pfChunk(p.rows, per).forEach((rows, i, all) => out.push({ ...p, rows, total, missing, part: all.length > 1 ? `${i + 1}/${all.length}` : '' }));
    }
    g.pages = out;
  }
  groups.forEach((g) => g.pages.forEach((p, i) => { p.label = `${g.key}　${i + 1} / ${g.pages.length}`; }));
  return groups;
}

const PF_M = 70; // 余白
const PF_TABLE_TOP = PF_M + 150;
const PF_ROW_H = 50;
function pfEvalRowsPerPage(o) {
  const [, H] = PF_PAPER[o.paper] || PF_PAPER.a4p;
  return Math.max(5, Math.floor((H - PF_M - 40 - PF_TABLE_TOP - 64) / PF_ROW_H));
}

/* ---------- 描画（canvas） ---------- */
function pfFont(weight, size) {
  return `${weight} ${Math.round(size)}px ${FONT_STACK}`;
}
function pfFitText(ctx, str, weight, size, maxW, min = size * 0.5) {
  let s = size;
  ctx.font = pfFont(weight, s);
  while (s > min && ctx.measureText(str).width > maxW) {
    s *= 0.93;
    ctx.font = pfFont(weight, s);
  }
  return s;
}
function pfWrap(ctx, str, maxW) {
  const lines = [];
  let cur = '';
  for (const ch of String(str)) {
    if (cur && ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}
function pfRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r); else ctx.rect(x, y, w, h);
}
function pfGrid(per, portrait) {
  return { 1: [1, 1], 2: portrait ? [1, 2] : [2, 1], 4: [2, 2], 6: portrait ? [2, 3] : [3, 2] }[per] || [1, 1];
}
const pfDateText = (d) => (d ? `${d.getMonth() + 1}/${d.getDate()}` : '');
const PF_C = { ink: '#1F2937', sub: '#6B7280', rule: '#D1D5DB', line: '#9CA3AF', head: '#F3F4F6', faint: '#C3CAD3', red: '#DC2626' };

/* 見出し（左に名前・単元、右に学級・タイトル、取扱注意） */
function pfDrawHeader(ctx, W, heading, sub, o) {
  const m = PF_M;
  const meta = [o.klass, o.title].filter(Boolean).join('　');
  let right = W - m;
  if (o.confidential) {
    ctx.font = pfFont(700, 22);
    const tw = ctx.measureText('取扱注意').width + 24;
    ctx.strokeStyle = PF_C.red;
    ctx.lineWidth = 2.5;
    pfRoundRect(ctx, right - tw, m + 8, tw, 40, 6);
    ctx.stroke();
    ctx.fillStyle = PF_C.red;
    ctx.textAlign = 'center';
    ctx.fillText('取扱注意', right - tw / 2, m + 36);
    right -= tw + 16;
  }
  let metaW = 0;
  if (meta) {
    ctx.textAlign = 'right';
    ctx.fillStyle = PF_C.sub;
    pfFitText(ctx, meta, 400, 24, W * 0.35);
    metaW = ctx.measureText(meta).width + 20;
    ctx.fillText(meta, right, m + 36);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = PF_C.ink;
  const hs = pfFitText(ctx, heading, 700, 44, right - m - metaW - 20);
  ctx.fillText(heading, m, m + 40);
  if (sub) {
    const hw = ctx.measureText(heading).width;
    ctx.font = pfFont(700, 26);
    ctx.fillStyle = PF_C.sub;
    ctx.fillText(sub, m + hw + 18, m + 40 - (44 - hs) * 0.3);
  }
  ctx.strokeStyle = PF_C.rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(m, m + 66);
  ctx.lineTo(W - m, m + 66);
  ctx.stroke();
}

function pfDrawFooter(ctx, W, H, label) {
  ctx.textAlign = 'right';
  ctx.fillStyle = PF_C.sub;
  ctx.font = pfFont(400, 20);
  ctx.fillText(label, W - PF_M, H - PF_M * 0.45);
}

/* 表を描く。cols: [{ title, w, align, kanten }]、rows: セルの文字の配列 */
function pfDrawTable(ctx, x, y, cols, rows, rowH, o, cellStyle) {
  const totalW = cols.reduce((a, c) => a + c.w, 0);
  // 見出しは2行まで折り返す
  ctx.font = pfFont(700, 19);
  const heads = cols.map((c) => {
    if ((ctx.font = pfFont(700, 21), ctx.measureText(c.title).width <= c.w - 12)) return { lines: [c.title], size: 21 };
    ctx.font = pfFont(700, 19);
    let lines = pfWrap(ctx, c.title, c.w - 12);
    let size = 19;
    while (lines.length > 2 && size > 12) {
      size -= 1;
      ctx.font = pfFont(700, size);
      lines = pfWrap(ctx, c.title, c.w - 12);
    }
    return { lines: lines.slice(0, 2), size };
  });
  const hh = heads.some((h) => h.lines.length > 1) ? Math.max(rowH, 64) : Math.max(rowH, 44);
  ctx.fillStyle = PF_C.head;
  ctx.fillRect(x, y, totalW, hh);
  ctx.textBaseline = 'middle';
  let cx = x;
  cols.forEach((c, i) => {
    const { lines, size } = heads[i];
    ctx.fillStyle = PF_C.ink;
    ctx.textAlign = 'center';
    ctx.font = pfFont(700, size);
    const lh = size * 1.2;
    lines.forEach((l, j) => ctx.fillText(l, cx + c.w / 2, y + hh / 2 + (j - (lines.length - 1) / 2) * lh));
    cx += c.w;
  });
  rows.forEach((cells, ri) => {
    const ry = y + hh + ri * rowH;
    cx = x;
    cols.forEach((c, ci) => {
      const v = cells[ci];
      const st = cellStyle?.(ri, ci, v) || {};
      if (c.kanten && !v && o.abc) {
        ctx.fillStyle = PF_C.faint;
        ctx.textAlign = 'center';
        ctx.font = pfFont(700, Math.min(22, rowH * 0.42));
        ctx.fillText('A　B　C', cx + c.w / 2, ry + rowH / 2);
      } else if (v !== '' && v !== null && v !== undefined) {
        ctx.fillStyle = st.color || PF_C.ink;
        ctx.textAlign = c.align || 'left';
        const str = String(v);
        pfFitText(ctx, str, st.weight || 400, Math.min(24, rowH * 0.46), c.w - 16, 11);
        ctx.fillText(str, c.align === 'center' ? cx + c.w / 2 : cx + 10, ry + rowH / 2);
      }
      cx += c.w;
    });
  });
  // 罫線
  const th = hh + rows.length * rowH;
  ctx.strokeStyle = PF_C.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, totalW, th);
  for (let i = 0; i <= rows.length; i++) {
    ctx.beginPath();
    ctx.moveTo(x, y + hh + i * rowH);
    ctx.lineTo(x + totalW, y + hh + i * rowH);
    ctx.stroke();
  }
  cx = x;
  cols.slice(0, -1).forEach((c) => {
    cx += c.w;
    ctx.beginPath();
    ctx.moveTo(cx, y);
    ctx.lineTo(cx, y + th);
    ctx.stroke();
  });
  ctx.textBaseline = 'alphabetic';
  return y + th;
}

/* 罫線入りの記入欄 */
function pfMemoBox(ctx, x, y, w, h, label, compact = false) {
  ctx.strokeStyle = PF_C.line;
  ctx.lineWidth = 2;
  pfRoundRect(ctx, x, y, w, h, compact ? 10 : 14);
  ctx.stroke();
  ctx.fillStyle = PF_C.ink;
  ctx.textAlign = 'left';
  ctx.font = pfFont(700, compact ? 20 : 24);
  ctx.fillText(label, x + (compact ? 14 : 20), y + (compact ? 30 : 40));
  ctx.strokeStyle = PF_C.rule;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([8, 7]);
  const first = compact ? 62 : 100, step = compact ? 40 : 56;
  for (let ly = y + first; ly < y + h - 12; ly += step) {
    ctx.beginPath();
    ctx.moveTo(x + 20, ly);
    ctx.lineTo(x + w - 20, ly);
    ctx.stroke();
  }
  ctx.setLineDash([]);
}

function pfDrawPage(ctx, p, W, H, o) {
  const m = PF_M;
  const kanten = pfKanten(o);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';

  if (p.kind === 'evalChild') {
    pfDrawHeader(ctx, W, p.heading, '評価シート', o);
    const top = m + 110;
    const avail = W - m * 2;
    const kw = Math.min(150, avail * 0.12);
    const cntW = 80;
    const unitW = Math.max(220, avail * 0.26);
    const memoW = avail - unitW - cntW - kw * kanten.length;
    const cols = [
      { title: '単元', w: unitW },
      { title: '枚数', w: cntW, align: 'center' },
      ...kanten.map((k) => ({ title: k.label, w: kw, kanten: true })),
      { title: 'メモ', w: memoW },
    ];
    const tableMax = H * (W > H ? 0.58 : 0.6) - top;
    const rowH = Math.max(42, Math.min(96, tableMax / (p.units.length + 1)));
    const rows = p.units.map((u) => [u.name, `${u.count}`, ...kanten.map(() => ''), '']);
    const end = pfDrawTable(ctx, m, top, cols, rows, rowH, o);
    const boxTop = end + 36;
    pfMemoBox(ctx, m, boxTop, avail, H - m - 40 - boxTop, '所見メモ');
    pfDrawFooter(ctx, W, H, p.label);
    return;
  }

  if (p.kind === 'evalUnit') {
    pfDrawHeader(ctx, W, p.heading, `評価一覧${p.part ? `（${p.part}）` : ''}`, o);
    const avail = W - m * 2;
    const kw = Math.min(150, avail * 0.12);
    const numW = 70, subW = 100;
    const nameW = Math.max(200, avail * 0.2);
    const memoW = avail - numW - nameW - subW - kw * kanten.length;
    const cols = [
      { title: '番号', w: numW, align: 'center' },
      { title: '名前', w: nameW },
      { title: '提出', w: subW, align: 'center' },
      ...kanten.map((k) => ({ title: k.label, w: kw, kanten: true })),
      { title: 'メモ', w: memoW },
    ];
    const rows = p.rows.map((r) => [r.num, r.name, r.count ? `${r.count}枚` : '未提出', ...kanten.map(() => ''), '']);
    const { total, missing } = p;
    ctx.fillStyle = PF_C.sub;
    ctx.textAlign = 'left';
    ctx.font = pfFont(400, 22);
    ctx.fillText(`${total}人中　提出 ${total - missing}人　未提出 ${missing}人`, m, m + 112);
    pfDrawTable(ctx, m, PF_TABLE_TOP, cols, rows, PF_ROW_H, o, (ri, ci, v) => (v === '未提出' ? { color: PF_C.red, weight: 700 } : null));
    pfDrawFooter(ctx, W, H, p.label);
    return;
  }

  if (p.kind === 'childOne') {
    pfDrawHeader(ctx, W, p.heading, o.sheet ? '評価シート' : '', o);
    const avail = W - m * 2;
    let y = m + 90;
    if (o.sheet) {
      const kw = Math.min(150, avail * 0.12);
      const cntW = 70;
      const unitW = Math.max(220, avail * 0.26);
      const cols = [
        { title: '単元', w: unitW },
        { title: '枚数', w: cntW, align: 'center' },
        ...kanten.map((k) => ({ title: k.label, w: kw, kanten: true })),
        { title: 'メモ', w: avail - unitW - cntW - kw * kanten.length },
      ];
      const rowH = H > W ? 40 : 34;
      y = pfDrawTable(ctx, m, y, cols, p.units.map((u) => [u.name, `${u.count}`, ...kanten.map(() => ''), '']), rowH, o) + 14;
      const memoH = H > W ? 132 : 92;
      pfMemoBox(ctx, m, y, avail, memoH, '所見メモ', true);
      y += memoH + 20;
    }
    if (o.scores) y = pfDrawScores(ctx, m, y, avail, o) + 20;
    pfDrawItems(ctx, p, m, y, avail, H - m - 24 - y, pfBestGrid(p.items, avail, H - m - 24 - y), o, kanten, true);
    pfDrawFooter(ctx, W, H, p.label);
    return;
  }

  // 提出物のページ
  pfDrawHeader(ctx, W, p.heading, '', o);
  const top = m + 96, bottom = H - m - 24;
  pfDrawItems(ctx, p, m, top, W - m * 2, bottom - top, pfGrid(o.perPage, H > W), o, kanten, false);
  pfDrawFooter(ctx, W, H, p.label);
}

/* ペーパーテストの点数欄（手書き用）。テスト名が空なら6回分の空欄 */
function pfDrawScores(ctx, x, y, w, o) {
  const names = String(o.scoreNames || '').split(/[,、，\n]/).map((s) => s.trim()).filter(Boolean).slice(0, 10);
  const n = names.length || 6;
  const labelW = 130;
  const cw = (w - labelW) / n;
  const h1 = 38, h2 = 56;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PF_C.ink;
  ctx.textAlign = 'left';
  ctx.font = pfFont(700, 20);
  ctx.fillText('ペーパーテスト', x + 2, y + 14);
  const top = y + 32;
  ctx.fillStyle = PF_C.head;
  ctx.fillRect(x, top, labelW, h1 + h2);
  ctx.fillRect(x + labelW, top, w - labelW, h1);
  ctx.fillStyle = PF_C.ink;
  ctx.textAlign = 'center';
  ctx.font = pfFont(700, 19);
  ctx.fillText('テスト名', x + labelW / 2, top + h1 / 2);
  ctx.fillText('点数', x + labelW / 2, top + h1 + h2 / 2);
  for (let i = 0; i < n; i++) {
    const cx = x + labelW + i * cw;
    if (names[i]) {
      ctx.fillStyle = PF_C.ink;
      ctx.textAlign = 'center';
      pfFitText(ctx, names[i], 700, 19, cw - 12, 10);
      ctx.fillText(names[i], cx + cw / 2, top + h1 / 2);
    }
    ctx.fillStyle = PF_C.sub;
    ctx.textAlign = 'right';
    ctx.font = pfFont(400, 17);
    ctx.fillText('点', cx + cw - 8, top + h1 + h2 - 14);
  }
  ctx.strokeStyle = PF_C.line;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, top, w, h1 + h2);
  ctx.beginPath();
  ctx.moveTo(x, top + h1);
  ctx.lineTo(x + w, top + h1);
  for (let i = 0; i < n; i++) {
    ctx.moveTo(x + labelW + i * cw, top);
    ctx.lineTo(x + labelW + i * cw, top + h1 + h2);
  }
  ctx.stroke();
  ctx.textBaseline = 'alphabetic';
  return top + h1 + h2;
}

/* 画像がいちばん大きく見える列数を選ぶ（枚数とカードの縦横から） */
function pfBestGrid(items, w, h) {
  const n = Math.max(1, items.length);
  const ar = items.reduce((a, it) => a + it.bmp.width / it.bmp.height, 0) / n || 1.4;
  let best = [1, n], bestS = -1;
  for (let c = 1; c <= Math.min(4, n); c++) {
    const r = Math.ceil(n / c);
    const cw = (w - 20 * (c - 1)) / c;
    const ih = (h - 20 * (r - 1)) / r - 34 - 48;
    const s = Math.min(cw / ar, ih);
    if (s > bestS) { bestS = s; best = [c, r]; }
  }
  return best;
}

function pfDrawItems(ctx, p, x0, top, aw, ah, [cols, rows], o, kanten, compact) {
  const gap = compact ? 20 : 30, capH = compact ? 34 : 42;
  const memoH = o.memo ? (compact ? 48 : 58) : 0;
  const capSize = compact ? 20 : 24;
  const cw = (aw - gap * (cols - 1)) / cols;
  const ch = (ah - gap * (rows - 1)) / rows;
  p.items.forEach((it, i) => {
    const cx = x0 + (i % cols) * (cw + gap);
    const cy = top + Math.floor(i / cols) * (ch + gap);
    const ih = ch - capH - memoH;
    const sc = Math.min(cw / it.bmp.width, ih / it.bmp.height);
    const dw = it.bmp.width * sc, dh = it.bmp.height * sc;
    const dx = cx + (cw - dw) / 2, dy = cy + (ih - dh) / 2;
    ctx.drawImage(it.bmp, dx, dy, dw, dh);
    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 2;
    ctx.strokeRect(dx, dy, dw, dh);
    const cap = [p.caption(it), o.showDate ? pfDateText(it.date) : ''].filter(Boolean).join('　');
    ctx.textAlign = 'center';
    ctx.fillStyle = PF_C.ink;
    pfFitText(ctx, cap, 700, capSize, cw - 10);
    const capY = cy + ih + capH - 10;
    ctx.fillText(cap, cx + cw / 2, capY);
    if (o.memo) pfDrawItemMemo(ctx, cx, capY + 10, cw, memoH - 10, kanten, o);
  });
}

/* 画像の下の評価メモ欄：［知 A B C］［思 A B C］…　メモ＿＿＿ */
function pfDrawItemMemo(ctx, x, y, w, h, kanten, o) {
  const bw = Math.min(150, (w * 0.62) / kanten.length);
  ctx.textBaseline = 'middle';
  kanten.forEach((k, i) => {
    const bx = x + i * (bw + 6);
    ctx.strokeStyle = PF_C.line;
    ctx.lineWidth = 1.5;
    pfRoundRect(ctx, bx, y, bw, h, 8);
    ctx.stroke();
    ctx.fillStyle = PF_C.head;
    pfRoundRect(ctx, bx, y, Math.min(44, bw * 0.32), h, 8);
    ctx.fill();
    ctx.fillStyle = PF_C.ink;
    ctx.textAlign = 'center';
    const lw = Math.min(44, bw * 0.32);
    pfFitText(ctx, k.abbr, 700, 20, lw - 6, 10);
    ctx.fillText(k.abbr, bx + lw / 2, y + h / 2);
    if (o.abc) {
      ctx.fillStyle = PF_C.faint;
      pfFitText(ctx, 'A B C', 700, 19, bw - lw - 8, 10);
      ctx.fillText('A B C', bx + lw + (bw - lw) / 2, y + h / 2);
    }
  });
  const mx = x + kanten.length * (bw + 6) + 8;
  if (x + w - mx > 90) {
    ctx.fillStyle = PF_C.sub;
    ctx.textAlign = 'left';
    ctx.font = pfFont(700, 19);
    ctx.fillText('メモ', mx, y + h / 2);
    ctx.strokeStyle = PF_C.line;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(mx + 48, y + h - 6);
    ctx.lineTo(x + w, y + h - 6);
    ctx.stroke();
  }
  ctx.textBaseline = 'alphabetic';
}

function pfRenderCanvas(p, o, scale = 1) {
  const [W, H] = PF_PAPER[o.paper] || PF_PAPER.a4p;
  const cv = document.createElement('canvas');
  cv.width = Math.round(W * scale);
  cv.height = Math.round(H * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale);
  pfDrawPage(ctx, p, W, H, o);
  return cv;
}

async function pfPagesToPdf(pages, o, onProgress) {
  const [W, H] = PF_PAPER[o.paper] || PF_PAPER.a4p;
  const [pw, ph] = PF_PT[o.paper] || PF_PT.a4p;
  const out = [];
  for (let i = 0; i < pages.length; i++) {
    const blob = await canvasBlob(pfRenderCanvas(pages[i], o), 'image/jpeg', 0.88);
    out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H });
    onProgress?.(i + 1, pages.length);
  }
  return jpegsToPdf(out, pw, ph);
}
