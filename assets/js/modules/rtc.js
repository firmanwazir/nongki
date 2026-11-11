/**
 * NONGKI — WebRTC & Signaling Layer (ES6 Module)
 * 
 * Mengelola siklus hidup koneksi PeerJS, Single-Line Lock (isBusy),
 * panggilan video/audio P2P, pertukaran pesan DataChannel, serta deteksi
 * pemutusan jaringan secara real-time.
 */

import { CONFIG } from '../config.js';

// State WebRTC Internal
const state = {
    peer: null,                 // Instance PeerJS aktif
    myPeerId: null,             // ID peer lokal yang diberikan PeerJS
    currentCall: null,          // MediaConnection aktif
    currentConn: null,          // DataConnection (DataChannel) aktif
    currentPeerId: null,        // ID lawan bicara aktif
    isBusy: false,              // Single-Line Lock untuk menolak panggilan ke-3
    isInitiator: false,         // Apakah kita yang menelepon (caller) atau menerima (callee)
    handshakeTimer: null,       // Timer batas waktu penyambungan panggilan (15 detik)
};

// Event Callbacks untuk komunikasi dengan orchestrator (app.js)
let callbacks = {
    onReady: (peerId) => {},
    onRemoteStream: (stream) => {},
    onPeerDisconnected: (reason) => {},
    onChatMessage: (message) => {},
    onIncomingCall: (call) => {},
    onError: (err) => {},
};

/**
 * Mendaftarkan callback event dari orchestrator.
 * @param {object} customCallbacks 
 */
export function registerRTCCallbacks(customCallbacks = {}) {
    callbacks = { ...callbacks, ...customCallbacks };
}

/**
 * Inisialisasi instance PeerJS dan binding seluruh event inti.
 * @returns {Promise<string>} Mengembalikan myPeerId jika sukses
 */
export function initPeer() {
    return new Promise((resolve, reject) => {
        if (typeof window.Peer === 'undefined') {
            return reject(new Error('Library PeerJS belum dimuat di halaman.'));
        }

        try {
            state.peer = new window.Peer(undefined, CONFIG.PEER_CONFIG);

            state.peer.on('open', (id) => {
                state.myPeerId = id;
                console.log('PeerJS siap dengan ID:', id);
                callbacks.onReady(id);
                resolve(id);
            });

            // Listener Panggilan Masuk (Incoming Video Call)
            state.peer.on('call', (incomingCall) => {
                handleIncomingCall(incomingCall);
            });

            // Listener Koneksi Masuk (Incoming DataChannel)
            state.peer.on('connection', (incomingConn) => {
                handleIncomingDataConnection(incomingConn);
            });

            state.peer.on('error', (err) => {
                console.error('PeerJS error:', err);

                // Jika lawan yang dipanggil sudah menutup tab (peer-unavailable), pulihkan otomatis dari status sibuk
                if (err.type === 'peer-unavailable' && state.isBusy) {
                    handleCallClosed('Teman nongki sedang terhubung dengan pengguna lain.');
                    return;
                }

                // Rekoneksi otomatis jika socket signaling terputus sementara
                if (
                    (err.type === 'network' || err.type === 'socket-error' || err.type === 'socket-closed') &&
                    state.peer && state.peer.disconnected && !state.peer.destroyed
                ) {
                    setTimeout(() => {
                        if (state.peer && state.peer.disconnected && !state.peer.destroyed) {
                            state.peer.reconnect();
                        }
                    }, 1500);
                }

                callbacks.onError(err);
            });

            state.peer.on('disconnected', () => {
                console.warn('PeerJS terputus dari signaling server, mencoba rekoneksi otomatis...');
                if (state.peer && !state.peer.destroyed) {
                    state.peer.reconnect();
                }
            });

            state.peer.on('close', () => {
                console.log('PeerJS connection closed.');
                state.peer = null;
                state.myPeerId = null;
            });

        } catch (err) {
            reject(err);
        }
    });
}

/**
 * Menangani panggilan video masuk dari peer lain.
 * Mengimplementasikan Single-Line Lock: menolak otomatis jika sedang sibuk.
 * 
 * @param {object} incomingCall Objek MediaConnection dari PeerJS
 */
