/* ============================================================
   链签 CHAIN OMEN
   deterministic daily fortune -> eight-axis chart -> share card
   ============================================================ */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

/* ---------- deterministic primitives ---------- */

function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* keccak-256 (original Keccak padding) — no dependencies */
const MASK64 = (1n << 64n) - 1n;
const RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const ROTC = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

function rotl(v, n) {
  if (n === 0) return v;
  const b = BigInt(n);
  return ((v << b) | (v >> (64n - b))) & MASK64;
}

function keccakF(A) {
  const C = new Array(5);
  const B = new Array(25);
  for (let round = 0; round < 24; round++) {
    for (let x = 0; x < 5; x++) C[x] = A[x] ^ A[x + 5] ^ A[x + 10] ^ A[x + 15] ^ A[x + 20];
    for (let x = 0; x < 5; x++) {
      const D = C[(x + 4) % 5] ^ rotl(C[(x + 1) % 5], 1);
      for (let y = 0; y < 5; y++) A[x + 5 * y] ^= D;
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        B[y + 5 * ((2 * x + 3 * y) % 5)] = rotl(A[x + 5 * y], ROTC[x + 5 * y]);
      }
    }
    for (let x = 0; x < 5; x++) {
      for (let y = 0; y < 5; y++) {
        A[x + 5 * y] = B[x + 5 * y] ^ ((~B[((x + 1) % 5) + 5 * y] & MASK64) & B[((x + 2) % 5) + 5 * y]);
      }
    }
    A[0] ^= RC[round];
  }
}

function keccak256Bytes(bytes) {
  const rate = 136;
  const len = bytes.length;
  const total = Math.ceil((len + 1) / rate) * rate;
  const m = new Uint8Array(total);
  m.set(bytes);
  m[len] ^= 0x01;
  m[total - 1] ^= 0x80;

  const A = new Array(25).fill(0n);
  for (let off = 0; off < total; off += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let j = 7; j >= 0; j--) lane = (lane << 8n) | BigInt(m[off + i * 8 + j]);
      A[i] ^= lane;
    }
    keccakF(A);
  }

  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) {
    let lane = A[i];
    for (let j = 0; j < 8; j++) {
      out[i * 8 + j] = Number(lane & 0xffn);
      lane >>= 8n;
    }
  }
  return out;
}

const TE = new TextEncoder();
const toHex = (bytes) => [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
const keccakHex = (str) => toHex(keccak256Bytes(TE.encode(str)));
function hexToBytes(h) {
  const s = h.replace(/^0x/, '');
  const out = new Uint8Array(s.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(s.slice(i * 2, i * 2 + 2), 16);
  return out;
}
function dayBytes(day) {
  const out = new Uint8Array(32);
  let d = BigInt(day);
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(d & 0xffn);
    d >>= 8n;
  }
  return out;
}
// keccak256(abi.encodePacked(bytes32 daySeed, address wallet, uint256 day))
function fortuneHash(address, day, daySeed) {
  const buf = new Uint8Array(84);
  buf.set(hexToBytes(daySeed), 0);
  buf.set(hexToBytes(address.toLowerCase()), 32);
  buf.set(dayBytes(day), 52);
  return '0x' + toHex(keccak256Bytes(buf));
}

const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];
const esc = (v) =>
  String(v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/* ---------- day boundary (UTC+8, matches contract) ---------- */

const DAY_OFFSET = 8 * 3600 * 1000;
const DAY_INDEX = Math.floor((Date.now() + DAY_OFFSET) / 86400000);
const dateLabel = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
  .format(new Date(DAY_INDEX * 86400000 - DAY_OFFSET))
  .replace(/\//g, '.');

/* ---------- deployed contract (set CONTRACT after mainnet deploy) ---------- */

const CONTRACT_DEFAULT = '0x5d07f0386d53f99bacd6baaf85c289201313565a';
const ZERO_ADDR = '0x0000000000000000000000000000000000000000';
const CONTRACT = (() => {
  let saved = '';
  try {
    saved = localStorage.getItem('omen.contract') || '';
  } catch {}
  const addr = saved || CONTRACT_DEFAULT;
  return addr !== ZERO_ADDR && /^0x[0-9a-fA-F]{40}$/.test(addr) ? addr : '';
})();

const RPC_URL = 'https://rpc.xlayer.tech';
const SEL_DAY_SEED = '0x9c137029';
let seedCache = { day: null, seed: null, live: false };

async function fetchDaySeed(day) {
  if (!CONTRACT) return null;
  const data = SEL_DAY_SEED + day.toString(16).padStart(64, '0');
  try {
    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [{ to: CONTRACT, data }, 'latest'],
      }),
    });
    const json = await res.json();
    const hex = json && json.result;
    if (!hex || !/^0x[0-9a-fA-F]{64}$/.test(hex) || /^0x0{64}$/.test(hex)) return null;
    return hex.toLowerCase();
  } catch {
    return null;
  }
}

async function ensureSeed() {
  if (seedCache.day === DAY_INDEX) return seedCache;
  const live = await fetchDaySeed(DAY_INDEX);
  seedCache = live
    ? { day: DAY_INDEX, seed: live, live: true }
    : { day: DAY_INDEX, seed: keccakHex(`chain-omen-day:${DAY_INDEX}`), live: false };
  return seedCache;
}

const wallet = window.okxwallet || window.ethereum || null;
const SEL_SEAL = '0x3fb27b85';
const SEAL_FEE = '0x5af3107a4000'; // 0.0001 OKB

