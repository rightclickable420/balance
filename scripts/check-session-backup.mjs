/**
 * Check for session wallet backup in browser storage
 * Run this in the browser console to check for backups
 */

console.log('🔍 Checking for Session Wallet Backups...\n')

// Check sessionStorage
const sessionBackup = sessionStorage.getItem('balance_session_wallet_encrypted')
if (sessionBackup) {
  try {
    const parsed = JSON.parse(sessionBackup)
    console.log('✅ Found backup in sessionStorage:')
    console.log('   Public Key:', parsed.publicKey)
    console.log('   Timestamp:', new Date(parsed.timestamp).toLocaleString())
    console.log('   Age:', Math.floor((Date.now() - parsed.timestamp) / 1000 / 60), 'minutes old')
  } catch (e) {
    console.log('⚠️ sessionStorage backup exists but is corrupted', e)
  }
} else {
  console.log('❌ No backup in sessionStorage')
}

// Check localStorage
const persistentBackup = localStorage.getItem('balance_session_wallet_persistent')
if (persistentBackup) {
  try {
    const parsed = JSON.parse(persistentBackup)
    console.log('\n✅ Found backup in localStorage:')
    console.log('   Public Key:', parsed.publicKey)
    console.log('   Timestamp:', new Date(parsed.timestamp).toLocaleString())
    console.log('   Age:', Math.floor((Date.now() - parsed.timestamp) / 1000 / 60), 'minutes old')
  } catch (e) {
    console.log('⚠️ localStorage backup exists but is corrupted', e)
  }
} else {
  console.log('❌ No backup in localStorage')
}

console.log('\n📋 Instructions:')
console.log('1. If backup exists, copy the public key')
console.log('2. Go back to setup screen')
console.log('3. Connect the same wallet you used to deposit')
console.log('4. The backup should auto-recover')
console.log('5. Click "Withdraw" to get your funds back')
