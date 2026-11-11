/**
 * NONGKI — Media Capture & Control Layer (ES6 Module)
 * 
 * Mengelola inisialisasi kamera & mikrofon lokal, mute/unmute audio, on/off video,
 * rotasi kamera mobile (front/back), serta screen sharing dengan penggantian
 * track aktif secara seamless (RTCRtpSender.replaceTrack).
 */

import {
    setLocalVideo,
    setLocalVideoMirror,
    toggleLocalAudioIcon,
    toggleLocalVideoIcon,
    toggleScreenShareIcon,
    setFlipCamVisibility,
    showToast
} from './ui.js';

import { getCurrentCall } from './rtc.js';

// State Media Internal
const state = {
    localStream: null,          // Stream aktif yang dikirim ke peer (kamera atau screen)
    cameraStream: null,         // Stream cadangan kamera saat screen sharing aktif
    screenStream: null,         // Stream berbagi layar
    isAudioMuted: false,
    isVideoOff: false,
    isScreenSharing: false,
    currentFacingMode: 'user',  // 'user' (depan) atau 'environment' (belakang)
    videoDevicesCount: 0,
};

/**
 * Inisialisasi perangkat kamera dan mikrofon lokal.
 * Menggunakan resolusi adaptif (720p ideal dengan fallback 480p).
 * 
 * @param {MediaStreamConstraints|null} customConstraints 
 * @returns {Promise<MediaStream>}
 */
export async function initLocalStream(customConstraints = null) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Browser Anda tidak mendukung WebRTC getUserMedia API.');
    }

    const defaultConstraints = {
        audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            latency: { ideal: 0.01 },
            channelCount: { ideal: 1 },
        },
        video: {
            facingMode: state.currentFacingMode,
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 30, max: 30 },
        }
    };

    const constraints = customConstraints || defaultConstraints;

    try {
        state.localStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (primaryErr) {
        console.warn('Gagal mendapatkan resolusi ideal, mencoba fallback standar:', primaryErr);
        try {
            // Fallback 1: Resolusi standar tanpa constraint ketat
            state.localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: true
            });
        } catch (secondaryErr) {
            // Fallback 2: Jika perangkat tidak memiliki kamera (Audio-Only Mode)
            if (secondaryErr.name === 'NotFoundError' || secondaryErr.name === 'DevicesNotFoundError') {
                console.warn('Kamera tidak ditemukan, beralih ke mode audio-only:', secondaryErr);
                state.localStream = await navigator.mediaDevices.getUserMedia({
                    audio: true,
                    video: false
                });
                state.isVideoOff = true;
                toggleLocalVideoIcon(true);
                showToast('Kamera tidak terdeteksi. Berjalan dalam mode audio saja.', 'warning');
            } else {
                throw secondaryErr;
            }
        }
    }

    state.cameraStream = state.localStream;

    // Optimasi Ultra-Low Latency: Beri instruksi encoder WebRTC bahwa track ini fokus gerakan cepat (motion)
    state.localStream.getVideoTracks().forEach(track => {
        if ('contentHint' in track) {
            track.contentHint = 'motion';
        }
    });
    state.localStream.getAudioTracks().forEach(track => {
        if ('contentHint' in track) {
            track.contentHint = 'speech';
        }
    });

    setLocalVideo(state.localStream);

    // Deteksi ketersediaan multiple kamera (terutama di smartphone)
    await detectVideoDevices();

    return state.localStream;
}

/**
 * Mendeteksi jumlah perangkat kamera yang tersedia pada sistem.
 */
async function detectVideoDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter(d => d.kind === 'videoinput');
        state.videoDevicesCount = videoInputs.length;

        // Tampilkan tombol flip camera jika perangkat mobile atau terdapat > 1 kamera
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        const hasMultipleCams = videoInputs.length > 1;
        setFlipCamVisibility(isMobile || hasMultipleCams);
    } catch (err) {
        console.warn('Gagal enumerasi perangkat media:', err);
    }
}

/**
 * Toggle mute / unmute mikrofon lokal.
 * @returns {boolean} Status isAudioMuted terbaru
 */
export function toggleAudio() {
    if (!state.localStream) return state.isAudioMuted;

    const audioTracks = state.localStream.getAudioTracks();
    if (audioTracks.length === 0) {
        showToast('Tidak ada mikrofon aktif terdeteksi.', 'warning');
        return state.isAudioMuted;
    }

    state.isAudioMuted = !state.isAudioMuted;

    // Terapkan ke semua audio track di localStream dan cameraStream
    state.localStream.getAudioTracks().forEach(track => {
        track.enabled = !state.isAudioMuted;
    });

    if (state.cameraStream && state.cameraStream !== state.localStream) {
        state.cameraStream.getAudioTracks().forEach(track => {
            track.enabled = !state.isAudioMuted;
        });
    }

    toggleLocalAudioIcon(state.isAudioMuted);
    return state.isAudioMuted;
}

