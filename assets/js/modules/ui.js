/**
 * NONGKI — UI Management Module (ES6)
 * 
 * Mengelola manipulasi DOM, state tombol kontrol, indikator status,
 * tampilan video stream, toast notifikasi, serta rendering chat anti-XSS.
 */

// Cache Elemen DOM
const dom = {
    // Status & Header
    statusBadge: document.getElementById('statusBadge'),
    statusText: document.getElementById('statusText'),
    btnToggleChatMobile: document.getElementById('btnToggleChatMobile'),
    chatUnreadDot: document.getElementById('chatUnreadDot'),

    // Viewport Video
    remoteVideo: document.getElementById('remoteVideo'),
    localViewport: document.getElementById('localViewport'),
    localVideo: document.getElementById('localVideo'),
    localVideoOffOverlay: document.getElementById('localVideoOffOverlay'),
    stagePlaceholder: document.getElementById('stagePlaceholder'),
    placeholderPulse: document.getElementById('placeholderPulse'),
    placeholderIcon: document.getElementById('placeholderIcon'),
    placeholderTitle: document.getElementById('placeholderTitle'),
    placeholderDesc: document.getElementById('placeholderDesc'),
    remoteInfoBar: document.getElementById('remoteInfoBar'),
    remoteName: document.getElementById('remoteName'),

    // Tombol Kontrol Toolbar
    btnStartNext: document.getElementById('btnStartNext'),
    iconStartNext: document.getElementById('iconStartNext'),
    labelStartNext: document.getElementById('labelStartNext'),
    btnStop: document.getElementById('btnStop'),
    btnToggleMic: document.getElementById('btnToggleMic'),
    iconMic: document.getElementById('iconMic'),
    btnToggleCam: document.getElementById('btnToggleCam'),
    iconCam: document.getElementById('iconCam'),
    btnFlipCam: document.getElementById('btnFlipCam'),
    btnShareScreen: document.getElementById('btnShareScreen'),
    iconScreen: document.getElementById('iconScreen'),

    // Panel Chat
    chatPanel: document.getElementById('chatPanel'),
    chatMessages: document.getElementById('chatMessages'),
    chatForm: document.getElementById('chatForm'),
    chatInput: document.getElementById('chatInput'),
    btnSendChat: document.getElementById('btnSendChat'),
    btnClearChat: document.getElementById('btnClearChat'),
    btnCloseChatMobile: document.getElementById('btnCloseChatMobile'),

    // Toast Container
    toastContainer: document.getElementById('toastContainer'),
};

/**
 * Memperbarui status koneksi pada header navbar.
 * @param {'idle'|'waiting'|'connected'|'error'} state 
 * @param {string} label 
 */
export function setConnectionStatus(state, label) {
    if (!dom.statusBadge || !dom.statusText) return;

    dom.statusBadge.classList.remove('status-idle', 'status-waiting', 'status-live');

    switch (state) {
        case 'connected':
            dom.statusBadge.classList.add('status-live');
            break;
        case 'waiting':
            dom.statusBadge.classList.add('status-waiting');
            break;
        case 'error':
            dom.statusBadge.classList.add('status-idle');
            break;
        default:
            dom.statusBadge.classList.add('status-idle');
            break;
    }

    dom.statusText.textContent = label;
}

/**
 * Mengatur tampilan panggung remote video (idle / searching / connected).
 * @param {'idle'|'searching'|'connected'} state 
 */
export function setStageState(state) {
    if (!dom.stagePlaceholder) return;

    if (state === 'connected') {
        dom.stagePlaceholder.classList.add('stage-hidden');
        if (dom.remoteInfoBar) dom.remoteInfoBar.classList.remove('d-none');
    } else {
        dom.stagePlaceholder.classList.remove('stage-hidden');
        if (dom.remoteInfoBar) dom.remoteInfoBar.classList.add('d-none');

        if (state === 'searching') {
            dom.placeholderPulse?.classList.add('searching');
            if (dom.placeholderIcon) dom.placeholderIcon.className = 'bi bi-radar';
            if (dom.placeholderTitle) dom.placeholderTitle.textContent = 'Mencari Pasangan Nongki...';
            if (dom.placeholderDesc) {
                dom.placeholderDesc.innerHTML = 'Mohon tunggu, sedang menghubungkan Anda dengan teman mengobrol acak...';
            }
        } else {
            dom.placeholderPulse?.classList.remove('searching');
            if (dom.placeholderIcon) dom.placeholderIcon.className = 'bi bi-broadcast';
            if (dom.placeholderTitle) dom.placeholderTitle.textContent = 'Temukan Teman Nongki';
            if (dom.placeholderDesc) {
                dom.placeholderDesc.innerHTML = 'Ketuk tombol <strong>Mulai Nongki</strong> di bawah<span class="d-none d-md-inline"> atau tekan tombol <code>ESC</code></span> untuk mencari teman.';
            }
        }
    }
}