async function ensureXLayer() {
  const id = await wallet.request({ method: 'eth_chainId' });
  if (String(id).toLowerCase() === '0xc4') return;
  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0xc4' }] });
  } catch (err) {
    if (err.code === 4902) {
      await wallet.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: '0xc4',
            chainName: 'X Layer',
            nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
            rpcUrls: ['https://rpc.xlayer.tech'],
            blockExplorerUrls: ['https://www.oklink.com/xlayer'],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

async function sealNow() {
  const btn = $('#sealNow');
  const out = $('#sealResult');
  if (!wallet || !CONTRACT || !current) return;
  btn.disabled = true;
  btn.textContent = '等待钱包确认…';
  out.textContent = '';
  try {
    await ensureXLayer();
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    const tx = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ from: accounts[0], to: CONTRACT, data: SEL_SEAL, value: SEAL_FEE }],
    });
    out.textContent = `已发出 ${tx.slice(0, 10)}… 等待上链`;
    let rc = null;
    for (let i = 0; i < 60; i++) {
      rc = await wallet.request({ method: 'eth_getTransactionReceipt', params: [tx] });
      if (rc) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!rc) throw new Error('等待上链超时，请到 OKLink 查看');
    if (rc.status !== '0x1') throw new Error('交易失败：今天可能已经存证过了');
    out.innerHTML = `已上链 · <a href="https://www.oklink.com/xlayer/tx/${tx}" target="_blank" rel="noopener">${tx.slice(0, 10)}…</a>`;
    btn.textContent = '已存证';
    refreshRevenue();
  } catch (err) {
    out.textContent = err && err.code === 4001 ? '你取消了签名。' : String((err && err.message) || err);
    btn.disabled = false;
    btn.textContent = '重试存证';
  }
}

function paintContract() {
  if (!CONTRACT) return;
  const el = $('#contractAddr');
  if (el) {
    el.textContent = `${CONTRACT.slice(0, 6)}…${CONTRACT.slice(-4)}`;
    el.href = `https://www.oklink.com/xlayer/address/${CONTRACT}`;
    el.target = '_blank';
    el.rel = 'noopener';
    el.title = CONTRACT;
  }
  const note = $('#mNote');
  if (note) note.textContent = '存证由 OKX Wallet 签名；日种子取当日首个区块的父哈希。';
}

/* ---------- content model ---------- */

const TRAITS = [
  { label: '定力', glyph: '☰', gua: '乾', xiang: '天行健，君子以自强不息。' },
  { label: '赌性', glyph: '☱', gua: '兑', xiang: '丽泽兑，君子以朋友讲习。' },
  { label: '财气', glyph: '☲', gua: '离', xiang: '明两作离，大人以继明照于四方。' },
  { label: '耐心', glyph: '☳', gua: '震', xiang: '洊雷震，君子以恐惧修省。' },
  { label: '隐忍', glyph: '☴', gua: '巽', xiang: '随风巽，君子以申命行事。' },
  { label: '手速', glyph: '☵', gua: '坎', xiang: '水洊至坎，君子以常德行。' },
  { label: '运势', glyph: '☶', gua: '艮', xiang: '兼山艮，君子以思不出其位。' },
  { label: '无常', glyph: '☷', gua: '坤', xiang: '地势坤，君子以厚德载物。' },
];

const ARCHETYPES = [
  {
    sigil: '守',
    name: '守夜人',
    en: 'THE NIGHT WATCHER',
    desc: '你的地址像一座不熄灯的哨塔。别人在追涨杀跌，你在等一个自己也说不清的时刻。',
  },
  {
    sigil: '赌',
    name: '赌徒',
    en: 'THE DEGENERATE',
    desc: '你不是在交易，你是在跟概率谈恋爱。仓位是你的情书，爆仓是你的分手信。',
  },
  {
    sigil: '鲸',
    name: '巨鲸',
    en: 'THE LEVIATHAN',
    desc: '你的一次转账，能让别人的 K 线抖三抖。你很低调，但链上从不替你保密。',
  },
  {
    sigil: '钓',
    name: '钓手',
    en: 'THE ANGLER',
    desc: '你擅长把时间熬成筹码。别人问你何时动手，你说：等鱼先动。',
  },
  {
    sigil: '隐',
    name: '隐士',
    en: 'THE HERMIT',
    desc: '你有一百个钱包，没有一个用真名。你不是神秘，你只是不想被 @。',
  },
  {
    sigil: '电',
    name: '闪电手',
    en: 'THE FLASH',
    desc: '区块还没出，你已经签完名了。你的手速是天赋，也是你最大的风险敞口。',
  },
  {
    sigil: '签',
    name: '天选',
    en: 'THE CHOSEN',
    desc: '空投总在你睡着的时候来。你怀疑过自己是内幕，后来发现只是命好。',
  },
  {
    sigil: '雾',
    name: '游魂',
    en: 'THE DRIFTER',
    desc: '你在每条链上都留过脚印，没有一条链记得你。你是流动性，也是传说。',
  },
];

const GRADES = [
  { label: '上上签', cls: '' },
  { label: '上签', cls: '' },
  { label: '中签', cls: 'g-mid' },
  { label: '下签', cls: 'g-low' },
  { label: '下下签', cls: 'g-low' },
];

const POEM = [
  [
    '万链俱寂夜观星', '一签落定问前程', '区块深深锁旧梦', '灯火阑珊数残星', '风起链上夜未央',
    '孤地址里藏春秋', '潮退方知谁未眠', '星图旋转问归途', '一枚私钥一寸心', '链上无风也起浪',
  ],
  [
    '持仓如雪压孤城', '浮盈浮亏皆是幻', '旧日空投已成尘', '冷钱包里有余温', '半仓明月半仓风',
    '一笔签名一世情', '孤灯照见旧仓位', '梦里曾骑百倍鲸', '醒来犹握半枚币', '地址无言水自流',
  ],
  [
    '莫笑今朝囊中涩', '若问何时风转向', '且把私钥收袖里', '休向他人问吉凶', '忽有鲸影过深池',
    '旧路已断新桥起', '且将执念付流水', '莫在深夜点链接', '天意从来高难问', '一朝风起云飞扬',
  ],
  [
    '明朝或有鲸来渡', '一轮明月照归途', '静待花开第几层', '自有清风送好音', '回头已是链上人',
    '且看潮生又潮平', '此签只合自己知', '来日方长莫心急', '山河无恙链长存', '下个区块见分晓',
  ],
];

