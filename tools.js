'use strict';
/* シンキングツールの描画定義（SVG文字列を生成） */

const FONT_STACK = `"BIZ UDPGothic","Hiragino Maru Gothic ProN","Hiragino Sans","Noto Sans JP","Noto Sans CJK JP","Yu Gothic","Meiryo",sans-serif`;

const THEMES = {
  color: {
    fills: ['#FFE0E0', '#D9ECFF', '#DFF3D8', '#FFF1BF', '#ECE0FA', '#FFE3CC', '#D6F2EF', '#F7DDEB', '#E4E9F0'],
    opacity: 0.8,
    stroke: '#3B4859',
    text: '#1F2937',
    chip: '#3B4859',
    chipText: '#FFFFFF',
    accent: '#E8553E',
    rule: '#A7B1BE',
    sub: '#6B7785',
  },
  mono: {
    fills: ['none'],
    opacity: 1,
    stroke: '#222222',
    text: '#111111',
    chip: '#FFFFFF',
    chipText: '#111111',
    chipStroke: '#222222',
    accent: '#222222',
    rule: '#9A9A9A',
    sub: '#555555',
  },
};

/* ---------- 基本ヘルパー ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rnd = (v) => Math.round(v * 10) / 10;

function tag(name, attrs = {}, inner = null) {
  let s = '<' + name;
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    s += ` ${k}="${typeof v === 'number' ? rnd(v) : esc(v)}"`;
  }
  return inner === null ? s + '/>' : s + '>' + inner + '</' + name + '>';
}

let _mctx = null;
function measure(str, size, weight = 700) {
  if (!_mctx) _mctx = document.createElement('canvas').getContext('2d');
  _mctx.font = `${weight} ${size}px ${FONT_STACK}`;
  return _mctx.measureText(str).width;
}

const NO_LINE_START = '、。，．・：；？！ー）」』】〉》ぁぃぅぇぉっゃゅょァィゥェォッャュョ';
function wrap(str, size, maxW, weight = 700) {
  const lines = [];
  for (const para of String(str).split('\n')) {
    let cur = '';
    for (const ch of para) {
      if (cur && measure(cur + ch, size, weight) > maxW && !NO_LINE_START.includes(ch)) {
        lines.push(cur);
        cur = ch;
      } else {
        cur += ch;
      }
    }
    lines.push(cur);
  }
  return lines;
}

function fitSize(str, size, maxW, weight = 700, min = size * 0.5) {
  let s = size;
  while (s > min && measure(str, s, weight) > maxW) s *= 0.93;
  return s;
}

/* 複数行テキスト。valign: top | middle | bottom */
function text(x, y, str, o = {}) {
  if (!str) return '';
  const size = o.size;
  const weight = o.weight ?? 700;
  const lh = size * 1.3;
  let lines = o.maxW ? wrap(str, size, o.maxW, weight) : String(str).split('\n');
  if (o.maxLines && lines.length > o.maxLines) lines = lines.slice(0, o.maxLines);
  const valign = o.valign ?? 'middle';
  const y0 = valign === 'top' ? y + size * 0.88
    : valign === 'bottom' ? y - (lines.length - 1) * lh - size * 0.2
    : y - ((lines.length - 1) * lh) / 2 + size * 0.36;
  const tspans = lines.map((l, i) => tag('tspan', { x, y: y0 + i * lh }, esc(l))).join('');
  return tag('text', {
    'font-size': size, 'font-weight': weight, 'text-anchor': o.anchor ?? 'middle', fill: o.fill ?? '#1F2937',
  }, tspans);
}