/**
 * Mengaitkan MediaStream remote ke elemen <video> dengan penanganan autoplay error.
 * @param {MediaStream} stream 
 */
export function setRemoteVideo(stream) {
    if (dom.remoteVideo) {
        dom.remoteVideo.srcObject = stream;
        dom.remoteVideo.playbackRate = 1.0;

        const playPromise = dom.remoteVideo.play();
        if (playPromise !== undefined) {
            playPromise.catch(err => {
                console.warn('Autoplay tertahan oleh browser policy. Menyiapkan resume audio pada interaksi pertama:', err);
                const resumePlayback = () => {
                    dom.remoteVideo?.play().catch(() => {});
                    window.removeEventListener('click', resumePlayback);
                    window.removeEventListener('keydown', resumePlayback);
                    window.removeEventListener('touchstart', resumePlayback);
                };
                window.addEventListener('click', resumePlayback, { once: true });
                window.addEventListener('keydown', resumePlayback, { once: true });
                window.addEventListener('touchstart', resumePlayback, { once: true });
            });
        }
    }
    setStageState('connected');
}

/**
 * Mengosongkan remote video dan mengembalikan panggung ke status idle.
 */
export function clearRemoteVideo() {
    if (dom.remoteVideo) {
        dom.remoteVideo.srcObject = null;
    }
    setStageState('idle');
}

/**
 * Mengaitkan MediaStream lokal ke elemen <video> Picture-in-Picture.
 * @param {MediaStream} stream 
 */
export function setLocalVideo(stream) {
    if (dom.localVideo) {
        dom.localVideo.srcObject = stream;
        dom.localVideo.play().catch(() => {});
    }
}

/**
 * Mengubah ikon kontrol mikrofon (mute / active) dan status aksesibilitas.
 * @param {boolean} isMuted 
 */
export function toggleLocalAudioIcon(isMuted) {
    if (!dom.btnToggleMic || !dom.iconMic) return;

    dom.btnToggleMic.setAttribute('aria-pressed', isMuted ? 'false' : 'true');

    if (isMuted) {
        dom.btnToggleMic.classList.add('active-off');
        dom.iconMic.className = 'bi bi-mic-mute-fill';
        dom.btnToggleMic.setAttribute('title', 'Nyalakan Mikrofon');
    } else {
        dom.btnToggleMic.classList.remove('active-off');
        dom.iconMic.className = 'bi bi-mic-fill';
        dom.btnToggleMic.setAttribute('title', 'Matikan Mikrofon');
    }
}

/**
 * Mengubah ikon kontrol kamera (off / active) dan overlay lokal.
 * @param {boolean} isVideoOff 
 */
export function toggleLocalVideoIcon(isVideoOff) {
    if (!dom.btnToggleCam || !dom.iconCam) return;

    dom.btnToggleCam.setAttribute('aria-pressed', isVideoOff ? 'false' : 'true');

    if (isVideoOff) {
        dom.btnToggleCam.classList.add('active-off');
        dom.iconCam.className = 'bi bi-camera-video-off-fill';
        dom.btnToggleCam.setAttribute('title', 'Nyalakan Kamera');
        dom.localVideoOffOverlay?.classList.add('active');
    } else {
        dom.btnToggleCam.classList.remove('active-off');
        dom.iconCam.className = 'bi bi-camera-video-fill';
        dom.btnToggleCam.setAttribute('title', 'Matikan Kamera');
        dom.localVideoOffOverlay?.classList.remove('active');
    }
}

