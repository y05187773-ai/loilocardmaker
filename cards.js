'use strict';
/* アンケートカード・テストカードの生成 */

const KEY_COLOR = '#E03131';

const MARKS = {
  kana: { name: 'ア・イ・ウ', list: ['ア', 'イ', 'ウ', 'エ', 'オ', 'カ', 'キ', 'ク'] },
  alpha: { name: 'A・B・C', list: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] },
  num: { name: '1・2・3', list: ['1', '2', '3', '4', '5', '6', '7', '8'] },
};

const SCALES = {
  four: { name: '4段階', labels: ['とてもそう思う', 'そう思う', 'あまりそう思わない', 'そう思わない'] },
  three: { name: '3段階', labels: ['よくできた', 'できた', 'もう少し'] },
  faces: { name: '顔マーク', labels: ['よくできた', 'できた', 'もう少し'], faces: [1, 0, -1] },
  five: { name: '5段階', labels: ['1\nそう思わない', '2', '3', '4', '5\nそう思う'] },
  yesno: { name: 'はい・いいえ', labels: ['はい', 'いいえ'] },
};

/* ---------- 入力テキストの読み取り ---------- */
// 行頭の「1.」「(1)」「問1」などの番号を取りのぞく（「3+5」のような式は残す）
function stripNumber(l) {
  return l.replace(/^\s*(?:問\s*[0-9０-９]+[\.．、:：]?\s*|[\(（][0-9０-９]+[\)）]\s*|[0-9０-９]+[\.．、:：)）](?![0-9０-９])\s*|[①-⑳]\s*)/, '').trim();
}

/* 1行1問。「｜」で区切ると選択肢、「答：」で正答、選択肢の頭に「*」で正答 */
function parseTest(src) {
  return String(src).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const segs = l.split(/\s*[|｜]\s*/);
    const q = stripNumber(segs[0]);
    let answers = [];
    let explain = '';
    let points = null;
    const corrects = [];
    const choices = [];
    for (const sg of segs.slice(1)) {
      if (!sg) continue;
      let m = sg.match(/^答え?\s*[:：]\s*(.*)$/);
      if (m) { answers = m[1].split(/\s*[/／]\s*/).filter(Boolean); continue; }
      m = sg.match(/^解説\s*[:：]\s*(.*)$/);
      if (m) { explain = m[1]; continue; }
      m = sg.match(/^配点\s*[:：]\s*([0-9０-９]+)\s*点?$/);
      if (m) { points = Number(m[1].replace(/[０-９]/g, (d) => '０１２３４５６７８９'.indexOf(d))); continue; }
      if (/^[*＊]/.test(sg)) {
        corrects.push(choices.length);
        choices.push(sg.slice(1).trim());
      } else {
        choices.push(sg);
      }
    }
    if (!corrects.length && answers.length && choices.length) {
      answers.forEach((a) => { const i = choices.indexOf(a); if (i >= 0) corrects.push(i); });
    }
    const answer = choices.length ? corrects.map((i) => choices[i]).join('／') : answers.join('／');
    return { q, choices, corrects, answers, answer, explain, points };
  });
}

/* 1行1問。「自由：」「記述：」で始めると自由記述 */
function parseSurvey(src) {
  return String(src).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const m = l.match(/^(?:自由|記述)\s*[:：]\s*(.*)$/);
    return m ? { q: stripNumber(m[1]), free: true } : { q: stripNumber(l), free: false };
  });
}

/* ---------- 描画の部品 ---------- */
function face(c, cx, cy, R, mood) {
  const fills = { 1: '#FFD8A8', 0: '#FFF1BF', '-1': '#D0E6FF' };
  let s = tag('circle', { cx, cy, r: R, fill: c.T.fills[0] === 'none' ? '#FFFFFF' : fills[mood], ...S(c) });
  s += tag('circle', { cx: cx - R * 0.35, cy: cy - R * 0.18, r: R * 0.1, fill: c.T.stroke });
  s += tag('circle', { cx: cx + R * 0.35, cy: cy - R * 0.18, r: R * 0.1, fill: c.T.stroke });
  const my = cy + R * 0.3;
  s += tag('path', { d: `M ${rnd(cx - R * 0.4)} ${rnd(my)} Q ${rnd(cx)} ${rnd(my + R * 0.45 * mood)} ${rnd(cx + R * 0.4)} ${rnd(my)}`, fill: 'none', ...S(c, 1.1) });
  return s;
}

