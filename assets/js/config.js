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
            iceCandidatePoolSize: 4,
            bundlePolicy: 'max-bundle',
            rtcpMuxPolicy: 'require',
            iceServers: [
                // 1. Cloudflare Anycast STUN (Ultra-Low Latency di jaringan ISP Indonesia, Port 3478 & 53)
                {
                    urls: [
                        'stun:stun.cloudflare.com:3478',
                        'stun:stun.cloudflare.com:53'
                    ]
                },

                // 2. Google Public STUN Servers (High-Availability Multi-Port 19302 & 5349)
                {
                    urls: [
                        'stun:stun.l.google.com:19302',
                        'stun:stun.l.google.com:5349',
                        'stun:stun1.l.google.com:19302'
                    ]
                },

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

