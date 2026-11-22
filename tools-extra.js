'use strict';
/* 追加のシンキングツールと、目的別のグループ分け */

const TOOL_GROUPS = [
  { id: 'compare', name: 'くらべる' },
  { id: 'classify', name: '分ける・いろいろな面から見る' },
  { id: 'reason', name: '理由・原因を考える' },
  { id: 'order', name: '順序・変化をとらえる' },
  { id: 'expand', name: '広げる・まとめる' },
  { id: 'evaluate', name: '評価する・決める' },
  { id: 'foresee', name: '見通す・ふり返る' },
];

const GROUP_OF = {
  venn2: 'compare', venn3: 'compare', tchart: 'compare', datachart: 'compare',
  xchart: 'classify', ychart: 'classify', kumade: 'classify',
  kurage: 'reason', fishbone: 'reason',
  steps: 'order', cycle: 'order', timeline: 'order', emotion: 'order',
  web: 'expand', concentric: 'expand', pyramid: 'expand',
  matrix: 'evaluate', scale: 'evaluate', pmi: 'evaluate', butterfly: 'evaluate', diamond: 'evaluate',
  kwl: 'foresee', candy: 'foresee',
};

/* 矢印つきの線（先端が (x2, y2)） */
function arrowLine(c, x1, y1, x2, y2, k = 1) {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const a = c.fs * 0.75;
  return line(x1, y1, x2 - Math.cos(ang) * a * 0.6, y2 - Math.sin(ang) * a * 0.6, S(c, k)) + arrowHead(c, x2, y2, ang, a);
}

const box = (c, x, y, w, h, i, rx) => tag('rect', { x, y, width: w, height: h, rx: rx ?? c.fs * 0.45, ...F(c, i), ...S(c) });
const whiteBox = (x, y, w, h, rx) => tag('rect', { x, y, width: w, height: h, rx, fill: '#FFFFFF' });
const range = (n) => Array.from({ length: n }, (_, i) => i);

