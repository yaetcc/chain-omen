#!/usr/bin/env bash
# Deploy FortuneSeal to X Layer mainnet (196) with a local burner key.
#
#   export PRIVATE_KEY=0x...
#   bash scripts/deploy.sh
#
# WARNING: this puts the key in the process arguments of `cast` for a moment.
# Prefer deploy.html + OKX Wallet if you do not want the key on disk.
set -euo pipefail
cd "$(dirname "$0")/.."

: "${PRIVATE_KEY:?export PRIVATE_KEY=0x... first (use a burner wallet with a little OKB)}"
RPC="${RPC:-https://rpc.xlayer.tech}"
export PATH="${HOME}/.foundry/bin:${PATH}"

CHAIN=$(cast chain-id --rpc-url "$RPC")
if [ "$CHAIN" != "196" ]; then
  echo "✗ expected chain 196, got $CHAIN" >&2
  exit 1
fi

BYTECODE=$(python3 -c "import json;print(json.load(open('artifacts/FortuneSeal.json'))['bytecode'])")

echo "→ deploying to X Layer mainnet…"
ADDR=$(cast send --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --create "$BYTECODE" --json \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('contractAddress') or d.get('contract_address') or '')")

if [ -z "$ADDR" ]; then
  echo "✗ could not read contract address from cast output" >&2
  exit 1
fi
echo "✓ FortuneSeal deployed: $ADDR"

echo "→ openDay()"
cast send "$ADDR" "openDay()" --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --json > /dev/null
echo "✓ today's seed is onchain"

echo
echo "Next: set CONTRACT in app.js to $ADDR (or open deploy.html once and it will be cached)."