/**
 * Mengatur apakah preview video lokal perlu dicerminkan (mirror).
 * Kamera depan (user) dicerminkan, sedangkan kamera belakang (environment) & screen share tidak dicerminkan.
 * @param {boolean} shouldMirror 
 */
export function setLocalVideoMirror(shouldMirror) {
    if (dom.localViewport) {
        dom.localViewport.classList.toggle('no-mirror', !shouldMirror);
    }
}

/**
 * Mengubah state tombol screen sharing dan mematikan efek cermin kamera lokal.
 * @param {boolean} isSharing 
 */
export function toggleScreenShareIcon(isSharing) {
    if (!dom.btnShareScreen || !dom.iconScreen) return;

    dom.btnShareScreen.setAttribute('aria-pressed', isSharing ? 'true' : 'false');

    if (isSharing) {
        dom.btnShareScreen.classList.add('active-sharing');
        dom.iconScreen.className = 'bi bi-display-fill';
        dom.btnShareScreen.setAttribute('title', 'Hentikan Berbagi Layar');
    } else {
        dom.btnShareScreen.classList.remove('active-sharing');
        dom.iconScreen.className = 'bi bi-display';
        dom.btnShareScreen.setAttribute('title', 'Bagikan Layar');
    }
}

/**
 * Mengatur tombol kontrol aksi (Start/Next, Stop, Chat inputs).
 * @param {{ inCall: boolean, isSearching: boolean }} state 
 */
export function setControlButtonsState({ inCall = false, isSearching = false }) {
    if (!dom.btnStartNext || !dom.btnStop) return;

    if (isSearching) {
        dom.btnStartNext.disabled = true;
        if (dom.iconStartNext) dom.iconStartNext.className = 'spinner-border spinner-border-sm me-1';
        if (dom.labelStartNext) dom.labelStartNext.textContent = 'Mencari...';
        dom.btnStop.disabled = false;

        if (dom.chatInput) dom.chatInput.disabled = true;
        if (dom.btnSendChat) dom.btnSendChat.disabled = true;
    } else if (inCall) {
        dom.btnStartNext.disabled = false;
        if (dom.iconStartNext) dom.iconStartNext.className = 'bi bi-skip-forward-fill';
        if (dom.labelStartNext) dom.labelStartNext.textContent = 'Next';
        dom.btnStop.disabled = false;

        if (dom.chatInput) dom.chatInput.disabled = false;
        if (dom.btnSendChat) dom.btnSendChat.disabled = false;
    } else {
        dom.btnStartNext.disabled = false;
        if (dom.iconStartNext) dom.iconStartNext.className = 'bi bi-play-fill';
        if (dom.labelStartNext) dom.labelStartNext.textContent = 'Mulai Nongki';
        dom.btnStop.disabled = true;

        if (dom.chatInput) dom.chatInput.disabled = true;
        if (dom.btnSendChat) dom.btnSendChat.disabled = true;
    }
}

/**
 * Menambahkan bubble chat secara aman ke dalam stream chat (Anti-XSS).
 * @param {{ sender: 'me'|'peer'|'system', text: string, time?: string }} message 
 */
export function appendChatMessage({ sender, text, time = null }) {
    if (!dom.chatMessages) return;

    if (sender === 'system') {
        const sysDiv = document.createElement('div');
        sysDiv.className = 'chat-system-message';

        const icon = document.createElement('i');
        icon.className = 'bi bi-info-circle-fill';

        const span = document.createElement('span');
        span.textContent = text; // Mencegah XSS

        sysDiv.appendChild(icon);
        sysDiv.appendChild(span);
        dom.chatMessages.appendChild(sysDiv);
    } else {
        const bubble = document.createElement('div');
        bubble.className = `chat-bubble ${sender === 'me' ? 'bubble-me' : 'bubble-peer'}`;

        const textSpan = document.createElement('span');
        textSpan.textContent = text; // Mencegah XSS

        const timeSpan = document.createElement('span');
        timeSpan.className = 'chat-bubble-time';
        timeSpan.textContent = time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        bubble.appendChild(textSpan);
        bubble.appendChild(timeSpan);
        dom.chatMessages.appendChild(bubble);

        // Jika chat mobile tertutup dan pesan dari lawan, nyalakan titik unread
        if (sender === 'peer' && dom.chatPanel && !dom.chatPanel.classList.contains('mobile-open')) {
            dom.chatUnreadDot?.classList.remove('d-none');
        }
    }

    // Batasi maksimal 150 elemen pesan di DOM untuk mencegah pembengkakan memori (DOM DoS)
    while (dom.chatMessages.children.length > 150) {
        dom.chatMessages.removeChild(dom.chatMessages.children[1] || dom.chatMessages.firstChild);
    }

    // Auto-scroll ke pesan terbawah
    dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
}