TOOLS.push(
  {
    id: 'datachart', name: 'データチャート', sub: '観点ごとに整理してくらべる', skill: '比較する',
    count: { label: '観点 × くらべるもの', options: ['2×2', '2×3', '3×3', '4×3', '3×4', '4×4', '5×3'], default: '3×3' },
    fields(n) {
      const [rows, cols] = String(n).split('×').map(Number);
      return [
        ...range(cols).map((i) => [`くらべるもの${i + 1}`, ['〇〇', '△△', '□□', '☆☆'][i]]),
        ...range(rows).map((i) => [`観点${i + 1}`, `観点${i + 1}`]),
      ];
    },
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const [rows, cols] = String(n).split('×').map(Number);
      const hh = fs * 2.2;
      const hw = Math.min(w * 0.2, fs * 6.5);
      const cw = (w - hw) / cols;
      const ch = (h - hh) / rows;
      let s = '';
      if (c.T.fills[0] !== 'none') {
        range(cols).forEach((j) => { s += tag('rect', { x: x + hw + j * cw, y, width: cw, height: hh, fill: c.T.fills[j % 8] }); });
        s += tag('rect', { x, y: y + hh, width: hw, height: h - hh, fill: c.T.fills[8] });
      }
      range(cols).forEach((j) => {
        const str = L[j];
        if (str) s += text(x + hw + j * cw + cw / 2, y + hh / 2, str, { size: fitSize(str, fs, cw * 0.9), fill: c.T.text });
      });
      range(rows).forEach((i) => {
        s += text(x + hw / 2, y + hh + i * ch + ch / 2, L[cols + i], { size: fs * 0.85, maxW: hw * 0.85, maxLines: 3, fill: c.T.text });
        range(cols).forEach((j) => { s += rules(c, x + hw + j * cw, y + hh + i * ch, cw, ch); });
      });
      s += tag('rect', { x, y, width: w, height: h, fill: 'none', ...S(c) });
      s += line(x, y + hh, x + w, y + hh, S(c));
      for (let j = 0; j < cols; j++) s += line(x + hw + j * cw, y, x + hw + j * cw, y + h, S(c));
      for (let i = 1; i < rows; i++) s += line(x, y + hh + i * ch, x + w, y + hh + i * ch, S(c, 0.6));
      return s;
    },
  },
  {
    id: 'kumade', name: 'くま手チャート', sub: 'いろいろな面から見る', skill: '多面的に見る',
    count: { label: '観点の数', options: [3, 4, 5, 6], default: 4 },
    fields: (n) => [['持ち手（見るもの）', '〇〇について'], ...range(n).map((i) => [`観点${i + 1}`, `観点${i + 1}`])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const hw = w * 0.24, hh = h * 0.34;
      const hy = y + (h - hh) / 2;
      const tx = x + w * 0.36;
      const gap = fs * 0.5;
      const bh = (h - gap * (n - 1)) / n;
      const mx = x + hw + (tx - x - hw) * 0.5;
      let s = '';
      range(n).forEach((i) => {
        const by = y + i * (bh + gap) + bh / 2;
        s += tag('path', { d: `M ${rnd(x + hw)} ${rnd(y + h / 2)} C ${rnd(mx)} ${rnd(y + h / 2)}, ${rnd(mx)} ${rnd(by)}, ${rnd(tx)} ${rnd(by)}`, fill: 'none', ...S(c) });
      });
      range(n).forEach((i) => {
        const by = y + i * (bh + gap);
        s += box(c, tx, by, x + w - tx, bh, i + 1);
        s += chip(tx + fs * 0.4, by + fs * 1.0, L[i + 1], c, { anchor: 'start', size: fs * 0.8, maxW: (x + w - tx) * 0.6 });
        s += rules(c, tx, by + fs * 1.8, x + w - tx, bh - fs * 1.8);
      });
      s += box(c, x, hy, hw, hh, 0, fs * 0.6);
      s += text(x + hw / 2, hy + hh / 2, L[0], { size: fs, maxW: hw * 0.85, maxLines: 3, fill: c.T.text });
      return s;
    },
  },
  {
    id: 'cycle', name: 'サイクル図', sub: 'くり返す流れをとらえる', skill: '順序立てる',
    count: { label: '段階の数', options: [3, 4, 5, 6], default: 4 },
    fields: (n) => [['まん中', 'テーマ'], ...range(n).map((i) => [`段階${i + 1}`, `${i + 1}`])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const cx = x + w / 2, cy = y + h / 2;
      const nw = n <= 4 ? w * 0.26 : w * 0.21;
      const nh = n <= 4 ? h * 0.27 : h * 0.24;
      const Rx = w / 2 - nw / 2, Ry = h / 2 - nh / 2;
      const P = range(n).map((i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
        return [cx + Math.cos(a) * Rx, cy + Math.sin(a) * Ry];
      });
      const exit = (dx, dy) => Math.min((nw / 2) / Math.max(Math.abs(dx), 1e-6), (nh / 2) / Math.max(Math.abs(dy), 1e-6));
      let s = '';
      range(n).forEach((i) => {
        const [ax, ay] = P[i];
        const [bx, by] = P[(i + 1) % n];
        const d = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / d, uy = (by - ay) / d;
        const t = exit(ux, uy) + fs * 0.4;
        s += arrowLine(c, ax + ux * t, ay + uy * t, bx - ux * t, by - uy * t, 1.3);
      });
      P.forEach(([px, py], i) => {
        s += box(c, px - nw / 2, py - nh / 2, nw, nh, i + 1);
        s += chip(px, py - nh / 2 + fs * 1.0, L[i + 1], c, { size: fs * 0.8, maxW: nw * 0.9 });
        s += rules(c, px - nw / 2, py - nh / 2 + fs * 1.8, nw, nh - fs * 1.8);
      });
      s += text(cx, cy, L[0], { size: fs * 1.05, maxW: w * 0.22, maxLines: 3, fill: c.T.text });
      return s;
    },
  },
  {
    id: 'timeline', name: '年表（タイムライン）', sub: '時間の流れで整理する', skill: '順序立てる',
    count: { label: '区切りの数', options: [3, 4, 5, 6], default: 4 },
    fields: (n) => range(n).map((i) => [`区切り${i + 1}`, `時期${i + 1}`]),
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const ay = y + fs * 2.8;
      let s = arrowLine(c, x, ay, x + w, ay, 1.6);
      const gap = fs * 0.6;
      const bw = w / n - gap;
      const top = ay + fs * 1.4;
      range(n).forEach((i) => {
        const px = x + (w * (i + 0.5)) / n;
        s += line(px, ay, px, top, { stroke: c.T.rule, 'stroke-width': c.sw * 0.7, 'stroke-dasharray': `${rnd(fs * 0.3)} ${rnd(fs * 0.25)}` });
        s += tag('circle', { cx: px, cy: ay, r: fs * 0.38, fill: '#FFFFFF', ...S(c) });
        s += chip(px, y + fs * 1.0, L[i], c, { maxW: bw });
        s += box(c, px - bw / 2, top, bw, y + h - top, i);
        s += rules(c, px - bw / 2, top, bw, y + h - top);
      });
      return s;
    },
  },
  {
    id: 'emotion', name: '心情曲線', sub: '気持ちの変化をとらえる', skill: '変化をとらえる',
    count: { label: '場面の数', options: [3, 4, 5, 6, 7, 8], default: 5 },
    fields: (n) => [['上（＋）', 'うれしい・明るい'], ['下（－）', 'かなしい・暗い'], ...range(n).map((i) => [`場面${i + 1}`, `場面${i + 1}`])],
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const px = x + fs * 0.6, py = y + fs * 0.5;
      const pw = w - fs * 0.6, ph = h - fs * 2.9;
      const my = py + ph / 2;
      let s = '';
      if (c.T.fills[0] !== 'none') {
        s += tag('rect', { x: px, y: py, width: pw, height: ph / 2, fill: c.T.fills[5], 'fill-opacity': 0.55 });
        s += tag('rect', { x: px, y: my, width: pw, height: ph / 2, fill: c.T.fills[1], 'fill-opacity': 0.55 });
      }
      range(n).forEach((i) => {
        const sx = px + (pw * (i + 0.5)) / n;
        s += line(sx, py + fs * 2, sx, py + ph, { stroke: c.T.rule, 'stroke-width': c.sw * 0.7, 'stroke-dasharray': `${rnd(fs * 0.3)} ${rnd(fs * 0.25)}` });
        s += chip(sx, y + h - fs * 0.9, L[i + 2], c, { size: fs * 0.75, maxW: (pw / n) * 0.95 });
      });
      s += line(px, py + ph, px, py, S(c, 1.4)) + arrowHead(c, px, py, -Math.PI / 2, fs * 0.8) + arrowHead(c, px, py + ph, Math.PI / 2, fs * 0.8);
      s += arrowLine(c, px, my, px + pw, my, 1.4);
      s += chip(px + fs * 0.7, py + fs * 0.9, L[0], c, { anchor: 'start', size: fs * 0.8, maxW: pw * 0.4 });
      s += chip(px + fs * 0.7, py + ph - fs * 0.9, L[1], c, { anchor: 'start', size: fs * 0.8, maxW: pw * 0.4 });
      return s;
    },
  },
  {
    id: 'concentric', name: '同心円チャート', sub: '身近なところから広げる', skill: '広げてみる・焦点化する',
    count: { label: '円の数', options: [2, 3, 4], default: 3 },
    fields: (n) => {
      const d = { 2: ['自分', 'まわりの人'], 3: ['自分', '家族・友だち', '地域・社会'], 4: ['自分', '家族', '学校', '地域'] }[n];
      return range(n).map((i) => [i === 0 ? '内側の円' : i === n - 1 ? '外側の円' : `内側から${i + 1}番目`, d[i]]);
    },
    draw(c) {
      const { x, y, w, h, L, fs, n } = c;
      const cx = x + w / 2, cy = y + h / 2;
      const rx = (i) => (w / 2) * ((i + 1) / n);
      const ry = (i) => (h / 2) * ((i + 1) / n);
      let s = '';
      for (let i = n - 1; i >= 0; i--) {
        s += tag('ellipse', { cx, cy, rx: rx(i), ry: ry(i), fill: '#FFFFFF' });
        s += tag('ellipse', { cx, cy, rx: rx(i), ry: ry(i), ...F(c, i), ...S(c) });
      }
      range(n).forEach((i) => {
        const ly = i === 0 ? cy - ry(0) * 0.55 : cy - (ry(i - 1) + ry(i)) / 2;
        s += chip(cx, ly, L[i], c, { maxW: i === 0 ? rx(0) * 1.5 : rx(i) * 1.1 });
      });
      return s;
    },
  },
  {
    id: 'butterfly', name: 'バタフライチャート', sub: '賛成・反対の両方から考える', skill: '多面的に見る・評価する',
    fields: () => [['まん中（テーマ）', 'テーマ'], ['左はし', '強く反対'], ['左', '反対'], ['右', '賛成'], ['右はし', '強く賛成'], ['下', '自分の考え']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      if (h > w * 1.1) {
        // たて向き：テーマ → 反対・賛成（2×2） → 自分の考え
        const gap = fs * 0.5;
        const bodyH = fs * 3;
        let s = box(c, x, y, w, bodyH, 0, bodyH / 2);
        s += text(x + w / 2, y + bodyH / 2, L[0], { size: fs, maxW: w * 0.85, maxLines: 1, fill: c.T.text });
        const gy = y + bodyH + gap;
        const gridH = (h - bodyH - gap * 2) * 0.7;
        const cw = (w - gap) / 2, chh = (gridH - gap) / 2;
        [[0, 0, 1], [0, 1, 2], [1, 0, 4], [1, 1, 3]].forEach(([col, row, li]) => {
          const bx = x + col * (cw + gap), by = gy + row * (chh + gap);
          s += box(c, bx, by, cw, chh, li, cw * 0.18);
          s += chip(bx + cw / 2, by + fs * 1.1, L[li], c, { size: fs * 0.8, maxW: cw * 0.85 });
          s += rules(c, bx + cw * 0.05, by + fs * 2, cw * 0.9, chh - fs * 2.4);
        });
        const by = gy + gridH + gap;
        s += box(c, x, by, w, y + h - by, 5);
        s += chip(x + fs * 0.5, by + fs * 1.0, L[5], c, { anchor: 'start', size: fs * 0.8, maxW: w * 0.6 });
        s += rules(c, x, by + fs * 1.8, w, y + h - by - fs * 1.8);
        return s;
      }
      const th = h * 0.66;
      const gap = fs * 0.5;
      const bodyW = w * 0.14;
      const wingW = (w - bodyW - gap * 4) / 4;
      const xs = [x, x + wingW + gap, x + 2 * (wingW + gap), x + 2 * (wingW + gap) + bodyW + gap];
      xs.push(xs[3] + wingW + gap);
      const wings = [[0, 1, 0.84], [1, 2, 1], [3, 3, 1], [4, 4, 0.84]];
      let s = '';
      wings.forEach(([pos, li, k]) => {
        const wh = th * k;
        const wy = y + (th - wh) / 2;
        s += box(c, xs[pos], wy, wingW, wh, li, wingW * 0.3);
        s += chip(xs[pos] + wingW / 2, wy + fs * 1.2, L[li], c, { size: fs * 0.8, maxW: wingW * 0.85 });
        s += rules(c, xs[pos] + wingW * 0.06, wy + fs * 2.2, wingW * 0.88, wh - fs * 3);
      });
      s += box(c, xs[2], y, bodyW, th, 0, bodyW / 2);
      s += text(xs[2] + bodyW / 2, y + th / 2, L[0], { size: fs * 0.95, maxW: bodyW * 0.75, maxLines: 4, fill: c.T.text });
      const by = y + th + fs * 0.6;
      s += box(c, x, by, w, y + h - by, 5);
      s += chip(x + fs * 0.5, by + fs * 1.0, L[5], c, { anchor: 'start', size: fs * 0.8, maxW: w * 0.5 });
      s += rules(c, x, by + fs * 1.8, w, y + h - by - fs * 1.8);
      return s;
    },
  },
  {
    id: 'diamond', name: 'ダイヤモンドランキング', sub: '9つに順位をつける', skill: '評価する・順位づける',
    fields: () => [['上のラベル', 'いちばん大切'], ['下のラベル', 'あまり大切ではない']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      const lh = fs * 2;
      const y0 = y + lh, h0 = h - lh * 2;
      const rows = [1, 2, 3, 2, 1];
      const gap = fs * 0.4;
      const bh = (h0 - gap * 4) / 5;
      const bw = Math.min((w - fs * 5 - gap * 2) / 3, bh * 3.3);
      const cx = x + w / 2;
      let s = '';
      rows.forEach((cnt, r) => {
        const rowW = cnt * bw + (cnt - 1) * gap;
        range(cnt).forEach((k) => { s += box(c, cx - rowW / 2 + k * (bw + gap), y0 + r * (bh + gap), bw, bh, r); });
      });
      const ax = cx - (3 * bw + 2 * gap) / 2 - fs * 1.8;
      s += arrowLine(c, ax, y0 + h0, ax, y0, 1.4);
      s += chip(cx, y + lh * 0.45, L[0], c, { maxW: w * 0.6 });
      s += chip(cx, y + h - lh * 0.45, L[1], c, { maxW: w * 0.6 });
      return s;
    },
  },
  {
    id: 'candy', name: 'キャンディチャート', sub: 'もし〜なら、を予想する', skill: '見通す',
    fields: () => [['左', 'もし〜なら'], ['まん中', 'きっと〜だろう'], ['右', 'なぜなら']],
    draw(c) {
      const { x, y, w, h, L, fs } = c;
      if (h > w * 1.1) {
        // たて向き：上に「もし」、下に「なぜなら」
        const cx = x + w / 2;
        const by1 = y + h * 0.3, by2 = y + h * 0.7;
        const bw = w * 0.7;
        let s = poly([[cx, by1 + fs], [x, y], [x + w, y]], { ...F(c, 0), ...S(c) });
        s += poly([[cx, by2 - fs], [x, y + h], [x + w, y + h]], { ...F(c, 2), ...S(c) });
        s += whiteBox(cx - bw / 2, by1, bw, by2 - by1, bw * 0.25);
        s += box(c, cx - bw / 2, by1, bw, by2 - by1, 1, bw * 0.25);
        s += chip(cx, y + h * 0.07, L[0], c, { size: fs * 0.8, maxW: w * 0.6 });
        s += chip(cx, y + h - h * 0.07, L[2], c, { size: fs * 0.8, maxW: w * 0.6 });
        s += chip(cx, by1 + fs * 1.2, L[1], c, { maxW: bw * 0.8 });
        s += rules(c, cx - bw * 0.38, by1 + fs * 2.2, bw * 0.76, by2 - by1 - fs * 2.8);
        return s;
      }
      const cy = y + h / 2;
      const bx1 = x + w * 0.3, bx2 = x + w * 0.7;
      const bh = h * 0.64;
      let s = '';
      s += poly([[bx1 + fs, cy], [x, y], [x, y + h]], { ...F(c, 0), ...S(c) });
      s += poly([[bx2 - fs, cy], [x + w, y], [x + w, y + h]], { ...F(c, 2), ...S(c) });
      s += whiteBox(bx1, cy - bh / 2, bx2 - bx1, bh, bh * 0.3);
      s += box(c, bx1, cy - bh / 2, bx2 - bx1, bh, 1, bh * 0.3);
      s += chip(x + w * 0.1, cy - h * 0.22, L[0], c, { size: fs * 0.8, maxW: w * 0.17 });
      s += chip(x + w * 0.9, cy - h * 0.22, L[2], c, { size: fs * 0.8, maxW: w * 0.17 });
      s += chip((bx1 + bx2) / 2, cy - bh / 2 + fs * 1.2, L[1], c, { maxW: (bx2 - bx1) * 0.85 });
      s += rules(c, bx1 + bh * 0.12, cy - bh / 2 + fs * 2.2, bx2 - bx1 - bh * 0.24, bh - fs * 2.8);
      return s;
    },
  },
);

/* 目的別グループの順にならべかえる（同じグループ内は登録順） */
(() => {
  const order = Object.fromEntries(TOOL_GROUPS.map((g, i) => [g.id, i]));
  const idx = new Map(TOOLS.map((t, i) => [t, i]));
  TOOLS.forEach((t) => { t.group = GROUP_OF[t.id] || 'evaluate'; });
  TOOLS.sort((a, b) => order[a.group] - order[b.group] || idx.get(a) - idx.get(b));
})();
