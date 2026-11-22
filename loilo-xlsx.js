'use strict';
/*
 * ロイロノート「テストカード」「アンケートカード」取り込み用 Excel(.xlsx) の生成
 *
 * 公式テンプレート v1.2.0 の構造（LoiLo 公式マニュアルのサンプルファイルより）
 *   シート名: Import
 *   1行目 : A1 = "v1.2.0"（バージョン情報・消さない）
 *   2行目 : 見出し（消さない）
 *   3行目〜: 1行1問
 *     A 問題形式   radio / checkbox / short:text / short:number / short:math / text / questionOnly
 *     B 問題文
 *     C 回答必須   1 で必須
 *     D 配点       0〜100（text は空欄なら採点なし）
 *     E 正答       radio/checkbox のとき G列以降の選択肢番号（複数は "1,3"）
 *     F 解説
 *     G〜 選択肢（radio/checkbox）または正答（short:*）
 *   アンケートカードも同じテンプレート（D・E 列は空欄のまま残す）
 *   ファイル名がカードのタイトルになる
 */

const LOILO_TEMPLATE_VERSION = 'v1.2.0';
const LOILO_HEADERS = [
  'Question Type', 'Question', 'Answer Required', 'Score', 'Correct answer(s)', 'Explanation',
  'Choices or Correct Answer 1', 'Choices or Correct Answer 2', 'Choices or Correct Answer 3', 'Choices or Correct Answer 4', '…',
];
const LOILO_TYPE_NAMES = {
  radio: '1つ選ぶ', checkbox: '複数選ぶ', 'short:text': '短答（文字）', 'short:number': '短答（数値）', text: '自由記述', questionOnly: '問題のみ',
};

const toHalf = (s) => String(s).replace(/[０-９．－−]/g, (ch) => ({ '．': '.', '－': '-', '−': '-' }[ch] ?? String('０１２３４５６７８９'.indexOf(ch))));
const isNumeric = (s) => /^-?\d+(\.\d+)?$/.test(toHalf(String(s).trim()));

/* テスト → テンプレートの行 */
function testToLoiloRows(items, opt) {
  const req = opt.required ? 1 : null;
  return items.map((it) => {
    const score = it.points ?? opt.points;
    if (it.choices.length) {
      const graded = it.corrects.length > 0;
      return {
        type: it.corrects.length > 1 ? 'checkbox' : 'radio',
        q: it.q, req, score: graded ? score : null,
        correct: !graded ? null : it.corrects.length === 1 ? it.corrects[0] + 1 : it.corrects.map((i) => i + 1).join(','),
        explain: it.explain, values: it.choices,
      };
    }
    if (it.answers.length) {
      const num = it.answers.every(isNumeric);
      return {
        type: num ? 'short:number' : 'short:text',
        q: it.q, req, score, correct: null, explain: it.explain,
        values: num ? it.answers.map((a) => Number(toHalf(a))) : it.answers,
      };
    }
    // 正答なし → 自由記述（配点を書いた問題だけ採点対象）
    return { type: 'text', q: it.q, req, score: it.points ?? null, correct: null, explain: it.explain, values: [] };
  });
}

/* アンケート → テンプレートの行 */
function surveyToLoiloRows(items, opt) {
  const req = opt.required ? 1 : null;
  const labels = (SCALES[opt.scale] || SCALES.four).labels.map((l) => l.replace('\n', ' '));
  return items.map((it) => (it.free
    ? { type: 'text', q: it.q, req, score: null, correct: null, explain: '', values: [] }
    : { type: 'radio', q: it.q, req, score: null, correct: null, explain: '', values: labels }));
}

/* ---------- xlsx ---------- */
const xmlEsc = (s) => String(s)
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
  .replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

function sheetXml(table) {
  const width = Math.max(...table.map((r) => r.length));
  const rows = table.map((cells, ri) => {
    const r = ri + 1;
    const cs = cells.map((v, ci) => {
      if (v === null || v === undefined || v === '') return '';
      const ref = `${colName(ci)}${r}`;
      const s = ri === 1 ? ' s="1"' : '';
      if (typeof v === 'number') return `<c r="${ref}"${s}><v>${v}</v></c>`;
      return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    }).join('');
    return `<row r="${r}"${ri === 1 ? ' ht="21" customHeight="1"' : ''}>${cs}</row>`;
  }).join('');
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    + '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
    + `<dimension ref="A1:${colName(width - 1)}${table.length}"/>`
    + '<sheetViews><sheetView tabSelected="1" workbookViewId="0"/></sheetViews>'
    + '<sheetFormatPr defaultRowHeight="20"/>'
    + `<cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="2" width="44" customWidth="1"/><col min="3" max="5" width="14" customWidth="1"/><col min="6" max="6" width="30" customWidth="1"/><col min="7" max="${Math.max(11, width)}" width="24" customWidth="1"/></cols>`
    + `<sheetData>${rows}</sheetData></worksheet>`;
}

function buildLoiloXlsx(rows) {
  const maxVals = Math.max(4, ...rows.map((r) => r.values.length));
  const headers = [...LOILO_HEADERS.slice(0, 10)];
  for (let i = 4; i < maxVals; i++) headers.push(`Choices or Correct Answer ${i + 1}`);
  headers.push('…');
  const table = [
    [LOILO_TEMPLATE_VERSION],
    headers,
    ...rows.map((r) => [r.type, r.q, r.req, r.score, r.correct, r.explain || null, ...r.values]),
  ];
  const files = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Import" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="12"/><name val="游ゴシック"/><family val="2"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFEEEEEE"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left style="thin"><color rgb="FF999999"/></left><right style="thin"><color rgb="FF999999"/></right><top style="thin"><color rgb="FF999999"/></top><bottom style="thin"><color rgb="FF999999"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"><alignment vertical="center"/></xf></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheetXml(table),
  };
  const enc = new TextEncoder();
  return zipStore(Object.entries(files).map(([name, text]) => ({ name, data: enc.encode(text) })),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

/* ---------- ZIP（無圧縮） ---------- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function zipStore(files, mime) {
  const enc = new TextEncoder();
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
  const parts = [];
  const central = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const size = f.data.length;
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034B50, true);
    lh.setUint16(4, 20, true);
    lh.setUint16(6, 0x0800, true);
    lh.setUint16(8, 0, true);
    lh.setUint16(10, dosTime, true);
    lh.setUint16(12, dosDate, true);
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true);
    lh.setUint32(22, size, true);
    lh.setUint16(26, name.length, true);
    lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, f.data);

    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014B50, true);
    ch.setUint16(4, 20, true);
    ch.setUint16(6, 20, true);
    ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, dosTime, true);
    ch.setUint16(14, dosDate, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + size;
  }
  const cdSize = central.reduce((a, b) => a + b.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054B50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: mime });
}