/* 丸いラベル（チップ）。(x, y) は anchor 位置・縦中央 */
function chip(x, y, str, c, o = {}) {
  if (!str) return '';
  const T = c.T;
  let size = o.size ?? c.fs * 0.9;
  if (o.maxW) size = fitSize(str, size, o.maxW - size * 1.2);
  const tw = measure(str, size);
  const padX = size * 0.6;
  const hgt = size * 1.6;
  const wdt = tw + padX * 2;
  const anchor = o.anchor ?? 'middle';
  const rx = anchor === 'middle' ? x - wdt / 2 : anchor === 'start' ? x : x - wdt;
  return tag('rect', {
    x: rx, y: y - hgt / 2, width: wdt, height: hgt, rx: hgt / 2,
    fill: o.fill ?? T.chip, stroke: T.chipStroke, 'stroke-width': T.chipStroke ? c.sw * 0.7 : null,
  }) + tag('text', {
    x: rx + wdt / 2, y: y + size * 0.36, 'font-size': size, 'font-weight': 700, 'text-anchor': 'middle', fill: o.color ?? T.chipText,
  }, esc(str));
}

const F = (c, i) => (c.T.fills[0] === 'none'
  ? { fill: 'none' }
  : { fill: c.T.fills[i % c.T.fills.length], 'fill-opacity': c.T.opacity });
