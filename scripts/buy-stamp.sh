#!/bin/bash
# Buy a postage stamp on Gnosis Chain for client-side stamping
# Contract source: https://github.com/ethersphere/storage-incentives
#
# Prerequisites:
#   - Foundry (cast): https://getfoundry.sh
#   - Signer key funded with BZZ + xDAI on Gnosis Chain
#
# Usage:
#   BEE_SIGNER_KEY=<hex-private-key> ./scripts/buy-stamp.sh [amount] [depth]

set -e

SIGNER_KEY=${BEE_SIGNER_KEY:?Set BEE_SIGNER_KEY to the hex-encoded private key}
AMOUNT=${1:-1000000000}
DEPTH=${2:-20}
BUCKET_DEPTH=16

BZZ=0xdBF3Ea6F5beE45c02255B2c26a16F300502F68da
POSTAGE=0x45a1502382541Cd610CC9068e88727426b696293
RPC=https://rpc.gnosis.gateway.fm

SIGNER_ADDR=$(cast wallet address --private-key $SIGNER_KEY 2>/dev/null)
echo "Signer: $SIGNER_ADDR"

# Check BZZ balance
TOTAL_COST=$(python3 -c "print($AMOUNT * (2 ** $DEPTH))")
BZZ_BAL=$(cast call $BZZ "balanceOf(address)(uint256)" $SIGNER_ADDR --rpc-url $RPC 2>/dev/null)
echo "BZZ balance: $BZZ_BAL"
echo "Stamp cost:  $TOTAL_COST"

# Approve
echo "Approving BZZ spend..."
cast send $BZZ "approve(address,uint256)" $POSTAGE $TOTAL_COST \
  --private-key $SIGNER_KEY --rpc-url $RPC --quiet 2>/dev/null

# Buy stamp
NONCE=$(openssl rand -hex 32)
echo "Buying stamp (amount=$AMOUNT, depth=$DEPTH, nonce=$NONCE)..."
TX=$(cast send $POSTAGE \
  "createBatch(address,uint256,uint8,uint8,bytes32,bool)" \
  $SIGNER_ADDR $AMOUNT $DEPTH $BUCKET_DEPTH 0x$NONCE false \
  --private-key $SIGNER_KEY --rpc-url $RPC --json 2>/dev/null)

BATCH_ID=$(echo $TX | python3 -c "
import json,sys
tx = json.load(sys.stdin)
for log in tx['logs']:
    if log['address'].lower() == '0x45a1502382541cd610cc9068e88727426b696293':
        print(log['topics'][1][2:])
        break
")

echo ""
echo "Batch ID: $BATCH_ID"
echo ""
echo "Add to .env.test:"
echo "BEE_STAMP_ID=$BATCH_ID"
