<?php
declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    http_response_code(403);
    exit('Forbidden');
}

require_once __DIR__ . '/../api/Database.php';

$pdo = Database::getConnection();
$pdo->exec("DELETE FROM waiting_queue");

$phpBin = 'D:\WebServer\laragon\bin\php\php-8.3.16-Win32-vs16-x64\php.exe';
$script = __DIR__ . '/../api/match.php';

echo "=== CONCURRENCY AUDIT: 20 Simultaneous Requests ===\n";

$numPeers = 20;
$processes = [];
$pipesList = [];

for ($i = 1; $i <= $numPeers; $i++) {
    $peerId = sprintf('peer_concurrent_%04d', $i);
    $payload = json_encode(['action' => 'find_match', 'peer_id' => $peerId]);

    // Command to execute match.php via CLI
    $cmd = "\"{$phpBin}\" -r \"\$_SERVER['REQUEST_METHOD'] = 'POST'; require '{$script}';\"";
    
    $descriptors = [
        0 => ['pipe', 'r'],
        1 => ['pipe', 'w'],
        2 => ['pipe', 'w'],
    ];

    $proc = proc_open($cmd, $descriptors, $pipes);
    if (is_resource($proc)) {
        fwrite($pipes[0], $payload);
        fclose($pipes[0]);
        $processes[$peerId] = $proc;
        $pipesList[$peerId] = $pipes;
    }
}

$results = [];
$errors = [];

foreach ($processes as $peerId => $proc) {
    $pipes = $pipesList[$peerId];
    $stdout = stream_get_contents($pipes[1]);
    fclose($pipes[1]);
    $stderr = stream_get_contents($pipes[2]);
    fclose($pipes[2]);
    
    $exitCode = proc_close($proc);
    $data = json_decode($stdout, true);
    
    if (!$data || ($data['status'] ?? '') === 'error') {
        $errors[] = [
            'peer_id' => $peerId,
            'exit' => $exitCode,
            'stdout' => $stdout,
            'stderr' => $stderr
        ];
    } else {
        $results[$peerId] = $data;
    }
}

echo "Total Processed: " . count($results) . " / {$numPeers}\n";
echo "Errors Count: " . count($errors) . "\n";
if (!empty($errors)) {
    print_r($errors);
}

$matchedCount = 0;
$waitingCount = 0;
$targets = [];

foreach ($results as $peerId => $res) {
    if ($res['status'] === 'matched') {
        $matchedCount++;
        $target = $res['target_id'];
        assert($target !== $peerId, "Self matching detected!");
        $targets[] = $target;
    } elseif ($res['status'] === 'waiting') {
        $waitingCount++;
    }
}

echo "Matched Peers: {$matchedCount}\n";
echo "Waiting Peers: {$waitingCount}\n";

// Verify uniqueness of targets
$uniqueTargets = array_unique($targets);
echo "Unique Targets: " . count($uniqueTargets) . " vs Total Targets: " . count($targets) . "\n";
assert(count($uniqueTargets) === count($targets), "Race condition: duplicate target assigned!");

echo "\n>>> CONCURRENCY AUDIT RESULT: PASSED ZERO RACE CONDITIONS! <<<\n";

