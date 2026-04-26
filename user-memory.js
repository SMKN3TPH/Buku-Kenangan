/**
 * user-memory.js
 * Sistem identitas user — Pernah di Sini
 *
 * Alur:
 * 1. Cek localStorage / cookie → langsung pakai
 * 2. Generate fingerprint device
 * 3. Cek Supabase (user_profiles) pakai fingerprint → pakai kalau ketemu
 * 4. Cek pakai session_id → pakai kalau ketemu, update fingerprint-nya
 * 5. Tidak ketemu → tampilkan modal profil (blocking, tidak bisa ditutup)
 *
 * Setelah profil tersimpan:
 * - localStorage (instant access)
 * - Cookie 30 hari (lintas tab)
 * - Supabase user_profiles (lintas device via fingerprint)
 */

const UserMemory = {
    currentUser: null,  // { name, role, jurusan }

    // ════════════════════════════════
    // COOKIE
    // ════════════════════════════════
    cookie: {
        /**
         * FIX #3: Tambah encodeURIComponent supaya konsisten dengan get().
         * Sebelumnya set() menyimpan raw JSON.stringify tanpa encode,
         * tapi get() mencoba decodeURIComponent — inkonsisten, bisa gagal parse.
         */
        set(name, value, days = 30) {
            const d = new Date();
            d.setTime(d.getTime() + days * 86400000);
            document.cookie = `${name}=${encodeURIComponent(JSON.stringify(value))};expires=${d.toUTCString()};path=/;SameSite=Strict`;
        },

        /**
         * FIX #4: Ganti `const [k, v] = part.split('=')` menjadi split dengan
         * limit agar nilai yang mengandung karakter '=' (misal base64 encoded)
         * tidak terpotong.
         */
        get(name) {
            for (const part of document.cookie.split('; ')) {
                const eqIdx = part.indexOf('=');
                if (eqIdx === -1) continue;
                const k = part.slice(0, eqIdx);
                const v = part.slice(eqIdx + 1); // FIX #4: ambil semua setelah '=' pertama
                if (k === name) {
                    try { return JSON.parse(decodeURIComponent(v)); } catch { return v; }
                }
            }
            return null;
        },

        delete(name) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/`;
        },
    },

    // ════════════════════════════════
    // FINGERPRINT
    // ════════════════════════════════
    fingerprint: {
        async get() {
            let fp = localStorage.getItem('_device_fp');
            if (fp) return fp;
            fp = await this._generate();
            localStorage.setItem('_device_fp', fp);
            return fp;
        },

        async _generate() {
            const isMobile  = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
            const isTablet  = /iPad|Tablet/i.test(navigator.userAgent);
            const deviceType = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop';

            const raw = [
                navigator.userAgent.replace(/[\d.]+/g, '').slice(0, 80),
                navigator.language,
                navigator.languages?.join(',') || '',
                new Date().getTimezoneOffset(),
                navigator.hardwareConcurrency || 0,
                navigator.platform || '',
                deviceType,
                !!window.indexedDB,
                !!window.localStorage,
                !!window.sessionStorage,
                typeof window.ontouchstart !== 'undefined',
                screen.colorDepth,
                isMobile ? `${screen.width}x${screen.height}` : 'desktop',
            ].join('|');

            if (window.crypto?.subtle) {
                const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
                return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
            }
            return btoa(unescape(encodeURIComponent(raw))).replace(/[^a-z0-9]/gi, '').slice(0, 40);
        },
    },

    // ════════════════════════════════
    // SUPABASE HELPERS
    // ════════════════════════════════
    async _findByFingerprint(fp) {
        try {
            const db = getSupabaseClient();
            const { data } = await db
                .from('user_profiles')
                .select('username, role, jurusan')
                .eq('device_fingerprint', fp)
                .maybeSingle();
            return data;
        } catch { return null; }
    },

    async _findBySession(sid) {
        try {
            const db = getSupabaseClient();
            const { data } = await db
                .from('user_profiles')
                .select('username, role, jurusan')
                .eq('session_id', sid)
                .maybeSingle();
            return data;
        } catch { return null; }
    },

    async _create(profile, fp) {
        try {
            const db  = getSupabaseClient();
            const sid = this._sessionId();
            await db.from('user_profiles').upsert([{
                session_id:         sid,
                device_fingerprint: fp,
                username:           profile.name,
                role:               profile.role,
                jurusan:            profile.jurusan || null,
                last_seen:          new Date().toISOString(),
            }], { onConflict: 'device_fingerprint' });
            return true;
        } catch { return false; }
    },

    async _updateFp(sid, fp) {
        try {
            const db = getSupabaseClient();
            await db.from('user_profiles')
                .update({ device_fingerprint: fp, last_seen: new Date().toISOString() })
                .eq('session_id', sid);
        } catch {}
    },

    async _updateLastSeen(fp) {
        try {
            const db = getSupabaseClient();
            await db.from('user_profiles')
                .update({ last_seen: new Date().toISOString() })
                .eq('device_fingerprint', fp);
        } catch {}
    },

    _sessionId() {
        // Didelegasikan ke getSessionId() dari utils.js
        // (sebelumnya duplikat dari _getSessionId() di supabase.js)
        return getSessionId();
    },

    // ════════════════════════════════
    // INIT — panggil di setiap halaman yang butuh profil
    // Returns: user object | null
    // ════════════════════════════════
    async init() {
        // 1. localStorage
        try {
            const cached = localStorage.getItem('_user_profile');
            if (cached) {
                this.currentUser = JSON.parse(cached);
                setTimeout(() => this.fingerprint.get().then(fp => this._updateLastSeen(fp)), 2000);
                return this.currentUser;
            }
        } catch {}

        // 2. Cookie
        const fromCookie = this.cookie.get('_user_profile');
        if (fromCookie) {
            this.currentUser = fromCookie;
            localStorage.setItem('_user_profile', JSON.stringify(fromCookie));
            return this.currentUser;
        }

        // 3. Fingerprint → Supabase
        const fp   = await this.fingerprint.get();
        const byFp = await this._findByFingerprint(fp);
        if (byFp) {
            this.currentUser = { name: byFp.username, role: byFp.role, jurusan: byFp.jurusan };
            this._cacheLocally(this.currentUser);
            return this.currentUser;
        }

        // 4. Session ID → Supabase (fallback lintas halaman)
        const sid   = this._sessionId();
        const bySid = await this._findBySession(sid);
        if (bySid) {
            this.currentUser = { name: bySid.username, role: bySid.role, jurusan: bySid.jurusan };
            this._cacheLocally(this.currentUser);
            this._updateFp(sid, fp);
            return this.currentUser;
        }

        // 5. Tidak ketemu → perlu onboarding
        return null;
    },

    // ════════════════════════════════
    // SAVE — dipanggil setelah modal profil disubmit
    // ════════════════════════════════
    async save(profile) {
        this.currentUser = profile;
        this._cacheLocally(profile);
        const fp = await this.fingerprint.get();
        await this._create(profile, fp);
        return true;
    },

    _cacheLocally(profile) {
        localStorage.setItem('_user_profile', JSON.stringify(profile));
        this.cookie.set('_user_profile', profile, 30);
    },

    // ════════════════════════════════
    // GETTERS
    // ════════════════════════════════
    get() {
        if (this.currentUser) return this.currentUser;
        try {
            const c = localStorage.getItem('_user_profile');
            if (c) { this.currentUser = JSON.parse(c); return this.currentUser; }
        } catch {}
        return null;
    },

    isLoggedIn() {
        return !!this.get();
    },

    // ════════════════════════════════
    // LOGOUT / GANTI PROFIL
    // ════════════════════════════════
    logout() {
        localStorage.removeItem('_user_profile');
        localStorage.removeItem('_device_fp');
        this.cookie.delete('_user_profile');
        this.currentUser = null;
    },
};


// ════════════════════════════════════════════
// PROFILE MODAL — UI blocking onboarding
// ════════════════════════════════════════════

const ProfileModal = {
    el: null,
    onSuccess: null,

    _customSelect(id, placeholder, options) {
        // Build custom styled select dropdown
        const opts = options.map(([val, label]) =>
            `<div class="pf-opt" data-val="${val}" onclick="ProfileModal._pickOpt('${id}','${val}','${label.replace(/'/g,"\\'")}',this)">${label}</div>`
        ).join('');
        return `
            <div class="pf-select-wrap" id="${id}-wrap">
                <div class="pf-select-trigger" id="${id}-trigger" onclick="ProfileModal._toggleDrop('${id}')">
                    <span id="${id}-label" style="color:var(--text-dim)">${placeholder}</span>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </div>
                <div class="pf-select-drop hidden" id="${id}-drop">${opts}</div>
                <input type="hidden" id="${id}" value="">
            </div>`;
    },

    _toggleDrop(id) {
        const drop = document.getElementById(id + '-drop');
        const trigger = document.getElementById(id + '-trigger');
        if (!drop) return;
        // Close all others first
        document.querySelectorAll('.pf-select-drop').forEach(d => {
            if (d.id !== id + '-drop') { d.classList.add('hidden'); }
        });
        drop.classList.toggle('hidden');
        trigger.classList.toggle('open', !drop.classList.contains('hidden'));
    },

    _pickOpt(id, val, label, el) {
        document.getElementById(id).value = val;
        document.getElementById(id + '-label').textContent = label;
        document.getElementById(id + '-label').style.color = 'var(--text)';
        document.getElementById(id + '-drop').classList.add('hidden');
        document.getElementById(id + '-trigger').classList.remove('open');
        // Mark active
        el.closest('.pf-select-drop').querySelectorAll('.pf-opt').forEach(o => o.classList.remove('active'));
        el.classList.add('active');
        // Trigger jurusan/angkatan toggle
        if (id === 'pf-role') ProfileModal.toggleJurusan();
    },

    inject() {
        if (document.getElementById('profile-modal')) return;

        // Inject CSS untuk custom select
        if (!document.getElementById('pf-style')) {
            const s = document.createElement('style');
            s.id = 'pf-style';
            s.textContent = `
                .pf-select-wrap { position:relative; }
                .pf-select-trigger {
                    display:flex; align-items:center; justify-content:space-between;
                    background:var(--bg-raised); border:1px solid var(--border);
                    color:var(--text); padding:11px 14px; cursor:pointer;
                    font-family:'DM Sans',sans-serif; font-size:14px;
                    transition:border-color 0.2s; border-radius:12px;
                    user-select:none;
                }
                .pf-select-trigger:hover,
                .pf-select-trigger.open { border-color:var(--gold-dim); }
                .pf-select-trigger svg { flex-shrink:0; color:var(--text-dim); transition:transform 0.2s; }
                .pf-select-trigger.open svg { transform:rotate(180deg); }
                .pf-select-drop {
                    position:absolute; top:calc(100% + 4px); left:0; right:0;
                    background:var(--bg-card); border:1px solid var(--border-gold);
                    z-index:10; overflow:hidden; border-radius:12px;
                    box-shadow:0 8px 24px rgba(0,0,0,0.5);
                    animation:fadeIn 0.15s ease;
                }
                .pf-select-drop.hidden { display:none; }
                .pf-opt {
                    padding:11px 14px; font-size:13px; color:var(--text-muted);
                    cursor:pointer; transition:background 0.15s,color 0.15s;
                    border-bottom:1px solid var(--border);
                    font-family:'DM Sans',sans-serif;
                }
                .pf-opt:last-child { border-bottom:none; }
                .pf-opt:hover,
                .pf-opt.active { background:var(--bg-raised); color:var(--text); }
                .pf-opt.active::after { content:'✓'; float:right; color:var(--gold); font-size:12px; }
                #profile-modal input[type=text] {
                    background:var(--bg-raised); border:1px solid var(--border);
                    color:var(--text); padding:11px 14px; font-family:'DM Sans',sans-serif;
                    font-size:14px; outline:none; width:100%; transition:border-color 0.2s;
                    border-radius:12px;
                }
                #profile-modal input[type=text]:focus { border-color:var(--gold-dim); }
                .pf-close {
                    position:absolute; top:14px; right:14px; background:none;
                    border:none; font-size:20px; cursor:pointer; color:var(--text-dim);
                    line-height:1; padding:4px 8px; transition:color 0.2s; z-index:10;
                }
                .pf-close:hover { color:var(--text); }
                .pf-info {
                    background:var(--bg-raised); border:1px solid var(--border);
                    padding:12px 14px; margin-bottom:20px; display:flex;
                    gap:10px; align-items:flex-start; border-radius:10px;
                }
            `;
            document.head.appendChild(s);
        }

        const el = document.createElement('div');
        el.id = 'profile-modal';
        el.style.cssText = `
            position:fixed; inset:0; background:rgba(0,0,0,0.82);
            z-index:1000; display:flex; align-items:center; justify-content:center;
            padding:20px; animation:fadeIn 0.3s ease;
        `;

        // Klik luar tutup modal
        el.addEventListener('click', e => {
            if (e.target === el) ProfileModal.dismiss();
        });

        const jurusanSelect = this._customSelect('pf-jurusan', '— Pilih jurusan —', [
            ['TSM',  'TSM — Teknik Sepeda Motor'],
            ['MPLB', 'MPLB — Manajemen Perkantoran dan Layanan Bisnis'],
            ['ATP',  'ATP — Agribisnis Tanaman Perkebunan'],
            ['APHP', 'APHP — Agribisnis Pengolahan Hasil Pertanian'],
        ]);

        const angkatanSelect = this._customSelect('pf-angkatan', '— Pilih angkatan —', [
            ['2026','Angkatan 2026'], ['2025','Angkatan 2025'], ['2024','Angkatan 2024'],
            ['2023','Angkatan 2023'], ['2022','Angkatan 2022'], ['2021','Angkatan 2021'],
            ['2020','Angkatan 2020'], ['2019','Angkatan 2019'], ['2018','Angkatan 2018'],
            ['2017','Angkatan 2017'], ['2016','Angkatan 2016'], ['2015','Angkatan 2015'],
        ]);

        const roleSelect = this._customSelect('pf-role', '— Pilih peranmu —', [
            ['Siswa','Siswa'],
            ['Guru','Guru'],
            ['Alumni','Alumni'],
            ['Anonim','Anonim / Lainnya'],
        ]);

        el.innerHTML = `
            <div style="
                background:var(--bg-card); border:1px solid var(--border);
                max-width:400px; width:100%; padding:36px; position:relative;
                animation:pageIn 0.35s ease; border-radius:20px; max-height:90vh; overflow-y:auto;
            ">
                <div style="position:absolute;top:0;left:0;right:0;height:2px;
                            background:linear-gradient(90deg,transparent,var(--gold),transparent);
                            border-radius:20px 20px 0 0"></div>

                <button class="pf-close" onclick="ProfileModal.dismiss()" title="Tutup">✕</button>

                <div style="text-align:center;margin-bottom:28px;padding-top:8px">
                    <div style="
                        width:52px;height:52px;background:var(--bg-raised);
                        border:1px solid var(--border-gold);display:flex;align-items:center;
                        justify-content:center;margin:0 auto 14px;border-radius:12px;
                        font-family:'Playfair Display',serif;font-size:22px;color:var(--gold)
                    ">✦</div>
                    <h2 style="font-family:'Playfair Display',serif;font-size:21px;font-style:italic;
                               color:var(--text);margin-bottom:6px">Siapa kamu?</h2>
                    <p style="font-size:12px;color:var(--text-muted);line-height:1.6">
                        Isi sekali — tidak perlu lagi di perangkat ini.
                    </p>
                </div>

                <form id="profile-form" onsubmit="return false">
                    <div style="display:flex;flex-direction:column;gap:12px;margin-bottom:20px">

                        <div class="form-field">
                            <label>Nama <span style="color:var(--gold)">*</span></label>
                            <input type="text" id="pf-name" placeholder="Nama kamu"
                                   autocomplete="off" maxlength="50">
                        </div>

                        <div class="form-field">
                            <label>Peran <span style="color:var(--gold)">*</span></label>
                            ${roleSelect}
                        </div>

                        <div class="form-field" id="pf-jurusan-row" style="display:none">
                            <label>Jurusan</label>
                            ${jurusanSelect}
                        </div>

                        <div class="form-field" id="pf-angkatan-row" style="display:none">
                            <label>Angkatan</label>
                            ${angkatanSelect}
                        </div>

                    </div>

                    <div class="pf-info">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--gold)"
                             stroke-width="2" style="flex-shrink:0;margin-top:1px">
                            <circle cx="12" cy="12" r="10"/>
                            <line x1="12" y1="8" x2="12" y2="12"/>
                            <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <p style="font-size:11px;color:var(--text-muted);line-height:1.6;margin:0">
                            Profilmu disimpan di perangkat ini. Namamu akan tampil di setiap pesan dan foto yang kamu kirim.
                        </p>
                    </div>

                    <button type="button" id="pf-submit-btn"
                            onclick="ProfileModal.submit()"
                            style="width:100%;background:var(--gold);border:none;color:var(--bg);
                                   font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;
                                   letter-spacing:1.5px;text-transform:uppercase;padding:15px;
                                   cursor:pointer;transition:background 0.2s;border-radius:40px;">
                        Lanjutkan →
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(el);
        this.el = el;

        // Re-attach click outside after innerHTML (karena el.innerHTML overwrite listener)
        el.addEventListener('click', e => {
            if (e.target === el) ProfileModal.dismiss();
        });

        // Close drop on outside click
        document.addEventListener('click', e => {
            if (!e.target.closest('.pf-select-wrap')) {
                document.querySelectorAll('.pf-select-drop').forEach(d => d.classList.add('hidden'));
                document.querySelectorAll('.pf-select-trigger').forEach(t => t.classList.remove('open'));
            }
        }, { capture: true });

        setTimeout(() => document.getElementById('pf-name')?.focus(), 300);
    },

    dismiss() {
        if (this.el) {
            this.el.style.animation = 'fadeOut 0.2s ease forwards';
            setTimeout(() => { this.el?.remove(); this.el = null; }, 200);
        }
        document.body.style.overflow = 'auto';
    },

    toggleJurusan() {
        const role = document.getElementById('pf-role')?.value;
        const jRow = document.getElementById('pf-jurusan-row');
        const aRow = document.getElementById('pf-angkatan-row');
        const showJurusan = role === 'Siswa' || role === 'Alumni';
        const showAngkatan = role === 'Alumni';
        if (jRow) jRow.style.display = showJurusan ? 'flex' : 'none';
        if (aRow) aRow.style.display = showAngkatan ? 'flex' : 'none';
    },

    async submit() {
        const name     = document.getElementById('pf-name')?.value.trim();
        const role     = document.getElementById('pf-role')?.value;
        const jurusan  = document.getElementById('pf-jurusan')?.value || null;
        const angkatan = document.getElementById('pf-angkatan')?.value || null;

        const namaErr = validasiNamaManusia(name);
        if (namaErr) {
            this._shake('pf-name');
            showProfileToast(namaErr, 'error');
            return;
        }
        if (!role) {
            showProfileToast('Pilih peranmu terlebih dahulu', 'error');
            return;
        }

        const btn = document.getElementById('pf-submit-btn');
        if (btn) { btn.textContent = 'Menyimpan…'; btn.disabled = true; }

        const profile = { name, role, jurusan, ...(angkatan ? { angkatan } : {}) };
        await UserMemory.save(profile);

        this.dismiss();
        showWelcomeNew(profile);

        if (typeof this.onSuccess === 'function') this.onSuccess(profile);
    },

    _shake(inputId) {
        const el = document.getElementById(inputId);
        if (!el) return;
        el.style.animation = 'shake 0.3s ease';
        setTimeout(() => el.style.animation = '', 400);
    },

    show(onSuccess) {
        this.onSuccess = onSuccess || null;
        document.body.style.overflow = 'hidden';
        this.inject();
    },
};


// ════════════════════════════════════════════
// WELCOME NOTIFICATIONS
// ════════════════════════════════════════════

function showWelcomeBack(user) {
    const msgs = {
        TSM:  'Siap-siap kangen sama bengkel dan suara motor ya? 🏍️',
        MPLB: 'Jangan lupa kenangan di lab administrasi! 📋',
        ATP:  'Tanaman-tanamanmu pasti kangen disiram! 🌱',
        APHP: 'Masak bareng lagi yuk? 🍳',
    };
    const sub = user.role === 'Guru'
        ? 'Terima kasih sudah mendidik kami 🙏'
        : user.role === 'Alumni'
        ? 'Welcome back, alumni! 🎓'
        : msgs[user.jurusan] || 'Selamat datang kembali! 👋';

    _showToastCard(`Halo lagi, <strong>${escHtml(user.name)}!</strong>`, sub);
}

function showWelcomeNew(profile) {
    const msgs = {
        TSM:  'Suara motor TSM paling kencang! 🏍️',
        MPLB: 'Admin terbaik angkatan! 📋',
        ATP:  'Green thumb sejati! 🌱',
        APHP: 'Chef berbakat! 🍳',
    };
    const sub = profile.role === 'Guru'
        ? 'Terima kasih Pak/Bu, sudah bergabung! 🙏'
        : profile.role === 'Alumni'
        ? 'Welcome back, alumni! 🎓'
        : msgs[profile.jurusan] || 'Selamat bergabung! 👋';

    _showToastCard(`Hai, <strong>${escHtml(profile.name)}!</strong>`, sub);
}

function _showToastCard(title, sub) {
    const card = document.createElement('div');
    card.style.cssText = `
        position:fixed; bottom:24px; left:50%; transform:translateX(-50%) translateY(80px);
        background:var(--bg-card); border:1px solid var(--border-gold);
        padding:16px 24px; z-index:9997; font-size:13px; color:var(--text);
        min-width:240px; text-align:center; transition:transform 0.35s ease;
        pointer-events:none;
    `;
    card.innerHTML = `<div>${title}</div><div style="font-size:11px;color:var(--text-muted);margin-top:4px">${sub}</div>`;
    document.body.appendChild(card);
    requestAnimationFrame(() => {
        requestAnimationFrame(() => { card.style.transform = 'translateX(-50%) translateY(0)'; });
    });
    setTimeout(() => {
        card.style.transform = 'translateX(-50%) translateY(80px)';
        setTimeout(() => card.remove(), 400);
    }, 3500);
}

function showProfileToast(msg, type = 'info') {
    const t = document.getElementById('toast');
    if (t) {
        t.textContent = msg;
        t.classList.add('show');
        clearTimeout(t._t);
        t._t = setTimeout(() => t.classList.remove('show'), 3000);
        return;
    }
    // Fallback kalau tidak ada toast element
    alert(msg);
}

// escHtmlProfile() dihapus — semua referensi diganti ke escHtml() dari utils.js


// ════════════════════════════════════════════
// INJECT CSS ANIMATIONS
// ════════════════════════════════════════════
(function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `
        @keyframes fadeIn  { from{opacity:0} to{opacity:1} }
        @keyframes fadeOut { from{opacity:1} to{opacity:0} }
        @keyframes shake   {
            0%,100%{transform:translateX(0)}
            20%{transform:translateX(-6px)}
            40%{transform:translateX(6px)}
            60%{transform:translateX(-4px)}
            80%{transform:translateX(4px)}
        }

        #profile-chip {
            display:inline-flex; align-items:center; gap:8px;
            background:var(--bg-card); border:1px solid var(--border);
            padding:5px 10px; cursor:pointer; transition:border-color 0.2s;
            font-family:'DM Sans',sans-serif; font-size:11px; color:var(--text-muted);
            flex-shrink:0; white-space:nowrap; margin-left:4px;
        }
        #profile-chip:hover { border-color:var(--border-gold); color:var(--text); }
        #profile-chip .chip-avatar {
            width:22px; height:22px; background:var(--gold-dim);
            display:flex; align-items:center; justify-content:center;
            font-size:11px; font-weight:700; color:var(--bg);
            font-family:'Playfair Display',serif; flex-shrink:0;
        }

        #rename-modal-overlay {
            position:fixed; inset:0; background:rgba(0,0,0,0.82);
            z-index:600; display:none; align-items:center; justify-content:center; padding:20px;
        }
        #rename-modal-overlay.open { display:flex; }
        #rename-modal-box {
            background:var(--bg-card); border:1px solid var(--border);
            max-width:380px; width:100%; padding:32px; position:relative; animation:pageIn 0.3s ease;
        }
        #rename-modal-box::before {
            content:''; position:absolute; top:0; left:0; right:0; height:2px;
            background:linear-gradient(90deg, transparent, var(--gold), transparent);
        }
    `;
    document.head.appendChild(style);
})();


// ════════════════════════════════════════════
// PROFILE CHIP — tampil di navbar setelah login
// ════════════════════════════════════════════
function injectProfileChip(user) {
    const nav = document.querySelector('.navbar-links');
    if (!nav || document.getElementById('profile-chip')) return;

    const chip    = document.createElement('div');
    chip.id       = 'profile-chip';
    chip.title    = 'Lihat profil';
    chip.onclick  = () => RenameModal.show(UserMemory.get() || user);

    const initial = (user.name || '?').charAt(0).toUpperCase();
    const jurusanDisplay = user.jurusan ? getJurusanLabel(user.jurusan) : '';
    chip.innerHTML = `
        <div class="chip-avatar">${escHtml(initial)}</div>
        <span>${escHtml(user.name)}</span>
    `;
    nav.appendChild(chip);
}


// ════════════════════════════════════════════
// MAIN INIT FUNCTION — panggil di galeri.html & pesan.html
// initUserSession(onReady) → onReady(user) dipanggil kalau profil sudah ada
// ════════════════════════════════════════════
async function initUserSession(onReady) {
    let user = await UserMemory.init();

    if (user) {
        await applyApprovedRename();
        user = UserMemory.get() || user;

        injectProfileChip(user);

        if (!sessionStorage.getItem('_welcomed')) {
            sessionStorage.setItem('_welcomed', '1');
            showWelcomeBack(user);
        }

        if (typeof onReady === 'function') onReady(user);
    } else {
        ProfileModal.show((newUser) => {
            sessionStorage.setItem('_welcomed', '1');
            injectProfileChip(newUser);
            if (typeof onReady === 'function') onReady(newUser);
        });
    }
}


// ════════════════════════════════════════════
// VALIDASI NAMA MANUSIA
// ════════════════════════════════════════════

const BUKAN_NAMA = [
    'test','admin','user','guest','anonymous','anonim','unknown',
    'null','undefined','none','no name','noname','abc','xyz',
    'asdf','qwerty','lorem','ipsum','haha','wkwk','ngab',
    'babi','anjing','monyet','goblok','tolol','idiot','kontol',
    'memek','bangsat','bajingan','setan','iblis','lonte',
    'fuck','shit','bitch','asshole','bastard',
];

function validasiNamaManusia(nama) {
    if (!nama || typeof nama !== 'string') return 'Nama tidak boleh kosong';

    const trimmed = nama.trim();

    if (trimmed.length < 2)  return 'Nama minimal 2 karakter';
    if (trimmed.length > 50) return 'Nama maksimal 50 karakter';

    if (!/^[a-zA-ZÀ-ÖØ-öø-ÿ\s.\-']+$/.test(trimmed))
        return 'Nama hanya boleh mengandung huruf dan spasi';

    if (/^(.)\1+$/.test(trimmed.replace(/\s/g, '')))
        return 'Nama tidak valid';

    if (!/[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(trimmed))
        return 'Nama harus mengandung huruf';

    const lower = trimmed.toLowerCase();
    for (const kata of BUKAN_NAMA) {
        if (lower === kata) return 'Gunakan nama aslimu ya 😊';
    }

    const words = trimmed.split(/\s+/);
    if (words.length === 1 && words[0].length < 2)
        return 'Nama terlalu pendek';

    return null;
}


// ════════════════════════════════════════════
// RENAME MODAL — ganti nama dengan request ke admin
// ════════════════════════════════════════════

const RenameModal = {
    _user: null,

    show(user) {
        this._user = user;

        if (!document.getElementById('rename-modal-overlay')) {
            this._inject();
        }

        const input = document.getElementById('rename-input');
        if (input) { input.value = user.name; input.disabled = false; input.style.opacity = '1'; input.select(); }
        document.getElementById('rename-status')?.remove();

        const btn = document.getElementById('rename-submit-btn');
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'Kirim Permintaan'; }

        const errEl = document.getElementById('rename-error');
        if (errEl) { errEl.style.display = 'none'; }

        document.getElementById('rename-modal-overlay').classList.add('open');
        document.body.style.overflow = 'hidden';

        this._checkPending(user);
    },

    close() {
        document.getElementById('rename-modal-overlay')?.classList.remove('open');
        document.body.style.overflow = '';
    },

    _inject() {
        const el = document.createElement('div');
        el.id    = 'rename-modal-overlay';
        el.innerHTML = `
            <div id="rename-modal-box">
                <button onclick="RenameModal.close()"
                        style="position:absolute;top:14px;right:14px;background:none;border:none;
                               font-size:20px;cursor:pointer;color:var(--text-muted);line-height:1;
                               transition:color 0.2s"
                        onmouseover="this.style.color='var(--text)'"
                        onmouseout="this.style.color='var(--text-muted)'">×</button>

                <h3 style="font-family:'Playfair Display',serif;font-size:20px;font-style:italic;
                           color:var(--text);margin-bottom:6px">Profil Kamu</h3>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:24px" id="rename-subtitle"></p>

                <div id="rename-profile-info"
                     style="background:var(--bg-raised);border:1px solid var(--border);
                            padding:14px;margin-bottom:20px;font-size:13px;color:var(--text-muted)">
                </div>

                <div style="margin-bottom:20px">
                    <label style="font-size:10px;letter-spacing:1.5px;text-transform:uppercase;
                                  color:var(--text-dim);display:block;margin-bottom:8px">
                        Nama Baru
                    </label>
                    <input id="rename-input" type="text" maxlength="50"
                           placeholder="Ketik nama baru…"
                           style="width:100%;background:var(--bg-raised);border:1px solid var(--border);
                                  color:var(--text);padding:10px 14px;font-family:'DM Sans',sans-serif;
                                  font-size:14px;outline:none;transition:border-color 0.2s"
                           onfocus="this.style.borderColor='var(--gold-dim)'"
                           onblur="this.style.borderColor='var(--border)'"
                           onkeydown="if(event.key==='Enter') RenameModal.submit()">
                    <p id="rename-error"
                       style="font-size:11px;color:#E05C50;margin-top:6px;display:none"></p>
                </div>

                <div style="background:rgba(185,155,90,0.06);border:1px solid var(--border-gold);
                            padding:12px 14px;margin-bottom:20px;display:flex;gap:10px;align-items:flex-start">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
                         stroke="var(--gold)" stroke-width="2" style="flex-shrink:0;margin-top:1px">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="12" y1="8" x2="12" y2="12"/>
                        <line x1="12" y1="16" x2="12.01" y2="16"/>
                    </svg>
                    <p style="font-size:11px;color:var(--text-muted);line-height:1.6">
                        Permintaan ganti nama akan ditinjau oleh admin sebelum berlaku.
                        Gunakan nama aslimu ya.
                    </p>
                </div>

                <div style="display:flex;gap:10px">
                    <button onclick="RenameModal.close()"
                            style="flex:1;background:none;border:1px solid var(--border);
                                   padding:12px;font-family:'DM Sans',sans-serif;font-size:12px;
                                   color:var(--text-muted);cursor:pointer;transition:all 0.2s;letter-spacing:1px;text-transform:uppercase"
                            onmouseover="this.style.borderColor='var(--border-gold)';this.style.color='var(--text)'"
                            onmouseout="this.style.borderColor='var(--border)';this.style.color='var(--text-muted)'">
                        Tutup
                    </button>
                    <button id="rename-submit-btn"
                            onclick="RenameModal.submit()"
                            style="flex:2;background:var(--gold);border:none;
                                   padding:12px;font-family:'DM Sans',sans-serif;font-size:12px;font-weight:500;
                                   color:var(--bg);cursor:pointer;transition:background 0.2s;letter-spacing:1px;text-transform:uppercase"
                            onmouseover="this.style.background='var(--gold-bright)'"
                            onmouseout="this.style.background='var(--gold)'">
                        Kirim Permintaan
                    </button>
                </div>
            </div>
        `;

        el.addEventListener('click', e => {
            if (e.target === el) this.close();
        });

        document.body.appendChild(el);
    },

    _setProfile(user) {
        const sub  = document.getElementById('rename-subtitle');
        const info = document.getElementById('rename-profile-info');
        if (sub)  sub.textContent = `Sesi aktif sebagai ${user.name}`;
        if (info) info.innerHTML = `
            <div style="display:flex;flex-direction:column;gap:6px">
                <div style="display:flex;justify-content:space-between">
                    <span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;text-transform:uppercase">Nama</span>
                    <span style="color:var(--text)">${escHtml(user.name)}</span>
                </div>
                <div style="display:flex;justify-content:space-between">
                    <span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;text-transform:uppercase">Peran</span>
                    <span style="color:var(--text)">${escHtml(user.role)}</span>
                </div>
                ${user.jurusan ? `
                <div style="display:flex;justify-content:space-between">
                    <span style="color:var(--text-dim);font-size:11px;letter-spacing:1px;text-transform:uppercase">Jurusan</span>
                    <span style="color:var(--text)">${escHtml(getJurusanLabel(user.jurusan))}</span>
                </div>` : ''}
            </div>
        `;
    },

    async _checkPending(user) {
        this._setProfile(user);
        try {
            const db = getSupabaseClient();
            const fp = await UserMemory.fingerprint.get();
            const { data } = await db
                .from('user_change_requests')
                .select('new_name, status, created_at')
                .eq('device_fingerprint', fp)
                .eq('status', 'pending')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data) {
                const input = document.getElementById('rename-input');
                const btn   = document.getElementById('rename-submit-btn');
                const errEl = document.getElementById('rename-error');
                if (input) { input.value = data.new_name; input.disabled = true; input.style.opacity = '0.5'; }
                if (btn)   { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = 'Menunggu Persetujuan'; }
                if (errEl) {
                    errEl.style.color   = 'var(--gold)';
                    errEl.textContent   = `Permintaan ganti nama ke "${data.new_name}" sedang ditinjau admin.`;
                    errEl.style.display = 'block';
                }
            }
        } catch { /* silent */ }
    },

    async submit() {
        const newName = document.getElementById('rename-input')?.value.trim();
        const errEl   = document.getElementById('rename-error');

        if (errEl) { errEl.style.display = 'none'; errEl.style.color = '#E05C50'; }

        const err = validasiNamaManusia(newName);
        if (err) {
            if (errEl) { errEl.textContent = err; errEl.style.display = 'block'; }
            document.getElementById('rename-input')?.focus();
            return;
        }

        if (newName.toLowerCase() === this._user?.name?.toLowerCase()) {
            if (errEl) { errEl.textContent = 'Nama baru sama dengan nama sekarang.'; errEl.style.display = 'block'; }
            return;
        }

        const btn = document.getElementById('rename-submit-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Mengirim…'; }

        try {
            const db = getSupabaseClient();
            const fp = await UserMemory.fingerprint.get();

            const { data: existing } = await db
                .from('user_change_requests')
                .select('id')
                .eq('device_fingerprint', fp)
                .eq('status', 'pending')
                .maybeSingle();

            if (existing) {
                if (errEl) {
                    errEl.style.color   = 'var(--gold)';
                    errEl.textContent   = 'Kamu sudah punya permintaan yang sedang ditinjau. Tunggu ya!';
                    errEl.style.display = 'block';
                }
                if (btn) { btn.disabled = false; btn.textContent = 'Kirim Permintaan'; }
                return;
            }

            const { error } = await db.from('user_change_requests').insert([{
                device_fingerprint: fp,
                old_name:           this._user.name,
                new_name:           newName,
                role:               this._user.role,
                jurusan:            this._user.jurusan || null,
                status:             'pending',
            }]);

            if (error) throw error;

            if (btn) { btn.disabled = true; btn.style.opacity = '0.5'; btn.textContent = 'Menunggu Persetujuan'; }
            const input = document.getElementById('rename-input');
            if (input) { input.disabled = true; input.style.opacity = '0.5'; }
            if (errEl) {
                errEl.style.color   = 'var(--gold)';
                errEl.textContent   = `✓ Permintaan terkirim! Namamu akan berubah ke "${newName}" setelah admin menyetujui.`;
                errEl.style.display = 'block';
            }

        } catch (e) {
            if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.textContent = 'Kirim Permintaan'; }
            if (errEl) { errEl.textContent = 'Gagal mengirim permintaan. Coba lagi.'; errEl.style.display = 'block'; }
        }
    },
};


// ════════════════════════════════════════════
// TERAPKAN APPROVED RENAME
// ════════════════════════════════════════════
async function applyApprovedRename() {
    try {
        const db = getSupabaseClient();
        const fp = await UserMemory.fingerprint.get();

        const { data } = await db
            .from('user_change_requests')
            .select('new_name, role, jurusan')
            .eq('device_fingerprint', fp)
            .eq('status', 'approved')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (!data) return;

        const currentProfile = UserMemory.get();
        if (currentProfile && currentProfile.name !== data.new_name) {
            const updated = { ...currentProfile, name: data.new_name };
            UserMemory._cacheLocally(updated);
            UserMemory.currentUser = updated;

            await db.from('user_profiles')
                .update({ username: data.new_name })
                .eq('device_fingerprint', fp);

            await db.from('user_change_requests')
                .update({ status: 'applied' })
                .eq('device_fingerprint', fp)
                .eq('status', 'approved');

            // Update chip nama di navbar juga
            const chipName = document.querySelector('#profile-chip span');
            if (chipName) chipName.textContent = updated.name;
            const chipAvatar = document.querySelector('#profile-chip .chip-avatar');
            if (chipAvatar) chipAvatar.textContent = updated.name.charAt(0).toUpperCase();
        }
    } catch { /* silent */ }
}
