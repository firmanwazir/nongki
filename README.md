# Nongki

A lightweight random live video and text chat web application powered by WebRTC and PHP SQLite. Designed to run seamlessly on standard shared hosting or self-hosted servers without requiring a background Node.js daemon.

**Live Demo:** [https://nongki.devlika.my.id/](https://nongki.devlika.my.id/)

---

## Key Features

- **Atomic FIFO Matchmaking Queue:** Uses SQLite 3 in *Write-Ahead Logging* (`WAL`) mode with `BEGIN IMMEDIATE` transactions to prevent race conditions under concurrent requests.
- **Zero-Configuration Database Provisioning:** Automatically creates the `storage/nongki_queue.sqlite` database file, WAL configuration, table schema (`waiting_queue`), and index on first request if not already present.
- **Real-Time Video, Audio & Text Chat:** Media streams and text messages are exchanged directly between browsers via WebRTC (`MediaStream` & `RTCDataChannel`) with low-latency playout tuning.
- **Complete Media Controls:**
  - Microphone *Mute / Unmute*.
  - Camera *On / Off*.
  - Front and rear camera switching (*Flip Camera*) on mobile devices without dropping the active call (`RTCRtpSender.replaceTrack`).
  - *Screen Sharing* on desktop browsers.
- **Automatic Queue Cleanup:** Combines periodic heartbeat polling, stale entry removal (*ghost queue cleanup*), and `navigator.sendBeacon` on tab unload.
- **Responsive Interface:** Features a split-stage layout on desktop and an ergonomic bottom-sheet chat drawer on mobile devices.

---

## Tech Stack

- **Frontend:** HTML5, CSS3, Bootstrap 5.3, Vanilla JavaScript (ES6 Modules), PeerJS (WebRTC Wrapper).
- **Backend:** PHP 8.x with `PDO` and `pdo_sqlite` extensions.
- **Database:** SQLite 3 (WAL Mode).
- **Web Server:** Apache 2.4+ (with `.htaccess`, `mod_headers`, and `mod_authz_core` enabled).

---

## Project Structure

```text
├── api/
│   ├── Database.php          # PDO SQLite Singleton connection & auto-schema initialization
│   └── match.php             # Atomic matchmaking & queue management API endpoint
├── assets/
│   ├── css/
│   │   └── main.css          # Main stylesheet & responsive breakpoints
│   ├── img/
│   │   └── favicon.svg       # Application icon
│   └── js/
│       ├── app.js            # Main application orchestrator
│       ├── config.js         # Endpoint, polling interval, and STUN/TURN configuration
│       └── modules/
│           ├── matcher.js    # Queue manager, heartbeat polling, and unload beacon
│           ├── media.js      # Camera, microphone, and screen sharing manager
│           ├── rtc.js        # WebRTC connection lifecycle, Single-Line Lock, and DataChannel
│           └── ui.js         # DOM manipulation, status indicators, and safe chat rendering
├── storage/
│   ├── .htaccess             # Blocks direct HTTP access to the database directory
│   └── .gitkeep
├── tests/                    # Automated unit & concurrency stress test scripts (CLI-only)
├── .htaccess                 # HTTP security headers & sensitive file protection
└── index.html                # Main application entry point
```

---

## System Requirements

1. **PHP:** Version 8.0 or higher.
2. **PHP Extensions:** `pdo`, `pdo_sqlite`.
3. **Web Server:** Apache (with `AllowOverride All` enabled for `.htaccess` rules) or Nginx.
4. **HTTPS (SSL):** Required in production environments for browser camera and microphone permissions (`navigator.mediaDevices.getUserMedia`).

---

## Installation

1. **Clone the Repository**
   ```bash
   git clone https://github.com/firmanwazir/nongki.git
   cd nongki
   ```

2. **Ensure Write Permissions on `storage/`**
   Ensure the web server / PHP process has read and write permissions on the `storage/` directory so `nongki_queue.sqlite` (along with its `-wal` and `-shm` files) can be created automatically on the first request:
   ```bash
   chmod 755 storage
   ```

3. **Configure STUN/TURN Servers (Optional)**
   By default, the application uses Google's public STUN servers configured in `assets/js/config.js`. To add custom TURN servers for strict *Symmetric NAT* traversal, update the `PEER_CONFIG.config.iceServers` array in `assets/js/config.js`.

4. **Run the Application**
   Point your web server's *Document Root* to the project directory and open it via `https://` (or `http://localhost` for local development).

---

## Running Tests (CLI)

The `tests/` directory includes automated test scripts to verify queue operations, SQLite WAL concurrency, and frontend module integrity:

```bash
# Backend queue & database lifecycle tests
php tests/test_backend.php

# High-concurrency stress test & E2E simulation (50 simultaneous requests)
php tests/test_e2e_simulation.php

# Frontend DOM & JavaScript module verification
node tests/test_ui_dom.js
node tests/test_media_module.js
node tests/test_rtc_module.js
node tests/test_phase6_orchestration.js
```

---

## Security

- **Database Protection:** SQLite files inside `storage/` are restricted via multi-layered `.htaccess` rules to prevent direct HTTP downloads.
- **Injection & XSS Prevention:** All SQL queries use strict *PDO Prepared Statements* (`ATTR_EMULATE_PREPARES = false`), and all user-supplied chat messages are rendered exclusively via `.textContent`.
- **Hardened HTTP Headers:** Enforces strict *Content-Security-Policy (CSP)*, *Permissions-Policy*, *X-Frame-Options*, *Origin/Referer* validation, and per-connection chat rate limiting.

---

## License

This project is licensed under the [MIT License](LICENSE).