const YI = ['加仓', '撤池', '换链', '潜水', '发币', '读书', '早睡', '归零', '复盘', '断舍离', '建仓', '空仓', '装死', '清仓'];
const JI = ['追高', '开合约', '信KOL', '点空投链接', '熬夜', '换头像', '抄底', '梭哈', '借贷', '手动撤池', '看群', '补仓'];
const COLORS = ['玄黑', '朱砂', '月白', '藤黄', '石青', '藕荷', '松绿', '鎏金'];
const OBJECTS = ['冷钱包', '旧电脑', '冰美式', '登机牌', '一枚硬币', '一只猫', '一根网线', '纸质地图'];
const DIRS = ['西北', '西', '南', '东', '东南', '北', '东北', '西南'];
const HOURS = ['子时', '丑时', '寅时', '卯时', '辰时', '巳时', '午时', '未时', '申时', '酉时', '戌时', '亥时'];
const CLOSINGS = [
  '命里有时终须有，命里无时莫追高。',
  '你缺的不是机会，是一次不点链接的夜晚。',
  '该来的空投会来，不该开的杠杆别开。',
  '这一签不保发财，只保你少亏一次。',
  '明年今日，你会感谢今天没梭哈的自己。',
  '钱包不会说话，但区块记得你做过什么。',
];
const ADVICE = [
  '宜顺势而为，忌迟疑',
  '宜稳中求进，忌贪',
  '宜守中，忌重仓',
  '宜静养，忌出手',
  '宜空仓观星，忌一切操作',
];

/* ---------- the oracle ---------- */

function castFortune(address, day = DAY_INDEX, daySeed = null, seedLive = false) {
  const seed = daySeed || keccakHex(`chain-omen-day:${day}`);
  const hash = fortuneHash(address, day, seed);
  const rnd = mulberry32(parseInt(hash.slice(2, 10), 16));

  const traits = TRAITS.map((t) => ({ ...t, value: 16 + Math.floor(rnd() * 80) }));

  let topIdx = 0;
  traits.forEach((t, i) => {
    if (t.value > traits[topIdx].value) topIdx = i;
  });
  const top = traits[topIdx];
  const low = traits.reduce((a, b) => (b.value < a.value ? b : a), traits[0]);
  const archetype = ARCHETYPES[topIdx];

  const g = rnd();
  const gradeIdx = g < 0.06 ? 0 : g < 0.3 ? 1 : g < 0.74 ? 2 : g < 0.94 ? 3 : 4;
  const grade = GRADES[gradeIdx];
  const no = 1 + Math.floor(rnd() * 100);

  const poem = POEM.map((pool) => pick(rnd, pool));

  const yi = pick(rnd, YI);
  const ji = pick(rnd, JI);
  const color = pick(rnd, COLORS);
  const luckyNo = 1 + Math.floor(rnd() * 99);
  const hour = pick(rnd, HOURS);
  const object = pick(rnd, OBJECTS);
  const closing = pick(rnd, CLOSINGS);

  const dir = DIRS[topIdx];

  const p1 = `${archetype.desc} 八维之中，你的「${top.label}」最盛（${top.value}），「${low.label}」最弱（${low.value}）。强处是你的入口，弱处是你的刹车——今天别把刹车拆了。`;
  const p2 = `本卦为「${top.gua}」，${top.xiang} 签落在${dir}，${ADVICE[gradeIdx]}。若今日非要做一个决定，把它留到${hour}之后。`;
  const p3 = `断语：${closing}`;

  return {
    address,
    day,
    seed,
    seedLive,
    hash,
    traits,
    top,
    low,
    archetype,
    grade,
    gradeIdx,
    no,
    poem,
    yi,
    ji,
    color,
    luckyNo,
    hour,
    object,
    dir,
    paid: [p1, p2, p3],
    teaser: `你的命盘落在「${archetype.name}」一宫。${top.label} ${top.value} · ${low.label} ${low.value}——强处是你的入口，弱处是你的刹车。`,
  };
}

/* ---------- chart painter ---------- */

const DARK = {
  halo0: 'rgba(201,168,106,.075)',
  halo1: 'rgba(201,168,106,0)',
  grid: 'rgba(201,168,106,.13)',
  spoke: 'rgba(201,168,106,.09)',
  fill0: 'rgba(201,168,106,.10)',
  fill1: 'rgba(201,168,106,.34)',
  stroke: 'rgba(233,207,156,.68)',
  dot: '#f2e3c0',
  label: 'rgba(234,225,206,.82)',
  value: 'rgba(201,168,106,.72)',
  glyph: 'rgba(201,168,106,.40)',
  ring: 'rgba(201,168,106,.30)',
  centerBg: '#0a0a0e',
  centerText: '#e8d5a8',
  centerRing: 'rgba(201,168,106,.42)',
};

