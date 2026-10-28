/* ============================================================
   FortuneSeal deployer — signs with the user's own wallet.
   No private key ever touches this page.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CHAIN_ID = '0xc4'; // 196
const EXPLORER = 'https://www.oklink.com/xlayer';
const SELECTOR_OPEN_DAY = '0x715761b3';

const wallet = window.okxwallet || window.ethereum || null;

let account = null;
let contract = null;
let busy = false;

/* ---------- tiny star field ---------- */

(function sky() {
  const canvas = $('#sky');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let w = 0, h = 0, stars = [];

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 11000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 0.9 + 0.15,
      p: Math.random() * Math.PI * 2,
    }));
  }

  function frame(t) {
    ctx.clearRect(0, 0, w, h);
    for (const s of stars) {
      const a = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.0005 + s.p));
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(232,213,168,${a.toFixed(3)})`;
      ctx.fill();
    }
    requestAnimationFrame(frame);
  }

  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(frame);
})();

/* ---------- ui helpers ---------- */

function short(a) {
  return a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '—';
}

function setHint(msg, isErr = false) {
  const el = $('#hint');
  el.textContent = msg;
  el.classList.toggle('err', isErr);
}

function setBusy(v) {
  busy = v;
  $('#action').disabled = v;
  if (v) $('#action').textContent = '处理中…';
}

function step(n, state) {
  const li = $(`#s${n}`);
  const em = $(`#e${n}`);
  li.classList.toggle('active', state === 'active');
  li.classList.toggle('done', state === 'done');
  em.textContent = state === 'done' ? '完成' : state === 'active' ? '进行中' : '待办';
}

function formatOKB(hexWei) {
  const wei = BigInt(hexWei);
  const whole = wei / 10n ** 18n;
  const frac = (wei % 10n ** 18n).toString().padStart(18, '0').slice(0, 5).replace(/0+$/, '');
  return `${whole}${frac ? '.' + frac : ''} OKB`;
}

/* ---------- wallet ---------- */

async function ensureChain() {
  const id = await wallet.request({ method: 'eth_chainId' });
  if (id.toLowerCase() === CHAIN_ID) return;

  try {
    await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: CHAIN_ID }] });
  } catch (err) {
    if (err.code === 4902 || err.code === -32603) {
      await wallet.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: CHAIN_ID,
            chainName: 'X Layer',
            nativeCurrency: { name: 'OKB', symbol: 'OKB', decimals: 18 },
            rpcUrls: ['https://rpc.xlayer.tech'],
            blockExplorerUrls: [EXPLORER],
          },
        ],
      });
    } else {
      throw err;
    }
  }

  const after = await wallet.request({ method: 'eth_chainId' });
  if (after.toLowerCase() !== CHAIN_ID) throw new Error('请在钱包中切换到 X Layer 主网（196）');
}

async function refreshBalance() {
  if (!account) return;
  const wei = await wallet.request({ method: 'eth_getBalance', params: [account, 'latest'] });
  $('#bal').textContent = formatOKB(wei);
}

async function connect() {
  if (!wallet) {
    setHint('没有检测到钱包。请安装 OKX Wallet，或在手机 OKX Wallet 的 DApp 浏览器里打开这个页面。', true);
    return;
  }
  setBusy(true);
  try {
    const accounts = await wallet.request({ method: 'eth_requestAccounts' });
    account = accounts[0];
    await ensureChain();
    $('#acct').textContent = short(account);
    $('#net').textContent = 'X Layer · 196';
    await refreshBalance();
    step(1, 'done');
    step(2, 'active');
    $('#action').textContent = '部署 FortuneSeal';
    setHint('网络正确。部署会发起一笔合约创建交易，请在钱包里确认。');
  } catch (err) {
    setHint(err.code === 4001 ? '你取消了连接。' : String(err.message || err), true);
  } finally {
    setBusy(false);
  }
}

/* ---------- chain calls ---------- */

