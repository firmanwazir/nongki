<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/../api/Database.php';

$phpBin = 'D:\WebServer\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe';
$script = __DIR__ . '/../api/match.php';

echo "=================================================================\n";
echo "       NONGKI E2E VERIFICATION & STRESS TEST SUITE (PHASE 7)      \n";
echo "=================================================================\n";

$pdo = Database::getConnection();
$pdo->exec("DELETE FROM waiting_queue");

// Helper function to send mock request
function executeApiRequest(array $payload, string $method = 'POST', array $serverOverrides = []): array {
    global $phpBin, $script;
    
    $json = json_encode($payload);
    $cmd = "\"{$phpBin}\" -r \"\$_SERVER['REQUEST_METHOD'] = '{$method}'; require '{$script}';\"";
    
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ];
    
    $proc = proc_open($cmd, $descriptors, $pipes);
    if (!is_resource($proc)) {
        throw new RuntimeException("Gagal menjalankan proc_open");
    }
    
    fwrite($pipes[0], $json);
    fclose($pipes[0]);
    
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    
    $exitCode = proc_close($proc);
    $data = json_decode($stdout, true);
    
    return [
        'exit' => $exitCode,
        'stdout' => $stdout,
        'stderr' => $stderr,
        'json' => $data
    ];
}

// -------------------------------------------------------------
// TASK 7.1: Multi-Tab Queue & Matchmaking Simulation
// -------------------------------------------------------------
echo "\n--- [TASK 7.1] Multi-Tab Queue & Pairing Lifecycle ---\n";

// Tab A joins
$tabA = 'tab_alpha_1111111111';
$resA = executeApiRequest(['action' => 'find_match', 'peer_id' => $tabA]);
echo "1. Tab A joins queue: " . ($resA['json']['status'] ?? 'unknown') . "\n";
assert(($resA['json']['status'] ?? '') === 'waiting', 'Tab A must get waiting');

// Tab B joins
$tabB = 'tab_bravo_2222222222';
$resB = executeApiRequest(['action' => 'find_match', 'peer_id' => $tabB]);
echo "2. Tab B joins queue: " . ($resB['json']['status'] ?? 'unknown') . ", target_id: " . ($resB['json']['target_id'] ?? '') . "\n";
assert(($resB['json']['status'] ?? '') === 'matched', 'Tab B must get matched');
assert(($resB['json']['target_id'] ?? '') === $tabA, 'Tab B target must be Tab A');

// Verify queue is completely empty
$stmt = $pdo->query("SELECT COUNT(*) FROM waiting_queue");
$count = (int)$stmt->fetchColumn();
$stmt->closeCursor();
echo "3. Queue count after Tab A & B matched: {$count} (Expected: 0)\n";
assert($count === 0, 'Queue must be empty after pair matched');

// -------------------------------------------------------------
// TASK 7.2: SQLite High-Concurrency Stress Test (50 Simultaneous Requests)
// -------------------------------------------------------------
echo "\n--- [TASK 7.2] SQLite WAL Concurrency Stress Test (50 Simultaneous Requests) ---\n";

$numClients = 50;
$procs = [];
$pipesMap = [];

for ($i = 1; $i <= $numClients; $i++) {
    $peerId = sprintf('stress_peer_%04d', $i);
    $cmd = "\"{$phpBin}\" -r \"\$_SERVER['REQUEST_METHOD'] = 'POST'; require '{$script}';\"";
    $p = proc_open($cmd, [0=>['pipe','r'], 1=>['pipe','w'], 2=>['pipe','w']], $pipes);
    if (is_resource($p)) {
        fwrite($pipes[0], json_encode(['action' => 'find_match', 'peer_id' => $peerId]));
        fclose($pipes[0]);
        $procs[$peerId] = $p;
        $pipesMap[$peerId] = $pipes;
    }
}

$matched = 0;
$waiting = 0;
$errors = 0;
$targetsAssigned = [];