/**
 * Mengosongkan riwayat chat obrolan.
 */
export function clearChat() {
    if (!dom.chatMessages) return;

    dom.chatMessages.innerHTML = `
        <div class="chat-system-message">
            <i class="bi bi-shield-check"></i>
            <span>Percakapan bersifat langsung dan terenkripsi. Riwayat pesan tidak disimpan di server.</span>
        </div>
    `;
}

/**
 * Membuka atau menutup panel chat pada perangkat mobile.
 * @param {boolean|null} forceState 
 */
export function toggleMobileChat(forceState = null) {
    if (!dom.chatPanel) return;

    if (forceState !== null) {
        dom.chatPanel.classList.toggle('mobile-open', forceState);
    } else {
        dom.chatPanel.classList.toggle('mobile-open');
    }

    if (dom.chatPanel.classList.contains('mobile-open')) {
        dom.chatUnreadDot?.classList.add('d-none');
        dom.chatInput?.focus();
    }
}

/**
 * Menampilkan notifikasi Toast bootstrap di pojok layar.
 * @param {string} message 
 * @param {'info'|'success'|'warning'|'danger'} type 
 */
export function showToast(message, type = 'info') {
    if (!dom.toastContainer) return;

    const toastId = 'toast_' + Date.now();
    const bgClass = type === 'danger'
        ? 'bg-danger text-white'
        : (type === 'success'
            ? 'bg-success text-white'
            : (type === 'warning'
                ? 'bg-warning text-dark'
                : 'bg-white text-dark border border-secondary-subtle'));
    const closeBtnClass = (type === 'danger' || type === 'success') ? 'btn-close-white' : '';

    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center ${bgClass} shadow-sm`;
    toastEl.id = toastId;
    toastEl.setAttribute('role', 'alert');
    toastEl.setAttribute('aria-live', 'assertive');
    toastEl.setAttribute('aria-atomic', 'true');

    toastEl.innerHTML = `
        <div class="d-flex">
            <div class="toast-body fw-medium">
                <i class="bi bi-info-circle me-2"></i><span class="toast-msg"></span>
            </div>
            <button type="button" class="btn-close ${closeBtnClass} me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
        </div>
    `;

    toastEl.querySelector('.toast-msg').textContent = message; // Anti-XSS
    dom.toastContainer.appendChild(toastEl);

    // Inisialisasi bootstrap Toast jika tersedia
    if (window.bootstrap?.Toast) {
        const bsToast = new window.bootstrap.Toast(toastEl, { delay: 3500 });
        bsToast.show();
        toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
    } else {
        setTimeout(() => toastEl.remove(), 3500);
    }
}

/**
 * Memunculkan tombol Flip Camera jika perangkat mobile memiliki lebih dari 1 kamera.
 * @param {boolean} isAvailable 
 */
export function setFlipCamVisibility(isAvailable) {
    if (dom.btnFlipCam) {
        dom.btnFlipCam.classList.toggle('d-none', !isAvailable);
    }
}

/**
 * Inisialisasi event listener dasar UI (Mobile drawer toggle & pembersihan chat).
 */
export function initUIListeners() {
    dom.btnToggleChatMobile?.addEventListener('click', () => toggleMobileChat());
    dom.btnCloseChatMobile?.addEventListener('click', () => toggleMobileChat(false));
    dom.btnClearChat?.addEventListener('click', () => clearChat());
}

// Jalankan binding listener UI dasar begitu DOM siap
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUIListeners);
} else {
    initUIListeners();
}

