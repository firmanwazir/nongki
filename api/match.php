<?php
declare(strict_types=1);

/**
 * Endpoint Matchmaking Nongki
 * 
 * Menangani pendaftaran antrean, pencarian lawan secara atomik (FIFO) dengan
 * SQLite WAL mode (BEGIN IMMEDIATE TRANSACTION), pembersihan ghost peers,
 * serta pembatalan antrean (leave_queue).
 */

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
header('X-Content-Type-Options: nosniff');

// Handle preflight CORS request jika diperlukan
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Method Not Allowed'
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

// 0. Validasi Origin / Referer & Sec-Fetch-Site (Anti-Cross-Site Queue Poisoning / CSRF) pada request browser
if (PHP_SAPI !== 'cli') {
    $secFetchSite = strtolower((string)($_SERVER['HTTP_SEC_FETCH_SITE'] ?? ''));
    if ($secFetchSite === 'cross-site') {
        http_response_code(403);
        echo json_encode(['status' => 'error', 'message' => 'Cross-site request forbidden'], JSON_UNESCAPED_SLASHES);
        exit;
    }

    $serverHost = strtolower((string)($_SERVER['HTTP_HOST'] ?? ''));
    $originHeader = (string)($_SERVER['HTTP_ORIGIN'] ?? '');
    $refererHeader = (string)($_SERVER['HTTP_REFERER'] ?? '');

    if ($serverHost !== '') {
        if ($originHeader !== '') {
            if ($originHeader === 'null') {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Null origin forbidden'], JSON_UNESCAPED_SLASHES);
                exit;
            }
            $originHost = strtolower((string)parse_url($originHeader, PHP_URL_HOST));
            $originPort = parse_url($originHeader, PHP_URL_PORT);
            $originAuthority = $originPort ? "{$originHost}:{$originPort}" : $originHost;
            if ($originHost !== $serverHost && $originAuthority !== $serverHost) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Cross-origin request forbidden'], JSON_UNESCAPED_SLASHES);
                exit;
            }
        } elseif ($refererHeader !== '') {
            $refHost = strtolower((string)parse_url($refererHeader, PHP_URL_HOST));
            $refPort = parse_url($refererHeader, PHP_URL_PORT);
            $refAuthority = $refPort ? "{$refHost}:{$refPort}" : $refHost;
            if ($refHost !== $serverHost && $refAuthority !== $serverHost) {
                http_response_code(403);
                echo json_encode(['status' => 'error', 'message' => 'Cross-origin referer forbidden'], JSON_UNESCAPED_SLASHES);
                exit;
            }
        }
    }
}

// 1. Batasi ukuran payload maksimal 4 KB untuk mencegah DoS Memory Exhaustion
$rawBody = file_get_contents('php://input', false, null, 0, 4096);
if (($rawBody === false || $rawBody === '') && PHP_SAPI === 'cli') {
    $rawBody = (string)file_get_contents('php://stdin', false, null, 0, 4096);
}

// Bersihkan UTF-8 BOM jika ada
$rawBody = preg_replace('/^\xEF\xBB\xBF/', '', (string)$rawBody);
$payload = json_decode($rawBody, true, 4);

if (!is_array($payload)) {
    if (!empty($_POST)) {
        $payload = $_POST;
    } else {
        $trimmed = trim($rawBody);
        if ($trimmed !== '') {
            $decoded = json_decode($trimmed, true, 4);
            $payload = is_array($decoded) ? $decoded : [];
        } else {
            $payload = [];
        }
    }
}

$rawAction = $payload['action'] ?? '';
$rawPeerId = $payload['peer_id'] ?? '';

$action = is_scalar($rawAction) ? trim((string)$rawAction) : '';
$peerId = is_scalar($rawPeerId) ? trim((string)$rawPeerId) : '';