const LIGHT = {
  halo0: 'rgba(168,52,42,.05)',
  halo1: 'rgba(168,52,42,0)',
  grid: 'rgba(52,40,26,.16)',
  spoke: 'rgba(52,40,26,.12)',
  fill0: 'rgba(168,52,42,.07)',
  fill1: 'rgba(168,52,42,.19)',
  stroke: 'rgba(52,40,26,.55)',
  dot: '#8f2f26',
  label: 'rgba(42,33,22,.88)',
  value: 'rgba(120,86,44,.9)',
  glyph: 'rgba(120,86,44,.5)',
  ring: 'rgba(52,40,26,.25)',
  centerBg: '#f3ead6',
  centerText: '#8f2f26',
  centerRing: 'rgba(52,40,26,.35)',
};

function paint(ctx, size, f, theme, p) {
  ctx.clearRect(0, 0, size, size);
  if (!f) return;

  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.312;
  const R0 = R * 0.27;
  const start = -Math.PI / 2;
  const seg = (Math.PI * 2) / 8;
  const gap = 0.055;

  const labelR = R + size * 0.056;

  const fsLabel = Math.max(9, size * 0.0255);
  const fsValue = Math.max(8, size * 0.0175);

  // halo
  const halo = ctx.createRadialGradient(cx, cy, R0, cx, cy, R * 1.55);
  halo.addColorStop(0, theme.halo0);
  halo.addColorStop(1, theme.halo1);
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.55, 0, Math.PI * 2);
  ctx.fill();

  // rings
  ctx.lineWidth = 1;
  for (let k = 1; k <= 4; k++) {
    ctx.beginPath();
    ctx.arc(cx, cy, R0 + ((R - R0) * k) / 4, 0, Math.PI * 2);
    ctx.strokeStyle = k === 4 ? theme.ring : theme.grid;
    ctx.stroke();
  }

  // spokes
  for (let i = 0; i < 8; i++) {
    const a = start + i * seg;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * R0, cy + Math.sin(a) * R0);
    ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R);
    ctx.strokeStyle = theme.spoke;
    ctx.stroke();
  }

  // sectors
  f.traits.forEach((t, i) => {
    const a0 = start + i * seg + gap / 2;
    const a1 = start + (i + 1) * seg - gap / 2;
    const outer = R0 + (R - R0) * (t.value / 100) * p;

    const grad = ctx.createRadialGradient(cx, cy, R0, cx, cy, R);
    grad.addColorStop(0, theme.fill0);
    grad.addColorStop(1, theme.fill1);

    ctx.beginPath();
    ctx.arc(cx, cy, outer, a0, a1);
    ctx.arc(cx, cy, R0, a1, a0, true);
    ctx.closePath();
    ctx.globalAlpha = 0.35 + 0.65 * p;
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.strokeStyle = theme.stroke;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.globalAlpha = 1;

    const am = (a0 + a1) / 2;
    ctx.beginPath();
    ctx.arc(cx + Math.cos(am) * outer, cy + Math.sin(am) * outer, Math.max(1.6, size * 0.005), 0, Math.PI * 2);
    ctx.fillStyle = theme.dot;
    ctx.globalAlpha = 0.4 + 0.6 * p;
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  // labels + values
  const la = smooth(0.42, 1, p);
  if (la > 0) {
    ctx.textBaseline = 'middle';
    f.traits.forEach((t, i) => {
      const a = start + (i + 0.5) * seg;
      const lx = cx + Math.cos(a) * labelR;
      const ly = cy + Math.sin(a) * labelR;

      ctx.font = `500 ${fsLabel}px "Songti SC","Noto Serif SC",serif`;
      const w1 = ctx.measureText(t.label).width;
      ctx.font = `400 ${fsValue}px "SF Mono",ui-monospace,monospace`;
      const w2 = ctx.measureText(String(t.value)).width;

      const gapPx = fsLabel * 0.55;
      const x0 = lx - (w1 + gapPx + w2) / 2;

      ctx.globalAlpha = la;
      ctx.textAlign = 'left';
      ctx.fillStyle = theme.label;
      ctx.font = `500 ${fsLabel}px "Songti SC","Noto Serif SC",serif`;
      ctx.fillText(t.label, x0, ly);

      ctx.fillStyle = theme.value;
      ctx.font = `400 ${fsValue}px "SF Mono",ui-monospace,monospace`;
      ctx.fillText(String(t.value), x0 + w1 + gapPx, ly);

      ctx.globalAlpha = 1;
    });
  }

  // compass ticks
  for (let i = 0; i < 8; i++) {
    const a = start + i * seg;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * (R + size * 0.008), cy + Math.sin(a) * (R + size * 0.008));
    ctx.lineTo(cx + Math.cos(a) * (R + size * 0.022), cy + Math.sin(a) * (R + size * 0.022));
    ctx.strokeStyle = theme.spoke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // center
  ctx.beginPath();
  ctx.arc(cx, cy, R0 * 0.98, 0, Math.PI * 2);
  ctx.fillStyle = theme.centerBg;
  ctx.fill();
  ctx.strokeStyle = theme.centerRing;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, R0 * 0.74, 0, Math.PI * 2);
  ctx.strokeStyle = theme.grid;
  ctx.stroke();

  const ca = smooth(0.6, 1, p);
  ctx.globalAlpha = ca;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = theme.centerText;
  ctx.font = `400 ${Math.round(R0 * 0.9)}px "Songti SC","Noto Serif SC",serif`;
  ctx.fillText(f.archetype.sigil, cx, cy + R0 * 0.02);
  ctx.globalAlpha = 1;
}

function makeChart(canvas) {
  const ctx = canvas.getContext('2d');
  let fortune = null;
  let progress = 0;
  let size = 0;
  let raf = 0;

  function fit() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    size = canvas.clientWidth || 520;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paint(ctx, size, fortune, DARK, progress);
  }

  function animate(f) {
    fortune = f;
    progress = 0;
    cancelAnimationFrame(raf);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      progress = 1;
      paint(ctx, size, fortune, DARK, 1);
      return;
    }
    const t0 = performance.now();
    const dur = 1600;
    const tick = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      progress = 1 - Math.pow(1 - t, 3);
      paint(ctx, size, fortune, DARK, progress);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  new ResizeObserver(fit).observe(canvas);
  fit();

  return { animate, fit, get fortune() { return fortune; } };
}

