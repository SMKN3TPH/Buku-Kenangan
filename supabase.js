/**
 * supabase.js
 * Supabase client & semua fungsi database/storage
 * Pernah di Sini — SMK Negeri 3 Tapung Hulu
 * Menggunakan supabase-js SDK via CDN
 */

// ── CONFIG ──────────────────────────────────
// Diambil dari config.js yang di-load sebelum file ini
const STORAGE_BUCKET = 'gallery_photos';

// Singleton — pakai getSupabaseClient() dari config.js
// Tidak perlu redefinisi di sini

// ── HELPER: Public URL storage ──────────────
function getStorageUrl(path) {
    const db = getSupabaseClient();
    const { data } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);
    return data.publicUrl;
}


// ════════════════════════════════════════════
//  SISWA
// ════════════════════════════════════════════

async function fetchSiswa(jurusan = null) {
    try {
        const db = getSupabaseClient();
        let query = db
            .from('students')
            .select('id, name, jurusan, wali_kelas, nisn')
            .eq('is_active', true)
            .eq('angkatan', '2026')
            .order('jurusan')
            .order('name');
        if (jurusan) query = query.eq('jurusan', jurusan);
        const { data, error } = await query;
        if (error) throw error;
        return data || [];
    } catch (e) {
        console.error('[fetchSiswa]', e.message);
        return [];
    }
}


// ════════════════════════════════════════════
//  PESAN
// ════════════════════════════════════════════

const MAX_PESAN    = 3;
const COOLDOWN_MS  = 4 * 60 * 60 * 1000;
const NIGHT_START  = 22;
const NIGHT_END    = 6;
const LS_PESAN_KEY = 'pds_pesan_log';

/**
 * Ambil pesan approved beserta reaksi
 */
