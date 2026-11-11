/**
 * NONGKI — Main Application Orchestrator (ES6 Entrypoint)
 * 
 * Menghubungkan seluruh modul aplikasi:
 * - UI Module (DOM, render video, toast, indikator)
 * - Media Module (WebRTC media streams, mic, kamera, screen sharing)
 * - RTC Module (PeerJS connection, Single-Line Lock, DataChannel chat)
 * - Matcher Module (Antrean SQLite, heartbeat polling 2.5s, unload beacon)
 */

import { CONFIG } from './config.js';
import {
    setConnectionStatus,
    setStageState,
    setRemoteVideo,
    clearRemoteVideo,
    setControlButtonsState,
    appendChatMessage,
    clearChat,
    showToast
} from './modules/ui.js';

import {
    initLocalStream,
    toggleAudio,
    toggleVideo,
    flipCamera,
    startScreenShare,
    stopScreenShare,
    getLocalStream,
    getMediaState
} from './modules/media.js';

import {
    registerRTCCallbacks,
    initPeer,
    answerIncomingCall,
    callPeer,
    sendChatMessage,
    endCurrentCall,
    getMyPeerId,
    getCurrentCall,
    isCallActive
} from './modules/rtc.js';

import {
    startPolling,
    stopPolling,
    requestLeaveQueue,
    setupUnloadBeacon,
    isQueueSearching
} from './modules/matcher.js';

// Timer untuk jeda auto-advance saat lawan bicara putus
let autoAdvanceTimer = null;

/**
 * Inisialisasi utama aplikasi saat halaman dimuat.
 */
async function initApp() {
    console.log('Menginisialisasi aplikasi Nongki...');

    // 1. Tampilkan state awal pada UI
    setConnectionStatus('idle', 'Menyiapkan Perangkat...');
    setStageState('idle');
    setControlButtonsState({ inCall: false, isSearching: false });

    // 2. Minta izin & inisialisasi kamera + mikrofon lokal
    try {
        await initLocalStream();
        showToast('Kamera dan mikrofon siap.', 'success');
    } catch (err) {
        console.error('Inisialisasi media gagal:', err);
        showToast('Izin kamera/mikrofon diperlukan untuk menggunakan Nongki.', 'danger');
        setConnectionStatus('error', 'Izin Media Ditolak');
        return;
    }

    // 3. Registrasi callbacks event WebRTC
    registerRTCCallbacks({
        onReady: (peerId) => {
            setConnectionStatus('idle', 'Siap Nongki');
            setupUnloadBeacon(peerId);
        },

        onRemoteStream: (remoteStream) => {
            console.log('Menerima remote video stream dari lawan bicara.');
            // Matikan timer auto-advance jika ada
            clearAutoAdvance();

            setRemoteVideo(remoteStream);
            setConnectionStatus('connected', 'Sedang Nongki');
            setControlButtonsState({ inCall: true, isSearching: false });
            showToast('Terhubung dengan teman nongki!', 'success');
            appendChatMessage({
                sender: 'system',
                text: 'Terhubung dengan teman nongki. Mulailah menyapa!'
            });
        },

        onIncomingCall: (incomingCall) => {
            console.log('Menerima panggilan masuk dari peer:', incomingCall.peer);
            // Hentikan interval polling dan bersihkan antrean di backend
            stopPolling();
            requestLeaveQueue(getMyPeerId());

            // Jawab panggilan dengan stream media aktif lokal
            answerIncomingCall(incomingCall, getLocalStream());
        },

        onChatMessage: (message) => {
            appendChatMessage(message);
        },

        onPeerDisconnected: (reason) => {
            console.log('Lawan bicara terputus:', reason);
            handlePeerDisconnected(reason);
        },

        onError: (err) => {
            showToast('Kendala koneksi WebRTC: ' + (err.type || err.message), 'warning');
        }
    });

    // 4. Inisialisasi PeerJS Cloud Signaling
    try {
        await initPeer();
    } catch (err) {
        console.error('Inisialisasi PeerJS gagal:', err);
        showToast('Gagal terhubung ke signaling server. Periksa koneksi internet Anda.', 'danger');
        setConnectionStatus('error', 'Signaling Offline');
        return;
    }

    // 5. Binding Event Listener Interaksi Pengguna
    bindEventListeners();
}

/**
 * Menghubungkan seluruh tombol aksi dan form ke event handler.
 */