/* ---------- star field ---------- */

function initSky() {
  const canvas = $('#sky');
  const ctx = canvas.getContext('2d');
  let stars = [];
  let w = 0;
  let h = 0;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 9000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 0.9 + 0.15,
      p: Math.random() * Math.PI * 2,
      s: 0.15 + Math.random() * 0.55,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.1 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.00055 * s.s + s.p));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232,213,168,${a.toFixed(3)})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) requestAnimationFrame(frame);
}

/* ---------- rendering ---------- */

const chart = makeChart($('#chart'));
let current = null;

function stagger(el, i) {
  if (!el) return;
  el.style.setProperty('--d', `${i * 70}ms`);
  el.classList.remove('reveal');
  void el.offsetWidth;
  el.classList.add('reveal');
}

function render(f, scroll = false) {
  current = f;

  $('#stageDate').textContent = dateLabel;

  const note = $('#stageNote');
  if (note) {
    note.textContent = f.seedLive
      ? `日种子已上链 · ${f.seed.slice(0, 10)}…${f.seed.slice(-6)}`
      : '演示种子 · 今日签池尚未开启';
  }

  const gradeEl = $('#grade');
  gradeEl.textContent = f.grade.label;
  gradeEl.className = 'grade ' + f.grade.cls;
  $('#no').textContent = `第 ${f.no} 签`;
  $('#hashShort').textContent = f.hash.slice(0, 6) + '…' + f.hash.slice(-4);

  $('#name').textContent = f.archetype.name;
  $('#en').textContent = f.archetype.en;
  $('#desc').textContent = f.archetype.desc;

  $('#poem').innerHTML = f.poem
    .map((line, i) => `<p style="--d:${0.25 + i * 0.13}s">${line}</p>`)
    .join('');

  $('#guaGlyph').textContent = f.top.glyph;
  $('#guaName').textContent = f.top.gua;
  $('#guaXiang').textContent = f.top.xiang;
  $('#caption').textContent = `本卦 ${f.top.glyph} ${f.top.gua} · ${f.top.xiang.split('，')[0]}`;

  $('#yi').textContent = f.yi;
  $('#ji').textContent = f.ji;

  $('#luck').innerHTML = [
    ['幸运色', f.color],
    ['数字', String(f.luckyNo)],
    ['吉位', f.dir],
    ['吉时', f.hour],
  ]
    .map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`)
    .join('');

  // dimensions
  const dims = $('#dims');
  dims.innerHTML = f.traits
    .map(
      (t) =>
        `<li><span>${t.label}</span><span class="track"><i style="--v:0%"></i></span><span class="val">${t.value}</span></li>`
    )
    .join('');
  requestAnimationFrame(() => {
    $$('#dims .track i').forEach((bar, i) => {
      bar.style.setProperty('--v', `${f.traits[i].value}%`);
    });
  });

  // reset paywall
  $('#unlock').hidden = false;
  $('#unlocked').hidden = true;
  $('#unlocked').innerHTML = '';
  $('#teaser').textContent = f.teaser;
  $('#pay').disabled = false;
  $('#pay').innerHTML = '<span>解锁 · 0.10 USDT</span><i>PAY PER READ</i>';

  $('#hash').textContent = f.hash;

  // reveal
  const seq = ['.reading-head', 'h2', '#en', '#desc', '.poem', '.gua', '.yi-ji', '.luck'];
  seq.forEach((sel, i) => stagger($(sel, $('#reading')), i));

  chart.animate(f);
  $('#download').disabled = true;

  const stage = $('#stage');
  if (stage.hidden) stage.hidden = false;
  if (scroll) {
    setTimeout(() => stage.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  }

  setTimeout(() => {
    $('#download').disabled = false;
  }, 1700);
}

/* ---------- share card ---------- */

function drawSpaced(ctx, text, x, y, spacing) {
  let cx = x;
  for (const ch of text) {
    ctx.fillText(ch, cx, y);
    cx += ctx.measureText(ch).width + spacing;
  }
}

async function buildCard(f) {
  await document.fonts.ready;

  const W = 1080;
  const H = 1440;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const x = c.getContext('2d');

  // paper
  x.fillStyle = '#f3ead6';
  x.fillRect(0, 0, W, H);

  // fibers
  const rnd = mulberry32(fnv1a(f.hash + 'paper'));
  for (let i = 0; i < 2600; i++) {
    x.globalAlpha = 0.02 + rnd() * 0.035;
    x.fillStyle = rnd() > 0.5 ? '#6b5636' : '#a8342a';
    x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2, 1);
  }
  x.globalAlpha = 1;

  // borders
  x.strokeStyle = 'rgba(52,40,26,.55)';
  x.lineWidth = 2;
  x.strokeRect(40, 40, W - 80, H - 80);
  x.strokeStyle = 'rgba(52,40,26,.2)';
  x.lineWidth = 1;
  x.strokeRect(52, 52, W - 104, H - 104);

  // header
  x.fillStyle = '#2a2116';
  x.textAlign = 'left';
  x.textBaseline = 'alphabetic';
  x.font = '600 30px "Songti SC","Noto Serif SC",serif';
  drawSpaced(x, '链签', 96, 128, 12);
  x.font = '400 10px "Didot","Times New Roman",serif';
  x.fillStyle = 'rgba(42,33,22,.55)';
  drawSpaced(x, 'CHAIN OMEN', 96, 152, 4.4);

  x.textAlign = 'right';
  x.font = '400 13px "SF Mono",ui-monospace,monospace';
  x.fillStyle = 'rgba(42,33,22,.6)';
  x.fillText(dateLabel, W - 96, 120);
  x.fillStyle = '#8f2f26';
  x.font = '500 15px "Songti SC",serif';
  x.fillText(`第 ${f.no} 签 · ${f.grade.label}`, W - 96, 148);

  // chart
  const off = document.createElement('canvas');
  const S = 760;
  off.width = S;
  off.height = S;
  const octx = off.getContext('2d');
  paint(octx, S, f, LIGHT, 1);
  x.drawImage(off, (W - S) / 2, 150);

  // name
  x.textAlign = 'center';
  x.fillStyle = '#211a11';
  x.font = '600 66px "Songti SC","Noto Serif SC",serif';
  drawSpacedCentered(x, f.archetype.name, W / 2, 990, 10);

  x.fillStyle = 'rgba(120,86,44,.85)';
  x.font = '400 11px "Didot","Times New Roman",serif';
  drawSpacedCentered(x, f.archetype.en, W / 2, 1026, 5);

  // divider
  x.strokeStyle = 'rgba(52,40,26,.18)';
  x.beginPath();
  x.moveTo(150, 1060);
  x.lineTo(W - 150, 1060);
  x.stroke();

  // poem
  x.fillStyle = '#2a2116';
  x.font = '400 33px "Songti SC","Noto Serif SC",serif';
  x.textAlign = 'left';
  f.poem.forEach((line, i) => {
    drawSpaced(x, line, 150, 1112 + i * 50, 7);
  });

  // yi / ji
  x.font = '400 15px "PingFang SC",sans-serif';
  x.fillStyle = 'rgba(42,33,22,.62)';
  x.fillText('宜', 150, 1312);
  x.fillStyle = '#8a6a35';
  x.font = '400 18px "Songti SC",serif';
  x.fillText(f.yi, 180, 1312);

  x.fillStyle = 'rgba(42,33,22,.62)';
  x.font = '400 15px "PingFang SC",sans-serif';
  x.fillText('忌', 330, 1312);
  x.fillStyle = '#8f2f26';
  x.font = '400 18px "Songti SC",serif';
  x.fillText(f.ji, 360, 1312);

  // address + hash
  x.font = '400 11px "SF Mono",ui-monospace,monospace';
  x.fillStyle = 'rgba(42,33,22,.42)';
  x.fillText(`${f.address.slice(0, 10)}…${f.address.slice(-6)}  ·  ${f.hash.slice(0, 18)}…`, 96, 1372);

  // seal
  x.save();
  x.translate(918, 1250);
  x.rotate(-0.07);
  x.fillStyle = '#a8342a';
  x.fillRect(-52, -52, 104, 104);
  x.strokeStyle = 'rgba(243,234,214,.9)';
  x.lineWidth = 2;
  x.strokeRect(-44, -44, 88, 88);
  x.fillStyle = '#f3ead6';
  x.font = '600 38px "Songti SC",serif';
  x.textAlign = 'center';
  x.fillText('链', 0, -6);
  x.fillText('签', 0, 34);
  x.restore();

  return c;
}

function drawSpacedCentered(ctx, text, cx, y, spacing) {
  const widths = [...text].map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + spacing * (widths.length - 1);
  let px = cx - total / 2;
  [...text].forEach((ch, i) => {
    ctx.fillText(ch, px + widths[i] / 2, y);
    px += widths[i] + spacing;
  });
}

async function downloadCard() {
  if (!current) return;
  const btn = $('#download');
  const old = btn.textContent;
  btn.textContent = '生成中…';
  btn.disabled = true;
  try {
    const card = await buildCard(current);
    const blob = await new Promise((res) => card.toBlob(res, 'image/png'));
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chain-omen-${current.address.slice(2, 8)}-${current.day}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } finally {
    btn.textContent = old;
    btn.disabled = false;
  }
}

/* ---------- interactions ---------- */

function randomAddress() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return '0x' + [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function normalize(input) {
  let v = input.trim().replace(/\s+/g, '').replace(/^0X/, '0x');
  if (!v) return null;
  if (!v.startsWith('0x')) v = '0x' + v;
  return /^0x[0-9a-fA-F]{40}$/.test(v) ? v : false;
}

function shake(el) {
  el.animate(
    [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(-3px)' },
      { transform: 'translateX(0)' },
    ],
    { duration: 320, easing: 'ease-out' }
  );
}

async function castFromInput() {
  const input = $('#addr');
  const parsed = normalize(input.value);
  if (parsed === false) {
    shake(input);
    input.focus();
    return;
  }
  const address = parsed || randomAddress();
  input.value = address;
  const s = await ensureSeed();
  const f = castFortune(address, DAY_INDEX, s.seed, s.live);
  render(f, true);
  try {
    history.replaceState(null, '', `?a=${address}`);
  } catch {}
}

$('#cast').addEventListener('submit', (e) => {
  e.preventDefault();
  castFromInput();
});

$('#random').addEventListener('click', () => {
  $('#addr').value = randomAddress();
  castFromInput();
});

$('#again').addEventListener('click', () => {
  document.body.classList.remove('shared');
  $('#addr').value = '';
  try {
    history.replaceState(null, '', location.pathname);
  } catch {}
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => $('#addr').focus(), 500);
});

$('#download').addEventListener('click', downloadCard);

/* ---------- x402: pay per reading ---------- */

const b64 = {
  encode(obj) {
    const bytes = new TextEncoder().encode(JSON.stringify(obj));
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  },
  decode(str) {
    const bin = atob(str);
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
  },
};

async function payForReading() {
  const qs = new URLSearchParams({ address: current.address, day: String(current.day) });
  const url = `/api/reading?${qs}`;
  let res;
  try {
    res = await fetch(url, { headers: { accept: 'application/json' } });
  } catch {
    return { offline: true };
  }
  if (res.status === 404 || (res.headers.get('content-type') || '').includes('text/html')) {
    return { offline: true };
  }

  let tx = '';

  if (res.status === 402) {
    if (!wallet) throw new Error('需要钱包签名：请安装 OKX Wallet');

    const header = res.headers.get('PAYMENT-REQUIRED');
    const pr = header ? b64.decode(header) : await res.json();
    const req = pr?.accepts?.[0];
    if (!req) throw new Error('没有可用的支付方式');

    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    const from = accounts[0];
    await ensureXLayer();

    const now = Math.floor(Date.now() / 1000);
    const nonce =
      '0x' +
      [...crypto.getRandomValues(new Uint8Array(32))]
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

    const authorization = {
      from,
      to: req.payTo,
      value: String(req.amount || req.maxAmountRequired),
      validAfter: String(now - 5),
      validBefore: String(now + (req.maxTimeoutSeconds || 300)),
      nonce,
    };

    const domain = {
      name: req.extra?.name || 'USD₮0',
      version: req.extra?.version || '1',
      chainId: 196,
      verifyingContract: req.asset,
    };
    const types = {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    };

    const signature = await wallet.request({
      method: 'eth_signTypedData_v4',
      params: [
        from,
        JSON.stringify({
          domain,
          types,
          primaryType: 'TransferWithAuthorization',
          message: authorization,
        }),
      ],
    });

    const payload = {
      x402Version: pr.x402Version || 2,
      accepted: req,
      payload: { authorization, signature },
    };

    res = await fetch(url, {
      headers: {
        accept: 'application/json',
        'PAYMENT-SIGNATURE': b64.encode(payload),
      },
    });

    const settle = res.headers.get('PAYMENT-RESPONSE');
    if (settle) {
      try {
        tx = b64.decode(settle).transaction || '';
      } catch {}
    }
  }

  if (!res.ok) {
    let msg = `支付失败（${res.status}）`;
    try {
      const j = await res.json();
      if (j.error) msg = j.error;
    } catch {}
    throw new Error(msg);
  }

  return { ...(await res.json()), tx };
}

function showPaid(data) {
  $('#unlock').hidden = true;
  const box = $('#unlocked');
  box.hidden = false;
  const tag = data.mock ? 'PAID · DEMO' : 'PAID · 0.10 USDT · X402';
  const safeTx = /^0x[0-9a-fA-F]{64}$/.test(data.tx || '') ? data.tx : '';
  const tx = safeTx
    ? `<p class="fine">tx <a href="https://www.oklink.com/xlayer/tx/${safeTx}" target="_blank" rel="noopener">${safeTx.slice(0, 12)}…</a></p>`
    : '';
  box.innerHTML =
    `<span class="paid-stamp">${esc(tag)}</span>` +
    `<h4>${esc(data.title || '完整解签')}</h4>` +
    (data.paragraphs || current.paid).map((p) => `<p>${esc(p)}</p>`).join('') +
    tx;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

$('#pay').addEventListener('click', async () => {
  if (!current || $('#pay').disabled) return;
  const btn = $('#pay');
  const note = $('#payNote');
  btn.disabled = true;
  btn.innerHTML = '<span>正在结算…</span><i>X402</i>';
  note.classList.remove('err');
  note.textContent = '在钱包里签一条 EIP-3009 授权，gas 由 facilitator 代付。';

  try {
    const data = await payForReading();
    if (data.offline) {
      showPaid({ ...current, mock: true, title: '完整解签', paragraphs: current.paid });
      note.textContent = '静态演示：未连接支付服务，已本地解锁。';
    } else {
      showPaid(data);
      note.textContent = '';
    }
  } catch (err) {
    btn.disabled = false;
    btn.innerHTML = '<span>重试 · 0.10 USDT</span><i>PAY PER READ</i>';
    note.classList.add('err');
    note.textContent = err && err.code === 4001 ? '你取消了签名。' : String((err && err.message) || err);
  }
});

/* seal modal */
/* ---------- contract revenue ---------- */

const SEL_ACCRUED = '0xa07e52a2';
const SEL_OWNER = '0x8da5cb5b';
const SEL_WITHDRAW = '0x51cff8d9';
let revOwner = '';

function fmtWei(hex) {
  const w = BigInt(hex);
  const whole = w / 10n ** 18n;
  const frac = (w % 10n ** 18n).toString().padStart(18, '0').slice(0, 6).replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''} OKB`;
}