const S = (c, k = 1) => ({ stroke: c.T.stroke, 'stroke-width': c.sw * k, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' });
const pts = (arr) => arr.map((p) => `${rnd(p[0])},${rnd(p[1])}`).join(' ');
const poly = (arr, attrs) => tag('polygon', { points: pts(arr), ...attrs });
const line = (x1, y1, x2, y2, attrs) => tag('line', { x1, y1, x2, y2, ...attrs });

/* 書く欄の罫線 */
function rules(c, x, y, w, h) {
  if (!c.ruled) return '';
  const gap = c.fs * 1.75;
  let s = '';
  for (let yy = y + gap; yy < y + h - gap * 0.35; yy += gap) {
    s += line(x + c.fs * 0.6, yy, x + w - c.fs * 0.6, yy, {
      stroke: c.T.rule, 'stroke-width': c.sw * 0.45, 'stroke-dasharray': `${rnd(c.fs * 0.35)} ${rnd(c.fs * 0.3)}`,
    });
  }
  return s;
}

/* 矢じり（angle: ラジアン、先端が (x, y)） */
function arrowHead(c, x, y, angle, size) {
  const a1 = angle + Math.PI * 0.82;
  const a2 = angle - Math.PI * 0.82;
  return poly([
    [x, y],
    [x + Math.cos(a1) * size, y + Math.sin(a1) * size],
    [x + Math.cos(a2) * size, y + Math.sin(a2) * size],
  ], { fill: c.T.stroke, ...S(c, 0.6) });
}

/* 表形式（Tチャート・KWL・PMI 共通） */
function drawTable(c) {
  const { x, y, w, h, L, fs, n } = c;
  const hh = fs * 2.3;
  const cw = w / n;
  let s = '';
  for (let i = 0; i < n; i++) {
    const cx = x + i * cw;
    if (c.T.fills[0] !== 'none') s += tag('rect', { x: cx, y, width: cw, height: hh, fill: c.T.fills[i % c.T.fills.length] });
    const str = L[i];
    if (str) {
      const size = fitSize(str, fs * 1.0, cw * 0.9);
      s += text(cx + cw / 2, y + hh / 2, str, { size, fill: c.T.text });
    }
    s += rules(c, cx, y + hh, cw, h - hh);
  }
  s += tag('rect', { x, y, width: w, height: h, fill: 'none', ...S(c) });
  s += line(x, y + hh, x + w, y + hh, S(c));
  for (let i = 1; i < n; i++) s += line(x + i * cw, y, x + i * cw, y + h, S(c));
  return s;
}

/* ---------- ツール定義 ---------- */
const TOOLS = [
  {
    id: 'venn2', name: 'ベン図', sub: '2つをくらべる', skill: '比較する',
    fields: () => [['左の円', '〇〇'], ['右の円', '△△'], ['重なり', 'にているところ']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const cx = x + w / 2, cy = y + h / 2;
      if (h > w * 1.1) {
        // たて向き：上下に並べる
        const r = Math.min(w * 0.49, h * 0.31);
        const d = r * 0.6;
        const cs = [[cx, cy - d], [cx, cy + d]];
        let s = cs.map((p, i) => tag('circle', { cx: p[0], cy: p[1], r, ...F(c, i) })).join('');
        s += cs.map((p) => tag('circle', { cx: p[0], cy: p[1], r, fill: 'none', ...S(c) })).join('');
        s += chip(cx, cy - d - r * 0.62, L[0], c, { maxW: r * 1.1 });
        s += chip(cx, cy + d + r * 0.62, L[1], c, { maxW: r * 1.1 });
        s += chip(cx, cy - r * 0.15, L[2], c, { maxW: r * 1.1, size: fs * 0.75 });
        return s;
      }
      const r = Math.min(h * 0.49, w * 0.3);
      const d = r * 0.6;
      const cs = [[cx - d, cy], [cx + d, cy]];
      let s = cs.map((p, i) => tag('circle', { cx: p[0], cy: p[1], r, ...F(c, i) })).join('');
      s += cs.map((p) => tag('circle', { cx: p[0], cy: p[1], r, fill: 'none', ...S(c) })).join('');
      s += chip(cx - d - r * 0.36, cy - r * 0.6, L[0], c, { maxW: r * 0.8 });
      s += chip(cx + d + r * 0.36, cy - r * 0.6, L[1], c, { maxW: r * 0.8 });
      s += chip(cx, cy - r * 0.42, L[2], c, { maxW: r * 0.6, size: fs * 0.75 });
      return s;
    },
  },
  {
    id: 'venn3', name: 'ベン図（3つ）', sub: '3つをくらべる', skill: '比較する',
    fields: () => [['左上の円', 'A'], ['右上の円', 'B'], ['下の円', 'C'], ['3つの重なり', '']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const k = 0.6;
      const r = Math.min(h / (2 + k * 1.732), w / (2 + 2 * k)) * 0.98;
      const d = r * k;
      const cx = x + w / 2;
      const t = y + (h - (2 * r + d * 1.732)) / 2 + r;
      const cs = [[cx - d, t], [cx + d, t], [cx, t + d * 1.732]];
      let s = cs.map((p, i) => tag('circle', { cx: p[0], cy: p[1], r, ...F(c, i) })).join('');
      s += cs.map((p) => tag('circle', { cx: p[0], cy: p[1], r, fill: 'none', ...S(c) })).join('');
      s += chip(cs[0][0] - r * 0.4, t - r * 0.5, L[0], c, { maxW: r * 0.8 });
      s += chip(cs[1][0] + r * 0.4, t - r * 0.5, L[1], c, { maxW: r * 0.8 });
      s += chip(cx, cs[2][1] + r * 0.62, L[2], c, { maxW: r * 0.9 });
      s += chip(cx, t + d * 0.58, L[3], c, { maxW: r * 0.5, size: fs * 0.7 });
      return s;
    },
  },
  {
    id: 'tchart', name: 'Tチャート', sub: '観点ごとにくらべる', skill: '比較する',
    count: { label: '列の数', options: [2, 3, 4], default: 2 },
    fields: (n) => Array.from({ length: n }, (_, i) => [`列${i + 1}`, ['〇〇', '△△', '□□', '☆☆'][i]]),
    draw: drawTable,
  },
  {
    id: 'xchart', name: 'Xチャート', sub: '4つの観点で分ける', skill: '分類する・多面的に見る',
    fields: () => [['上', '観点1'], ['右', '観点2'], ['下', '観点3'], ['左', '観点4']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const cx = x + w / 2, cy = y + h / 2;
      const P = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
      let s = '';
      for (let i = 0; i < 4; i++) s += poly([P[i], P[(i + 1) % 4], [cx, cy]], F(c, i));
      s += tag('rect', { x, y, width: w, height: h, fill: 'none', ...S(c) });
      s += line(x, y, x + w, y + h, S(c)) + line(x + w, y, x, y + h, S(c));
      const mw = w * 0.28;
      s += chip(cx, y + fs * 1.1, L[0], c, { maxW: mw });
      s += chip(x + w - fs * 0.6, cy, L[1], c, { anchor: 'end', maxW: mw * 0.8 });
      s += chip(cx, y + h - fs * 1.1, L[2], c, { maxW: mw });
      s += chip(x + fs * 0.6, cy, L[3], c, { anchor: 'start', maxW: mw * 0.8 });
      return s;
    },
  },
  {
    id: 'ychart', name: 'Yチャート', sub: '3つの観点で分ける', skill: '分類する・多面的に見る',
    fields: () => [['上', '観点1'], ['左下', '観点2'], ['右下', '観点3']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const cx = x + w / 2, cy = y + h * 0.42;
      let s = '';
      s += poly([[x, y], [x + w, y], [cx, cy]], F(c, 0));
      s += poly([[x, y], [cx, cy], [cx, y + h], [x, y + h]], F(c, 1));
      s += poly([[x + w, y], [x + w, y + h], [cx, y + h], [cx, cy]], F(c, 2));
      s += tag('rect', { x, y, width: w, height: h, fill: 'none', ...S(c) });
      s += line(x, y, cx, cy, S(c)) + line(x + w, y, cx, cy, S(c)) + line(cx, cy, cx, y + h, S(c));
      s += chip(cx, y + fs * 1.1, L[0], c, { maxW: w * 0.4 });
      s += chip(x + w * 0.25, y + h - fs * 1.1, L[1], c, { maxW: w * 0.4 });
      s += chip(x + w * 0.75, y + h - fs * 1.1, L[2], c, { maxW: w * 0.4 });
      return s;
    },
  },
  {
    id: 'matrix', name: 'マトリクス', sub: '2つの軸で位置づける', skill: '評価する・分類する',
    fields: () => [
      ['縦軸の上', '効果が大きい'], ['縦軸の下', '効果が小さい'], ['横軸の左', 'むずかしい'], ['横軸の右', 'かんたん'],
      ['左上の区画', ''], ['右上の区画', ''], ['左下の区画', ''], ['右下の区画', ''],
    ],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const padY = fs * 1.7;
      const px = x, py = y + padY, pw = w, ph = h - padY * 2;
      const cx = px + pw / 2, cy = py + ph / 2;
      let s = '';
      const q = [[px, py], [cx, py], [px, cy], [cx, cy]];
      q.forEach((p, i) => { s += tag('rect', { x: p[0], y: p[1], width: pw / 2, height: ph / 2, ...F(c, i) }); });
      s += tag('rect', { x: px, y: py, width: pw, height: ph, fill: 'none', ...S(c, 0.5) });
      s += line(cx, py, cx, py + ph, S(c, 1.3)) + line(px, cy, px + pw, cy, S(c, 1.3));
      const a = fs * 0.9;
      s += arrowHead(c, cx, py, -Math.PI / 2, a) + arrowHead(c, cx, py + ph, Math.PI / 2, a);
      s += arrowHead(c, px, cy, Math.PI, a) + arrowHead(c, px + pw, cy, 0, a);
      s += chip(cx, y + fs * 0.8, L[0], c, { maxW: w * 0.45 });
      s += chip(cx, y + h - fs * 0.8, L[1], c, { maxW: w * 0.45 });
      s += chip(px + fs * 0.9, cy - fs * 1.05, L[2], c, { anchor: 'start', maxW: w * 0.4 });
      s += chip(px + pw - fs * 0.9, cy - fs * 1.05, L[3], c, { anchor: 'end', maxW: w * 0.4 });
      const qs = fs * 0.8, qf = c.T.sub;
      s += text(px + fs * 0.6, py + fs * 0.4, L[4], { size: qs, anchor: 'start', valign: 'top', fill: qf });
      s += text(px + pw - fs * 0.6, py + fs * 0.4, L[5], { size: qs, anchor: 'end', valign: 'top', fill: qf });
      s += text(px + fs * 0.6, py + ph - fs * 0.4, L[6], { size: qs, anchor: 'start', valign: 'bottom', fill: qf });
      s += text(px + pw - fs * 0.6, py + ph - fs * 0.4, L[7], { size: qs, anchor: 'end', valign: 'bottom', fill: qf });
      return s;
    },
  },
  {
    id: 'kurage', name: 'クラゲチャート', sub: '考えと理由', skill: '理由づける',
    count: { label: '理由の数', options: [2, 3, 4, 5], default: 3 },
    fields: (n) => [['頭（考え）', 'わたしの考え'], ...Array.from({ length: n }, (_, i) => [`足${i + 1}`, `理由${i + 1}`])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const cx = x + w / 2;
      const hw = Math.min(w * 0.64, h * 1.1);
      const hb = y + h * 0.38;
      const x1 = cx - hw / 2, x2 = cx + hw / 2;
      let s = tag('path', { d: `M ${rnd(x1)} ${rnd(hb)} A ${rnd(hw / 2)} ${rnd(hb - y)} 0 0 1 ${rnd(x2)} ${rnd(hb)} Z`, ...F(c, 0), ...S(c) });
      s += chip(cx, y + (hb - y) * 0.3, L[0], c, { maxW: hw * 0.6 });
      const bt = y + h * 0.54;
      const bh = y + h - bt;
      const gap = fs * 0.7;
      const bw = (w - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const bx = x + i * (bw + gap);
        const sx = x1 + hw * (i + 0.5) / n;
        const tx = bx + bw / 2;
        const my = (hb + bt) / 2;
        s += tag('path', { d: `M ${rnd(sx)} ${rnd(hb)} C ${rnd(sx)} ${rnd(my)}, ${rnd(tx)} ${rnd(my)}, ${rnd(tx)} ${rnd(bt)}`, fill: 'none', ...S(c) });
        s += tag('rect', { x: bx, y: bt, width: bw, height: bh, rx: fs * 0.5, ...F(c, i + 1), ...S(c) });
        s += chip(tx, bt + fs * 1.1, L[i + 1], c, { maxW: bw * 0.9, size: fs * 0.8 });
        s += rules(c, bx, bt + fs * 2, bw, bh - fs * 2);
      }
      return s;
    },
  },
  {
    id: 'pyramid', name: 'ピラミッドチャート', sub: '情報をしぼってまとめる', skill: '構造化する',
    count: { label: '段の数', options: [3, 4], default: 3 },
    fields: (n) => (n === 3
      ? [['上の段', 'まとめ（主張）'], ['中の段', '考え'], ['下の段', '事実・情報']]
      : [['1段目（上）', 'まとめ（主張）'], ['2段目', '考え'], ['3段目', '理由'], ['4段目（下）', '事実・情報']]),
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const bw = Math.min(w * 0.62, h * 1.25);
      const x0 = x + Math.max(0, (w - bw) / 2 - w * 0.12);
      const ax = x0 + bw / 2;
      const half = (yy) => (bw / 2) * ((yy - y) / h);
      let s = '';
      for (let i = 0; i < n; i++) {
        const y1 = y + (h * i) / n, y2 = y + (h * (i + 1)) / n;
        s += poly([[ax - half(y1), y1], [ax + half(y1), y1], [ax + half(y2), y2], [ax - half(y2), y2]], { ...F(c, i), ...S(c) });
        const my = (y1 + y2) / 2;
        const lx = ax + half(my) + fs * 0.6;
        s += chip(lx, my, L[i], c, { anchor: 'start', maxW: x + w - lx });
      }
      return s;
    },
  },
  {
    id: 'fishbone', name: 'フィッシュボーン', sub: '原因を考える', skill: '関係づける',
    count: { label: '原因の数', options: [4, 6], default: 4 },
    fields: (n) => [['頭（問題・結果）', '問題'], ...Array.from({ length: n }, (_, i) => [`骨${i + 1}`, `原因${i + 1}`])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const m = n / 2;
      const headW = Math.min(w * 0.2, fs * 8);
      const headH = h * 0.34;
      const cy = y + h / 2;
      const hx = x + w - headW;
      let s = tag('rect', { x: hx, y: cy - headH / 2, width: headW, height: headH, rx: fs * 0.6, ...F(c, 0), ...S(c) });
      s += text(hx + headW / 2, cy, L[0], { size: fs * 0.95, maxW: headW * 0.82, maxLines: 3, fill: c.T.text });
      const sx0 = x + fs * 0.5;
      const len = hx - sx0;
      s += line(sx0, cy, hx, cy, S(c, 1.5));
      const seg = len / (m + 0.3);
      const dx = Math.min(h * 0.3, seg * 0.55);
      for (let k = 0; k < m; k++) {
        const px = sx0 + seg * (k + 1);
        const ex = px - dx;
        const mw = Math.min(seg * 0.95, (ex - x) * 2);
        s += line(px, cy, ex, y + fs * 2, S(c));
        s += line(px, cy, ex, y + h - fs * 2, S(c));
        s += chip(ex, y + fs * 0.85, L[1 + k * 2], c, { maxW: mw });
        s += chip(ex, y + h - fs * 0.85, L[2 + k * 2], c, { maxW: mw });
      }
      return s;
    },
  },
  {
    id: 'steps', name: 'ステップチャート', sub: '順番に整理する', skill: '順序立てる',
    count: { label: 'ステップの数', options: [2, 3, 4, 5, 6], default: 3 },
    fields: (n) => Array.from({ length: n }, (_, i) => [`ステップ${i + 1}`, n === 3 ? ['はじめ', 'なか', 'おわり'][i] : `${i + 1}`]),
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const horiz = w >= h * 1.05;
      const gap = fs * 1.8;
      const a = gap * 0.32;
      let s = '';
      if (horiz) {
        const bw = (w - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          const bx = x + i * (bw + gap);
          s += tag('rect', { x: bx, y, width: bw, height: h, rx: fs * 0.5, ...F(c, i), ...S(c) });
          s += chip(bx + bw / 2, y + fs * 1.1, L[i], c, { maxW: bw * 0.9 });
          s += rules(c, bx, y + fs * 2, bw, h - fs * 2);
          if (i < n - 1) {
            const ax = bx + bw + gap / 2, ay = y + h / 2;
            s += poly([[ax - a, ay - a * 1.4], [ax + a, ay], [ax - a, ay + a * 1.4]], { fill: c.T.stroke });
          }
        }
      } else {
        const bh = (h - gap * (n - 1)) / n;
        for (let i = 0; i < n; i++) {
          const by = y + i * (bh + gap);
          s += tag('rect', { x, y: by, width: w, height: bh, rx: fs * 0.5, ...F(c, i), ...S(c) });
          s += chip(x + fs * 0.5, by + fs * 1.1, L[i], c, { anchor: 'start', maxW: w * 0.6 });
          s += rules(c, x, by + fs * 2, w, bh - fs * 2);
          if (i < n - 1) {
            const ax = x + w / 2, ay = by + bh + gap / 2;
            s += poly([[ax - a * 1.4, ay - a], [ax, ay + a], [ax + a * 1.4, ay - a]], { fill: c.T.stroke });
          }
        }
      }
      return s;
    },
  },
  {
    id: 'web', name: 'イメージマップ', sub: '考えを広げる', skill: '広げてみる',
    count: { label: 'まわりの数', options: [4, 5, 6, 7, 8], default: 6 },
    fields: (n) => [['まん中', 'テーマ'], ...Array.from({ length: n }, (_, i) => [`まわり${i + 1}`, ''])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const cx = x + w / 2, cy = y + h / 2;
      const crx = w * 0.15, cry = h * 0.14;
      const srx = w * 0.11, sry = h * 0.1;
      const Rx = w / 2 - srx - fs * 0.2, Ry = h / 2 - sry - fs * 0.2;
      const sats = Array.from({ length: n }, (_, i) => {
        const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return [cx + Math.cos(ang) * Rx, cy + Math.sin(ang) * Ry];
      });
      let s = sats.map((p) => line(cx, cy, p[0], p[1], S(c))).join('');
      s += tag('ellipse', { cx, cy, rx: crx, ry: cry, fill: '#fff', stroke: 'none' });
      s += tag('ellipse', { cx, cy, rx: crx, ry: cry, ...F(c, 0), ...S(c, 1.3) });
      s += text(cx, cy, L[0], { size: fs * 1.05, maxW: crx * 1.5, maxLines: 2, fill: c.T.text });
      sats.forEach((p, i) => {
        s += tag('ellipse', { cx: p[0], cy: p[1], rx: srx, ry: sry, fill: '#fff', stroke: 'none' });
        s += tag('ellipse', { cx: p[0], cy: p[1], rx: srx, ry: sry, ...F(c, i + 1), ...S(c) });
        s += text(p[0], p[1], L[i + 1], { size: fs * 0.85, maxW: srx * 1.5, maxLines: 2, fill: c.T.text });
      });
      return s;
    },
  },
  {
    id: 'scale', name: '座標軸（数直線）', sub: '自分の立場を決める', skill: '評価する',
    count: { label: '目もりの数', options: [3, 5, 7, 10], default: 5 },
    fields: () => [['左はし', '反対'], ['右はし', '賛成'], ['下の欄', 'そう考えた理由']],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const ly = y + h * 0.2;
      const x1 = x + fs * 0.4, x2 = x + w - fs * 0.4;
      let s = line(x1, ly, x2, ly, S(c, 1.5));
      s += arrowHead(c, x1, ly, Math.PI, fs * 0.9) + arrowHead(c, x2, ly, 0, fs * 0.9);
      const t1 = x1 + fs * 2, t2 = x2 - fs * 2;
      for (let i = 0; i < n; i++) {
        const tx = t1 + ((t2 - t1) * i) / (n - 1);
        s += line(tx, ly - fs * 0.55, tx, ly + fs * 0.55, S(c));
        s += text(tx, ly + fs * 1.3, String(i + 1), { size: fs * 0.7, fill: c.T.sub, weight: 400 });
      }
      s += chip(x1, ly - fs * 1.5, L[0], c, { anchor: 'start', maxW: w * 0.4 });
      s += chip(x2, ly - fs * 1.5, L[1], c, { anchor: 'end', maxW: w * 0.4 });
      const by = y + h * 0.4;
      s += tag('rect', { x, y: by, width: w, height: y + h - by, rx: fs * 0.5, ...F(c, 3), ...S(c) });
      s += chip(x + fs * 0.5, by + fs * 1.1, L[2], c, { anchor: 'start', maxW: w * 0.6 });
      s += rules(c, x, by + fs * 2, w, y + h - by - fs * 2);
      return s;
    },
  },
  {
    id: 'kwl', name: 'KWLチャート', sub: '学ぶ前と後をつなぐ', skill: '見通す・ふり返る',
    fields: () => [['左の列', 'K 知っていること'], ['中の列', 'W 知りたいこと'], ['右の列', 'L 学んだこと']],
    draw: drawTable,
  },
  {
    id: 'pmi', name: 'PMIシート', sub: 'よい点・悪い点', skill: '評価する',
    fields: () => [['左の列', 'P よいところ'], ['中の列', 'M よくないところ'], ['右の列', 'I おもしろいところ']],
    draw: drawTable,
  },
];