function handleIncomingCall(incomingCall) {
    // 1. Single-Line Lock Check
    if (state.isBusy) {
        console.warn('Menolak panggilan masuk ke-3 karena sedang dalam panggilan (isBusy = true).');
        try {
            incomingCall.close();
        } catch (e) {
            // Abaikan error penutupan
        }
        return;
    }

    // 2. Kunci status sibuk segera untuk mencegah race condition mikrodetik
    state.isBusy = true;
    state.isInitiator = false;
    state.currentCall = incomingCall;
    state.currentPeerId = incomingCall.peer;

    // Beritahukan orchestrator bahwa panggilan masuk diterima
    callbacks.onIncomingCall(incomingCall);
}

/**
 * Menjawab panggilan masuk dengan MediaStream lokal.
 * 
 * @param {object} incomingCall 
 * @param {MediaStream} localStream 
 */
export function answerIncomingCall(incomingCall, localStream) {
    if (!incomingCall) return;

    try {
        incomingCall.answer(localStream);
        setupMediaConnectionListeners(incomingCall);
    } catch (err) {
        console.error('Gagal menjawab panggilan:', err);
        endCurrentCall();
    }
}

/**
 * Memanggil peer target (Caller Initiator).
 * 
 * @param {string} targetPeerId ID peer lawan bicara
 * @param {MediaStream} localStream Stream media lokal
 * @returns {object|null} Objek MediaConnection
 */
export function callPeer(targetPeerId, localStream) {
    if (!state.peer || !targetPeerId) return null;

    // Tutup panggilan sebelumnya jika ada
    endCurrentCall();

    state.isBusy = true;
    state.isInitiator = true;
    state.currentPeerId = targetPeerId;

    try {
        // 1. Inisialisasi Panggilan Media Video/Audio
        state.currentCall = state.peer.call(targetPeerId, localStream);
        setupMediaConnectionListeners(state.currentCall);

        // 2. Buka DataChannel untuk Live Text Chat
        const conn = state.peer.connect(targetPeerId, { reliable: true });
        setupDataConnection(conn);

        return state.currentCall;
    } catch (err) {
        console.error('Gagal memanggil peer target:', err);
        endCurrentCall();
        return null;
    }
}

/**
 * Mengatur timer batas waktu penyambungan panggilan (15 detik).
 * Mencegah UI macet selamanya di status "Menghubungkan..." jika lawan gagal merespons ICE/SDP.
 * 
 * @param {object} call 
 */
function startCallHandshakeTimer(call) {
    clearCallHandshakeTimer();
    state.handshakeTimer = setTimeout(() => {
        if (state.currentCall === call && state.isBusy) {
            console.warn('Batas waktu penyambungan WebRTC habis (15s timeout).');
            handleCallClosed('Waktu sambungan habis, mencari teman nongki lain...');
        }
    }, 15000);
}

/**
 * Membersihkan timer handshake panggilan.
 */
function clearCallHandshakeTimer() {
    if (state.handshakeTimer) {
        clearTimeout(state.handshakeTimer);
        state.handshakeTimer = null;
    }
}

/**
 * Mengoptimalkan RTCPeerConnection untuk Ultra-Low Latency:
 * 1. Mengatur playoutDelayHint / jitterBufferTarget ke minimum pada receiver (menghilangkan jeda buffer).
 * 2. Mengatur degradationPreference = 'maintain-framerate' dan maxBitrate pada sender agar paket tidak menumpuk di antrean jaringan.
 * 
 * @param {RTCPeerConnection} pc 
 */
