/**
 * galeri.js — Pernah di Sini
 * Galeri foto: admin gallery + kiriman user
 */

// ── STATE ─────────────────────────────────────────────────
let adminPhotos = [], userPhotos = [];
let currentAdminPage = 1, currentUserPage = 1;
let currentAdminCategory = 'all', currentAdminJurusan = 'all', currentUserCategory = 'all';
let currentModalPhotoList = [], currentModalPhotoIndex = 0, currentModalType = 'user';
let _galeriClosed = false, _galeriCloseDate = null;
let _webpSupported = null;

// currentUser dihapus — gunakan UserMemory.get() langsung
// EMOJI_LIST dihapus — diambil dari utils.js
// formatTimeAgo, escHtml, showToast dihapus — diambil dari utils.js

const PER_PAGE = 10;


// ── UPLOAD QUOTA (sistem energi) ──────────────────────────
// Max 3 kuota, regen 1 per 3.5 jam. Upload bebas selama kuota > 0.
const UPLOAD_MAX = 3, REGEN_MS = 3.5 * 60 * 60 * 1000, UPLOAD_KEY = '_pds_upload_log';

function _getUsed() {
    try {
        const raw = localStorage.getItem(UPLOAD_KEY);
        if (!raw) return [];
        const p = JSON.parse(raw);
        return Array.isArray(p) ? p : (p.entries || []);
    } catch { return []; }
}

function _activeSlots() {
    const now = Date.now();
    return _getUsed().filter(t => now - t < REGEN_MS);
}

function getSisaUpload()  { return Math.max(0, UPLOAD_MAX - _activeSlots().length); }

function getNextRegenMs() {
    const slots = _activeSlots().sort((a, b) => a - b);
    return slots.length ? Math.max(0, slots[0] + REGEN_MS - Date.now()) : 0;
}

function addUploadEntry() {
    const slots = _activeSlots();
    slots.push(Date.now());
    localStorage.setItem(UPLOAD_KEY, JSON.stringify(slots));
}

function formatDurasi(ms) {
    const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
    return h > 0 ? (m > 0 ? `${h} jam ${m} menit` : `${h} jam`) : `${m} menit`;
}

function updateQuotaDisplay() {
    const el = document.getElementById('quota-info');
    if (!el) return;
    if (_galeriClosed) { el.textContent = '📷 Upload foto telah ditutup'; return; }
    const sisa = getSisaUpload(), next = getNextRegenMs();
    if (sisa <= 0)             el.textContent = `⏳ Kuota habis · regen dalam ${formatDurasi(next)}`;
    else if (sisa < UPLOAD_MAX) el.textContent = `📸 ${sisa}/${UPLOAD_MAX} kuota · +1 dalam ${formatDurasi(next)}`;
    else                        el.textContent = `📸 ${sisa}/${UPLOAD_MAX} kuota tersedia`;
}


// ── KOMPRESI & KONVERSI WEBP ──────────────────────────────
function isWebPSupported() {
    if (_webpSupported !== null) return _webpSupported;
    const c = document.createElement('canvas');
    c.width = c.height = 1; c.getContext('2d');
    _webpSupported = c.toDataURL('image/webp').indexOf('image/webp') === 5;
    return _webpSupported;
}

async function compressImage(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) { reject(new Error('File bukan gambar')); return; }
        const MAX_DIM = 1920, QUALITY = 0.85;
        const img = new Image(), blobUrl = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(blobUrl);
            let { width, height } = img;
            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
                else                { width  = Math.round(width  * MAX_DIM / height); height = MAX_DIM; }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const mime = isWebPSupported() ? 'image/webp' : 'image/jpeg';
            canvas.toBlob(blob => {
                if (blob?.size > 0) resolve(blob);
                else canvas.toBlob(jpg => jpg ? resolve(jpg) : reject(new Error('Konversi gagal')), 'image/jpeg', QUALITY);
            }, mime, QUALITY);
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('File tidak valid')); };
        img.src = blobUrl;
    });
}


// ── SUBMIT UPLOAD ─────────────────────────────────────────
window.submitUpload = async function () {
    const title    = document.getElementById('upload-title')?.value.trim();
    const desc     = document.getElementById('upload-desc')?.value.trim() || '';
    const category = document.getElementById('upload-category')?.value || 'umum';
    const file     = document.getElementById('upload-file')?.files[0];

    if (_galeriClosed) { showToast('📷 Masa upload sudah berakhir'); closeUploadModal(); return; }
    if (!title) { showToast('Mohon isi judul foto'); return; }
    if (!file)  { showToast('Pilih foto terlebih dahulu'); return; }
    if (getSisaUpload() <= 0) { showToast(`⏳ Kuota habis. Regen dalam ${formatDurasi(getNextRegenMs())}`); return; }

    const profile = UserMemory.get();
    const btn = document.getElementById('upload-submit-btn');
    if (btn) { btn.textContent = 'Memproses...'; btn.disabled = true; }

    try {
        const blob = await compressImage(file);
        const jurusanFoto = category === 'kelas'
            ? (document.getElementById('upload-jurusan-foto')?.value || null) : null;

        const result = await uploadFoto(blob, {
            uploader: profile?.name    || 'Anonim',
            role:     profile?.role    || 'Anonim',
            jurusan:  profile?.jurusan || null,
            jurusanFoto, title, description: desc, category,
        });

        if (result.ok) {
            addUploadEntry();
            closeUploadModal();
            showToast('✅ Foto terkirim! Menunggu persetujuan admin.');
            loadUserGallery(currentUserCategory);
            updateQuotaDisplay();
        } else {
            showToast(result.message || '❌ Gagal upload');
        }
    } catch (e) {
        console.error('[submitUpload]', e);
        showToast('❌ Gagal memproses gambar');
    } finally {
        if (btn) { btn.textContent = 'Upload Foto'; btn.disabled = false; }
    }
};


