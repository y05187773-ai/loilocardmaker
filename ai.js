'use strict';
/* チャットAI（Copilot / Gemini など）に相談するためのプロンプト生成と、回答の取り込み */

const AI_LINKS = {
  copilot: { name: 'Copilot', url: 'https://copilot.microsoft.com/' },
  gemini: { name: 'Gemini', url: 'https://gemini.google.com/app' },
};

const SUBJECTS = ['国語', '算数', '理科', '社会', '生活', '外国語・外国語活動', '道徳', '総合的な学習の時間', '音楽', '図画工作', '家庭', '体育', '特別活動'];

const FENCE = '```';

function gradeText(g) {
  return g ? `小学${g}年生` : '小学生';
}

function lineList(arr) {
  return arr.filter(Boolean).map((s) => `- ${s}`).join('\n');
}

/* ---------- テスト ---------- */
const TEST_FORMAT_RULES = (grade) => lineList([
  '問題だけを、1つのコードブロック（```）の中に、1行に1問で書いてください。',
  '区切りには全角の「｜」を使ってください。問題文の中では「｜」を使わず、改行もしないでください。',
  '書いて答える問題：「問題文｜答：正答」（別解があるときは「答：56／五十六」のように「／」で区切る）',
  '選んで答える問題：「問題文｜*正しい選択肢｜選択肢｜選択肢｜選択肢」（正答の頭に「*」。正答が複数あるときは、そのすべてに「*」）',
  '解説をつけるときは、行の最後に「｜解説：〜」をつける',
  '番号・記号・太字などの飾りはつけない',
  '答えが1つに決まる問題にする。選択肢の問題では、正答の位置をばらばらにする',
  `${gradeText(grade)}が読める言葉づかいにする（まだ習っていない漢字はひらがなにする）`,
]);

const TEST_EXAMPLE = `${FENCE}
7×8は？｜答：56
日本の首都はどこですか？｜大阪｜*東京｜京都｜名古屋｜解説：国会や中央省庁がある都市です
昆虫をすべて選びましょう｜*アリ｜クモ｜*チョウ｜ダンゴムシ
${FENCE}`;

const TEST_TYPES = { mix: '選んで答える問題と書いて答える問題をまぜる', choice: 'すべて選んで答える問題（選択肢は4つ）', write: 'すべて書いて答える問題（短い言葉や数で答える）' };
const LEVELS = { easy: 'やさしめ（基本の確認）', normal: 'ふつう（教科書の練習問題くらい）', hard: 'むずかしめ（活用・応用をふくむ）' };

function buildTestPrompt(a, currentText) {
  const who = 'あなたは日本の小学校の先生を手伝う、教材づくりのアシスタントです。';
  const cond = lineList([
    `対象：${gradeText(a.grade)}`,
    a.subject && `教科：${a.subject}`,
    a.unit && `単元・内容：${a.unit}`,
    a.goal === 'create' && `問題数：${a.count}問`,
    a.goal === 'create' && `問題の形式：${TEST_TYPES[a.type] || TEST_TYPES.mix}`,
    a.goal === 'create' && `難しさ：${LEVELS[a.level] || LEVELS.normal}`,
    a.explain && 'すべての問題に、子ども向けの短い解説をつける',
    a.extra && `そのほか：${a.extra}`,
  ]);

  if (a.goal === 'review') {
    return `${who}
次の確認テストの問題を見直して、よりよくしてください。

【条件】
${cond}

【お願い】
1. 問題ごとに、正答のまちがい・あいまいな表現・学年に合わない言葉・答えが複数考えられる問題がないかを確かめ、気づいたことを短い箇条書きで教えてください。
2. そのうえで、直したあとの問題の全体を、下の【書き方のルール】で1つのコードブロックにまとめてください。

【書き方のルール】
${TEST_FORMAT_RULES(a.grade)}

【書き方の例】
${TEST_EXAMPLE}

【今の問題】
${FENCE}
${(currentText || '').trim() || '（ここに問題を貼り付けてください）'}
${FENCE}`;
  }

  return `${who}
次の条件で、確認テストの問題を作ってください。

【条件】
${cond}

【書き方のルール（必ず守ってください）】
${TEST_FORMAT_RULES(a.grade)}
- コードブロックの前後に、前置きや説明は書かないでください。

【書き方の例】
${TEST_EXAMPLE}`;
}

/* ---------- アンケート ---------- */
function buildSurveyPrompt(a, currentText, scaleLabels) {
  const who = 'あなたは日本の小学校の先生を手伝う、授業づくりのアシスタントです。';
  const choices = scaleLabels.map((l) => `「${l}」`).join('・');
  const cond = lineList([
    `対象：${gradeText(a.grade)}`,
    a.subject && `教科：${a.subject}`,
    a.purpose && `アンケートの目的：${a.purpose}`,
    a.goal === 'create' && `選択式の質問の数：${a.count}問`,
    a.goal === 'create' && `書いて答える質問の数：${a.free}問`,
    `選択式の質問は、${choices} の${scaleLabels.length}つから選んで答えます。この選択肢で自然に答えられる質問にしてください。`,
    a.extra && `そのほか：${a.extra}`,
  ]);
  const rules = lineList([
    '質問だけを、1つのコードブロック（```）の中に、1行に1問で書いてください。',
    '選択式の質問は、質問文だけを書く（選択肢は書かない）',
    '書いて答える質問は、行の頭に「自由：」をつける',
    '番号・記号・太字などの飾りはつけない。1つの質問で2つのことを聞かない',
    `${gradeText(a.grade)}が読める言葉づかいにし、ていねいな言い方（〜ましたか）にする`,
  ]);
  const example = `${FENCE}
めあてを達成できましたか
友だちの考えを聞いて、自分の考えが広がりましたか
自由：今日の学習でわかったことを書きましょう
${FENCE}`;

  if (a.goal === 'review') {
    return `${who}
次のふり返りアンケートの質問を見直して、よりよくしてください。

【条件】
${cond}

【お願い】
1. 質問ごとに、答えにくい・あいまい・選択肢と合わない・学年に合わない言葉がないかを確かめ、気づいたことを短い箇条書きで教えてください。
2. そのうえで、直したあとの質問の全体を、下の【書き方のルール】で1つのコードブロックにまとめてください。

【書き方のルール】
${rules}

【書き方の例】
${example}

【今の質問】
${FENCE}
${(currentText || '').trim() || '（ここに質問を貼り付けてください）'}
${FENCE}`;
  }

  return `${who}
次の条件で、子どもが答えるアンケートの質問を作ってください。

【条件】
${cond}

【書き方のルール（必ず守ってください）】
${rules}
- コードブロックの前後に、前置きや説明は書かないでください。

【書き方の例】
${example}`;
}

/* ---------- AIの回答から問題の行だけを取り出す ---------- */
function extractAiLines(raw) {
  const text = String(raw).replace(/\r\n?/g, '\n');
  const blocks = [...text.matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  const body = blocks.length ? blocks[blocks.length - 1] : text;
  return body.split('\n')
    .map((l) => stripNumber(l.trim()
      .replace(/^(?:[-*]\s+|[・●■◆]\s*|#+\s*)/, '') // 箇条書き・見出し記号
      .replace(/\*\*(.+?)\*\*/g, '$1') // 太字
      .replace(/\s*\|\s*/g, '｜'))) // 半角の区切りを全角に・行頭の番号を取りのぞく
    .filter((l) => l && !/^```/.test(l) && !/^(?:【.*】|問題[:：]?|質問[:：]?)$/.test(l))
    .join('\n');
}