function applyUltraLowLatencyTuning(pc) {
    if (!pc) return;

    // Tune Senders (Outgoing Stream): Jaga kelancaran framerate & batasi lonjakan bitrate
    const tuneSenders = () => {
        if (!pc.getSenders) return;
        pc.getSenders().forEach((sender) => {
            if (!sender.track) return;

            if (sender.track.kind === 'video' && typeof sender.getParameters === 'function') {
                try {
                    const params = sender.getParameters();
                    if (!params.encodings || params.encodings.length === 0) {
                        params.encodings = [{}];
                    }
                    // Prioritaskan kelancaran frame (zero-lag) dibanding resolusi saat jaringan padat
                    params.degradationPreference = 'maintain-framerate';
                    params.encodings[0].maxBitrate = 900000; // 900 kbps (sangat ringan & instan di jaringan seluler/WiFi)
                    params.encodings[0].maxFramerate = 30;
                    params.encodings[0].priority = 'high';
                    params.encodings[0].networkPriority = 'high';
                    sender.setParameters(params).catch(() => {});
                } catch (e) {}
            }
        });
    };

    // Tune Receivers (Incoming Stream): Pangkas Jitter Buffer Playout Delay ke 0 detik
    const tuneReceivers = () => {
        if (!pc.getReceivers) return;
        pc.getReceivers().forEach((receiver) => {
            try {
                // Chromium / Edge / Android WebRTC Native Low-Latency Hint (dalam detik)
                if ('playoutDelayHint' in receiver) {
                    receiver.playoutDelayHint = 0;
                }
                // W3C Standard Jitter Buffer Target (dalam milidetik)
                if ('jitterBufferTarget' in receiver) {
                    receiver.jitterBufferTarget = 0;
                }
            } catch (e) {}
        });
    };

    tuneSenders();
    tuneReceivers();

    pc.addEventListener('track', () => {
        tuneReceivers();
        tuneSenders();
    });
}

/**
 * Mengatur listener pada MediaConnection (video stream & close).
 * Dilengkapi guard (state.currentCall === call) untuk mencegah event panggilan lama
 * mengintervensi panggilan baru.
 * 
 * @param {object} call Objek MediaConnection dari PeerJS
 */
function setupMediaConnectionListeners(call) {
    if (!call) return;

    startCallHandshakeTimer(call);

    if (call.peerConnection) {
        applyUltraLowLatencyTuning(call.peerConnection);
    }

    // Event saat menerima video stream dari lawan bicara
    call.on('stream', (remoteStream) => {
        if (state.currentCall !== call) return;
        clearCallHandshakeTimer();
        if (call.peerConnection) {
            applyUltraLowLatencyTuning(call.peerConnection);
        }
        callbacks.onRemoteStream(remoteStream);
    });

    call.on('close', () => {
        if (state.currentCall !== call) return;
        console.log('MediaConnection ditutup oleh peer.');
        handleCallClosed('Teman nongki telah meninggalkan obrolan.');
    });

    call.on('error', (err) => {
        if (state.currentCall !== call) return;
        console.error('MediaConnection error:', err);
        handleCallClosed('Terjadi kendala koneksi media.');
    });

    // Deteksi pemutusan jaringan via RTCPeerConnection internal (ICE disconnect)
    if (call.peerConnection) {
        const pc = call.peerConnection;

        pc.addEventListener('connectionstatechange', () => {
            if (state.currentCall !== call) return;
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                handleCallClosed('Koneksi terputus dari jaringan.');
            }
        });

        pc.addEventListener('iceconnectionstatechange', () => {
            if (state.currentCall !== call) return;
            if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
                handleCallClosed('Koneksi ICE terputus.');
            }
        });
    }
}

/**
 * Menangani koneksi DataChannel masuk.
 * 
 * @param {object} incomingConn Objek DataConnection dari PeerJS
 */
function handleIncomingDataConnection(incomingConn) {
    if (!incomingConn) return;

    // Jika sedang tidak dalam panggilan/handshake aktif sama sekali, tolak koneksi DataChannel tak dikenal
    if (!state.isBusy) {
        try {
            incomingConn.close();
        } catch (e) {}
        return;
    }

    // Jika koneksi datang dari peer ke-3 di luar sesi aktif, tolak dengan pesan BUSY
    if (incomingConn.peer !== state.currentPeerId) {
        incomingConn.on('open', () => {
            try {
                incomingConn.send({ type: 'system', text: 'BUSY' });
            } catch (e) {}
            setTimeout(() => {
                try {
                    incomingConn.close();
                } catch (e) {}
            }, 150);
        });
        return;
    }

    setupDataConnection(incomingConn);
}