async function waitFor(hash) {
  for (let i = 0; i < 120; i++) {
    const rc = await wallet.request({ method: 'eth_getTransactionReceipt', params: [hash] });
    if (rc) return rc;
    await sleep(2000);
  }
  throw new Error('等待上链超时，请到 OKLink 查看交易。');
}

async function deploy() {
  setBusy(true);
  step(2, 'active');
  try {
    let art;
    try {
      art = await (await fetch('artifacts/FortuneSeal.json')).json();
    } catch {
      throw new Error('读取 artifacts/FortuneSeal.json 失败：请用本地服务器打开（python3 -m http.server）。');
    }

    setHint('正在估算 gas…');
    const gasHex = await wallet.request({
      method: 'eth_estimateGas',
      params: [{ from: account, data: art.bytecode }],
    });
    const gas = '0x' + ((BigInt(gasHex) * 125n) / 100n).toString(16);

    setHint('请在钱包里确认部署交易…');
    const tx = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, data: art.bytecode, gas, value: '0x0' }],
    });

    setHint(`交易已发出 ${short(tx)}，等待上链…`);
    const rc = await waitFor(tx);
    if (rc.status !== '0x1') throw new Error('部署交易失败（reverted）。');

    contract = rc.contractAddress;
    step(2, 'done');
    step(3, 'active');
    await refreshBalance();
    $('#action').textContent = '开启今日签池';
    setHint('合约已部署。最后一步：调用 openDay() 写入今天的日种子。');
  } catch (err) {
    setHint(err.code === 4001 ? '你取消了签名。' : String(err.message || err), true);
    step(2, 'active');
  } finally {
    setBusy(false);
  }
}

async function openDay() {
  setBusy(true);
  step(3, 'active');
  try {
    setHint('请在钱包里确认 openDay() 交易…');
    const tx = await wallet.request({
      method: 'eth_sendTransaction',
      params: [{ from: account, to: contract, data: SELECTOR_OPEN_DAY }],
    });
    setHint(`交易已发出 ${short(tx)}，等待上链…`);
    const rc = await waitFor(tx);
    if (rc.status !== '0x1') throw new Error('openDay 失败：今天的签池可能已经开启。');

    step(3, 'done');
    await refreshBalance();
    showDone();
  } catch (err) {
    setHint(err.code === 4001 ? '你取消了签名。' : String(err.message || err), true);
  } finally {
    setBusy(false);
  }
}

/* ---------- done ---------- */

function showDone() {
  try {
    localStorage.setItem('omen.contract', contract);
  } catch {}

  $('#addr').textContent = contract;
  $('#explorer').href = `${EXPLORER}/address/${contract}`;
  $('#done').hidden = false;
  $('#action').textContent = '部署完成';
  $('#action').disabled = true;
  setHint('完成。签文页现在会显示这个合约地址。');
  $('#done').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/* ---------- wiring ---------- */

$('#action').addEventListener('click', async () => {
  if (busy) return;
  if (!account) return connect();
  if (!contract) return deploy();
  return openDay();
});

$('#copy').addEventListener('click', async (e) => {
  const btn = e.currentTarget;
  try {
    await navigator.clipboard.writeText(contract);
    btn.textContent = '已复制';
  } catch {
    btn.textContent = '复制失败';
  }
  setTimeout(() => (btn.textContent = '复制地址'), 1600);
});

if (wallet) {
  // do not reload on chainChanged: switching to 196 happens mid-flow
  wallet.on?.('accountsChanged', (accs) => {
    if (!accs || accs.length === 0) location.reload();
  });
}

/* if already deployed from this browser, offer it up front */
try {
  const saved = localStorage.getItem('omen.contract');
  if (saved && /^0x[0-9a-f]{40}$/i.test(saved)) {
    setHint(`本机记录过一个已部署的合约：${short(saved)}。刷新签文页即会使用它；重新部署会覆盖记录。`);
  }
} catch {}