/* 番号＋問題文。戻り値：{ s, bottom } */
function questionBlock(c, r, num, q, f, maxW) {
  const numSize = f * 0.9;
  const numW = Math.max(numSize * 1.6, measure(String(num), numSize) + numSize * 1.2);
  let s = chip(r.x, r.y + f * 0.72, String(num), c, { anchor: 'start', size: numSize });
  const tx = r.x + numW + f * 0.45;
  const lines = wrap(q || '', f, maxW - numW - f * 0.45).slice(0, 4);
  if (q) s += text(tx, r.y, lines.join('\n'), { size: f, anchor: 'start', valign: 'top', fill: c.T.text });
  return { s, bottom: r.y + Math.max(f * 1.45, lines.length * f * 1.3) };
}

function answerBox(c, x, y, w, h, f, o = {}) {
  let s = tag('rect', { x, y, width: w, height: h, rx: f * 0.4, fill: '#FFFFFF', ...S(c, 0.8) });
  if (o.label) s += chip(x + f * 0.4, y + f * 0.85, o.label, c, { anchor: 'start', size: f * 0.65 });
  const top = o.label ? f * 1.7 : 0;
  if (h - top > c.fs * 3) s += rules(c, x, y + top, w, h - top);
  if (o.answer) {
    s += text(x + w / 2, y + top + (h - top) / 2, o.answer, { size: Math.min(f * 1.2, (h - top) * 0.5), maxW: w * 0.9, maxLines: 3, fill: KEY_COLOR });
  }
  return s;
}