/**
 * Mengatur listener DataChannel untuk live text chat.
 * 
 * @param {object} conn Objek DataConnection
 */
function setupDataConnection(conn) {
    state.currentConn = conn;
    let messageTimestamps = [];

    conn.on('open', () => {
        if (state.currentConn !== conn) return;
        console.log('DataChannel terbuka dengan:', conn.peer);
    });

    conn.on('data', (data) => {
        if (!data || state.currentConn !== conn) return;

        // Cek jika menerima pesan penolakan sibuk (BUSY)
        if (data === 'BUSY' || data.text === 'BUSY') {
            console.warn('Lawan bicara merespons status BUSY.');
            handleCallClosed('Teman nongki sedang terhubung dengan pengguna lain.');
            return;
        }

        if (data.type === 'chat' && typeof data.text === 'string') {
            // Rate Limiting Anti-Flood: Maksimal 8 pesan per 3 detik dari peer lawan
            const now = Date.now();
            messageTimestamps = messageTimestamps.filter(ts => now - ts < 3000);
            if (messageTimestamps.length >= 8) {
                console.warn('Pesan chat diabaikan karena melebihi batas rate-limit.');
                return;
            }
            messageTimestamps.push(now);

            // Sanitasi karakter kontrol tak terlihat (null bytes / bidi override)
            const cleanText = data.text
                .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/g, '')
                .trim()
                .substring(0, CONFIG.CHAT.MAX_MESSAGE_LENGTH);
            if (!cleanText) return;

            const safeTime = (typeof data.time === 'string' && /^[0-9:.\sAPMapm]{1,12}$/.test(data.time))
                ? data.time.trim()
                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            callbacks.onChatMessage({
                sender: 'peer',
                text: cleanText,
                time: safeTime
            });
        }
    });

    conn.on('close', () => {
        if (state.currentConn !== conn) return;
        console.log('DataConnection ditutup.');
    });

    conn.on('error', (err) => {
        if (state.currentConn !== conn) return;
        console.error('DataConnection error:', err);
    });
}

/**
 * Mengirim pesan teks melalui P2P DataChannel aktif.
 * 
 * @param {string} text Isi pesan teks
 * @returns {boolean} Berhasil atau tidak
 */
export function sendChatMessage(text) {
    if (!state.currentConn || !state.currentConn.open) {
        return false;
    }

    const trimmed = text.trim().substring(0, CONFIG.CHAT.MAX_MESSAGE_LENGTH);
    if (!trimmed) return false;

    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const payload = {
        type: 'chat',
        text: trimmed,
        time: time
    };

    try {
        state.currentConn.send(payload);
        return true;
    } catch (err) {
        console.error('Gagal mengirim pesan chat via DataChannel:', err);
        return false;
    }
}

/**
 * Menutup panggilan aktif saat ini dan membersihkan state.
 * PENTING: Reset state dilakukan SEBELUM memanggil .close() agar event listener
 * sinkron dari PeerJS tidak memicu false-positive handleCallClosed / auto-advance.
 */
export function endCurrentCall() {
    clearCallHandshakeTimer();

    const callToClose = state.currentCall;
    const connToClose = state.currentConn;

    state.currentCall = null;
    state.currentConn = null;
    state.currentPeerId = null;
    state.isBusy = false;
    state.isInitiator = false;

    if (callToClose) {
        try {
            callToClose.close();
        } catch (e) {}
    }

    if (connToClose) {
        try {
            connToClose.close();
        } catch (e) {}
    }
}

/**
 * Handler internal saat panggilan ditutup atau terputus secara tidak terduga.
 * @param {string} reason 
 */
function handleCallClosed(reason) {
    if (!state.isBusy && !state.currentCall) return;

    endCurrentCall();
    callbacks.onPeerDisconnected(reason);
}

// Getters untuk state query
export function getMyPeerId() {
    return state.myPeerId;
}

export function getCurrentCall() {
    return state.currentCall;
}

export function getCurrentPeerId() {
    return state.currentPeerId;
}

export function isCallActive() {
    return state.isBusy && state.currentCall !== null;
}

export function setBusyState(busy) {
    state.isBusy = Boolean(busy);
}

