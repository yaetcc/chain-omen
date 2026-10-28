// Chain Omen payment server — x402 (exact, EIP-3009) on X Layer.
//
//   X402_MOCK=1 node server.mjs          # local UI test, no real payment
//   node --env-file=.env server.mjs      # real facilitator (OKX API key required)
//
// Env:
//   PORT=8787
//   PAY_TO=0x...                 seller address (defaults to the contract owner)
//   X402_MOCK=1                  accept any well-formed payment (dev only)
//   OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE   hosted facilitator credentials
//   X402_SYNC_SETTLE=1           wait for on-chain confirmation before responding

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, http } from 'viem';
import { paymentMiddleware, x402ResourceServer } from '@okxweb3/x402-express';
import { ExactEvmScheme } from '@okxweb3/x402-evm/exact/server';
import { OKXFacilitatorClient } from '@okxweb3/x402-core';
import { readingText } from './reading.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const PORT = Number(process.env.PORT || 8787);
const RPC = process.env.RPC_URL || 'https://rpc.xlayer.tech';
const CONTRACT = process.env.CONTRACT || '0x5d07f0386d53f99bacd6baaf85c289201313565a';
const PAY_TO = process.env.PAY_TO || '0x3e85316251d3DE135F585104F7b9E45d4358104c';
const MOCK = process.env.X402_MOCK === '1';

const client = createPublicClient({ transport: http(RPC) });
const DAY_SEED_ABI = [
  {
    type: 'function',
    name: 'daySeed',
    stateMutability: 'view',
    inputs: [{ name: 'day', type: 'uint256' }],
    outputs: [{ name: '', type: 'bytes32' }],
  },
];

const currentDay = () => Math.floor((Date.now() / 1000 + 8 * 3600) / 86400);

/* ---------- seed cache ---------- */
let seedCache = { day: null, seed: null, at: 0 };

async function readSeed(day) {
  const now = Date.now();
  if (seedCache.day === day && now - seedCache.at < 30_000) return seedCache.seed;
  const seed = await client.readContract({
    address: CONTRACT,
    abi: DAY_SEED_ABI,
    functionName: 'daySeed',
    args: [BigInt(day)],
  });
  seedCache = { day, seed, at: now };
  return seed;
}

/* ---------- facilitator ---------- */
function mockFacilitator() {
  console.warn('[x402] MOCK facilitator — no payment is actually verified or settled.');
  return {
    async getSupported() {
      return {
        kinds: [1, 2].map((v) => ({ x402Version: v, scheme: 'exact', network: 'eip155:196' })),
      };
    },
    async verify(payload) {
      const p = payload?.payload;
      if (!p?.authorization?.from || !p?.signature) {
        return { isValid: false, invalidReason: 'incomplete' };
      }
      return { isValid: true, payer: p.authorization.from };
    },
    async settle(payload) {
      return {
        success: true,
        transaction: `0x${'ab'.repeat(32)}`,
        network: 'eip155:196',
        payer: payload?.payload?.authorization?.from,
      };
    },
  };
}

function facilitator() {
  if (MOCK) return mockFacilitator();
  const { OKX_API_KEY, OKX_SECRET_KEY, OKX_PASSPHRASE } = process.env;
  if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
    console.error(
      'Missing OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE.\n' +
        'Set them in server/.env, or run with X402_MOCK=1 for a local UI test.',
    );
    process.exit(1);
  }
  return new OKXFacilitatorClient({
    apiKey: OKX_API_KEY,
    secretKey: OKX_SECRET_KEY,
    passphrase: OKX_PASSPHRASE,
    syncSettle: process.env.X402_SYNC_SETTLE === '1',
  });
}

/* ---------- app ---------- */
const app = express();
app.set('trust proxy', 1);

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// cheap in-memory guard against RPC spam; 60 requests / minute / IP
const ipHits = new Map();
app.use('/api/reading', (req, res, next) => {
  const now = Date.now();
  const rec = ipHits.get(req.ip) || { t: now, n: 0 };
  if (now - rec.t > 60_000) {
    rec.t = now;
    rec.n = 0;
  }
  rec.n++;
  ipHits.set(req.ip, rec);
  if (ipHits.size > 5000) ipHits.clear();
  if (rec.n > 60) return res.status(429).json({ error: 'too many requests' });
  next();
});

app.get('/api/config', (_req, res) => {
  res.json({
    mock: MOCK,
    network: 'eip155:196',
    asset: '0x779ded0c9e1022225f8e0630b35a9b54be713736',
    price: '0.10',
    payTo: PAY_TO,
    contract: CONTRACT,
    day: currentDay(),
  });
});

// validate before asking for money
app.use('/api/reading', async (req, res, next) => {
  const address = String(req.query.address || '');
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return res.status(400).json({ error: 'invalid address' });
  }
  const day = Number(req.query.day) || currentDay();
  if (!Number.isSafeInteger(day) || day < 0) return res.status(400).json({ error: 'invalid day' });

  try {
    const seed = await readSeed(day);
    if (/^0x0{64}$/.test(seed)) {
      return res.status(409).json({ error: 'day not open', day });
    }
    req.omen = { address, day, seed };
    next();
  } catch (err) {
    console.error('[rpc]', err?.message || err);
    res.status(502).json({ error: 'rpc unavailable' });
  }
});

const resource = new x402ResourceServer(facilitator()).register(
  'eip155:196',
  new ExactEvmScheme(),
);

app.use(
  paymentMiddleware(
    {
      'GET /api/reading': {
        accepts: {
          scheme: 'exact',
          price: '$0.10',
          network: 'eip155:196',
          payTo: PAY_TO,
        },
        description: '链签 · 完整解签',
        mimeType: 'application/json',
      },
    },
    resource,
  ),
);

app.get('/api/reading', (req, res) => {
  const { address, day, seed } = req.omen;
  try {
    const out = readingText(address, day, seed);
    res.json({ address, day, seed, mock: MOCK, ...out });
  } catch (err) {
    console.error('[reading]', err);
    res.status(500).json({ error: 'reading failed' });
  }
});

// static site — never expose server/, node_modules/, or dotfiles
app.use((req, res, next) => {
  const first = req.path.split('/').filter(Boolean)[0] || '';
  if (first === 'server' || first === 'node_modules') return res.status(404).end();
  next();
});
app.use(express.static(ROOT, { dotfiles: 'deny', index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`chain omen server  http://127.0.0.1:${PORT}`);
  console.log(`  mode      ${MOCK ? 'MOCK (no real payment)' : 'x402 / OKX facilitator'}`);
  console.log(`  network   eip155:196`);
  console.log(`  payTo     ${PAY_TO}`);
  console.log(`  contract  ${CONTRACT}`);
});
