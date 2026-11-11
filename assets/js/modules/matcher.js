/**
 * NONGKI — Matchmaking Coordinator (ES6 Module)
 * 
 * Mengelola antrean matchmaking, polling heartbeat berkala (2.5 detik),
 * eksekusi aksi find_match & leave_queue, serta integrasi pembersihan
 * navigator.sendBeacon saat browser ditutup.
 */

import { CONFIG } from '../config.js';

// State Matcher Internal
let pollTimer = null;
let isPollingActive = false;
let currentPeerId = null;

/**
 * Mengirim request pencarian lawan / heartbeat ke match.php.
 * 
 * @param {string} peerId 
 * @returns {Promise<{status: 'matched'|'waiting'|'error', target_id?: string, message?: string}>}
 */
export async function requestFindMatch(peerId) {
    if (!peerId) {
        throw new Error('Peer ID wajib disertakan untuk matchmaking.');
    }

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'find_match',
                peer_id: peerId
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.message || `HTTP Error ${response.status}`);
        }

        return await response.json();
    } catch (err) {
        console.error('Error requestFindMatch:', err);
        return { status: 'error', message: err.message };
    }
}

/**
 * Mengirim request pembatalan / keluar dari antrean (leave_queue).
 * 
 * @param {string} peerId 
 * @returns {Promise<boolean>}
 */
export async function requestLeaveQueue(peerId) {
    const targetId = peerId || currentPeerId;
    if (!targetId) return false;

    try {
        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                action: 'leave_queue',
                peer_id: targetId
            })
        });

        return response.ok;
    } catch (err) {
        console.warn('Gagal requestLeaveQueue:', err);
        return false;
    }
}

/**
 * Memulai interval polling heartbeat matchmaking.
 * Menggunakan chained setTimeout untuk mencegah penumpukan request saat jaringan lambat.
 * 
 * @param {string} peerId 
 * @param {function} onMatched Dipanggil saat menemukan lawan: onMatched(targetId)
 * @param {function} onWaiting Dipanggil saat status masih antre / menunggu
 * @param {function} onError Dipanggil saat request polling gagal
 */
export function startPolling(peerId, onMatched, onWaiting, onError = null) {
    stopPolling();

    currentPeerId = peerId;
    isPollingActive = true;

    async function executePoll() {
        if (!isPollingActive) return;

        const res = await requestFindMatch(peerId);

        if (!isPollingActive) return; // Cek kembali jika polling dihentikan di tengah request

        if (res.status === 'matched' && res.target_id) {
            stopPolling();
            onMatched(res.target_id);
            return;
        }

        if (res.status === 'waiting') {
            onWaiting();
            // Jadwalkan polling berikutnya setelah interval
            pollTimer = setTimeout(executePoll, CONFIG.POLLING_INTERVAL_MS);
            return;
        }

        // Jika terjadi error dari API
        if (res.status === 'error') {
            console.warn('Polling matchmaking menerima status error:', res.message);
            if (onError) onError(res.message);
            // Tetap coba ulang dengan interval normal
            pollTimer = setTimeout(executePoll, CONFIG.POLLING_INTERVAL_MS);
        }
    }

    // Jalankan panggilan pertama secara langsung
    executePoll();
}

/**
 * Menghentikan proses polling antrean.
 */
export function stopPolling() {
    isPollingActive = false;
    if (pollTimer) {
        clearTimeout(pollTimer);
        pollTimer = null;
    }
}

/**
 * Menyiapkan penghapusan otomatis ID dari SQLite saat tab browser ditutup
 * menggunakan navigator.sendBeacon.
 * 
 * @param {string} peerId 
 */
export function setupUnloadBeacon(peerId) {
    if (!peerId) return;
    currentPeerId = peerId;

    const sendCleanupBeacon = () => {
        if (!currentPeerId) return;

        // Gunakan FormData untuk kompatibilitas 100% pada seluruh browser (Safari, Chrome, Firefox)
        try {
            const formData = new FormData();
            formData.append('action', 'leave_queue');
            formData.append('peer_id', currentPeerId);
            navigator.sendBeacon(CONFIG.API_URL, formData);
        } catch (e) {
            // Fallback plain string
            const payload = JSON.stringify({
                action: 'leave_queue',
                peer_id: currentPeerId
            });
            navigator.sendBeacon(CONFIG.API_URL, payload);
        }
    };

    window.addEventListener('beforeunload', sendCleanupBeacon);
    window.addEventListener('pagehide', sendCleanupBeacon);
}

/**
 * Mengecek apakah saat ini sedang dalam proses polling antrean.
 * @returns {boolean}
 */
export function isQueueSearching() {
    return isPollingActive;
}

