#!/usr/bin/env bash
# Open today's fortune on X Layer. Safe to run hourly: it exits if already open.
#
#   CONTRACT=0x... PRIVATE_KEY=0x... bash scripts/keeper.sh
#
# PRIVATE_KEY is only needed when the day is still closed. Any funded wallet works —
# openDay() is permissionless and does not have to be the contract owner.
set -euo pipefail
cd "$(dirname "$0")/.."

CONTRACT="${CONTRACT:-0x5d07f0386d53f99bacd6baaf85c289201313565a}"
RPC="${RPC_URL:-https://rpc.xlayer.tech}"
export PATH="${HOME}/.foundry/bin:${PATH}"

DAY=$(( ( $(date +%s) + 28800 ) / 86400 ))
echo "day=$DAY contract=$CONTRACT"

OPEN=$(cast call "$CONTRACT" "dayOpen(uint256)(bool)" "$DAY" --rpc-url "$RPC")
if [ "$OPEN" = "true" ]; then
  echo "already open — nothing to do"
  exit 0
fi

if [ -z "${PRIVATE_KEY:-}" ]; then
  echo "day $DAY is closed; PRIVATE_KEY not set — skipping (add KEEPER_PRIVATE_KEY to enable)."
  exit 0
fi

echo "opening…"
if ! cast send "$CONTRACT" "openDay()" --rpc-url "$RPC" --private-key "$PRIVATE_KEY" --json >/tmp/omen-keeper-send.json; then
  # another keeper may have won the race
  OPEN=$(cast call "$CONTRACT" "dayOpen(uint256)(bool)" "$DAY" --rpc-url "$RPC")
  if [ "$OPEN" = "true" ]; then
    echo "another keeper opened it first — ok"
    exit 0
  fi
  echo "openDay failed" >&2
  exit 1
fi

SEED=$(cast call "$CONTRACT" "daySeed(uint256)(bytes32)" "$DAY" --rpc-url "$RPC")
if [ "$SEED" = "0x0000000000000000000000000000000000000000000000000000000000000000" ]; then
  echo "seed is zero after openDay" >&2
  exit 1
fi

echo "ok seed=$SEED"
