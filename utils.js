/**
 * utils.js — Pernah di Sini
 * Shared utilities: load sebelum semua file custom lainnya.
 *
 * Load order yang benar di setiap HTML:
 *   supabase CDN → utils.js → config.js → supabase.js → user-memory.js → page.js
 */

// ════════════════════════════════════════════
//  SESSION ID
//  Satu implementasi, dipakai oleh supabase.js & user-memory.js.
//  Sebelumnya terduplikasi sebagai _getSessionId() di supabase.js
//  dan UserMemory._sessionId() di user-memory.js.
// ════════════════════════════════════════════
function getSessionId() {
    let sid = sessionStorage.getItem('_sid');
    if (!sid) {
        sid = 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11);
        sessionStorage.setItem('_sid', sid);
    }
    return sid;
}


// ════════════════════════════════════════════
//  HTML ESCAPING
//  Sebelumnya: escHtml() di galeri.js & pesan.js,
//  escHtmlProfile() di user-memory.js — semua identik.
// ════════════════════════════════════════════
function escHtml(s) {
    return String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}


// ════════════════════════════════════════════
//  TIME FORMATTING
//  Versi terlengkap (dari galeri.js, tambah logika "bulan lalu"
//  yang tidak ada di versi pesan.js).
// ════════════════════════════════════════════
function formatTimeAgo(iso) {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'Baru saja';
    if (m < 60) return `${m} menit lalu`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h} jam lalu`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d} hari lalu`;
    const w = Math.floor(d / 7);
    if (w < 4) return `${w} minggu lalu`;
    return `${Math.floor(d / 30)} bulan lalu`;
}


// ════════════════════════════════════════════
//  TOAST NOTIFICATION
//  Versi terlengkap (dari galeri.js) dengan animasi reset
//  saat toast muncul berturut-turut.
// ════════════════════════════════════════════
function showToast(msg, duration = 3500) {
    const t = document.getElementById('toast');
    if (!t) return;
    clearTimeout(t._timer);
    if (t.classList.contains('show')) {
        t.classList.remove('show');
        t._timer = setTimeout(() => {
            t.textContent = msg;
            t.classList.add('show');
            t._timer = setTimeout(() => t.classList.remove('show'), duration);
        }, 320);
    } else {
        t.textContent = msg;
        t.classList.add('show');
        t._timer = setTimeout(() => t.classList.remove('show'), duration);
    }
}


// ════════════════════════════════════════════
//  KONSTANTA BERSAMA
//  Sebelumnya: EMOJI_LIST di galeri.js, EMOJI_REACTIONS di pesan.js
//  (nama beda, urutan beda, konten sama).
// ════════════════════════════════════════════

/** Daftar emoji reaksi — urutan ini dipakai di galeri & pesan */
const EMOJI_LIST = ['❤️', '🔥', '😂', '😭', '👏'];

/** Daftar jurusan yang berlaku di sekolah */
const JURUSAN_LIST = ['TSM', 'MPLB', 'ATP', 'APHP'];


// ════════════════════════════════════════════
//  JURUSAN LABEL MAP
//  DB menyimpan 'MPLB', tampil di UI sebagai 'MPLB'.
// ════════════════════════════════════════════
const JURUSAN_LABEL = {
    TSM: 'TSM',
    MPLB: 'MPLB',
    ATP: 'ATP',
    APHP: 'APHP',
};

/** Kembalikan label display untuk jurusan tertentu */
function getJurusanLabel(j) {
    return JURUSAN_LABEL[j] || j;
}


// ════════════════════════════════════════════
//  NAVBAR SCROLL HINT
//  Sebelumnya duplikat inline di setiap HTML.
//  Dipanggil otomatis — tidak perlu dipanggil manual.
// ════════════════════════════════════════════
(function initNavbarHint() {
    // Tunggu DOM siap
    function run() {
        const links = document.getElementById('navbar-links');
        const wrap = document.getElementById('nav-wrap');
        const hint = document.getElementById('nav-hint');
        if (!links || !wrap) return;
        
        function check() {
            const atEnd = links.scrollLeft + links.clientWidth >= links.scrollWidth - 4;
            wrap.classList.toggle('at-end', atEnd);
            if (hint) hint.style.opacity = atEnd ? '0' : '1';
        }
        links.addEventListener('scroll', check, { passive: true });
        check();
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', run);
    } else {
        run();
    }
})();


// ════════════════════════════════════════════
//  PAGE TRANSITION
//  Intercept semua link internal → animasi keluar → navigate.
//  Animasi masuk dihandle CSS (body { animation: pageIn ... }).
//  Tidak perlu framework — native, ringan, optimal.
// ════════════════════════════════════════════
(function initPageTransitions() {
    const FADE_OUT_MS = 220; // durasi fade-out overlay (saat navigasi keluar)
    
    // Inject overlay sekali ke DOM
    const overlay = document.createElement('div');
    overlay.className = 'pds-page-overlay';
    document.body.appendChild(overlay);
    
    // ── FIX BFCACHE ────────────────────────────────────────
    // Saat browser restore halaman dari back-forward cache,
    // overlay mungkin masih .active (opacity 1 / hitam).
    // pageshow dengan persisted=true → lepas class → CSS transition
    // otomatis fade-out dari hitam ke transparan = nice fade-in saat back.
    window.addEventListener('pageshow', (e) => {
        if (e.persisted) {
            // Sedikit delay supaya browser selesai paint dulu
            requestAnimationFrame(() => overlay.classList.remove('active'));
        }
    });
    
    // ── INTERCEPT LINK CLICK ───────────────────────────────
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a[href]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        
        // Lewati: eksternal, hash, download, target=_blank
        if (!href ||
            href.startsWith('http') ||
            href.startsWith('//') ||
            href.startsWith('#') ||
            href.startsWith('mailto:') ||
            href.startsWith('tel:') ||
            link.hasAttribute('download') ||
            link.target === '_blank') return;
        
        e.preventDefault();
        
        // Aktifkan overlay (fade-in cepat ke hitam)
        overlay.classList.add('active');
        
        // Navigasi setelah overlay penuh hitam
        setTimeout(() => { window.location.href = href; }, FADE_OUT_MS);
    });
})();