// ── ZOOM STATE ────────────────────────────────────────────
const _z = {
    scale: 1, tx: 0, ty: 0,       // current transform
    MIN: 1, MAX: 5,                // zoom range
    dragging: false,
    startX: 0, startY: 0,         // drag start (mouse/touch)
    startTx: 0, startTy: 0,       // tx/ty at drag start
    lastTap: 0,                    // double-tap detection
    pinchDist: 0,                  // last pinch distance
    pinchMidX: 0, pinchMidY: 0,   // last pinch midpoint
    hintTimer: null,
    // Swipe tracking (saat scale = 1)
    swipeStartX: 0, swipeStartY: 0,
    swipeLastX: 0,
    isSwipe: false,
};

// Reset zoom ke 1x
function _zoomReset() {
    _z.scale = 1; _z.tx = 0; _z.ty = 0;
    _z.dragging = false;
    _applyZoom(true);
}

// Terapkan transform ke #modal-image
function _applyZoom(animate = false) {
    const img = document.getElementById('modal-image');
    const con = document.getElementById('modal-img-container');
    const ind = document.getElementById('zoom-indicator');
    if (!img || !con) return;

    if (animate) img.classList.remove('is-interacting');
    else         img.classList.add('is-interacting');

    img.style.transform     = `translate(${_z.tx}px, ${_z.ty}px) scale(${_z.scale})`;
    img.style.transformOrigin = '0 0';

    // Cursor
    if (_z.scale > 1) {
        img.style.cursor = _z.dragging ? 'grabbing' : 'grab';
    } else {
        img.style.cursor = 'zoom-in';
    }

    // Indicator
    if (ind) {
        const pct = Math.round(_z.scale * 100) + '%';
        ind.textContent = pct;
        if (_z.scale > 1) ind.classList.add('visible');
        else              ind.classList.remove('visible');
    }
}

// Zoom ke titik layar (sx, sy) relatif ke viewport, dengan faktor f
function _zoomAt(f, sx, sy) {
    const img = document.getElementById('modal-img-container');
    if (!img) return;
    const rect    = img.getBoundingClientRect();
    const px      = sx - rect.left;   // posisi dalam container
    const py      = sy - rect.top;
    const newScale = Math.max(_z.MIN, Math.min(_z.MAX, _z.scale * f));
    if (newScale === _z.scale) return;

    // Zoom toward cursor: titik di bawah kursor harus tetap di tempat
    // Before: imgPoint = (px - tx) / scale
    // After:  px = imgPoint * newScale + newTx
    //         newTx = px - (px - tx) * (newScale / scale)
    _z.tx    = px - (px - _z.tx) * (newScale / _z.scale);
    _z.ty    = py - (py - _z.ty) * (newScale / _z.scale);
    _z.scale = newScale;
    _clampPan();
    _applyZoom(false);
}

// Clamp pan supaya tidak keluar dari batas gambar
function _clampPan() {
    const con = document.getElementById('modal-img-container');
    const img = document.getElementById('modal-image');
    if (!con || !img) return;

    if (_z.scale <= 1) { _z.tx = 0; _z.ty = 0; return; }

    const cW = con.clientWidth, cH = con.clientHeight;
    // Ukuran gambar saat sudah di-scale
    const iW = img.naturalWidth  || img.clientWidth;
    const iH = img.naturalHeight || img.clientHeight;

    // Gambar di-fit ke container, hitung rendered size
    const ratio   = Math.min(cW / iW, cH / iH);
    const rendW   = iW * ratio;
    const rendH   = iH * ratio;
    const baseOffX = (cW - rendW) / 2;  // offset tengah saat scale=1
    const baseOffY = (cH - rendH) / 2;

    // Setelah scale, gambar berukuran rendW * scale × rendH * scale
    const scaledW = rendW * _z.scale;
    const scaledH = rendH * _z.scale;

    // tx minimum: gambar jangan geser ke kiri terlalu jauh
    const txMin = Math.min(0, cW - scaledW - baseOffX * (_z.scale - 1));
    const txMax = Math.max(0, baseOffX * (_z.scale - 1));
    const tyMin = Math.min(0, cH - scaledH - baseOffY * (_z.scale - 1));
    const tyMax = Math.max(0, baseOffY * (_z.scale - 1));

    _z.tx = Math.max(txMin, Math.min(txMax, _z.tx));
    _z.ty = Math.max(tyMin, Math.min(tyMax, _z.ty));
}

// Sembunyikan hint setelah beberapa detik
function _scheduleHideHint() {
    const hint = document.getElementById('modal-zoom-hint');
    if (!hint) return;
    clearTimeout(_z.hintTimer);
    _z.hintTimer = setTimeout(() => hint.classList.add('hidden'), 3000);
}


// ── EVENT LISTENERS ZOOM ──────────────────────────────────

