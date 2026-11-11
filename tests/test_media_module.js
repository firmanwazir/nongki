const fs = require('fs');
const path = require('path');

const mediaJsPath = path.join(__dirname, '../assets/js/modules/media.js');
const mediaCode = fs.readFileSync(mediaJsPath, 'utf8');

const requiredExports = [
    'initLocalStream',
    'toggleAudio',
    'toggleVideo',
    'flipCamera',
    'startScreenShare',
    'stopScreenShare',
    'replacePeerVideoTrack',
    'stopAllMediaTracks',
    'getLocalStream',
    'getMediaState'
];

console.log('=== TEST 1: Check Phase 4 Module Exports in media.js ===');
let missingExport = false;

for (const exp of requiredExports) {
    const regex = new RegExp(`export\\s+(async\\s+)?function\\s+${exp}`);
    if (!regex.test(mediaCode)) {
        console.error(`MISSING EXPORT: ${exp}`);
        missingExport = true;
    } else {
        console.log(`Exported: ${exp}() (PASS)`);
    }
}

console.log('\n=== TEST 2: Check replaceTrack & getUserMedia Integration ===');
const hasReplaceTrack = mediaCode.includes('replaceTrack');
const hasGetUserMedia = mediaCode.includes('getUserMedia');
const hasGetDisplayMedia = mediaCode.includes('getDisplayMedia');
const hasFacingMode = mediaCode.includes('facingMode');

console.log(`Includes replaceTrack: ${hasReplaceTrack ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Includes getUserMedia: ${hasGetUserMedia ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Includes getDisplayMedia: ${hasGetDisplayMedia ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`Includes facingMode rotation: ${hasFacingMode ? 'YES (PASS)' : 'NO (FAIL)'}`);

if (!missingExport && hasReplaceTrack && hasGetUserMedia && hasGetDisplayMedia && hasFacingMode) {
    console.log('\n>>> SEMUA VERIFIKASI FASE 4 BERHASIL 100% <<<');
} else {
    process.exit(1);
}

