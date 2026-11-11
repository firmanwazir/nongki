const fs = require('fs');
const path = require('path');

const matcherJsPath = path.join(__dirname, '../assets/js/modules/matcher.js');
const appJsPath = path.join(__dirname, '../assets/js/app.js');

const matcherCode = fs.readFileSync(matcherJsPath, 'utf8');
const appCode = fs.readFileSync(appJsPath, 'utf8');

console.log('=== TEST 1: Check matcher.js Exports ===');
const requiredMatcherExports = [
    'requestFindMatch',
    'requestLeaveQueue',
    'startPolling',
    'stopPolling',
    'setupUnloadBeacon',
    'isQueueSearching'
];

let missingMatcher = false;
for (const exp of requiredMatcherExports) {
    const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${exp}`);
    if (!regex.test(matcherCode)) {
        console.error(`MISSING MATCHER EXPORT: ${exp}`);
        missingMatcher = true;
    } else {
        console.log(`Matcher Export: ${exp}() (PASS)`);
    }
}

console.log('\n=== TEST 2: Check app.js Orchestration & Wiring ===');
const hasEscapeShortcut = appCode.includes("'Escape'") || appCode.includes("'Esc'");
const hasStartNextHandler = appCode.includes('handleStartNext');
const hasStopHandler = appCode.includes('handleStop');
const hasAutoAdvance = appCode.includes('handlePeerDisconnected');
const hasChatSubmit = appCode.includes('sendChatMessage');
const hasBeaconInit = appCode.includes('setupUnloadBeacon');

console.log(`Keyboard ESC shortcut wired: ${hasEscapeShortcut ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Start/Next handler wired: ${hasStartNextHandler ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Stop handler wired: ${hasStopHandler ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Auto-advance on peer disconnect wired: ${hasAutoAdvance ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Live Chat submit wired: ${hasChatSubmit ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Unload beacon wired: ${hasBeaconInit ? 'YES (PASS)' : 'NO (FAIL)'}`);

if (!missingMatcher && hasEscapeShortcut && hasStartNextHandler && hasStopHandler && hasAutoAdvance && hasChatSubmit && hasBeaconInit) {
    console.log('\n>>> SEMUA VERIFIKASI FASE 6 BERHASIL 100% <<<');
} else {
    process.exit(1);
}