function _attachZoomListeners() {
    const con = document.getElementById('modal-img-container');
    const img = document.getElementById('modal-image');
    if (!con || !img) return;

    // Wheel — zoom di posisi kursor
    con._onWheel = (e) => {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        _zoomAt(factor, e.clientX, e.clientY);
    };
    con.addEventListener('wheel', con._onWheel, { passive: false });

    // Double-click — toggle zoom 1x ↔ 2.5x
    con._onDblClick = (e) => {
        e.stopPropagation();
        if (_z.scale > 1) {
            _zoomReset();
        } else {
            _zoomAt(2.5, e.clientX, e.clientY);
        }
    };
    con.addEventListener('dblclick', con._onDblClick);

    // Mouse drag — pan saat sudah zoom
    con._onMouseDown = (e) => {
        if (_z.scale <= 1) return;
        e.preventDefault();
        _z.dragging = true;
        _z.startX   = e.clientX;
        _z.startY   = e.clientY;
        _z.startTx  = _z.tx;
        _z.startTy  = _z.ty;
        img.classList.add('is-interacting');
        img.style.cursor = 'grabbing';
    };
    con.addEventListener('mousedown', con._onMouseDown);

    con._onMouseMove = (e) => {
        if (!_z.dragging) return;
        _z.tx = _z.startTx + (e.clientX - _z.startX);
        _z.ty = _z.startTy + (e.clientY - _z.startY);
        _clampPan();
        _applyZoom(false);
    };
    window.addEventListener('mousemove', con._onMouseMove);

    con._onMouseUp = () => {
        if (!_z.dragging) return;
        _z.dragging = false;
        _applyZoom(false);
    };
    window.addEventListener('mouseup', con._onMouseUp);

    // Touch — pinch-to-zoom + drag + swipe navigasi
    con._onTouchStart = (e) => {
        if (e.touches.length === 1) {
            const now = Date.now();
            const t   = e.touches[0];

            // Double-tap detection
            if (now - _z.lastTap < 300) {
                e.preventDefault();
                _z.scale > 1 ? _zoomReset() : _zoomAt(2.5, t.clientX, t.clientY);
            }
            _z.lastTap = now;

            // Track start untuk swipe (scale=1) atau pan (scale>1)
            _z.swipeStartX = t.clientX;
            _z.swipeStartY = t.clientY;
            _z.swipeLastX  = t.clientX;
            _z.isSwipe     = false;

            if (_z.scale > 1) {
                _z.dragging = true;
                _z.startX   = t.clientX;
                _z.startY   = t.clientY;
                _z.startTx  = _z.tx;
                _z.startTy  = _z.ty;
            }
        } else if (e.touches.length === 2) {
            e.preventDefault();
            _z.dragging  = false;
            _z.isSwipe   = false;
            const dx     = e.touches[1].clientX - e.touches[0].clientX;
            const dy     = e.touches[1].clientY - e.touches[0].clientY;
            _z.pinchDist = Math.hypot(dx, dy);
            _z.pinchMidX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            _z.pinchMidY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
        }
        img.classList.add('is-interacting');
    };
    con.addEventListener('touchstart', con._onTouchStart, { passive: false });

    con._onTouchMove = (e) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const dx     = e.touches[1].clientX - e.touches[0].clientX;
            const dy     = e.touches[1].clientY - e.touches[0].clientY;
            const dist   = Math.hypot(dx, dy);
            const midX   = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const midY   = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            const factor = dist / (_z.pinchDist || dist);
            _z.pinchDist = dist;
            _z.pinchMidX = midX;
            _z.pinchMidY = midY;
            _zoomAt(factor, midX, midY);

        } else if (e.touches.length === 1) {
            const t  = e.touches[0];
            const dx = t.clientX - _z.swipeStartX;
            const dy = t.clientY - _z.swipeStartY;
            _z.swipeLastX = t.clientX;

            if (_z.scale <= 1) {
                // Swipe navigasi — horizontal lebih dominan dari vertikal
                if (!_z.isSwipe && Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.5) {
                    _z.isSwipe = true;
                }
                if (_z.isSwipe) e.preventDefault(); // cegah scroll saat swipe

            } else if (_z.dragging) {
                // Pan saat sudah zoom
                e.preventDefault();
                _z.tx = _z.startTx + dx;
                _z.ty = _z.startTy + dy;
                _clampPan();
                _applyZoom(false);
            }
        }
    };
    con.addEventListener('touchmove', con._onTouchMove, { passive: false });

    con._onTouchEnd = (e) => {
        // Swipe selesai — navigasi kalau cukup jauh
        if (_z.scale <= 1 && _z.isSwipe) {
            const dist = _z.swipeLastX - _z.swipeStartX;
            if (Math.abs(dist) > 55) navigatePhoto(dist < 0 ? 1 : -1);
        }
        _z.dragging  = false;
        _z.pinchDist = 0;
        _z.isSwipe   = false;
    };
    con.addEventListener('touchend', con._onTouchEnd);

    // Keyboard — Esc tutup, +/- zoom
    con._onKey = (e) => {
        if (e.key === 'Escape')    { closePhotoModal(); return; }
        if (e.key === '+' || e.key === '=') { _zoomAt(1.25, window.innerWidth/2, window.innerHeight/2); }
        if (e.key === '-')          { _zoomAt(1/1.25, window.innerWidth/2, window.innerHeight/2); }
        if (e.key === '0')          { _zoomReset(); }
        if (e.key === 'ArrowLeft')  { navigatePhoto(-1); }
        if (e.key === 'ArrowRight') { navigatePhoto(1); }
    };
    window.addEventListener('keydown', con._onKey);
}

function _detachZoomListeners() {
    const con = document.getElementById('modal-img-container');
    if (!con) return;
    if (con._onWheel)      { con.removeEventListener('wheel', con._onWheel); }
    if (con._onDblClick)   { con.removeEventListener('dblclick', con._onDblClick); }
    if (con._onMouseDown)  { con.removeEventListener('mousedown', con._onMouseDown); }
    if (con._onMouseMove)  { window.removeEventListener('mousemove', con._onMouseMove); }
    if (con._onMouseUp)    { window.removeEventListener('mouseup', con._onMouseUp); }
    if (con._onTouchStart) { con.removeEventListener('touchstart', con._onTouchStart); }
    if (con._onTouchMove)  { con.removeEventListener('touchmove', con._onTouchMove); }
    if (con._onTouchEnd)   { con.removeEventListener('touchend', con._onTouchEnd); }
    if (con._onKey)        { window.removeEventListener('keydown', con._onKey); }
}


// ── MODAL FOTO ────────────────────────────────────────────

// Saat modal dibuka, push state baru ke history supaya back button
// menutup modal — bukan pindah halaman.
let _navHideTimer = null;
function _scheduleHideNav() {
    const nav = document.querySelector('.modal-nav-row');
    if (!nav) return;
    nav.classList.remove('hidden');
    clearTimeout(_navHideTimer);
    _navHideTimer = setTimeout(() => nav.classList.add('hidden'), 2500);
}

