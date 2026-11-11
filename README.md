# Nongki

Aplikasi web obrolan video dan teks acak (*random live video chat*) ringan berbasis WebRTC dan PHP SQLite. Dirancang agar dapat dijalankan pada infrastruktur *shared hosting* standar maupun server mandiri tanpa memerlukan layanan *daemon* Node.js di sisi server.

**Live Demo:** [https://nongki.devlika.my.id/](https://nongki.devlika.my.id/)

---

## Fitur Utama

- **Pencocokan Antrean Atomik (FIFO):** Menggunakan SQLite 3 dengan mode *Write-Ahead Logging* (`WAL`) dan transaksi `BEGIN IMMEDIATE` untuk mencegah *race condition* saat menangani permintaan secara bersamaan.
- **Komunikasi Video & Audio Real-Time:** Aliran media dan pesan teks dikirim secara langsung antar peramban menggunakan WebRTC (`MediaStream` & `RTCDataChannel`) dengan optimasi *low-latency*.
- **Kontrol Perangkat Media Lengkap:**
  - *Mute / Unmute* mikrofon.
  - *On / Off* kamera video.
  - Pergantian kamera depan dan belakang (*Flip Camera*) pada perangkat seluler tanpa memutus panggilan (`RTCRtpSender.replaceTrack`).
  - Berbagi layar (*Screen Sharing*) pada peramban desktop.
- **Pembersihan Antrean Otomatis:** Menggabungkan *heartbeat polling* berkala, penghapusan otomatis pengguna tidak aktif (*ghost queue cleanup*), serta pengiriman sinyal keluar menggunakan `navigator.sendBeacon` saat tab ditutup.
- **Antarmuka Responsif:** Mendukung tampilan *split-stage* pada desktop dan *bottom-sheet chat drawer* pada perangkat seluler.

---

## Teknologi yang Digunakan

- **Frontend:** HTML5, CSS3, Bootstrap 5.3, Vanilla JavaScript (ES6 Modules), PeerJS (WebRTC Wrapper).
- **Backend:** PHP 8.x dengan ekstensi `PDO` dan `pdo_sqlite`.
- **Database:** SQLite 3 (WAL Mode).
- **Web Server:** Apache 2.4+ (dengan dukungan `.htaccess`, `mod_headers`, dan `mod_authz_core`).

---

## Struktur Proyek

```text
├── api/
│   ├── Database.php          # Koneksi PDO SQLite Singleton & inisialisasi skema WAL
│   └── match.php             # Endpoint API pencocokan pasangan & manajemen antrean
├── assets/
│   ├── css/
│   │   └── main.css          # Stylesheet utama & tata letak responsif
│   ├── img/
│   │   └── favicon.svg       # Ikon aplikasi
│   └── js/
│       ├── app.js            # Orkestrator utama aplikasi
│       ├── config.js         # Konfigurasi endpoint, interval, dan STUN/TURN server
│       └── modules/
│           ├── matcher.js    # Pengelola antrean, polling heartbeat, dan unload beacon
│           ├── media.js      # Pengelola kamera, mikrofon, dan berbagi layar
│           ├── rtc.js        # Pengelola koneksi WebRTC, Single-Line Lock, dan DataChannel
│           └── ui.js         # Manipulasi DOM, indikator status, dan perenderan pesan
├── storage/
│   ├── .htaccess             # Proteksi akses langsung ke direktori database
│   └── .gitkeep
├── tests/                    # Skrip pengujian unit dan simulasi konkurensi (khusus CLI)
├── .htaccess                 # Konfigurasi keamanan HTTP Header & proteksi berkas sensitif
└── index.html                # Halaman utama aplikasi
```

---

## Kebutuhan Sistem

1. **PHP:** Versi 8.0 atau lebih baru.
2. **Ekstensi PHP:** `pdo`, `pdo_sqlite`.
3. **Web Server:** Apache (dengan `AllowOverride All` agar aturan keamanan `.htaccess` berjalan) atau Nginx.
4. **HTTPS (SSL):** Wajib menggunakan koneksi HTTPS di lingkungan produksi agar peramban mengizinkan akses kamera dan mikrofon (`navigator.mediaDevices.getUserMedia`).

---

## Panduan Instalasi

1. **Salin Repositori**
   ```bash
   git clone https://github.com/firmanwazir/nongki.git
   cd nongki
   ```

2. **Atur Izin Direktori `storage/`**
   Pastikan proses PHP/Web Server memiliki izin baca dan tulis (*read/write*) pada direktori `storage/` agar berkas database `nongki_queue.sqlite` beserta berkas `-wal` dan `-shm` dapat dibuat secara otomatis:
   ```bash
   chmod 755 storage
   ```

3. **Konfigurasi STUN/TURN Server (Opsional)**
   Secara bawaan, aplikasi menggunakan server STUN publik milik Google yang dikonfigurasi pada berkas `assets/js/config.js`. Jika ingin menambahkan server TURN pribadi untuk menembus jaringan dengan *Symmetric NAT* ketat, sesuaikan bagian `PEER_CONFIG.config.iceServers` di dalam `assets/js/config.js`.

4. **Jalankan Aplikasi**
   Arahkan *Document Root* web server ke direktori proyek dan akses melalui peramban menggunakan protokol `https://` (atau `http://localhost` untuk pengujian lokal).

---

## Pengujian (CLI)

Proyek ini menyertakan skrip pengujian otomatis di dalam direktori `tests/` untuk memverifikasi fungsi antrean, konkurensi database SQLite WAL, dan struktur modul frontend:

```bash
# Pengujian fungsionalitas backend & antrean
php tests/test_backend.php

# Pengujian konkurensi tinggi & simulasi End-to-End (50 permintaan simultan)
php tests/test_e2e_simulation.php

# Pengujian integritas DOM & modul JavaScript
node tests/test_ui_dom.js
node tests/test_media_module.js
node tests/test_rtc_module.js
node tests/test_phase6_orchestration.js
```

---

## Keamanan

- **Perlindungan Basis Data:** Berkas SQLite di dalam `storage/` dilindungi menggunakan aturan `.htaccess` berlapis agar tidak dapat diunduh melalui protokol HTTP.
- **Pencegahan Injeksi & XSS:** Seluruh kueri SQL menggunakan *PDO Prepared Statements* (`ATTR_EMULATE_PREPARES = false`) dan seluruh pesan obrolan dirender menggunakan `.textContent`.
- ** Kebijakan Header Keamanan:** Dilengkapi dengan *Content-Security-Policy (CSP)*, *Permissions-Policy*, *X-Frame-Options*, serta validasi *Origin/Referer* dan *Rate Limiting* pada kanal pesan.

---

## Lisensi

Proyek ini dilisensikan di bawah [MIT License](LICENSE).

