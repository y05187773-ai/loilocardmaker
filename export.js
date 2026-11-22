'use strict';
/* SVG → PNG / JPEG / PDF 書き出し（外部ライブラリなし） */

async function svgToCanvas(svg, W, H) {
  const img = new Image();
  await new Promise((resolve, reject) => {
    img.onload = resolve;
    img.onerror = () => reject(new Error('画像の生成に失敗しました'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, W, H);
  g.drawImage(img, 0, 0, W, H);
  return canvas;
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('画像に変換できませんでした'))), type, quality));
}

async function svgToPng(svg, W, H) {
  return canvasBlob(await svgToCanvas(svg, W, H), 'image/png');
}

/* SVG（カード）を1ページ1枚の PDF にする */
async function svgsToPdf(svgs, W, H) {
  const pages = [];
  for (const svg of svgs) {
    const blob = await canvasBlob(await svgToCanvas(svg, W, H), 'image/jpeg', 0.92);
    pages.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), w: W, h: H });
  }
  return jpegsToPdf(pages, Math.round(W / 2), Math.round(H / 2));
}

/* JPEG を1ページ1枚で埋め込んだ PDF を作る。pw, ph はページの大きさ（ポイント） */
function jpegsToPdf(pages, pw, ph) {
  const enc = new TextEncoder();
  const chunks = [];
  const offsets = [];
  let len = 0;
  const push = (d) => {
    const b = typeof d === 'string' ? enc.encode(d) : d;
    chunks.push(b);
    len += b.length;
  };
  const obj = (id, body) => {
    offsets[id] = len;
    push(`${id} 0 obj\n`);
    body();
    push('\nendobj\n');
  };
  const n = pages.length;
  push('%PDF-1.4\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const pid = 3 + i * 3, cid = pid + 1, iid = pid + 2;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`);
      push(p.jpeg);
      push('\nendstream');
    });
  });
  const total = 3 + n * 3;
  const xref = len;
  push(`xref\n0 ${total}\n0000000000 65535 f \n`);
  for (let i = 1; i < total; i++) push(`${String(offsets[i]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
