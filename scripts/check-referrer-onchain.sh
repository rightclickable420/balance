#!/bin/bash

# Check if Drift referrer account exists on-chain

REFERRER_ACCOUNT="7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB"
REFERRER_WALLET="APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc"
DRIFT_PROGRAM="dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH"

echo "🔍 Checking Drift Referrer Account On-Chain"
echo ""
echo "Referrer Wallet:  $REFERRER_WALLET"
echo "Referrer Account: $REFERRER_ACCOUNT"
echo "Expected Owner:   $DRIFT_PROGRAM (Drift Protocol)"
echo ""

# Check if solana CLI is installed
if ! command -v solana &> /dev/null; then
    echo "❌ Solana CLI not installed"
    echo "   Install: sh -c \"\$(curl -sSfL https://release.solana.com/stable/install)\""
    echo ""
    echo "   Or just use the web interface to verify:"
    echo "   https://explorer.solana.com/address/$REFERRER_ACCOUNT"
    exit 1
fi

# Check the account
echo "Querying account..."
solana account $REFERRER_ACCOUNT --url mainnet-beta

echo ""
echo "✅ If the account exists and owner is $DRIFT_PROGRAM,"
echo "   then the referrer configuration is valid!"
echo ""
echo "📝 Next: Follow TEST-REFERRAL-INSTRUCTIONS.md to test integration"
