// Server-side paid reading. This corpus never ships to the browser.
import { keccak256, encodePacked } from 'viem';

const ARCHETYPES = [
  { name: '守夜人', long: '你守的不是仓，是一个还没到来的时刻。别人用频率换安全感，你用沉默换赔率。' },
  { name: '赌徒', long: '你和概率的关系比和人的关系更稳定。你真正上瘾的不是赢，是开牌前那三秒。' },
  { name: '巨鲸', long: '你习惯在水下移动。你以为自己很安静，但每一次呼吸都会让别人的海面起浪。' },
  { name: '钓手', long: '你最大的本钱不是耐心，是能在别人都动的时候不动。这份定力值钱，也容易过期。' },
  { name: '隐士', long: '你把生活拆成很多个地址，每个地址只装一件事。你怕的不是被看见，是被看穿。' },
  { name: '闪电手', long: '你的手指比你的判断快。多数时候这是天赋，少数时候这是你亏钱的唯一原因。' },
  { name: '天选', long: '你经历过几次无法解释的好运，于是开始怀疑努力。别怀疑，运气也需要接得住。' },
  { name: '游魂', long: '你在每条链上都留过脚印，却没有一条链记得你。自由是真的，孤独也是真的。' },
];

const LABELS = ['定力', '赌性', '财气', '耐心', '隐忍', '手速', '运势', '无常'];

const GATES = [
  '今天最容易犯的错，是在一个你已经看过三遍的叙事里，假装自己第一次听说。',
  '今天会有一个「看起来来不及了」的机会。它大概率真的来不及，也大概率不值得。',
  '今天你的判断力在上午最好，情绪在深夜最贵。把重要的决定放在午饭前。',
  '今天会有人用「大家都上了」来说服你。记住，大家都上了的时候，车通常已经到站。',
  '今天适合处理旧仓位，不适合开新故事。旧账清了，新局才有位置。',
  '今天你对风险的容忍度会比平时高，这不是勇气，是血糖或者睡眠的问题。',
  '今天会有一个瞬间让你想证明自己。那一刻的签名，通常是你本月最贵的一笔。',
  '今天的信息噪声会比平时多。少看一个群，比多看十个 alpha 更有用。',
];

const THREE_THINGS = [
  ['把止损写下来，再下单', '只碰你看得懂的第一个标的', '在睡前把钱包断开一次'],
  ['先卖出最让你焦虑的那一个', '把今天的操作控制在两笔以内', '给明天的自己留一半子弹'],
  ['拒绝一个你不想去的局', '把盈利的一部分换成稳定币', '重新读一遍你最早的投资笔记'],
  ['关掉价格提醒两小时', '只回答一个问题：我为什么持有', '把杠杆降到你能睡着的位置'],
  ['给一个老朋友发消息，不聊币', '把最赚钱的仓位减掉十分之一', '在纸上写下三个不买的理由'],
  ['把手机的行情小组件删掉', '今天不点任何陌生链接', '把「回本」两个字从今天的词典里删掉'],
];

const CLOSINGS = [
  '命里有时终须有，命里无时莫追高。',
  '你缺的不是机会，是一次不点链接的夜晚。',
  '该来的空投会来，不该开的杠杆别开。',
  '这一签不保发财，只保你少亏一次。',
  '明年今日，你会感谢今天没梭哈的自己。',
  '钱包不会说话，但区块记得你做过什么。',
  '运势是风，仓位是帆。帆太大，风就是灾。',
  '今天不适合改命，适合改一个很小的习惯。',
];

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const byteAt = (hash, i) => parseInt(hash.slice(2 + i * 2, 4 + i * 2), 16);

export function derive(address, day, seed) {
  const hash = keccak256(
    encodePacked(['bytes32', 'address', 'uint256'], [seed, address, BigInt(day)]),
  );
  const rnd = mulberry32(parseInt(hash.slice(2, 10), 16));
  const traits = LABELS.map(() => 16 + Math.floor(rnd() * 80));

  let topIdx = 0;
  traits.forEach((v, i) => {
    if (v > traits[topIdx]) topIdx = i;
  });
  const lowIdx = traits.reduce((a, b, i) => (traits[i] < traits[a] ? i : a), 0);

  const b = (n) => byteAt(hash, n);
  const gate = GATES[b(20) % GATES.length];
  const three = THREE_THINGS[b(21) % THREE_THINGS.length];
  const closing = CLOSINGS[b(22) % CLOSINGS.length];

  return {
    hash,
    archetype: ARCHETYPES[topIdx],
    top: { label: LABELS[topIdx], value: traits[topIdx] },
    low: { label: LABELS[lowIdx], value: traits[lowIdx] },
    gate,
    three,
    closing,
  };
}

export function readingText(address, day, seed) {
  const d = derive(address, day, seed);
  const gap = d.top.value - d.low.value;

  return {
    hash: d.hash,
    title: `${d.archetype.name} · 完整解签`,
    paragraphs: [
      `${d.archetype.long} 你的「${d.top.label}」是 ${d.top.value}，「${d.low.label}」只有 ${d.low.value}，中间隔着 ${gap} 点——这就是你今年反复卡住的地方：强项把你推上场，弱项决定你能待多久。`,
      `今日关隘：${d.gate}`,
      `给你的三件事：① ${d.three[0]}；② ${d.three[1]}；③ ${d.three[2]}。不用全做，做到一件，今天就没白过。`,
      `断语：${d.closing}`,
    ],
  };
}
