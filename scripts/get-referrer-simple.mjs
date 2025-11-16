/**
 * Simple script to show Drift referrer configuration
 */

const DRIFT_PROGRAM_ID = 'dRiftyHA39MWEi3m9aunc5MzRF1JYuBsbn6VPcn33UH'
const REFERRER_PUBKEY = '7PorzwK9s7idBvKNtQSJQf8goSNfUG1yF6BV8eBSKiGB'
const REFERRER_WALLET = 'APADQYNLjWsaKhJR72TpfewzS3RjdwLXrn4xzKxHmqZc'

console.log('🔍 Drift Referral Configuration\n')
console.log('Referral Code:     balance')
console.log('Referrer Wallet:   ' + REFERRER_WALLET)
console.log('Referrer Account:  ' + REFERRER_PUBKEY)
console.log('Referral Link:     https://app.drift.trade/ref/balance')
console.log('Drift Program:     ' + DRIFT_PROGRAM_ID)

console.log('\n📊 Configuration:')
console.log('   Fee Share:      35% of user trading fees')
console.log('   User Discount:  5% fee reduction')
console.log('   Method:         SDK initializeUserAccount(referrerInfo)')

console.log('\n🧪 To Test:')
console.log('   1. npm run dev')
console.log('   2. Connect wallet with 0.1 SOL')
console.log('   3. Choose "Real" mode')
console.log('   4. Deposit 0.065+ SOL')
console.log('   5. Place 1-2 trades')
console.log('   6. Check Drift dashboard:')
console.log('      https://app.drift.trade/ → Connect ' + REFERRER_WALLET.substring(0, 8) + '... → Referrals')

console.log('\n📝 What to Look For:')
console.log('   - Session wallet address in "Referred Users"')
console.log('   - Trading volume attributed to referrer')
console.log('   - Fee earnings (35% of their fees)')

console.log('\n📚 Documentation: TEST-REFERRAL-INSTRUCTIONS.md')