function bindEventListeners() {
    const btnStartNext = document.getElementById('btnStartNext');
    const btnStop = document.getElementById('btnStop');
    const btnToggleMic = document.getElementById('btnToggleMic');
    const btnToggleCam = document.getElementById('btnToggleCam');
    const btnFlipCam = document.getElementById('btnFlipCam');
    const btnShareScreen = document.getElementById('btnShareScreen');
    const chatForm = document.getElementById('chatForm');
    const chatInput = document.getElementById('chatInput');

    // Tombol Mulai / Next (Ganti Pasangan)
    btnStartNext?.addEventListener('click', () => handleStartNext());

    // Tombol Stop (Berhenti Nongki)
    btnStop?.addEventListener('click', () => handleStop());

    // Kontrol Media
    btnToggleMic?.addEventListener('click', () => toggleAudio());
    btnToggleCam?.addEventListener('click', () => toggleVideo());
    btnFlipCam?.addEventListener('click', () => flipCamera(getCurrentCall()));

    btnShareScreen?.addEventListener('click', async () => {
        const mediaState = getMediaState();
        if (mediaState.isScreenSharing) {
            await stopScreenShare(getCurrentCall());
        } else {
            await startScreenShare(getCurrentCall());
        }
    });

    // Pintasan Keyboard: Tekan tombol ESC untuk Next (Ganti Pasangan)
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' || e.key === 'Esc') {
            e.preventDefault();
            handleStartNext();
        }
    });

    // Pengiriman Pesan Live Chat
    chatForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = chatInput?.value?.trim();
        if (!text) return;

        const success = sendChatMessage(text);
        if (success) {
            appendChatMessage({
                sender: 'me',
                text: text
            });
            chatInput.value = '';
        } else {
            showToast('Gagal mengirim pesan. Pastikan Anda sedang dalam panggilan.', 'warning');
        }
    });
}

/**
 * Logika tombol Mulai Nongki / Next (Ganti Pasangan).
 */
async function handleStartNext() {
    clearAutoAdvance();

    // Debounce: Abaikan jika sudah berada dalam proses pencarian aktif
    if (isQueueSearching()) {
        return;
    }

    const myPeerId = getMyPeerId();
    if (!myPeerId) {
        showToast('Menunggu inisialisasi ID Anda...', 'warning');
        return;
    }

    // 1. Tutup panggilan/handshake aktif atau sebelumnya (jika ada) dan bersihkan stage
    endCurrentCall();
    clearRemoteVideo();
    clearChat();

    // 2. Ubah UI ke mode pencarian (Waiting)
    setConnectionStatus('waiting', 'Mencari Pasangan...');
    setStageState('searching');
    setControlButtonsState({ inCall: false, isSearching: true });

    // 3. Mulai polling heartbeat matchmaking
    startPolling(
        myPeerId,
        // Callback saat menemukan lawan (Matched)
        (targetPeerId) => {
            console.log('Pasangan ditemukan! Melakukan panggilan ke:', targetPeerId);
            setConnectionStatus('waiting', 'Menghubungkan...');
            showToast('Menghubungkan dengan teman nongki...', 'info');

            // Lakukan panggilan media P2P ke target peer
            callPeer(targetPeerId, getLocalStream());
        },
        // Callback saat masih menunggu dalam antrean (Waiting)
        () => {
            setConnectionStatus('waiting', 'Mencari Pasangan...');
        },
        // Callback saat terjadi error polling
        (errMsg) => {
            showToast('Kendala antrean: ' + errMsg, 'warning');
        }
    );
}

/**
 * Logika tombol Stop (Berhenti dari panggilan atau antrean).
 */
async function handleStop() {
    clearAutoAdvance();

    // 1. Hentikan polling jika sedang mencari
    if (isQueueSearching()) {
        stopPolling();
    }

    // 2. Lepaskan antrean dari backend SQLite
    const myPeerId = getMyPeerId();
    if (myPeerId) {
        requestLeaveQueue(myPeerId);
    }

    // 3. Hentikan screen sharing jika sedang aktif
    const mediaState = getMediaState();
    if (mediaState.isScreenSharing) {
        await stopScreenShare(getCurrentCall());
    }

    // 4. Akhiri panggilan/handshake WebRTC (selalu panggil untuk memastikan isBusy ter-reset)
    endCurrentCall();

    // 5. Bersihkan tampilan video lawan dan chat
    clearRemoteVideo();
    clearChat();

    // 6. Kembalikan UI ke mode Siap
    setConnectionStatus('idle', 'Siap Nongki');
    setStageState('idle');
    setControlButtonsState({ inCall: false, isSearching: false });

    showToast('Nongki dihentikan.', 'info');
}

/**
 * Menangani skenario saat lawan bicara menutup panggilan / koneksi putus.
 * Menampilkan notifikasi dan otomatis mencari pasangan baru setelah jeda singkat (Auto-Advance).
 * 
 * @param {string} reason 
 */
function handlePeerDisconnected(reason) {
    clearRemoteVideo();
    clearChat();
    showToast(reason || 'Teman nongki telah meninggalkan obrolan.', 'info');

    setConnectionStatus('waiting', 'Mencari Pasangan Baru...');
    setStageState('searching');
    setControlButtonsState({ inCall: false, isSearching: true });

    // Jika lawan sibuk (BUSY collision), langsung cari lawan lain tanpa jeda panjang
    const isBusyCollision = typeof reason === 'string' && reason.includes('sedang terhubung dengan pengguna lain');
    const delay = isBusyCollision ? 300 : 1200;

    clearAutoAdvance();
    autoAdvanceTimer = setTimeout(() => {
        handleStartNext();
    }, delay);
}

/**
 * Membersihkan timer auto-advance.
 */
function clearAutoAdvance() {
    if (autoAdvanceTimer) {
        clearTimeout(autoAdvanceTimer);
        autoAdvanceTimer = null;
    }
}

// Jalankan inisialisasi aplikasi saat dokumen HTML siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
} else {
    initApp();
}

