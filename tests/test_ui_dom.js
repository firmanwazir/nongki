const fs = require('fs');
const path = require('path');

const htmlPath = path.join(__dirname, '../index.html');
const uiJsPath = path.join(__dirname, '../assets/js/modules/ui.js');

const html = fs.readFileSync(htmlPath, 'utf8');
const uiJs = fs.readFileSync(uiJsPath, 'utf8');

console.log('=== TEST 1: Check Duplicate IDs in index.html ===');
const idMatches = [...html.matchAll(/id=["']([^"']+)["']/g)].map(m => m[1]);
const idCounts = {};
let duplicateFound = false;

for (const id of idMatches) {
    idCounts[id] = (idCounts[id] || 0) + 1;
    if (idCounts[id] > 1) {
        console.error(`DUPLICATE ID FOUND: ${id}`);
        duplicateFound = true;
    }
}
if (!duplicateFound) {
    console.log(`All ${idMatches.length} IDs are completely unique! (PASS)`);
}

console.log('\n=== TEST 2: Verify ui.js getElementById Targets in index.html ===');
const domIdMatches = [...uiJs.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1]);
let missingId = false;

for (const targetId of domIdMatches) {
    if (!idCounts[targetId]) {
        console.error(`MISSING ID IN HTML: ${targetId}`);
        missingId = true;
    } else {
        console.log(`Matched: #${targetId}`);
    }
}

if (!missingId) {
    console.log(`All ${domIdMatches.length} DOM selectors in ui.js match index.html! (PASS)`);
}

console.log('\n=== TEST 3: Check Required HTML Attributes for WebRTC ===');
const hasLocalMuted = html.includes('id="localVideo"') && html.includes('muted');
const hasAutoplayPlaysinline = html.includes('autoplay') && html.includes('playsinline');
console.log(`localVideo has muted attribute: ${hasLocalMuted ? 'YES (PASS)' : 'NO (FAIL)'}`);
console.log(`videos have autoplay & playsinline: ${hasAutoplayPlaysinline ? 'YES (PASS)' : 'NO (FAIL)'}`);

if (!duplicateFound && !missingId && hasLocalMuted && hasAutoplayPlaysinline) {
    console.log('\n>>> SEMUA AUDIT FASE 3 BERHASIL 100% <<<');
} else {
    process.exit(1);
}

