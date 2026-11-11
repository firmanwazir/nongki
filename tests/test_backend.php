<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/../api/Database.php';

echo "=== TEST 1: Database Connection & PRAGMA Verification ===\n";
$pdo = Database::getConnection();
$journalMode = $pdo->query('PRAGMA journal_mode;')->fetchColumn();
$busyTimeout = $pdo->query('PRAGMA busy_timeout;')->fetchColumn();
$synchronous = $pdo->query('PRAGMA synchronous;')->fetchColumn();

echo "journal_mode: {$journalMode} (Expected: wal)\n";
echo "busy_timeout: {$busyTimeout} (Expected: 5000)\n";
echo "synchronous: {$synchronous}\n";

assert(strtolower((string)$journalMode) === 'wal', 'journal_mode must be wal');
assert((int)$busyTimeout === 5000, 'busy_timeout must be 5000');

// Helper to simulate request to match.php
function simulateMatchRequest(array $payload, string $method = 'POST', string $contentType = 'application/json'): array {
    $script = __DIR__ . '/../api/match.php';
    $json = json_encode($payload);
    
    $phpBin = 'D:\WebServer\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe';
    $cmd = "\"{$phpBin}\" -r \"\$_SERVER['REQUEST_METHOD'] = '{$method}'; require '{$script}';\"";
    
    $descriptor = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w']
    ];
    
    $proc = proc_open($cmd, $descriptor, $pipes);
    if (is_resource($proc)) {
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
    
    throw new RuntimeException("Gagal menjalankan proc_open");
}

echo "\n=== TEST 2: Invalid Peer ID Validation ===\n";
$resInvalid = simulateMatchRequest(['action' => 'find_match', 'peer_id' => 'bad!id']);
echo "Result invalid peer_id: " . json_encode($resInvalid['json']) . "\n";
assert(($resInvalid['json']['status'] ?? '') === 'error', 'Invalid peer_id must return error');

echo "\n=== TEST 3: Peer 1 Joins Queue (Waiting) ===\n";
$peer1 = 'peer_user_11111111';
$res1 = simulateMatchRequest(['action' => 'find_match', 'peer_id' => $peer1]);
echo "Peer 1 stdout: " . $res1['stdout'] . "\n";
echo "Peer 1 status: " . ($res1['json']['status'] ?? 'unknown') . "\n";
assert(($res1['json']['status'] ?? '') === 'waiting', 'Peer 1 must get waiting');

echo "\n=== TEST 4: Peer 2 Joins Queue (Matched with Peer 1) ===\n";
$peer2 = 'peer_user_22222222';
$res2 = simulateMatchRequest(['action' => 'find_match', 'peer_id' => $peer2]);
echo "Peer 2 status: " . ($res2['json']['status'] ?? 'unknown') . ", target_id: " . ($res2['json']['target_id'] ?? 'none') . "\n";
assert(($res2['json']['status'] ?? '') === 'matched', 'Peer 2 must get matched');
assert(($res2['json']['target_id'] ?? '') === $peer1, "Peer 2 target must be {$peer1}");

// Verify both peers are removed from queue
$checkStmt = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id IN (?, ?)");
$checkStmt->execute([$peer1, $peer2]);
$count = $checkStmt->fetchColumn();
$checkStmt->closeCursor();
echo "Remaining matched peers in queue: {$count} (Expected: 0)\n";
assert((int)$count === 0, 'Matched peers must be removed from queue');

echo "\n=== TEST 5: Leave Queue (Action leave_queue) ===\n";
$peer3 = 'peer_user_33333333';
simulateMatchRequest(['action' => 'find_match', 'peer_id' => $peer3]);
$resLeave = simulateMatchRequest(['action' => 'leave_queue', 'peer_id' => $peer3]);
echo "Leave queue status: " . ($resLeave['json']['status'] ?? 'unknown') . "\n";
assert(($resLeave['json']['status'] ?? '') === 'removed', 'leave_queue must return removed');

$checkLeave = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id = ?");
$checkLeave->execute([$peer3]);
$countLeave = (int)$checkLeave->fetchColumn();
$checkLeave->closeCursor();
assert($countLeave === 0, 'Peer 3 must be deleted from queue');

echo "\n=== TEST 6: Ghost Queue Cleanup (updated_at < time() - 8) ===\n";
$ghostPeer = 'peer_ghost_9999999';
$pastTime = time() - 15;
$ghostInsert = $pdo->prepare("INSERT INTO waiting_queue (peer_id, updated_at) VALUES (?, ?)");
$ghostInsert->execute([$ghostPeer, $pastTime]);

// Now call find_match with peer 5
$peer5 = 'peer_user_55555555';
simulateMatchRequest(['action' => 'find_match', 'peer_id' => $peer5]);

// Ghost peer must have been cleaned up
$checkGhost = $pdo->prepare("SELECT COUNT(*) FROM waiting_queue WHERE peer_id = ?");
$checkGhost->execute([$ghostPeer]);
$ghostCount = $checkGhost->fetchColumn();
echo "Ghost peer count after cleanup: {$ghostCount} (Expected: 0)\n";
assert((int)$ghostCount === 0, 'Ghost peer must be wiped out');

// Cleanup test peer 5
$pdo->exec("DELETE FROM waiting_queue");

echo "\n>>> SEMUA PENGUJIAN FASE 2 BERHASIL 100% <<<\n";
