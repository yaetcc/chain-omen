# 链签 · 自检报告

日期：2026-10-29 · 范围：`xlayer-fortune/`（前端、服务端、合约、keeper、部署）

## 结论

可以公开展示，**不能直接当收费产品上线**。核心链路（合约 → 日种子 → 命盘哈希 → 分享卡）一致且可复算；x402 协议链路已跑通，但真结算仍缺 OKX facilitator 凭证，当前所有线上实例都明确标记为 DEMO。

## 通过项

| 检查 | 结果 |
| --- | --- |
| 仓库密钥扫描 | 23 个跟踪文件，无 `.env`、无 token、无 `node_modules` |
| 合约源码 → artifact | 使用同一 source unit 名重新编译，bytecode / runtime 逐字节一致 |
| artifact → 链上 | `eth_getCode` 1989 bytes，与 artifact **完全一致** |
| 合约状态 | owner `0x3e85…104c`，fee `1e14`，`dayOpen(20755)=true`，seed 非零 |
| 哈希一致性 | 前端 `0x0baf…3de1` = 合约 `fortuneOf(0x8f3a…, 20755)` |
| 分享卡 | 1080×1440 PNG，约 622 KB，浏览器内生成成功 |
| 静态站 | GitHub Pages 首页 / CSS / JS / deploy.html / artifact / 分享卡全部 200 |
| 服务端 402 | `PAYMENT-REQUIRED` 头存在，`amount=100000`，`asset=USDT0`，`payTo` 正确 |
| 服务端校验 | 非法地址 400；未开签日 409；坏 `PAYMENT-SIGNATURE` 返回 402 而不是 500 |
| 目录暴露 | `/server/*`、`/node_modules/*`、`/.env`、`/.github/*` 均 404 |
| 移动端 | 390px 单栏正常，命盘、判词、x402 区块无溢出 |
| HTML 结构 | 无重复 id，无失效锚点，`target=_blank` 均带 `rel=noopener` |
| YAML | `render.yaml`、`open-day.yml` 语法有效 |

## 本轮修复

1. **Pages 上没有支付状态提示**：`/api/config` 404 时现在显示 `STATIC DEMO · 支付服务未接入`，并把付费说明改成“本地解锁，不会收款”。
2. **付费内容 XSS 面**：`showPaid` 改为转义服务端文本；`tx` 只接受 64 位 hex 才生成链接。
3. **缺少分享预览**：补了 `og:title` / `og:description` / `og:image` / `twitter:card`。
4. **服务端裸奔**：加 `X-Content-Type-Options`、`Referrer-Policy`、每 IP 60 次/分钟的 `/api/reading` 限流。
5. **`npm start` 依赖 `.env`**：拆成 `start`（读环境变量）、`start:env`（本地 .env）、`dev`（mock）。
6. **CI 权限过大**：workflow 加 `permissions: contents: read`。
7. **keeper 不校验网络**：新增 chain id 196 检查；无 `PRIVATE_KEY` 时安全跳过而不是报错。

## 仍存在的风险

| 级别 | 问题 | 建议 |
| --- | --- | --- |
| 高 | x402 **真结算未验证**：只跑过 mock facilitator | 填 OKX API key 后先跑一笔 0.10 USDT0，再对外 |
| 高 | 买家钱包的 EIP-712 签名只测过 mock 钱包 | 用 OKX Wallet 真签一次，确认 `EIP712Domain` 兼容 |
| 中 | `render.yaml` 默认 `X402_MOCK=1` | 真上线前删掉，否则任何人可免费解锁 |
| 中 | 临时隧道无 uptime 保证 | 永久 API 用 Render/Railway，或命名隧道 + 域名 |
| 中 | 合约 owner 是单一 EOA，无转移/多签 | 生产前换成多签或加 `transferOwnership` + 延时 |
| 低 | 限流是单实例内存态 | 多实例部署时换 Redis/网关限流 |
| 低 | Express 无 CSP | 静态站由 GitHub/Cloudflare 托管，风险有限；自建可补 |
| 低 | 仓库无 LICENSE | 想让人复用就加 MIT，否则默认保留所有权利 |

## 复现命令

```bash
# 合约：源码 → artifact
# 注意 source unit 名必须是 FortuneSeal.sol，否则 metadata 会变
solc --evm-version paris --optimize --optimize-runs 200 ...

# 链上比对
cast code 0x5d07f0386d53f99bacd6baaf85c289201313565a --rpc-url https://rpc.xlayer.tech
cast call 0x5d07... "fortuneOf(address,uint256)(bytes32)" 0x8f3a... 20755 --rpc-url https://rpc.xlayer.tech

# 服务端
X402_MOCK=1 node server/server.mjs
curl -i "http://127.0.0.1:8787/api/reading?address=0x8f3a..."
```
