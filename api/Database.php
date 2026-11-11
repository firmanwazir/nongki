<?php
declare(strict_types=1);

// Cegah akses HTTP langsung ke file class internal
if (PHP_SAPI !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === basename(__FILE__)) {
    http_response_code(403);
    exit('Forbidden');
}

/**
 * Class Database
 * 
 * Pengelola koneksi SQLite 3 berbasis PDO Singleton dengan konfigurasi WAL Mode,
 * busy timeout, serta inisialisasi skema tabel antrean otomatis.
 */
class Database
{
    private static ?PDO $instance = null;
    private static string $dbPath = __DIR__ . '/../storage/nongki_queue.sqlite';

    /**
     * Konstruktor privat untuk mencegah instansiasi langsung (Singleton).
     */
    private function __construct()
    {
    }

    /**
     * Mencegah clone objek.
     */
    private function __clone()
    {
    }

    /**
     * Mendapatkan koneksi PDO aktif.
     *
     * @return PDO
     * @throws RuntimeException Jika inisialisasi koneksi atau pragma gagal.
     */
    public static function getConnection(): PDO
    {
        if (self::$instance === null) {
            try {
                $storageDir = dirname(self::$dbPath);
                if (!is_dir($storageDir) && !mkdir($storageDir, 0755, true) && !is_dir($storageDir)) {
                    throw new RuntimeException("Gagal membuat direktori storage: {$storageDir}");
                }

                $dsn = 'sqlite:' . self::$dbPath;
                $pdo = new PDO($dsn, null, null, [
                    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES   => false,
                ]);

                // WAJIB PERTAMA: Pasang busy_timeout sebelum pragma/query lain agar tidak terkena SQLITE_BUSY (timeout 0ms)
                $pdo->exec('PRAGMA busy_timeout = 5000;');
                $pdo->exec('PRAGMA journal_mode = WAL;');
                $pdo->exec('PRAGMA synchronous = NORMAL;');

                // Inisialisasi tabel dan indeks antrean jika belum ada
                $pdo->exec('
                    CREATE TABLE IF NOT EXISTS waiting_queue (
                        peer_id TEXT PRIMARY KEY,
                        updated_at INTEGER NOT NULL
                    );
                    CREATE INDEX IF NOT EXISTS idx_waiting_queue_updated ON waiting_queue(updated_at ASC);
                ');

                self::$instance = $pdo;
            } catch (Throwable $e) {
                throw new RuntimeException("Koneksi database SQLite gagal: " . $e->getMessage(), (int)$e->getCode(), $e);
            }
        }

        return self::$instance;
    }
}