function rowFrame(c, r, single) {
  if (single) return '';
  return tag('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: c.fs * 0.5, fill: 'none', stroke: c.T.rule, 'stroke-width': c.sw * 0.6 });
}

/* ---------- テスト ---------- */
function drawTestItem(c, r, item, num, o) {
  const single = o.perPage === 1;
  const pad = single ? 0 : c.fs * 0.6;
  const f = o.f;
  const inner = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
  let s = rowFrame(c, r, single);

  if (item.choices.length) {
    const qb = questionBlock(c, inner, num, item.q, f, inner.w);
    s += qb.s;
    const marks = MARKS[o.marks]?.list || MARKS.kana.list;
    const n = item.choices.length;
    const cf = single ? f * 1.3 : f; // 1問1枚のときは選択肢を大きく
    const mr = cf * 0.72;
    const areaY = qb.bottom + f * 0.5;
    const areaH = inner.y + inner.h - areaY;
    const indent = f * 1.8;
    const availW = inner.w - indent;
    const longest = Math.max(...item.choices.map((ch) => measure(ch, cf * 0.95)));
    const cols = longest + mr * 2 + cf * 1.4 <= availW / n ? n : n <= 2 ? n : Math.min(n, 2);
    const rows = Math.ceil(n / cols);
    const cellW = availW / cols;
    const cellH = Math.min(areaH / rows, cf * (single ? 3.4 : 2.8));
    const startY = areaY + Math.max(0, (areaH - cellH * rows) / 2);
    item.choices.forEach((ch, i) => {
      const cx = inner.x + indent + (i % cols) * cellW;
      const cy = startY + Math.floor(i / cols) * cellH + cellH / 2;
      const hit = o.key && item.corrects.includes(i);
      s += tag('circle', { cx: cx + mr, cy, r: mr, fill: '#FFFFFF', ...S(c, 0.8) });
      s += text(cx + mr, cy, marks[i] ?? String(i + 1), { size: cf * 0.8, fill: c.T.text });
      const tw = cellW - mr * 2 - cf * 1.2;
      const ts = fitSize(ch, cf * 0.95, tw);
      s += text(cx + mr * 2 + cf * 0.4, cy, ch, { size: ts, anchor: 'start', fill: hit ? KEY_COLOR : c.T.text });
      if (hit) s += tag('circle', { cx: cx + mr, cy, r: mr * 1.35, fill: 'none', stroke: KEY_COLOR, 'stroke-width': c.sw * 1.6 });
    });
    return s;
  }

  const side = !single && inner.w > inner.h * 2.4;
  if (side) {
    const qw = inner.w * 0.6;
    s += questionBlock(c, inner, num, item.q, f, qw).s;
    const bx = inner.x + inner.w * 0.63;
    s += answerBox(c, bx, inner.y, inner.x + inner.w - bx, inner.h, f, { answer: o.key ? item.answer : '' });
  } else {
    const qb = questionBlock(c, inner, num, item.q, f, inner.w);
    s += qb.s;
    const by = qb.bottom + f * 0.6;
    s += answerBox(c, inner.x, by, inner.w, inner.y + inner.h - by, f, { label: 'こたえ', answer: o.key ? item.answer : '' });
  }
  return s;
}

/* ---------- アンケート ---------- */
function drawSurveyItem(c, r, item, num, o) {
  const single = o.perPage === 1;
  const pad = single ? 0 : c.fs * 0.6;
  const f = o.f;
  const inner = { x: r.x + pad, y: r.y + pad, w: r.w - pad * 2, h: r.h - pad * 2 };
  let s = rowFrame(c, r, single);
  const qb = questionBlock(c, inner, num, item.q, f, inner.w);
  s += qb.s;
  const areaY = qb.bottom + f * 0.4;
  const areaH = inner.y + inner.h - areaY;

  if (item.free) {
    s += answerBox(c, inner.x, areaY + f * 0.2, inner.w, areaH - f * 0.2, f);
    return s;
  }

  const sc = SCALES[o.answerScale] || SCALES.four;
  const k = sc.labels.length;
  const indent = f * 1.8;
  const cellW = Math.min((inner.w - indent) / k, f * 9);
  const startX = inner.x + indent + ((inner.w - indent) - cellW * k) / 2;
  const ls = f * 0.75;
  const labelLines = Math.max(...sc.labels.map((l) => wrap(l, ls, cellW * 0.92).length));
  const R = sc.faces ? Math.min(f * (single ? 2.2 : 1.6), areaH * 0.32) : Math.min(f * (single ? 1.1 : 0.8), areaH * 0.25);
  const blockH = R * 2 + f * 0.35 + labelLines * ls * 1.3;
  const top = areaY + Math.max(0, (areaH - blockH) / 2);
  sc.labels.forEach((lab, i) => {
    const cx = startX + cellW * (i + 0.5);
    const cy = top + R;
    s += sc.faces ? face(c, cx, cy, R, sc.faces[i]) : tag('circle', { cx, cy, r: R, fill: '#FFFFFF', ...S(c) });
    s += text(cx, cy + R + f * 0.35, lab, { size: ls, maxW: cellW * 0.92, valign: 'top', fill: c.T.text });
  });
  return s;
}

/* ---------- ページ分け ---------- */
function paginate(items, perPage) {
  const pages = [];
  for (let i = 0; i < items.length; i += perPage) pages.push(items.slice(i, i + perPage));
  return pages.length ? pages : [[]];
}

function layoutRows(c, count, perPage, drawRow) {
  const gap = c.fs * 0.5;
  const k = Math.max(1, perPage);
  const rh = (c.h - gap * (k - 1)) / k;
  const f = c.fs * Math.min(k === 1 ? 1.3 : 1, rh / (c.fs * 4.6));
  let s = '';
  for (let i = 0; i < count; i++) s += drawRow({ x: c.x, y: c.y + i * (rh + gap), w: c.w, h: rh }, i, f);
  return s;
}

function renderPagesFor(items, o, drawItem, extra = {}) {
  const pages = paginate(items, o.perPage);
  return pages.map((pg, pi) => renderFrame({
    ...o,
    pageLabel: pages.length > 1 ? `${pi + 1} / ${pages.length}${extra.suffix || ''}` : (extra.suffix ? extra.suffix.trim() : ''),
  }, (c) => layoutRows(c, pg.length, o.perPage, (r, i, f) => drawItem(c, r, pg[i], pi * o.perPage + i + 1, { ...o, f }))));
}

function renderTestPages(o) {
  const items = parseTest(o.text);
  if (!items.length) return [renderFrame(o, (c) => text(c.x + c.w / 2, c.y + c.h / 2, '左の欄に問題を入力してください', { size: c.fs, fill: c.T.sub, weight: 400 }))];
  const pages = renderPagesFor(items, o, drawTestItem);
  if (o.answerKey) {
    const keyTitle = `${o.title || 'テスト'}（解答）`;
    pages.push(...renderPagesFor(items, { ...o, title: keyTitle, key: true, showName: false, showScore: false }, drawTestItem, { suffix: '' }));
  }
  return pages;
}

function renderSurveyPages(o) {
  const items = parseSurvey(o.text);
  if (o.comment && o.commentText?.trim()) items.push({ q: o.commentText.trim(), free: true });
  if (!items.length) return [renderFrame(o, (c) => text(c.x + c.w / 2, c.y + c.h / 2, '左の欄に質問を入力してください', { size: c.fs, fill: c.T.sub, weight: 400 }))];
  return renderPagesFor(items, o, drawSurveyItem);
}