/**
 * Toggle on / off kamera video lokal.
 * @returns {boolean} Status isVideoOff terbaru
 */
export function toggleVideo() {
    if (!state.localStream) return state.isVideoOff;

    const videoTracks = state.localStream.getVideoTracks();
    const screenTracks = state.screenStream ? state.screenStream.getVideoTracks() : [];
    if (videoTracks.length === 0 && screenTracks.length === 0) {
        showToast('Tidak ada kamera aktif terdeteksi.', 'warning');
        return state.isVideoOff;
    }

    state.isVideoOff = !state.isVideoOff;

    // Terapkan ke video track di localStream, cameraStream, dan screenStream
    state.localStream.getVideoTracks().forEach(track => {
        track.enabled = !state.isVideoOff;
    });

    if (state.cameraStream && state.cameraStream !== state.localStream) {
        state.cameraStream.getVideoTracks().forEach(track => {
            track.enabled = !state.isVideoOff;
        });
    }

    if (state.screenStream) {
        state.screenStream.getVideoTracks().forEach(track => {
            track.enabled = !state.isVideoOff;
        });
    }

    toggleLocalVideoIcon(state.isVideoOff);
    return state.isVideoOff;
}

/**
 * Memutar / mengganti kamera depan dan belakang (Flip Camera).
 * Mengganti video track pada active WebRTC call menggunakan replaceTrack tanpa memutus panggilan.
 * 
 * @param {object|null} activeCall Objek MediaConnection aktif dari PeerJS
 * @returns {Promise<boolean>}
 */
export async function flipCamera(activeCall = null) {
    if (state.isScreenSharing) {
        showToast('Hentikan berbagi layar terlebih dahulu untuk memutar kamera.', 'warning');
        return false;
    }

    // Toggle facing mode
    state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';

    try {
        const newStream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                facingMode: { ideal: state.currentFacingMode },
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
                frameRate: { ideal: 30, max: 30 },
            }
        });

        const newVideoTrack = newStream.getVideoTracks()[0];
        if (!newVideoTrack) return false;

        if ('contentHint' in newVideoTrack) {
            newVideoTrack.contentHint = 'motion';
        }

        // Ambil video track lama untuk dihentikan
        const oldVideoTrack = state.localStream?.getVideoTracks()[0];
        if (oldVideoTrack) {
            oldVideoTrack.stop();
            state.localStream.removeTrack(oldVideoTrack);
        }

        // Tambahkan video track baru ke localStream
        state.localStream.addTrack(newVideoTrack);
        state.cameraStream = state.localStream;
        setLocalVideo(state.localStream);
        setLocalVideoMirror(state.currentFacingMode === 'user');

        // Pertahankan status video on/off pengguna
        newVideoTrack.enabled = !state.isVideoOff;

        // Jika sedang dalam panggilan aktif, lakukan replaceTrack pada RTCRtpSender
        const callToUpdate = activeCall || getCurrentCall();
        if (callToUpdate) {
            await replacePeerVideoTrack(callToUpdate, newVideoTrack);
        }

        showToast(
            state.currentFacingMode === 'user' ? 'Kamera depan aktif' : 'Kamera belakang aktif',
            'info'
        );
        return true;

    } catch (err) {
        console.error('Gagal memutar kamera:', err);
        showToast('Gagal memutar kamera: ' + (err.message || 'Perangkat tidak tersedia'), 'danger');
        // Kembalikan flag facing mode
        state.currentFacingMode = state.currentFacingMode === 'user' ? 'environment' : 'user';
        return false;
    }
}

/**
 * Memulai fitur Screen Sharing (Berbagi Layar).
 * Menggantikan video track kamera dengan video track layar via replaceTrack.
 * 
 * @param {object|null} activeCall Objek MediaConnection aktif dari PeerJS
 * @returns {Promise<boolean>}
 */
export async function startScreenShare(activeCall = null) {
    if (state.isScreenSharing) return true;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        showToast('Fitur berbagi layar tidak didukung di peramban ini.', 'warning');
        return false;
    }

    try {
        state.screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                cursor: 'always',
                displaySurface: 'monitor'
            },
            audio: false
        });

        const screenTrack = state.screenStream.getVideoTracks()[0];
        if (!screenTrack) return false;

        state.isScreenSharing = true;
        screenTrack.enabled = !state.isVideoOff;

        // Pasang listener saat pengguna mengklik tombol bawaan "Stop sharing" pada browser.
        // Gunakan getCurrentCall() secara dinamis agar tidak terjebak referensi panggilan lama (stale closure).
        screenTrack.addEventListener('ended', () => {
            stopScreenShare(getCurrentCall());
        });

        // Ganti track pada koneksi WebRTC aktif jika ada
        const callToUpdate = activeCall || getCurrentCall();
        if (callToUpdate) {
            await replacePeerVideoTrack(callToUpdate, screenTrack);
        }

        // Tampilkan stream layar di PiP lokal (tanpa efek cermin)
        setLocalVideo(state.screenStream);
        setLocalVideoMirror(false);
        toggleScreenShareIcon(true);
        showToast('Berbagi layar aktif.', 'info');

        return true;
    } catch (err) {
        if (err.name !== 'NotAllowedError') {
            console.error('Error startScreenShare:', err);
            showToast('Gagal membagikan layar: ' + err.message, 'danger');
        }
        return false;
    }
}