async function ethCall(to, data) {
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }),
  });
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

async function refreshRevenue() {
  const amountEl = $('#revAmount');
  const noteEl = $('#revNote');
  const btn = $('#withdrawBtn');
  if (!amountEl || !noteEl || !btn) return;

  if (!CONTRACT) {
    amountEl.textContent = '—';
    noteEl.textContent = '合约未部署。';
    btn.hidden = true;
    return;
  }

  try {
    const [accHex, ownerHex] = await Promise.all([
      ethCall(CONTRACT, SEL_ACCRUED),
      ethCall(CONTRACT, SEL_OWNER),
    ]);
    const acc = BigInt(accHex);
    revOwner = '0x' + String(ownerHex).slice(-40);
    amountEl.textContent = fmtWei(accHex);

    if (!wallet) {
      btn.hidden = true;
      noteEl.textContent = '连接钱包后，owner 可提取。';
      return;
    }

    let account = '';
    try {
      const accounts = await wallet.request({ method: 'eth_accounts' });
      account = (accounts && accounts[0]) || '';
    } catch {}

    if (!account) {
      btn.hidden = false;
      btn.disabled = false;
      btn.textContent = '连接 owner 钱包';
      noteEl.textContent = '连接后检查提取权限。';
      return;
    }
    if (account.toLowerCase() !== revOwner.toLowerCase()) {
      btn.hidden = true;
      noteEl.textContent = `当前钱包不是 owner（${revOwner.slice(0, 6)}…${revOwner.slice(-4)}）。`;
      return;
    }

    btn.hidden = false;
    btn.disabled = acc === 0n;
    btn.textContent = acc === 0n ? '暂无可提取收入' : '提取到我的钱包';
    noteEl.textContent = acc === 0n ? '还没有人存证。' : '只有 owner 能提取，合约会强制校验。';
  } catch {
    amountEl.textContent = '读取失败';
    btn.hidden = true;
    noteEl.textContent = 'RPC 暂时不可用。';
  }
}