async function fetchPesan(filterJurusan = 'semua') {
    try {
        const db = getSupabaseClient();
        let query = db
            .from('pesan')
            .select('id, nama, peran, jurusan, isi, likes, created_at, session_id')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (filterJurusan !== 'semua') {
            if (filterJurusan === 'Guru') {
                query = query.eq('jurusan', 'Guru');
            } else if (filterJurusan === 'Lainnya') {
                query = query.eq('jurusan', 'Anonim');
            } else {
                query = query.eq('jurusan', filterJurusan);
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        const messages = data || [];
        if (!messages.length) return [];

        // Ambil reaksi
        const ids = messages.map(m => m.id);
        const { data: reaksiData } = await db
            .from('pesan_reaksi')
            .select('pesan_id, emoji')
            .in('pesan_id', ids);

        const reaksiMap = {};
        (reaksiData || []).forEach(r => {
            if (!reaksiMap[r.pesan_id]) reaksiMap[r.pesan_id] = {};
            reaksiMap[r.pesan_id][r.emoji] = (reaksiMap[r.pesan_id][r.emoji] || 0) + 1;
        });

        return messages.map(m => ({ ...m, reaksi: reaksiMap[m.id] || {} }));
    } catch (e) {
        console.error('[fetchPesan]', e.message);
        return [];
    }
}

/**
 * Kirim pesan baru — dengan anti-spam localStorage
 */
async function kirimPesan(nama, jurusan, isi, profile = null) {
    // Jam malam
    const h = new Date().getHours();
    if (h >= NIGHT_START || h < NIGHT_END) {
        return { ok: false, message: `⏰ Pengiriman pesan ditutup pukul ${NIGHT_START}.00–0${NIGHT_END}.00` };
    }

    const log = _getLog();
    if (log.banned && log.banExpiry > Date.now()) {
        const sisa = Math.ceil((log.banExpiry - Date.now()) / 3600000);
        return { ok: false, message: `🚫 Kamu dibanned. Aktif kembali ${sisa} jam lagi.` };
    }

    const recent = (log.entries || []).filter(t => Date.now() - t < COOLDOWN_MS);
    if (recent.length >= MAX_PESAN) {
        _saveLog({ banned: true, banExpiry: Date.now() + 72 * 3600000, entries: recent });
        banOtomatis('Terlalu banyak mengirim pesan dalam waktu singkat', 72)
            .catch(() => {});
        return { ok: false, message: '🚫 Batas pesan tercapai. Kamu dibanned selama 72 jam.' };
    }

    try {
        const db  = getSupabaseClient();
        const sid = getSessionId();
        const { error } = await db.from('pesan').insert([{
            nama,
            peran:        profile?.role    || 'Anonim',
            jurusan:      profile?.jurusan || null,
            isi,
            likes:        0,
            session_id:   sid,
            is_approved:  false,
            is_reported:  false,
            report_count: 0,
            status:       'pending',
        }]);
        if (error) throw error;

        recent.push(Date.now());
        _saveLog({ banned: false, banExpiry: null, entries: recent });

        const sisa = MAX_PESAN - recent.length;
        return {
            ok: true,
            message: `📨 Pesan terkirim! Tersisa ${sisa} pesan dalam 4 jam · Menunggu moderasi admin`,
            sisaKuota: sisa,
        };
    } catch (e) {
        console.error('[kirimPesan]', e.message);
        return { ok: false, message: 'Gagal mengirim pesan. Coba lagi.' };
    }
}

/**
 * Toggle like pesan
 */
async function likePesan(pesanId) {
    const db    = getSupabaseClient();
    const sid   = getSessionId();
    const liked = localStorage.getItem(`pds_like_${pesanId}`) === '1';

    try {
        if (liked) {
            await db.from('message_likes').delete()
                .eq('message_id', pesanId).eq('session_id', sid);

            const { data } = await db.from('pesan').select('likes').eq('id', pesanId).single();
            const newLikes = Math.max(0, (data?.likes || 1) - 1);
            await db.from('pesan').update({ likes: newLikes }).eq('id', pesanId);

            localStorage.removeItem(`pds_like_${pesanId}`);
            return { liked: false, count: newLikes };
        } else {
            const { data: existing } = await db.from('message_likes')
                .select('id').eq('message_id', pesanId).eq('session_id', sid).maybeSingle();

            if (!existing) {
                await db.from('message_likes').insert([{ message_id: pesanId, session_id: sid }]);
            }

            const { data } = await db.from('pesan').select('likes').eq('id', pesanId).single();
            const newLikes = (data?.likes || 0) + 1;
            await db.from('pesan').update({ likes: newLikes }).eq('id', pesanId);

            localStorage.setItem(`pds_like_${pesanId}`, '1');
            return { liked: true, count: newLikes };
        }
    } catch (e) {
        console.error('[likePesan]', e.message);
        return { liked, count: null };
    }
}

/**
 * Toggle reaksi emoji pesan
 */
async function reaktPesan(pesanId, emoji) {
    const db      = getSupabaseClient();
    const key     = `pds_react_${pesanId}_${emoji}`;
    const reacted = localStorage.getItem(key) === '1';

    try {
        if (reacted) {
            await db.from('pesan_reaksi').delete()
                .eq('pesan_id', pesanId).eq('emoji', emoji);
            localStorage.removeItem(key);
            return { reacted: false };
        } else {
            await db.from('pesan_reaksi').insert([{ pesan_id: pesanId, emoji }]);
            localStorage.setItem(key, '1');
            return { reacted: true };
        }
    } catch (e) {
        console.error('[reaktPesan]', e.message);
        return { reacted };
    }
}

/**
 * Laporkan pesan
 */
async function laporPesan(pesanId) {
    try {
        const db  = getSupabaseClient();
        const sid = getSessionId();

        await db.from('message_reports').insert([{
            message_id: pesanId,
            session_id: sid,
        }]);

        const { data: curr } = await db
            .from('pesan').select('report_count').eq('id', pesanId).single();
        await db.from('pesan').update({
            is_reported:  true,
            report_count: (curr?.report_count || 0) + 1,
        }).eq('id', pesanId);

        return true;
    } catch (e) {
        console.error('[laporPesan]', e.message);
        return false;
    }
}

// Anti-spam helpers
function _getLog() {
    try { return JSON.parse(localStorage.getItem(LS_PESAN_KEY) || '{}'); }
    catch { return {}; }
}
function _saveLog(data) {
    localStorage.setItem(LS_PESAN_KEY, JSON.stringify(data));
}
function getSisaKuota() {
    const log    = _getLog();
    if (log.banned && log.banExpiry > Date.now()) return -1;
    const recent = (log.entries || []).filter(t => Date.now() - t < COOLDOWN_MS);
    return MAX_PESAN - recent.length;
}
function isBanned() {
    const log = _getLog();
    return log.banned && log.banExpiry > Date.now();
}
// _getSessionId() dihapus — gunakan getSessionId() dari utils.js


// ════════════════════════════════════════════
//  GALERI
// ════════════════════════════════════════════

/**
 * Ambil foto admin dari tabel admin_gallery
 *
 * FIX #1: Tambah parameter `jurusan` — sebelumnya hanya ada `category`,
 * padahal galeri.js memanggil fetchFotoAdmin(category, jurusan).
 * Filter jurusan tidak pernah diterapkan ke query.
 */
async function fetchFotoAdmin(category = 'all', jurusan = 'all') {
    try {
        const db = getSupabaseClient();
        let query = db.from('admin_gallery')
            .select('id, title, description, photo_url, category, display_order, jurusan')
            .eq('is_active', true)
            .order('display_order', { ascending: true });

        if (category !== 'all') query = query.eq('category', category);
        if (jurusan  !== 'all') query = query.eq('jurusan',  jurusan);  // FIX #1

        const { data, error } = await query;
        if (error) throw error;

        const photos = data || [];
        return await _attachReaksiGaleri(photos, 'admin');
    } catch (e) {
        console.error('[fetchFotoAdmin]', e.message);
        return _getDefaultAdminPhotos();
    }
}

/**
 * Ambil foto user dari tabel user_gallery
 */
async function fetchFotoUser(category = 'all') {
    try {
        const db = getSupabaseClient();
        let query = db.from('user_gallery')
            .select('id, title, description, image_url, category, username, likes_count, views_count, created_at')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (category !== 'all') query = query.eq('category', category);

        const { data, error } = await query;
        if (error) throw error;

        const photos = data || [];
        return await _attachReaksiGaleri(photos, 'user');
    } catch (e) {
        console.error('[fetchFotoUser]', e.message);
        return [];
    }
}

async function _attachReaksiGaleri(photos, type) {
    if (!photos.length) return photos;
    try {
        const db  = getSupabaseClient();
        const ids = photos.map(p => p.id);
        const { data } = await db.from('galeri_reaksi')
            .select('galeri_id, emoji').in('galeri_id', ids);

        const map = {};
        (data || []).forEach(r => {
            if (!map[r.galeri_id]) map[r.galeri_id] = {};
            map[r.galeri_id][r.emoji] = (map[r.galeri_id][r.emoji] || 0) + 1;
        });
        return photos.map(p => ({ ...p, reaksi: map[p.id] || {}, _type: type }));
    } catch {
        return photos.map(p => ({ ...p, reaksi: {}, _type: type }));
    }
}

/**
 * Upload foto ke gallery_photos bucket lalu insert ke user_gallery.
 *
 * FIX #2: `file` adalah Blob dari compressImage(), bukan File.
 * Blob tidak punya properti `.name`, sehingga `file.name.split('.')` crash
 * dengan TypeError. Sekarang ekstensi ditentukan dari MIME type Blob.
 */
async function uploadFoto(file, { uploader, role, jurusan, jurusanFoto = null, title, description, category }) {
    const db = getSupabaseClient();

    // FIX #2: deteksi ekstensi dari MIME type Blob, bukan dari file.name
    const mimeToExt = {
        'image/webp': 'webp',
        'image/jpeg': 'jpg',
        'image/png':  'png',
        'image/gif':  'gif',
        'image/avif': 'avif',
    };
    const ext  = mimeToExt[file.type] || 'jpg';
    const path = `user-uploads/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${ext}`;

    try {
        // Upload ke storage
        const { error: upErr } = await db.storage.from(STORAGE_BUCKET).upload(path, file, {
            contentType: file.type || 'image/jpeg',
        });
        if (upErr) throw upErr;

        // Ambil public URL
        const { data: urlData } = db.storage.from(STORAGE_BUCKET).getPublicUrl(path);

        // Insert ke user_gallery
        const { error: dbErr } = await db.from('user_gallery').insert([{
            username:        uploader,
            title:           title || 'Foto tanpa judul',
            description:     description || '',
            image_url:       urlData.publicUrl,
            category:        category || 'umum',
            status:          'pending',
            likes_count:     0,
            views_count:     0,
            user_session_id: getSessionId(),
        }]);
        if (dbErr) throw dbErr;

        return { ok: true, url: urlData.publicUrl };
    } catch (e) {
        console.error('[uploadFoto]', e.message);
        return { ok: false, message: 'Gagal upload: ' + e.message };
    }
}

/**
 * Increment view count
 */
async function incrementView(photoId) {
    try {
        const db = getSupabaseClient();
        await db.rpc('increment_gallery_views', { photo_id: photoId });
    } catch { /* opsional */ }
}

/**
 * Toggle like foto
 */
async function likeUserGallery(photoId, currentLikes) {
    const db    = getSupabaseClient();
    const sid   = getSessionId();
    const liked = localStorage.getItem(`pds_gl_${photoId}`) === '1';

    try {
        if (liked) {
            await db.from('gallery_likes').delete()
                .eq('photo_id', photoId).eq('user_session_id', sid);
            const newLikes = Math.max(0, currentLikes - 1);
            await db.from('user_gallery').update({ likes_count: newLikes }).eq('id', photoId);
            localStorage.removeItem(`pds_gl_${photoId}`);
            return { liked: false, count: newLikes };
        } else {
            const { data: ex } = await db.from('gallery_likes')
                .select('id').eq('photo_id', photoId).eq('user_session_id', sid).maybeSingle();
            if (!ex) {
                await db.from('gallery_likes').insert([{ photo_id: photoId, user_session_id: sid }]);
            }
            const newLikes = currentLikes + 1;
            await db.from('user_gallery').update({ likes_count: newLikes }).eq('id', photoId);
            localStorage.setItem(`pds_gl_${photoId}`, '1');
            return { liked: true, count: newLikes };
        }
    } catch (e) {
        console.error('[likeUserGallery]', e.message);
        return { liked, count: currentLikes };
    }
}

/**
 * Toggle reaksi foto
 */
async function reaktFoto(galeriId, emoji) {
    const db      = getSupabaseClient();
    const key     = `pds_greact_${galeriId}_${emoji}`;
    const reacted = localStorage.getItem(key) === '1';

    try {
        if (reacted) {
            await db.from('galeri_reaksi').delete()
                .eq('galeri_id', galeriId).eq('emoji', emoji);
            localStorage.removeItem(key);
            return { reacted: false };
        } else {
            await db.from('galeri_reaksi').insert([{ galeri_id: galeriId, emoji }]);
            localStorage.setItem(key, '1');
            return { reacted: true };
        }
    } catch (e) {
        console.error('[reaktFoto]', e.message);
        return { reacted };
    }
}

/**
 * Tambah komentar foto
 */
async function tambahKomentar(photoId, comment, username) {
    try {
        const db = getSupabaseClient();
        const { error } = await db.from('gallery_comments').insert([{
            photo_id:        photoId,
            user_session_id: getSessionId(),
            username:        username || 'Pengunjung',
            comment,
        }]);
        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

/**
 * Ambil komentar foto
 */
async function fetchKomentar(photoId) {
    try {
        const db = getSupabaseClient();
        const { data, error } = await db.from('gallery_comments')
            .select('*').eq('photo_id', photoId)
            .order('created_at', { ascending: false });
        if (error) throw error;
        return data || [];
    } catch { return []; }
}

/**
 * Hapus foto user (hanya pemilik)
 */
async function hapusFoto(photoId) {
    try {
        const db = getSupabaseClient();
        const { data: photo } = await db.from('user_gallery')
            .select('image_url').eq('id', photoId).single();

        if (photo?.image_url) {
            const parts    = photo.image_url.split('/');
            const filePath = parts.slice(-2).join('/');
            await db.storage.from(STORAGE_BUCKET).remove([filePath]);
        }

        await db.from('user_gallery').delete().eq('id', photoId);
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

/**
 * Laporkan foto
 */
async function laporFoto(photoId, reason) {
    try {
        const db = getSupabaseClient();
        await db.from('gallery_reports').insert([{
            photo_id:        photoId,
            user_session_id: getSessionId(),
            reason,
        }]);
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}

// ── Default foto admin (fallback kalau DB kosong) ──
function _getDefaultAdminPhotos() {
    return [
        { id: 1, title: 'Kelas TSM 2023',         description: 'Suasana kelas TSM saat praktik',       photo_url: 'https://images.unsplash.com/photo-1581091226033-d5c48150dbaa?w=800', category: 'kelas',   display_order: 1, jurusan: null, reaksi: {}, _type: 'admin' },
        { id: 2, title: 'Praktik MP',              description: 'Praktik administrasi perkantoran',      photo_url: 'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800', category: 'praktik', display_order: 2, jurusan: null, reaksi: {}, _type: 'admin' },
        { id: 3, title: 'Acara Perpisahan',        description: 'Acara perpisahan angkatan',             photo_url: 'https://images.unsplash.com/photo-1511578314322-379afb476865?w=800', category: 'acara',   display_order: 3, jurusan: null, reaksi: {}, _type: 'admin' },
        { id: 4, title: 'Praktik ATP',             description: 'Praktik budidaya tanaman',              photo_url: 'https://images.unsplash.com/photo-1523348837708-15d4a09cfac2?w=800', category: 'praktik', display_order: 4, jurusan: null, reaksi: {}, _type: 'admin' },
        { id: 5, title: 'Ekstrakurikuler Paskibra',description: 'Kegiatan paskibra sekolah',             photo_url: 'https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=800', category: 'ekstra',  display_order: 5, jurusan: null, reaksi: {}, _type: 'admin' },
        { id: 6, title: 'Kelas APHP',              description: 'Suasana kelas APHP',                    photo_url: 'https://images.unsplash.com/photo-1523050854058-8df90110c9f1?w=800', category: 'kelas',   display_order: 6, jurusan: null, reaksi: {}, _type: 'admin' },
    ];
}


// ════════════════════════════════════════════
//  BLOCKED WORDS — fetch dari DB
// ════════════════════════════════════════════

let _blockedWords = null;

async function fetchBlockedWords() {
    try {
        const db = getSupabaseClient();
        const { data, error } = await db
            .from('blocked_words')
            .select('word, severity')
            .eq('is_active', true);

        if (error) throw error;
        _blockedWords = (data || []).map(r => ({
            word:     r.word.toLowerCase().trim(),
            severity: r.severity || 'medium',
        }));
        return _blockedWords;
    } catch (e) {
        console.warn('[fetchBlockedWords] Gagal load dari DB, pakai fallback:', e.message);
        _blockedWords = [];
        return _blockedWords;
    }
}

function getBlockedWords() {
    return _blockedWords || [];
}


// ════════════════════════════════════════════
//  BANNED USERS
// ════════════════════════════════════════════

async function cekBanStatus() {
    try {
        const db  = getSupabaseClient();
        const sid = getSessionId();

        const { data } = await db
            .from('banned_users')
            .select('reason, expires_at, is_permanent, banned_at')
            .eq('session_id', sid)
            .maybeSingle();

        if (!data) return { banned: false };

        if (!data.is_permanent && data.expires_at) {
            if (new Date() > new Date(data.expires_at)) {
                await db.from('banned_users').delete().eq('session_id', sid);
                return { banned: false };
            }
        }

        return {
            banned:      true,
            reason:      data.reason || 'Melanggar aturan penggunaan',
            isPermanent: data.is_permanent || false,
            expiresAt:   data.expires_at,
        };
    } catch (e) {
        console.warn('[cekBanStatus]', e.message);
        return { banned: false };
    }
}

async function banOtomatis(reason = 'Spam otomatis', durationHours = 72) {
    try {
        const db        = getSupabaseClient();
        const sid       = getSessionId();
        const expiresAt = durationHours
            ? new Date(Date.now() + durationHours * 3600000).toISOString()
            : null;

        await db.from('banned_users').upsert([{
            session_id:   sid,
            reason,
            expires_at:   expiresAt,
            is_permanent: !durationHours,
            banned_at:    new Date().toISOString(),
        }], { onConflict: 'session_id' });

        return true;
    } catch (e) {
        console.error('[banOtomatis]', e.message);
        return false;
    }
}

async function unbanUser(sessionId) {
    try {
        const db = getSupabaseClient();
        const { error } = await db
            .from('banned_users')
            .delete()
            .eq('session_id', sessionId);
        if (error) throw error;
        return { ok: true };
    } catch (e) {
        return { ok: false, message: e.message };
    }
}


// ════════════════════════════════════════════
//  SITE CONFIG — generic key-value dari tabel site_config
//  Dipindahkan ke sini dari galeri.js (loadGaleriConfig)
//  dan pesan.js (loadPesanConfig) yang sebelumnya masing-masing
//  punya query inline sendiri.
// ════════════════════════════════════════════

/**
 * Ambil satu nilai dari tabel site_config berdasarkan key.
 * Returns: string value | null
 */
async function fetchSiteConfig(key) {
    try {
        const { data } = await getSupabaseClient()
            .from('site_config')
            .select('value')
            .eq('key', key)
            .maybeSingle();
        return data?.value ?? null;
    } catch { return null; }
}


// ════════════════════════════════════════════
//  JURUSAN PHOTO COUNTS — untuk filter galeri admin
//  Dipindahkan ke sini dari galeri.js (updateAdminJurusanCounts)
//  yang sebelumnya query Supabase langsung dari galeri.js.
// ════════════════════════════════════════════

/**
 * Hitung jumlah foto aktif di admin_gallery per jurusan + total.
 * Returns: { TSM: n, MP: n, ATP: n, APHP: n, _total: n }
 */
async function fetchJurusanPhotoCounts() {
    try {
        const db = getSupabaseClient();
        const results = {};

        await Promise.all(JURUSAN_LIST.map(async j => {
            const { count } = await db.from('admin_gallery')
                .select('*', { count: 'exact', head: true })
                .eq('is_active', true)
                .eq('jurusan', j);
            results[j] = count || 0;
        }));

        const { count: total } = await db.from('admin_gallery')
            .select('*', { count: 'exact', head: true })
            .eq('is_active', true);
        results._total = total || 0;

        return results;
    } catch (e) {
        console.error('[fetchJurusanPhotoCounts]', e);
        return {};
    }
}