/**
 * Menghentikan Screen Sharing dan mengembalikan stream ke kamera.
 * 
 * @param {object|null} activeCall Objek MediaConnection aktif dari PeerJS
 * @returns {Promise<boolean>}
 */
export async function stopScreenShare(activeCall = null) {
    if (!state.isScreenSharing) return false;

    // Hentikan seluruh track pada screen stream
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
        state.screenStream = null;
    }

    state.isScreenSharing = false;

    // Kembalikan video track kamera asli
    const cameraVideoTrack = state.cameraStream?.getVideoTracks()[0];

    if (cameraVideoTrack) {
        cameraVideoTrack.enabled = !state.isVideoOff;

        const callToUpdate = activeCall || getCurrentCall();
        if (callToUpdate) {
            await replacePeerVideoTrack(callToUpdate, cameraVideoTrack);
        }

        setLocalVideo(state.cameraStream);
    }

    // Kembalikan efek cermin jika menggunakan kamera depan
    setLocalVideoMirror(state.currentFacingMode === 'user');
    toggleScreenShareIcon(false);
    showToast('Berbagi layar dihentikan.', 'info');
    return true;
}

/**
 * Helper untuk mengganti video track pada RTCRtpSender WebRTC tanpa memutus koneksi.
 * Mendukung pencarian sender via getSenders() dan getTransceivers() untuk kompatibilitas lintas-browser.
 * 
 * @param {object} call Objek MediaConnection dari PeerJS
 * @param {MediaStreamTrack} newTrack Track video pengganti
 */
export async function replacePeerVideoTrack(call, newTrack) {
    if (!call || !call.peerConnection) return;

    try {
        const pc = call.peerConnection;
        if (pc.connectionState === 'closed' || pc.signalingState === 'closed') return;

        let videoSender = null;

        if (pc.getSenders) {
            const senders = pc.getSenders();
            videoSender = senders.find(sender => sender.track && sender.track.kind === 'video');
        }

        // Fallback untuk WebKit / Safari transceivers jika sender.track bernilai null
        if (!videoSender && pc.getTransceivers) {
            const transceivers = pc.getTransceivers();
            const vt = transceivers.find(t => 
                (t.sender?.track && t.sender.track.kind === 'video') ||
                (t.receiver?.track && t.receiver.track.kind === 'video')
            );
            if (vt && vt.sender) {
                videoSender = vt.sender;
            }
        }

        if (videoSender) {
            await videoSender.replaceTrack(newTrack);
        } else {
            console.warn('Tidak ditemukan RTCRtpSender video aktif pada PeerConnection.');
        }
    } catch (err) {
        console.error('Gagal mengeksekusi replaceTrack:', err);
    }
}

/**
 * Menghentikan semua track media lokal (saat menutup aplikasi / reset penuh).
 */
export function stopAllMediaTracks() {
    if (state.localStream) {
        state.localStream.getTracks().forEach(t => t.stop());
    }
    if (state.cameraStream && state.cameraStream !== state.localStream) {
        state.cameraStream.getTracks().forEach(t => t.stop());
    }
    if (state.screenStream) {
        state.screenStream.getTracks().forEach(t => t.stop());
    }
    state.localStream = null;
    state.cameraStream = null;
    state.screenStream = null;
    state.isScreenSharing = false;
}

/**
 * Mendapatkan stream media aktif saat ini.
 * Jika screen sharing aktif, otomatis menggabungkan video screen dengan audio mikrofon
 * agar lawan bicara tidak kehilangan suara saat panggilan baru terbentuk.
 * 
 * @returns {MediaStream|null}
 */
export function getLocalStream() {
    if (state.isScreenSharing && state.screenStream) {
        const combinedTracks = [
            ...state.screenStream.getVideoTracks(),
            ...(state.cameraStream ? state.cameraStream.getAudioTracks() : [])
        ];
        return new MediaStream(combinedTracks);
    }
    return state.localStream;
}

/**
 * Mendapatkan status media saat ini.
 * @returns {object}
 */
export function getMediaState() {
    return {
        isAudioMuted: state.isAudioMuted,
        isVideoOff: state.isVideoOff,
        isScreenSharing: state.isScreenSharing,
        currentFacingMode: state.currentFacingMode,
        hasMultipleCameras: state.videoDevicesCount > 1
    };
}