function openPhotoModal() {
    document.getElementById('photo-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
    history.pushState({ pdsModal: 'photo' }, '');
    _zoomReset();
    _attachZoomListeners();
    _scheduleHideHint();
    _scheduleHideNav();

    // Tap/click pada container → tampilkan nav lagi
    const con = document.getElementById('modal-img-container');
    if (con) {
        con._showNav = () => _scheduleHideNav();
        con.addEventListener('click', con._showNav);
        con.addEventListener('touchstart', con._showNav, { passive: true });
    }
}

// Tutup modal tanpa mengubah history (dipanggil dari dalam: tombol ✕,
// klik overlay, Esc). go(-1) supaya history entry yang kita push ikut hilang.
function closePhotoModal() {
    const modal = document.getElementById('photo-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    document.getElementById('modal-react-picker')?.classList.add('hidden');
    document.body.style.overflow = '';
    const img = document.getElementById('modal-image');
    if (img) img.src = '';
    _detachZoomListeners();
    _zoomReset();
    clearTimeout(_z.hintTimer);
    const hint = document.getElementById('modal-zoom-hint');
    if (hint) hint.classList.remove('hidden');
    // Hapus history entry yang kita push saat buka — tapi hanya kalau
    // penutupan bukan dipicu oleh popstate (kalau dipicu popstate, browser
    // sudah go(-1) sendiri).
    if (history.state?.pdsModal === 'photo') history.back();
}
window.closePhotoModal = closePhotoModal;

// Dipanggil oleh popstate (back button) — tutup modal tanpa go(-1) lagi
function _closePhotoModalFromBack() {
    const modal = document.getElementById('photo-modal');
    if (!modal?.classList.contains('open')) return;
    modal.classList.remove('open');
    document.getElementById('modal-react-picker')?.classList.add('hidden');
    document.body.style.overflow = '';
    const img = document.getElementById('modal-image');
    if (img) img.src = '';
    _detachZoomListeners();
    _zoomReset();
    clearTimeout(_z.hintTimer);
    clearTimeout(_navHideTimer);
    const hint = document.getElementById('modal-zoom-hint');
    if (hint) hint.classList.remove('hidden');
    const nav = document.querySelector('.modal-nav-row');
    if (nav) nav.classList.remove('hidden');
    const con = document.getElementById('modal-img-container');
    if (con?._showNav) {
        con.removeEventListener('click', con._showNav);
        con.removeEventListener('touchstart', con._showNav);
    }
}

// Listener popstate — back button HP / browser
window.addEventListener('popstate', (e) => {
    // Kalau modal sedang buka, tutup modal (jangan biarkan navigasi jalan)
    if (document.getElementById('photo-modal')?.classList.contains('open')) {
        _closePhotoModalFromBack();
    }
});

function closePhotoModalOnOverlay(e) {
    if (e.target === document.getElementById('photo-modal')) closePhotoModal();
}
window.closePhotoModalOnOverlay = closePhotoModalOnOverlay;


// ── MODAL UPLOAD ──────────────────────────────────────────
function openUploadModal() {
    const user = UserMemory.get();
    if (!user) {
        ProfileModal.show((newUser) => { _doOpenUploadModal(newUser); });
        return;
    }
    _doOpenUploadModal(user);
}
function _doOpenUploadModal(user) {
    const sub = document.getElementById('upload-subtitle');
    if (sub && user) {
        const j = user.jurusan ? ' · ' + getJurusanLabel(user.jurusan) : '';
        sub.textContent = `Upload sebagai ${user.name} · ${user.role}${j}`;
    }
    document.getElementById('upload-modal')?.classList.add('open');
    document.body.style.overflow = 'hidden';
}
window.openUploadModal = openUploadModal;

function closeUploadModal() {
    document.getElementById('upload-modal')?.classList.remove('open');
    document.body.style.overflow = '';
    ['upload-title','upload-desc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const cat = document.getElementById('upload-category'); if (cat) cat.value = '';
    const jf  = document.getElementById('upload-jurusan-foto'); if (jf) jf.value = '';
    const jff = document.getElementById('jurusan-foto-field'); if (jff) jff.style.display = 'none';
    const fi  = document.getElementById('upload-file'); if (fi) fi.value = '';
    const pre = document.getElementById('upload-preview'); if (pre) { pre.src = ''; pre.style.display = 'none'; }
    const da  = document.getElementById('drag-drop-area'); if (da) da.style.display = '';
}
window.closeUploadModal = closeUploadModal;

function toggleJurusanFotoField(val) {
    const f = document.getElementById('jurusan-foto-field');
    if (f) f.style.display = val === 'kelas' ? 'block' : 'none';
}
window.toggleJurusanFotoField = toggleJurusanFotoField;


// ── MODAL CONTENT BUILDERS ────────────────────────────────

// Reaction badges ringkas — hanya tampilkan emoji yang sudah ada count-nya
function _buildReactionBadges(reaksi) {
    return Object.entries(reaksi || {})
        .filter(([, c]) => c > 0)
        .map(([e, c]) => `<span class="modal-react-badge">${e} ${c}</span>`)
        .join('');
}

// Toggle picker reaksi yang ada di atas info bar (#modal-react-picker)
function toggleModalPicker(photoId, type) {
    const picker = document.getElementById('modal-react-picker');
    if (!picker) return;

    // Tutup kalau sudah buka untuk foto yang sama
    if (!picker.classList.contains('hidden') && picker.dataset.pid == photoId) {
        picker.classList.add('hidden');
        return;
    }

    const handler = type === 'admin' ? 'handleReaksiAdminModal' : 'handleReaksiUserModal';
    picker.dataset.pid  = photoId;
    picker.dataset.type = type;
    picker.innerHTML    = EMOJI_LIST.map(e =>
        `<button class="emoji-btn" onclick="${handler}(${photoId},'${e}')">${e}</button>`
    ).join('');
    picker.classList.remove('hidden');
}
window.toggleModalPicker = toggleModalPicker;

function buildAdminModalInfo(photo) {
    const badges = _buildReactionBadges(photo.reaksi);
    return `
        <div class="modal-info-left">
            <div class="modal-info-title">${escHtml(photo.title || '')}</div>
            <div class="modal-info-sub">${escHtml(photo.category || '')}</div>
        </div>
        <div class="modal-info-right">
            ${badges ? `<div class="modal-react-badges">${badges}</div>` : ''}
            <button class="modal-react-trigger" onclick="event.stopPropagation();toggleModalPicker(${photo.id},'admin')">😊</button>
        </div>`;
}

function buildUserModalInfo(photo) {
    const isLiked = localStorage.getItem(`pds_gl_${photo.id}`) === '1';
    const badges  = _buildReactionBadges(photo.reaksi);
    return `
        <div class="modal-info-left">
            <div class="modal-info-title">${escHtml(photo.title || '')}</div>
            <div class="modal-info-sub">
                <span class="modal-info-user">${escHtml(photo.username || 'Anonim')}</span>
                <span class="modal-info-time">${formatTimeAgo(photo.created_at)}</span>
                <span class="modal-info-views">👁 ${photo.views_count || 0}</span>
            </div>
        </div>
        <div class="modal-info-right">
            <button class="modal-like-btn ${isLiked ? 'liked' : ''}"
                    id="like-btn-modal"
                    onclick="event.stopPropagation();handleLikePhotoModal(${photo.id},${photo.likes_count || 0})">
                ${isLiked ? '❤️' : '🤍'}
                <span id="like-count-modal">${photo.likes_count || 0}</span>
            </button>
            ${badges ? `<div class="modal-react-badges">${badges}</div>` : ''}
            <button class="modal-react-trigger" onclick="event.stopPropagation();toggleModalPicker(${photo.id},'user')">😊</button>
        </div>`;
}

function updateNavButtons() {
    const p = document.getElementById('modal-prev'), n = document.getElementById('modal-next');
    if (p) p.style.visibility = currentModalPhotoIndex > 0 ? 'visible' : 'hidden';
    if (n) n.style.visibility = currentModalPhotoIndex < currentModalPhotoList.length - 1 ? 'visible' : 'hidden';
}

function _setModal(photo, dir = 0) {
    const con  = document.getElementById('modal-img-container');
    const img  = document.getElementById('modal-image');
    const info = document.getElementById('modal-info');
    if (!img || !con) return;

    // Slide animation
    if (dir !== 0 && img.src) {
        const outX = dir < 0 ? '40px' : '-40px';
        img.style.transition = 'opacity 0.18s ease, transform 0.18s ease';
        img.style.opacity    = '0';
        img.style.transform  = `translateX(${outX})`;
    }

    // Skeleton loading
    con.classList.add('img-loading');

    setTimeout(() => {
        const url = (currentModalType === 'admin' ? photo.photo_url : photo.image_url) || '';
        img.style.transition = 'none';
        img.style.opacity    = '0';
        img.style.transform  = dir !== 0 ? `translateX(${dir > 0 ? '40px' : '-40px'})` : 'translateX(0)';

        img.onload = () => {
            con.classList.remove('img-loading');
            img.style.transition = 'opacity 0.22s ease, transform 0.22s ease';
            img.style.opacity    = '1';
            img.style.transform  = 'translateX(0)';
        };
        img.onerror = () => {
            con.classList.remove('img-loading');
            img.style.opacity = '1';
        };
        img.src = url;
    }, dir !== 0 ? 160 : 0);

    if (info) info.innerHTML = currentModalType === 'admin' ? buildAdminModalInfo(photo) : buildUserModalInfo(photo);
}

function openAdminModal(photoId) {
    const photo = adminPhotos.find(p => p.id === photoId);
    if (!photo) return;
    currentModalPhotoList  = adminPhotos;
    currentModalPhotoIndex = adminPhotos.findIndex(p => p.id === photoId);
    currentModalType       = 'admin';
    _setModal(photo);
    openPhotoModal();
    updateNavButtons();
}
window.openAdminModal = openAdminModal;

async function openUserModal(photoId) {
    const photo = userPhotos.find(p => p.id === photoId);
    if (!photo) return;
    currentModalPhotoList  = userPhotos;
    currentModalPhotoIndex = userPhotos.findIndex(p => p.id === photoId);
    currentModalType       = 'user';
    _setModal(photo);
    openPhotoModal();
    updateNavButtons();
    await incrementView(photoId);
}
window.openUserModal = openUserModal;

function navigatePhoto(dir) {
    const newIdx = currentModalPhotoIndex + dir;
    if (newIdx < 0 || newIdx >= currentModalPhotoList.length) return;
    currentModalPhotoIndex = newIdx;
    const photo = currentModalPhotoList[newIdx];
    if (!photo) return;
    document.getElementById('modal-react-picker')?.classList.add('hidden');
    _zoomReset();
    _setModal(photo, dir);
    updateNavButtons();
    _scheduleHideNav();
    if (currentModalType === 'user') incrementView(photo.id);
}
window.navigatePhoto = navigatePhoto;


// ── REAKSI MODAL ──────────────────────────────────────────
async function handleReaksiAdminModal(photoId, emoji) {
    await reaktFoto(photoId, emoji);
    document.getElementById('modal-react-picker')?.classList.add('hidden');
    adminPhotos = await fetchFotoAdmin(currentAdminCategory, currentAdminJurusan);
    const photo = adminPhotos.find(p => p.id === photoId);
    if (!photo) return;
    // Refresh card reactions
    const el = document.getElementById(`reactions-admin-${photoId}`);
    if (el) el.innerHTML = buildBadges(photo.reaksi || {});
    // Refresh info bar
    const info = document.getElementById('modal-info');
    if (info) info.innerHTML = buildAdminModalInfo(photo);
    showToast('Reaksi diberikan!');
}
window.handleReaksiAdminModal = handleReaksiAdminModal;

async function handleReaksiUserModal(photoId, emoji) {
    await reaktFoto(photoId, emoji);
    document.getElementById('modal-react-picker')?.classList.add('hidden');
    userPhotos = await fetchFotoUser(currentUserCategory);
    const photo = userPhotos.find(p => p.id === photoId);
    if (!photo) return;
    // Refresh card reactions
    const el = document.getElementById(`reactions-user-${photoId}`);
    if (el) el.innerHTML = buildBadges(photo.reaksi || {});
    // Refresh info bar
    const info = document.getElementById('modal-info');
    if (info) info.innerHTML = buildUserModalInfo(photo);
    showToast('Reaksi diberikan!');
}
window.handleReaksiUserModal = handleReaksiUserModal;

async function handleLikePhotoModal(photoId, currentLikes) {
    const result = await likeUserGallery(photoId, currentLikes);
    const btn = document.getElementById('like-btn-modal');
    if (btn) {
        btn.style.color = result.liked ? 'var(--gold)' : 'var(--text-muted)';
        btn.innerHTML = `${result.liked ? '❤️' : '🤍'} <span id="like-count-modal">${result.count ?? currentLikes}</span>`;
    }
    const badge = document.getElementById(`like-badge-${photoId}`);
    if (badge) badge.textContent = `${result.liked ? '❤️' : '🤍'} ${result.count ?? currentLikes}`;
    const p = userPhotos.find(p => p.id === photoId);
    if (p) p.likes_count = result.count ?? currentLikes;
}
window.handleLikePhotoModal = handleLikePhotoModal;


// ── INIT ──────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    // currentUser dihapus — gunakan UserMemory.get() di mana butuh profil user

    await loadGaleriConfig();
    checkGaleriStatus();
    await Promise.all([loadAdminGallery(), loadUserGallery()]);

    setupAdminFilters();
    setupUserFilters();
    setupUploadForm();
    setupDragDropInModal();

    setTimeout(updateQuotaDisplay, 300);
    setTimeout(updateAdminJurusanCounts, 300);

    document.getElementById('upload-modal')?.addEventListener('click', e => {
        if (e.target === document.getElementById('upload-modal')) closeUploadModal();
    });
    document.getElementById('upload-submit-btn')?.addEventListener('click', () => window.submitUpload());
});


// ── LOAD & RENDER ─────────────────────────────────────────
async function loadAdminGallery(category = 'all', jurusan = 'all') {
    const grid = document.getElementById('admin-photo-grid');
    if (!grid) return;
    renderSkeleton(grid, 6);
    adminPhotos = await fetchFotoAdmin(category, jurusan);
    currentAdminPage = 1;
    renderAdminGallery();
}

async function loadUserGallery(category = 'all') {
    const grid = document.getElementById('user-photo-grid');
    if (!grid) return;
    renderSkeleton(grid, 4);
    userPhotos = await fetchFotoUser(category);
    currentUserPage = 1;
    renderUserGallery();
}

function renderSkeleton(grid, n) {
    grid.innerHTML = Array(n).fill(`
        <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:8px;overflow:hidden;animation:shimmer 1.4s infinite">
            <div style="aspect-ratio:4/3;background:var(--bg-hover)"></div>
            <div style="padding:10px 10px 12px;display:flex;flex-direction:column;gap:6px">
                <div style="height:9px;width:70%;background:var(--bg-hover);border-radius:2px"></div>
                <div style="height:8px;width:40%;background:var(--bg-hover);border-radius:2px"></div>
            </div>
        </div>`).join('');
}

// _imgEl — helper untuk render gambar dengan:
// 1. loading="lazy"  : native lazy load (didukung semua browser modern)
// 2. WebP fallback   : kalau browser tidak support WebP atau gambar gagal load,
//                      tampil placeholder bergaya bukan sekadar hilang
//
// Tidak menggunakan <picture> karena storage hanya menyimpan satu versi (WebP/JPG).
// isWebPSupported() dari baris atas — cek sekali, di-cache di _webpSupported.
function _imgEl(src, alt) {
    // Kalau browser tidak support WebP dan URL adalah .webp → langsung placeholder
    const isWebp = src && src.toLowerCase().includes('.webp');
    if (isWebp && !isWebPSupported()) {
        return `<div class="img-placeholder img-no-webp" title="${escHtml(alt)}">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.3">
                <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/>
                <polyline points="21 15 16 10 5 21"/>
            </svg>
            <span>Format tidak didukung</span>
        </div>`;
    }
    return `<img src="${escHtml(src)}" alt="${escHtml(alt)}"
                 loading="eager"
                 decoding="async"
                 onload="resizeGridItem(this.closest('.photo-item'))"
                 onerror="this.parentElement.classList.add('img-error');resizeGridItem(this.closest('.photo-item'));this.remove()">`;
}

// Tombol trigger reaksi — satu tombol, klik buka picker (seperti pesan.html)
function _reactionTrigger(id, prefix) {
    return `<button class="react-card-trigger" onclick="event.stopPropagation();togglePicker(${id},'${prefix}')">😊</button>`;
}

// Picker emoji — muncul saat trigger diklik, posisi inline di bawah info bar
function _emojiPicker(id, prefix, handler) {
    return `<div class="reaction-picker hidden" id="picker-${prefix}-${id}" onclick="event.stopPropagation()">
        ${EMOJI_LIST.map(e => `<button class="emoji-btn" onclick="${handler}(${id},'${e}')">${e}</button>`).join('')}
    </div>`;
}


// ════════════════════════════════════════════
//  GRID MASONRY RESIZE
// ════════════════════════════════════════════
function resizeGridItem(item) {
    if (!item) return;
    const grid = item.closest('.photo-grid');
    if (!grid) return;
    const rowH = parseInt(getComputedStyle(grid).gridAutoRows) || 8;
    item.style.gridRowEnd = '';
    const h = item.getBoundingClientRect().height;
    if (h > 0) item.style.gridRowEnd = `span ${Math.ceil(h / rowH)}`;
}

function resizeAllGridItems(gridId) {
    const grid = document.getElementById(gridId);
    if (!grid) return;
    // Resize semua item — termasuk yang gambarnya sudah load
    grid.querySelectorAll('.photo-item').forEach(item => {
        const img = item.querySelector('img');
        if (img && img.complete && img.naturalHeight > 0) {
            resizeGridItem(item);
        }
    });
    // Resize ulang setelah semua gambar selesai load (beberapa kali)
    [100, 400, 900, 1800].forEach(delay => {
        setTimeout(() => {
            grid.querySelectorAll('.photo-item').forEach(item => resizeGridItem(item));
        }, delay);
    });
}

function renderAdminGallery() {
    const grid = document.getElementById('admin-photo-grid');
    if (!grid) return;
    const toShow = adminPhotos.slice(0, currentAdminPage * PER_PAGE);

    if (!toShow.length) {
        grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">
            Belum ada foto untuk filter ini.</div>`;
        updateLoadMore('load-more-admin', 0, 1);
        return;
    }

    grid.innerHTML = toShow.map(photo => `
        <div class="photo-item">
            <!-- Area gambar — klik buka modal -->
            <div class="photo-img-wrap" onclick="openAdminModal(${photo.id})">
                ${_imgEl(photo.photo_url, photo.title)}
                ${photo.category ? `<span class="photo-cat-badge">${escHtml(photo.category)}</span>` : ''}
            </div>
            <!-- Info bar — always visible, stopPropagation -->
            <div class="photo-info" onclick="event.stopPropagation()">
                <div class="photo-info-main" onclick="openAdminModal(${photo.id})" style="cursor:pointer">
                    <div class="photo-info-title">${escHtml(photo.title || '')}</div>
                </div>
                <div class="photo-actions-row">
                    <div class="photo-reactions" id="reactions-admin-${photo.id}">
                        ${buildBadges(photo.reaksi || {})}
                    </div>
                    ${_reactionTrigger(photo.id, 'admin')}
                </div>
                ${_emojiPicker(photo.id, 'admin', 'handleReaksiAdmin')}
            </div>
        </div>`).join('');

    updateLoadMore('load-more-admin', adminPhotos.length, currentAdminPage);
    setTimeout(() => resizeAllGridItems('admin-photo-grid'), 50);
}

function renderUserGallery() {
    const grid = document.getElementById('user-photo-grid');
    if (!grid) return;
    const toShow = userPhotos.slice(0, currentUserPage * PER_PAGE);

    if (!toShow.length) {
        grid.innerHTML = `<div style="text-align:center;padding:48px;color:var(--text-muted);font-size:13px">
            Belum ada foto kiriman. Jadilah yang pertama upload!</div>`;
        updateLoadMore('load-more-user', 0, 1);
        return;
    }

    grid.innerHTML = toShow.map(photo => {
        const isLiked = localStorage.getItem(`pds_gl_${photo.id}`) === '1';
        return `
        <div class="photo-item">
            <!-- Area gambar — klik buka modal -->
            <div class="photo-img-wrap" onclick="openUserModal(${photo.id})">
                ${_imgEl(photo.image_url, photo.title)}
                ${photo.category ? `<span class="photo-cat-badge">${escHtml(photo.category)}</span>` : ''}
            </div>
            <!-- Info bar — always visible, stopPropagation -->
            <div class="photo-info" onclick="event.stopPropagation()">
                <div class="photo-info-main" onclick="openUserModal(${photo.id})" style="cursor:pointer">
                    <div class="photo-info-title">${escHtml(photo.title || '')}</div>
                    <div class="photo-info-meta">
                        <span class="photo-username">${escHtml(photo.username || 'Anonim')}</span>
                        <span class="photo-time">${formatTimeAgo(photo.created_at)}</span>
                    </div>
                </div>
                <div class="photo-actions-row">
                    <button class="photo-like-btn ${isLiked ? 'liked' : ''}"
                            id="like-badge-${photo.id}"
                            onclick="event.stopPropagation();handleLikePhoto(${photo.id},${photo.likes_count || 0})">
                        ${isLiked ? '❤️' : '🤍'} <span>${photo.likes_count || 0}</span>
                    </button>
                    <div class="photo-reactions" id="reactions-user-${photo.id}">
                        ${buildBadges(photo.reaksi || {})}
                    </div>
                    ${_reactionTrigger(photo.id, 'user')}
                </div>
                ${_emojiPicker(photo.id, 'user', 'handleReaksiUser')}
            </div>
        </div>`; }).join('');

    updateLoadMore('load-more-user', userPhotos.length, currentUserPage);
    setTimeout(() => resizeAllGridItems('user-photo-grid'), 50);
}

function updateLoadMore(btnId, total, page) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const rem = total - page * PER_PAGE;
    if (rem <= 0) { btn.style.display = 'none'; return; }
    btn.style.cssText = 'display:flex !important; margin: 0 auto 40px;';
    btn.textContent   = `Lihat ${rem} foto lainnya`;
}

window.loadMoreAdmin = () => { currentAdminPage++; renderAdminGallery(); };
window.loadMoreUser  = () => { currentUserPage++;  renderUserGallery(); };


// ── FILTER ────────────────────────────────────────────────
function setupAdminFilters() {
    const catBtns = document.querySelectorAll('.admin-category-filter-btn');
    catBtns.forEach(btn => btn.addEventListener('click', function () {
        catBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentAdminCategory = this.dataset.category;
        currentAdminPage = 1;
        loadAdminGallery(currentAdminCategory, currentAdminJurusan);
    }));

    const cards = document.querySelectorAll('#admin-jurusan-filter-container .jurusan-card');
    cards.forEach(card => card.addEventListener('click', function () {
        cards.forEach(c => c.classList.remove('active'));
        this.classList.add('active');
        currentAdminJurusan = this.dataset.jurusan;
        currentAdminPage = 1;
        loadAdminGallery(currentAdminCategory, currentAdminJurusan);
    }));
}

function setupUserFilters() {
    const btns = document.querySelectorAll('.user-category-filter-btn');
    btns.forEach(btn => btn.addEventListener('click', function () {
        btns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentUserCategory = this.dataset.category;
        currentUserPage = 1;
        loadUserGallery(currentUserCategory);
    }));
}


// ── UPLOAD FORM ───────────────────────────────────────────
function setupUploadForm() {
    const trigger = document.getElementById('upload-trigger');
    if (!trigger) return;
    trigger.addEventListener('click', openUploadModal);
    trigger.addEventListener('dragover',  e => { e.preventDefault(); trigger.style.borderColor = 'var(--gold)'; });
    trigger.addEventListener('dragleave', ()  => { trigger.style.borderColor = ''; });
    trigger.addEventListener('drop', e => {
        e.preventDefault(); trigger.style.borderColor = '';
        const file = e.dataTransfer.files[0];
        if (file?.type.startsWith('image/')) {
            openUploadModal();
            setTimeout(() => {
                const inp = document.getElementById('upload-file');
                if (inp) { const dt = new DataTransfer(); dt.items.add(file); inp.files = dt.files; handleFileSelect(inp); }
            }, 100);
        }
    });
}

function handleFileSelect(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { showToast('❌ Ukuran maksimal 15MB'); input.value = ''; return; }
    if (!file.type.startsWith('image/')) { showToast('❌ Hanya file gambar'); input.value = ''; return; }
    const reader = new FileReader();
    reader.onload = e => {
        const pre = document.getElementById('upload-preview');
        const da  = document.getElementById('drag-drop-area');
        if (pre) { pre.src = e.target.result; pre.style.display = 'block'; }
        if (da)  da.style.display = 'none';
    };
    reader.readAsDataURL(file);
}

function setupDragDropInModal() {
    const da = document.getElementById('drag-drop-area');
    const fi = document.getElementById('upload-file');
    if (!da || !fi) return;

    const process = file => {
        if (file?.type.startsWith('image/')) {
            const dt = new DataTransfer(); dt.items.add(file); fi.files = dt.files;
            handleFileSelect(fi); showToast('📷 Foto siap diupload');
        } else showToast('❌ Hanya file gambar');
    };

    da.addEventListener('click', () => fi.click());
    document.getElementById('select-file-btn')?.addEventListener('click', e => { e.stopPropagation(); fi.click(); });
    da.addEventListener('dragover',  e => { e.preventDefault(); da.classList.add('drag-over'); });
    da.addEventListener('dragleave', ()  => da.classList.remove('drag-over'));
    da.addEventListener('drop', e => { e.preventDefault(); da.classList.remove('drag-over'); process(e.dataTransfer.files[0]); });
    fi.addEventListener('change', () => { if (fi.files.length) handleFileSelect(fi); });
}


// ── REAKSI KARTU ──────────────────────────────────────────
function togglePicker(photoId, type) {
    // Tutup semua picker lain dulu, resize dulu
    document.querySelectorAll('.reaction-picker').forEach(p => {
        if (p.id !== `picker-${type}-${photoId}`) {
            if (!p.classList.contains('hidden')) {
                p.classList.add('hidden');
                resizeGridItem(p.closest('.photo-item'));
            }
        }
    });
    const picker = document.getElementById(`picker-${type}-${photoId}`);
    if (!picker) return;
    picker.classList.toggle('hidden');
    // Resize item setelah picker expand/collapse
    requestAnimationFrame(() => {
        resizeGridItem(picker.closest('.photo-item'));
    });
}

async function handleReaksiAdmin(id, emoji) {
    await reaktFoto(id, emoji);
    adminPhotos = await fetchFotoAdmin(currentAdminCategory, currentAdminJurusan);
    const photo = adminPhotos.find(p => p.id === id);
    if (photo) {
        const el = document.getElementById(`reactions-admin-${id}`);
        if (el) el.innerHTML = buildBadges(photo.reaksi || {});
    }
    document.getElementById(`picker-admin-${id}`)?.classList.add('hidden');
    showToast('Reaksi diberikan!');
}

async function handleReaksiUser(id, emoji) {
    await reaktFoto(id, emoji);
    userPhotos = await fetchFotoUser(currentUserCategory);
    const photo = userPhotos.find(p => p.id === id);
    if (photo) {
        const el = document.getElementById(`reactions-user-${id}`);
        if (el) el.innerHTML = buildBadges(photo.reaksi || {});
    }
    document.getElementById(`picker-user-${id}`)?.classList.add('hidden');
    showToast('Reaksi diberikan!');
}

async function handleLikePhoto(photoId, currentLikes) {
    const result = await likeUserGallery(photoId, currentLikes);
    const btn = document.getElementById(`like-badge-${photoId}`);
    if (btn) {
        btn.classList.toggle('liked', result.liked);
        const heart = result.liked ? '❤️' : '🤍';
        const count = result.count ?? currentLikes;
        btn.innerHTML = `${heart} <span>${count}</span>`;
    }
    const p = userPhotos.find(p => p.id === photoId);
    if (p) p.likes_count = result.count ?? currentLikes;
}

function buildBadges(reaksi) {
    return Object.entries(reaksi).filter(([,c]) => c > 0)
        .map(([e, c]) => `<span class="reaction-badge">${e} ${c}</span>`).join('');
}


// ── JURUSAN COUNT ─────────────────────────────────────────
// fetchJurusanPhotoCounts() dipindah ke supabase.js — galeri.js
// tinggal update DOM berdasarkan hasil yang dikembalikan.
async function updateAdminJurusanCounts() {
    const counts = await fetchJurusanPhotoCounts();
    JURUSAN_LIST.forEach(j => {
        const el = document.getElementById(`admin-count-${j.toLowerCase()}`);
        if (el) el.textContent = `${counts[j] ?? 0} foto`;
    });
    const allEl = document.getElementById('admin-count-all');
    if (allEl) allEl.textContent = `${counts._total ?? 0} foto`;
}


// ── SISTEM PENUTUPAN ──────────────────────────────────────
async function loadGaleriConfig() {
    // fetchSiteConfig() dari supabase.js — tidak perlu query inline di sini
    const value = await fetchSiteConfig('gallery_close_date');
    if (value) {
        _galeriCloseDate = new Date(value);
        _galeriClosed    = new Date() > _galeriCloseDate;
    }
}

function checkGaleriStatus() {
    if (!_galeriClosed) return;
    const trigger = document.getElementById('upload-trigger');
    if (trigger) trigger.style.display = 'none';
    const grid = document.getElementById('user-photo-grid');
    if (!grid) return;
    const banner = document.createElement('div');
    banner.style.cssText = 'background:var(--bg-card);border:1px solid var(--border);border-radius:16px;padding:32px 24px;text-align:center;margin-bottom:8px;';
    banner.innerHTML = `<div style="font-size:24px;margin-bottom:12px">📷</div>
        <p style="font-family:'Playfair Display',serif;font-size:16px;font-style:italic;color:var(--text);margin-bottom:6px">Upload Foto Ditutup</p>
        <p style="font-size:12px;color:var(--text-muted)">Masa pengiriman foto telah berakhir.${_galeriCloseDate ? ` Ditutup pada ${_galeriCloseDate.toLocaleDateString('id-ID',{day:'numeric',month:'long',year:'numeric'})}.` : ''}</p>`;
    grid.insertAdjacentElement('beforebegin', banner);
}


// ── HELPERS ───────────────────────────────────────────────
// escHtml(), formatTimeAgo(), showToast() dihapus dari sini.
// Ketiganya tersedia global dari utils.js.