async function withdrawRevenue() {
  const amountEl = $('#revAmount');
  const note = $('#revNote');
  const btn = $('#withdrawBtn');
  if (!wallet || !CONTRACT || !revOwner) return;

  btn.disabled = true;
  btn.textContent = '等待钱包确认…';
  note.textContent = '';

  try {
    await ensureXLayer();
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    const from = accounts && accounts[0];
    if (!from) throw new Error('没有连接钱包');
    if (from.toLowerCase() !== revOwner.toLowerCase()) {
      await refreshRevenue();
      throw new Error('当前钱包不是 owner');
    }

    const data = SEL_WITHDRAW + from.slice(2).toLowerCase().padStart(64, '0');
    const tx = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ from, to: CONTRACT, data }],
    });

    note.textContent = `交易已发出 ${tx.slice(0, 10)}… 等待上链`;
    let rc = null;
    for (let i = 0; i < 60; i++) {
      rc = await wallet.request({ method: 'eth_getTransactionReceipt', params: [tx] });
      if (rc) break;
      await new Promise((r) => setTimeout(r, 2000));
    }
    if (!rc) throw new Error('等待上链超时，请到 OKLink 查看');
    if (rc.status !== '0x1') throw new Error('提取失败');

    if (amountEl) amountEl.textContent = '0 OKB';
    note.innerHTML = `已提取 · <a href="https://www.oklink.com/xlayer/tx/${tx}" target="_blank" rel="noopener">${tx.slice(0, 10)}…</a>`;
    btn.textContent = '已提取';
  } catch (err) {
    note.textContent = err && err.code === 4001 ? '你取消了签名。' : String((err && err.message) || err);
    btn.disabled = false;
    btn.textContent = '重试提取';
  }
}