foreach ($procs as $peerId => $p) {
    $pipes = $pipesMap[$peerId];
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    proc_close($p);
    
    $resp = json_decode($stdout, true);
    if (!$resp || ($resp['status'] ?? '') === 'error') {
        $errors++;
        echo "Error on client {$peerId}: {$stdout} {$stderr}\n";
    } elseif ($resp['status'] === 'matched') {
        $matched++;
        $targetsAssigned[] = $resp['target_id'];
    } elseif ($resp['status'] === 'waiting') {
        $waiting++;
    }
}

echo "Total Clients Fired: {$numClients}\n";
echo "Total Matched: {$matched}\n";
echo "Total Waiting: {$waiting}\n";
echo "Total Errors (Lock Failures): {$errors}\n";

assert($errors === 0, 'Zero lock errors allowed under high concurrency');
assert($matched === 25, 'Expected 25 pairs matched from 50 concurrent requests');
assert($waiting === 25, 'Expected 25 peers waiting in queue');
assert(count(array_unique($targetsAssigned)) === count($targetsAssigned), 'All targets must be unique (Zero duplicate matching)');

echo ">> Concurrency stress test: 100% PASSED WITHOUT A SINGLE SQLITE_BUSY OR DEADLOCK!\n";

// Clean up stress test queue
$pdo->exec("DELETE FROM waiting_queue");

// -------------------------------------------------------------
// TASK 7.3: Tab Unload Beacon & Ghost Cleanup Verification
// -------------------------------------------------------------
echo "\n--- [TASK 7.3] Tab Unload Beacon & Ghost Cleanup Verification ---\n";

// 1. Simulasikan Tab C bergabung
$tabC = 'tab_charlie_333333333';
executeApiRequest(['action' => 'find_match', 'peer_id' => $tabC]);

$stmt = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id = ?");
$stmt->execute([$tabC]);
assert((int)$stmt->fetchColumn() === 1, 'Tab C must be in queue');
$stmt->closeCursor();

// 2. Simulasikan Tab C menutup tab (Beacon send leave_queue via FormData/POST)
$resBeacon = executeApiRequest(['action' => 'leave_queue', 'peer_id' => $tabC]);
echo "Tab C beacon leave_queue status: " . ($resBeacon['json']['status'] ?? 'unknown') . "\n";
assert(($resBeacon['json']['status'] ?? '') === 'removed', 'Beacon must remove Tab C');

$stmt = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id = ?");
$stmt->execute([$tabC]);
$cCount = (int)$stmt->fetchColumn();
$stmt->closeCursor();
echo "Tab C in database after unload: {$cCount} (Expected: 0)\n";
assert($cCount === 0, 'Tab C must be wiped from database upon unload');

// 3. Simulasikan Ghost Peer (abandoned tab tanpa beacon, time > 8 detik)
$tabGhost = 'tab_ghost_444444444';
$staleTime = time() - 12; // 12 detik lalu
$insertGhost = $pdo->prepare("INSERT INTO waiting_queue (peer_id, updated_at) VALUES (?, ?)");
$insertGhost->execute([$tabGhost, $staleTime]);
$insertGhost->closeCursor();

echo "Ghost peer inserted with timestamp 12s ago.\n";

// Tab D joins now -> should automatically trigger ghost cleanup inside BEGIN IMMEDIATE
$tabD = 'tab_delta_555555555';
$resD = executeApiRequest(['action' => 'find_match', 'peer_id' => $tabD]);
echo "Tab D find_match response: " . ($resD['json']['status'] ?? 'unknown') . "\n";
assert(($resD['json']['status'] ?? '') === 'waiting', 'Tab D should be waiting since ghost was purged');

// Verify Ghost was deleted
$stmt = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id = ?");
$stmt->execute([$tabGhost]);
$ghostRemaining = (int)$stmt->fetchColumn();
$stmt->closeCursor();
echo "Ghost peer count after automatic cleanup: {$ghostRemaining} (Expected: 0)\n";
assert($ghostRemaining === 0, 'Ghost peer must be purged completely');

// Clean up
$pdo->exec("DELETE FROM waiting_queue");

echo "\n=================================================================\n";
echo "   >>> SEMUA PENGUJIAN FASE 7 BERHASIL 100% LULUS TANPA CACAT <<< \n";
echo "=================================================================\n";

