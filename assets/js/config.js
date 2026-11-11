/**
 * NONGKI — Application Configuration & Constants (ES6)
 * 
 * Konfigurasi STUN/TURN ICE Servers, endpoint API backend, interval polling,
 * serta batasan sistem matchmaking dan WebRTC.
 */

export const CONFIG = {
    // Endpoint Backend API
    API_URL: 'api/match.php',

    // Interval Polling Heartbeat (milidetik)
    POLLING_INTERVAL_MS: 2500,

    // Batas Ambang Pembersihan Antrean Hantu (detik)
    GHOST_THRESHOLD_SECONDS: 8,

    // Konfigurasi WebRTC PeerJS & ICE Servers (NAT Traversal)
    PEER_CONFIG: {
        debug: 1, // 1: Errors only, 2: Warnings, 3: All logs
        config: {
            // Utamakan koneksi langsung via STUN, fallback ke TURN jika gagal/terblokir firewall
            iceTransportPolicy: 'all',
            iceCandidatePoolSize: 10,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceServers: [
                // 1. Google Public STUN Servers (Gratis & Kecepatan Tinggi)
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' },
                { urls: 'stun:stun3.l.google.com:19302' },
                { urls: 'stun:stun4.l.google.com:19302' },

                // 2. Placeholder TURN Servers (UDP, TCP Port 80, TURNS Port 443)
                // Isi jika ingin traversal menembus Symmetric NAT / Jaringan Seluler Ketat
                /*
                {
                    urls: [
                        'turn:turn.yourdomain.com:3478?transport=udp',
                        'turn:turn.yourdomain.com:80?transport=tcp'
                    ],
                    username: 'nongki_user',
                    credential: 'nongki_password'
                },
                {
                    urls: 'turns:turn.yourdomain.com:443?transport=tcp',
                    username: 'nongki_user',
                    credential: 'nongki_password'
                }
                */
            ]
        }
    },

    // Batasan Chat
    CHAT: {
        MAX_MESSAGE_LENGTH: 500,
    }
};