function openModal() {
  if (!current) return;
  $('#mAddr').textContent = current.address;
  $('#mDay').textContent = `${current.day} · ${dateLabel}`;
  $('#mSeed').textContent = current.seed;
  $('#mHash').textContent = current.hash;
  $('#mCmd').textContent =
    `cast send ${CONTRACT || '<CONTRACT>'} "seal()" \\\n  --value 0.0001ether \\\n  --rpc-url https://rpc.xlayer.tech \\\n  --private-key $PK`;
  const canSeal = !!(wallet && CONTRACT);
  $('#sealNow').hidden = !canSeal;
  $('#sealNow').disabled = false;
  $('#sealNow').textContent = '用钱包存证 · 0.0001 OKB';
  $('#sealResult').textContent = '';
  $('#modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  $('#modal').hidden = true;
  document.body.style.overflow = '';
}

$('#sealBtn').addEventListener('click', openModal);
$('#sealNow').addEventListener('click', sealNow);
$('#withdrawBtn').addEventListener('click', withdrawRevenue);
wallet?.on?.('accountsChanged', () => refreshRevenue());
$('#closeModal').addEventListener('click', closeModal);
$('#closeModal2').addEventListener('click', closeModal);
$('#modal').addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});
$('#copyCmd').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText($('#mCmd').textContent);
    btn.textContent = '已复制';
  } catch {
    btn.textContent = '复制失败';
  }
  setTimeout(() => (btn.textContent = '复制命令'), 1600);
});

/* ---------- demo badge ---------- */

async function showDemoBadge() {
  let cfg = null;
  try {
    const res = await fetch('/api/config', { headers: { accept: 'application/json' } });
    if (res.ok) cfg = await res.json();
  } catch {}

  const staticOnly = !cfg;
  if (!staticOnly && !cfg.mock) return;

  const el = document.createElement('div');
  el.className = 'demo-badge';
  el.innerHTML = `<i></i>${staticOnly ? 'STATIC DEMO · 支付服务未接入' : 'DEMO · 支付未接通真实结算'}`;
  el.title = staticOnly
    ? '这是纯静态站，解锁只在本地演示，不会收款。'
    : '当前使用 mock facilitator，不会真的收款。';
  document.body.appendChild(el);

  const note = $('#payNote');
  if (note) {
    note.textContent = staticOnly
      ? '静态演示 · 点击后在本地解锁，不会收款。'
      : 'DEMO · mock facilitator，不会真的收款。';
  }
}

/* ---------- boot ---------- */

initSky();
paintContract();
showDemoBadge();
refreshRevenue();

const params = new URLSearchParams(location.search);
const pre = params.get('a');
if (pre && /^0x[0-9a-fA-F]{40}$/.test(pre)) {
  document.body.classList.add('shared');
  $('#addr').value = pre;
  setTimeout(async () => {
    const s = await ensureSeed();
    render(castFortune(pre, DAY_INDEX, s.seed, s.live));
  }, 200);
}

/* dev hook (harmless in production, used by tools/card.mjs) */
window.__omen = {
  castFortune,
  buildCard,
  get current() {
    return current;
  },
};