// 2. Early Return Validation: Validasi action & format peer_id sebelum menyentuh database
if (!in_array($action, ['find_match', 'leave_queue'], true)) {
    http_response_code(400);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Invalid action'
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

if (!preg_match('/^[a-zA-Z0-9_-]{10,64}$/', $peerId)) {
    http_response_code(400);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Invalid or missing peer_id'
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

require_once __DIR__ . '/Database.php';

try {
    $pdo = Database::getConnection();
} catch (Throwable $e) {
    error_log('Nongki DB connection error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'status'  => 'error',
        'message' => 'Database connection error'
    ], JSON_UNESCAPED_SLASHES);
    exit;
}

// 3. Routing Aksi
switch ($action) {
    case 'find_match':
        $now = time();
        $ghostThreshold = $now - 8;
        $inImmediateTx = false;

        try {
            // Eksekusi transaksi atomik SQLite (Eksplisit raw SQL BEGIN IMMEDIATE TRANSACTION)
            $pdo->exec('BEGIN IMMEDIATE TRANSACTION');
            $inImmediateTx = true;

            // 1. Pembersihan antrean hantu (peers yang tidak mengirim heartbeat > 8 detik)
            // Dijalankan di dalam transaksi atomik untuk menghemat write-lock I/O
            $cleanStmt = $pdo->prepare('DELETE FROM waiting_queue WHERE updated_at < :threshold');
            $cleanStmt->execute([':threshold' => $ghostThreshold]);
            $cleanStmt->closeCursor();

            // 2. Cari 1 peer terlama selain diri sendiri
            $findStmt = $pdo->prepare('
                SELECT peer_id 
                FROM waiting_queue 
                WHERE peer_id != :my_id 
                ORDER BY updated_at ASC 
                LIMIT 1
            ');
            $findStmt->execute([':my_id' => $peerId]);
            $matched = $findStmt->fetch();
            $findStmt->closeCursor();

            if ($matched && !empty($matched['peer_id'])) {
                $targetId = (string)$matched['peer_id'];

                // Hapus kedua peer dari antrean karena telah dipasangkan
                $delStmt = $pdo->prepare('DELETE FROM waiting_queue WHERE peer_id IN (:target_id, :my_id)');
                $delStmt->execute([
                    ':target_id' => $targetId,
                    ':my_id'     => $peerId,
                ]);
                $delStmt->closeCursor();

                $pdo->exec('COMMIT');
                $inImmediateTx = false;

                echo json_encode([
                    'status'    => 'matched',
                    'target_id' => $targetId
                ], JSON_UNESCAPED_SLASHES);
                exit;
            }

            // 3. Jika belum ada lawan yang cocok, daftarkan atau perbarui heartbeat di antrean
            // Guard Anti-Flooding: Batasi kapasitas tabel antrean maksimal 1000 entri aktif
            $countStmt = $pdo->query('SELECT COUNT(*) FROM waiting_queue');
            $currentQueueSize = (int)$countStmt->fetchColumn();
            $countStmt->closeCursor();

            if ($currentQueueSize >= 1000) {
                // Pangkas entri paling tua jika antrean melampaui batas wajar
                $pdo->exec('
                    DELETE FROM waiting_queue 
                    WHERE peer_id IN (
                        SELECT peer_id FROM waiting_queue ORDER BY updated_at ASC LIMIT 100
                    )
                ');
            }

            $upsertStmt = $pdo->prepare('
                INSERT OR REPLACE INTO waiting_queue (peer_id, updated_at) 
                VALUES (:my_id, :now)
            ');
            $upsertStmt->execute([
                ':my_id' => $peerId,
                ':now'   => $now,
            ]);
            $upsertStmt->closeCursor();

            $pdo->exec('COMMIT');
            $inImmediateTx = false;

            echo json_encode([
                'status' => 'waiting'
            ], JSON_UNESCAPED_SLASHES);
            exit;

        } catch (Throwable $e) {
            if ($inImmediateTx) {
                try {
                    $pdo->exec('ROLLBACK');
                } catch (Throwable) {
                    // Abaikan jika rollback gagal
                }
            }
            error_log('Nongki match error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'status'  => 'error',
                'message' => 'Matchmaking transaction failed'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }

    case 'leave_queue':
        try {
            $delStmt = $pdo->prepare('DELETE FROM waiting_queue WHERE peer_id = :my_id');
            $delStmt->execute([':my_id' => $peerId]);
            $delStmt->closeCursor();

            echo json_encode([
                'status' => 'removed'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        } catch (Throwable $e) {
            error_log('Nongki leave_queue error: ' . $e->getMessage());
            http_response_code(500);
            echo json_encode([
                'status'  => 'error',
                'message' => 'Failed to leave queue'
            ], JSON_UNESCAPED_SLASHES);
            exit;
        }

    default:
        http_response_code(400);
        echo json_encode([
            'status'  => 'error',
            'message' => 'Invalid action'
        ], JSON_UNESCAPED_SLASHES);
        exit;
}