/* ---------- カード全体の描画（ヘッダー＋本体） ---------- */
function renderFrame(o, drawBody) {
  const { W, H } = o;
  const T = THEMES[o.theme] || THEMES.color;
  const fs = (Math.min(W, H) / 1080) * 34 * (o.scale ?? 1);
  const sw = Math.max(1.2, fs * 0.11);
  const m = Math.min(W, H) * 0.045;
  let s = tag('rect', { width: W, height: H, fill: '#FFFFFF' });
  let top = m;

  const title = (o.title || '').trim();
  if (title || o.showName || o.showDate || o.showScore) {
    const tsize0 = fs * 1.15;
    const metas = [];
    if (o.showDate) metas.push(['date', fs * 6.2]);
    if (o.showName) metas.push(['name', fs * 9.5]);
    if (o.showScore) metas.push(['score', fs * 5.2]);
    const metaW = metas.reduce((a, b) => a + b[1], 0) + Math.max(0, metas.length - 1) * fs * 0.8;
    let tagW = 0;
    const c0 = { T, fs, sw };
    if (title && o.tag) {
      const chipSize = fs * 0.85;
      tagW = measure(o.tag, chipSize) + chipSize * 1.2 + fs * 0.5;
      s += chip(m, top + tsize0 * 0.66, o.tag, c0, { anchor: 'start', size: chipSize, fill: T.accent, color: '#FFFFFF' });
    }
    const maxW = W - 2 * m - tagW - (metaW ? metaW + fs * 1.2 : 0);
    let tsize = tsize0;
    let lines = title ? wrap(title, tsize, maxW) : [];
    while (lines.length > 2 && tsize > fs * 0.7) {
      tsize *= 0.92;
      lines = wrap(title, tsize, maxW);
    }
    if (lines.length === 2) {
      // 2行目が極端に短くならないよう、行の長さをそろえる
      const balanced = wrap(title, tsize, measure(title, tsize) / 2 + tsize * 1.5);
      if (balanced.length === 2) lines = balanced;
    }
    const headerH = Math.max(lines.length * tsize * 1.3, fs * 1.6);
    if (title) s += text(m + tagW, top, lines.slice(0, 3).join('\n'), { size: tsize, anchor: 'start', valign: 'top', fill: T.text });
    const my = top + tsize0 * 0.66;
    const metaSize = fs * 0.8;
    let mx = W - m - metaW;
    for (const [kind, mw] of metas) {
      if (kind === 'date') {
        s += text(mx, my, '　　月　　日', { size: metaSize, anchor: 'start', fill: T.text });
      } else if (kind === 'name') {
        s += text(mx, my, '名前', { size: metaSize, anchor: 'start', fill: T.text });
        s += line(mx + fs * 2.3, my + fs * 0.55, mx + mw, my + fs * 0.55, { stroke: T.stroke, 'stroke-width': sw * 0.7 });
      } else if (kind === 'score') {
        s += tag('rect', { x: mx, y: my - fs * 0.85, width: mw - fs * 1.2, height: fs * 1.7, rx: fs * 0.3, fill: 'none', stroke: T.stroke, 'stroke-width': sw * 0.8 });
        s += text(mx + mw - fs * 0.1, my, '点', { size: metaSize, anchor: 'end', fill: T.text });
      }
      mx += mw + fs * 0.8;
    }
    s += line(m, top + headerH + fs * 0.45, W - m, top + headerH + fs * 0.45, { stroke: T.rule, 'stroke-width': sw * 0.6 });
    top += headerH + fs * 1.3;
  }

  const bottom = o.pageLabel ? m + fs * 0.6 : m;
  const c = { x: m, y: top, w: W - 2 * m, h: H - top - bottom, T, fs, sw, ruled: !!o.ruled };
  s += drawBody(c);
  if (o.pageLabel) s += text(W - m, H - m * 0.55, o.pageLabel, { size: fs * 0.6, anchor: 'end', fill: T.sub, weight: 400 });

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family='${FONT_STACK}'>${s}</svg>`;
}

function renderCard(o) {
  const n = o.n ?? o.tool.fields(o.n).length;
  return renderFrame(o, (c) => o.tool.draw({ ...c, L: o.labels, n }));
}
