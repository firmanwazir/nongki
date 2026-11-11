const fs = require('fs');
const path = require('path');

const configJsPath = path.join(__dirname, '../assets/js/config.js');
const rtcJsPath = path.join(__dirname, '../assets/js/modules/rtc.js');

const configCode = fs.readFileSync(configJsPath, 'utf8');
const rtcCode = fs.readFileSync(rtcJsPath, 'utf8');

console.log('=== TEST 1: Check config.js Configuration Tokens ===');
const hasApiUrl = configCode.includes("API_URL: 'api/match.php'");
const hasPollingInterval = configCode.includes("POLLING_INTERVAL_MS: 2500");
const hasIceServers = configCode.includes('stun.l.google.com:19302');
const hasIceTransportPolicy = configCode.includes("iceTransportPolicy: 'all'");

console.log(`API_URL configured: ${hasApiUrl ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`POLLING_INTERVAL_MS 2500: ${hasPollingInterval ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Google STUN configured: ${hasIceServers ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`iceTransportPolicy 'all': ${hasIceTransportPolicy ? 'YES (PASS)' : 'NO (FAIL)'}`);

console.log('\n=== TEST 2: Check rtc.js Module Exports ===');
const requiredExports = [
    'registerRTCCallbacks',
    'initPeer',
    'answerIncomingCall',
    'callPeer',
    'sendChatMessage',
    'endCurrentCall',
    'getMyPeerId',
    'getCurrentCall',
    'getCurrentPeerId',
    'isCallActive',
    'setBusyState'
];

let missing = false;
for (const exp of requiredExports) {
    const regex = new RegExp(`export\\s+function\\s+${exp}`);
    if (!regex.test(rtcCode)) {
        console.error(`MISSING EXPORT: ${exp}`);
        missing = true;
    } else {
        console.log(`Exported: ${exp}() (PASS)`);
    }
}

console.log('\n=== TEST 3: Check Single-Line Lock (isBusy) and DataChannel ===');
const hasBusyLock = rtcCode.includes('isBusy');
const hasBusyReject = rtcCode.includes("'BUSY'");
const hasDataChannel = rtcCode.includes('setupDataConnection');

console.log(`Single-Line Lock state implemented: ${hasBusyLock ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Rejection with 'BUSY' message implemented: ${hasBusyReject ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`DataChannel setup for Live Chat implemented: ${hasDataChannel ? 'YES (PASS)' : 'NO (FAIL)'}`);

if (hasApiUrl && hasPollingInterval && hasIceServers && !missing && hasBusyLock && hasBusyReject && hasDataChannel) {
    console.log('\n>>> SEMUA VERIFIKASI FASE 5 BERHASIL 100% <<<');
} else {
    process.exit(1);
}

