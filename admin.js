// ========== ADMIN DASHBOARD ==========
// File ini bekerja bersama admin.html

let currentTab = 'foto';
let currentFilter = 'pending';

// ========== INIT ==========
document.addEventListener('DOMContentLoaded', () => {
    // Cek session aktif
    getSupabaseClient().auth.getSession().then(({ data }) => {
        if (data.session) {
            showDashboard();
        }
    });

    // Form login
    document.getElementById('login-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        doLogin();
    });

    // Logout
    document.getElementById('logout-btn').addEventListener('click', doLogout);

    // Refresh
    document.getElementById('refresh-btn').addEventListener('click', () => {
        loadStats();
        loadContent();
    });
});

// ========== LOGIN / LOGOUT ==========
async function doLogin() {
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const errBox   = document.getElementById('login-error');
    const errMsg   = document.getElementById('login-error-msg');

    errBox.classList.add('hidden');
    showLoading(true);

    const { error } = await getSupabaseClient().auth.signInWithPassword({ email, password });

    showLoading(false);

    if (error) {
        errMsg.textContent = 'Email atau password salah.';
        errBox.classList.remove('hidden');
        document.getElementById('login-password').value = '';
        return;
    }

    showDashboard();
}

async function doLogout() {
    await getSupabaseClient().auth.signOut();
    document.getElementById('dashboard-section').classList.add('hidden');
    document.getElementById('login-section').classList.remove('hidden');
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function showDashboard() {
    document.getElementById('login-section').classList.add('hidden');
    document.getElementById('dashboard-section').classList.remove('hidden');
    loadStats();
    loadContent();
}

// ========== STATISTIK ==========
async function loadStats() {
    try {
        const [pesanRes, fotoRes, msgRep, galRep, feedRes] = await Promise.all([
            getSupabaseClient().from('pesan').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            getSupabaseClient().from('user_gallery').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
            getSupabaseClient().from('message_reports').select('*', { count: 'exact', head: true }),
            getSupabaseClient().from('gallery_reports').select('*', { count: 'exact', head: true }),
            getSupabaseClient().from('feedbacks').select('*', { count: 'exact', head: true })
        ]);

        const pesanPending = pesanRes.count || 0;
        const fotoPending  = fotoRes.count  || 0;
        const laporan      = (msgRep.count || 0) + (galRep.count || 0);
        const feedback     = feedRes.count || 0;

        document.getElementById('stat-pesan').textContent    = pesanPending;
        document.getElementById('stat-foto').textContent     = fotoPending;
        document.getElementById('stat-laporan').textContent  = laporan;
        document.getElementById('stat-feedback').textContent = feedback;

        setBadge('foto',    fotoPending);
        setBadge('pesan',   pesanPending);
        setBadge('laporan', laporan);

        // Navbar pending count (dari html asli)
        const totalPendingEl = document.getElementById('total-pending');
        if (totalPendingEl) totalPendingEl.textContent = fotoPending + pesanPending;

    } catch { /* silent */ }
}

function setBadge(tab, count) {
    const el = document.getElementById('badge-' + tab);
    if (!el) return;
    if (count > 0) {
        el.textContent = count > 99 ? '99+' : count;
        el.classList.remove('hidden');
    } else {
        el.classList.add('hidden');
    }
}

// ========== TAB & FILTER ==========
function switchTab(tab) {
    currentTab = tab;
    currentFilter = 'pending';

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById('tab-' + tab).classList.add('active');

    // Reset filter ke pending
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-status="pending"]').classList.add('active');

    // Sembunyikan filter untuk tab laporan & feedback
    const filterRow = document.getElementById('filter-row');
    if (filterRow) {
        filterRow.style.display = (tab === 'laporan' || tab === 'feedback') ? 'none' : 'flex';
    }

    loadContent();
}

function setFilter(status) {
    currentFilter = status;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`[data-status="${status}"]`).classList.add('active');
    loadContent();
}

// ========== LOAD CONTENT ==========
async function loadContent() {
    // Pastikan session masih valid
    const { data: { session } } = await getSupabaseClient().auth.getSession();
    if (!session) {
        doLogout();
        return;
    }

    const area = document.getElementById('content-area');
    area.innerHTML = `<div class="flex justify-center py-16"><i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;

    try {
        if (currentTab === 'foto')     await loadFoto(area);
        if (currentTab === 'pesan')    await loadPesan(area);
        if (currentTab === 'laporan')  await loadLaporan(area);
        if (currentTab === 'feedback') await loadFeedback(area);
    } catch {
        area.innerHTML = `
            <div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat data. Coba refresh.</p>
            </div>`;
    }
}

// ========== TAB FOTO ==========
async function loadFoto(area) {
    let query = getSupabaseClient().from('user_gallery').select('*').order('created_at', { ascending: false });
    if (currentFilter !== 'all') query = query.eq('status', currentFilter);

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
        area.innerHTML = emptyState(
            currentFilter === 'pending' ? 'Semua Foto Telah Dimoderasi' : `Tidak ada foto "${currentFilter}"`,
            currentFilter === 'pending' ? 'Tidak ada foto yang menunggu persetujuan.' : ''
        );
        return;
    }

    area.innerHTML = `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">${data.map(renderFotoCard).join('')}</div>`;
}

function renderFotoCard(f) {
    const time   = formatTime(f.created_at);
    const status = `<span class="status-${f.status}">${f.status}</span>`;
    const actions = f.status === 'pending' ? `
        <button class="btn-approve flex-1" onclick="approveItem('foto', ${f.id})">
            <i class="fas fa-check mr-1"></i>Approve
        </button>
        <button class="btn-reject flex-1" onclick="rejectItem('foto', ${f.id})">
            <i class="fas fa-times mr-1"></i>Tolak
        </button>
        <button class="btn-delete" onclick="deleteItem('foto', ${f.id}, '${escAttr(f.image_url)}')">
            <i class="fas fa-trash"></i>
        </button>
    ` : `
        <button class="btn-delete w-full" onclick="deleteItem('foto', ${f.id}, '${escAttr(f.image_url)}')">
            <i class="fas fa-trash mr-1"></i>Hapus Foto
        </button>
    `;

    return `
        <div class="card" id="item-foto-${f.id}">
            <div class="aspect-w-16 relative" style="padding-bottom:56.25%;">
                <img src="${f.image_url}" alt="${escHtml(f.title)}"
                     class="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition"
                     onclick="openImgModal('${escAttr(f.image_url)}')">
            </div>
            <div class="p-4">
                <div class="flex items-start justify-between gap-2 mb-1">
                    <span class="font-semibold text-gray-800 text-sm">${escHtml(f.title || '')}</span>
                    ${status}
                </div>
                <p class="text-xs text-gray-500 mb-1">${escHtml(f.description || '—')}</p>
                <div class="flex items-center justify-between text-xs text-gray-400 mb-4">
                    <span><i class="fas fa-user mr-1"></i>${escHtml(f.username || 'Anonim')}</span>
                    <span class="bg-gray-100 px-2 py-0.5 rounded">${escHtml(f.category || '')}</span>
                    <span>${time}</span>
                </div>
                <div class="flex gap-2">${actions}</div>
            </div>
        </div>
    `;
}

// ========== TAB PESAN ==========
async function loadPesan(area) {
    let query = getSupabaseClient().from('pesan').select('*').order('created_at', { ascending: false });
    if (currentFilter !== 'all') query = query.eq('status', currentFilter);

    const { data, error } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
        area.innerHTML = emptyState(
            currentFilter === 'pending' ? 'Semua Pesan Telah Dimoderasi' : `Tidak ada pesan "${currentFilter}"`,
            ''
        );
        return;
    }

    area.innerHTML = `<div class="space-y-4">${data.map(renderPesanCard).join('')}</div>`;
}

function renderPesanCard(p) {
    const time      = formatTime(p.created_at);
    const status    = `<span class="status-${p.status}">${p.status}</span>`;
    const roleLabel = [p.peran, p.jurusan].filter(Boolean).map(escHtml).join(' · ');
    const actions   = p.status === 'pending' ? `
        <button class="btn-approve" onclick="approveItem('pesan', ${p.id})">
            <i class="fas fa-check mr-1"></i>Approve
        </button>
        <button class="btn-reject" onclick="rejectItem('pesan', ${p.id})">
            <i class="fas fa-times mr-1"></i>Tolak
        </button>
    ` : `
        <button class="btn-delete" onclick="deleteItem('pesan', ${p.id})">
            <i class="fas fa-trash mr-1"></i>Hapus
        </button>
    `;

    return `
        <div class="card p-5" id="item-pesan-${p.id}">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1 flex-wrap">
                        <span class="font-semibold text-gray-800">${escHtml(p.nama || 'Anonim')}</span>
                        <span class="text-xs text-gray-400">${roleLabel}</span>
                        ${status}
                    </div>
                    <p class="text-sm text-gray-600 leading-relaxed mt-2">${escHtml(p.isi || '')}</p>
                    <p class="text-xs text-gray-400 mt-3">${time}</p>
                </div>
                <div class="flex gap-2 flex-shrink-0">${actions}</div>
            </div>
        </div>
    `;
}

// ========== TAB LAPORAN ==========
async function loadLaporan(area) {
    const [msgRep, galRep] = await Promise.all([
        getSupabaseClient().from('message_reports')
            .select('*, pesan(id, nama, isi, peran, jurusan, status)')
            .order('created_at', { ascending: false }),
        getSupabaseClient().from('gallery_reports')
            .select('*, user_gallery(id, username, title, image_url, status)')
            .order('created_at', { ascending: false })
    ]);

    const pesanLaporan = (msgRep.data || []).map(r => ({ ...r, _type: 'pesan' }));
    const fotoLaporan  = (galRep.data  || []).map(r => ({ ...r, _type: 'foto' }));
    const all = [...pesanLaporan, ...fotoLaporan]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    if (all.length === 0) {
        area.innerHTML = emptyState('Tidak Ada Laporan', 'Semua konten aman, tidak ada laporan masuk.');
        return;
    }

    area.innerHTML = `<div class="space-y-4">${all.map(renderLaporanCard).join('')}</div>`;
}

function renderLaporanCard(r) {
    const time = formatTime(r.created_at);

    if (r._type === 'pesan' && r.pesan) {
        const p = r.pesan;
        return `
            <div class="card p-5 border-l-4 border-l-yellow-400">
                <div class="flex items-start justify-between gap-4 flex-wrap">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-xs font-semibold text-yellow-600 uppercase tracking-wider">Laporan Pesan</span>
                            <span class="status-${p.status || 'pending'}">${p.status || 'pending'}</span>
                        </div>
                        <p class="text-sm text-gray-700">"${escHtml(p.isi || '')}"</p>
                        <p class="text-xs text-gray-400 mt-2">Dilaporkan ${time}</p>
                    </div>
                    <div class="flex gap-2 flex-shrink-0">
                        <button class="btn-reject" onclick="rejectItem('pesan', ${p.id})">
                            <i class="fas fa-ban mr-1"></i>Tolak Pesan
                        </button>
                        <button class="btn-delete" onclick="deleteLaporan('message_reports', ${r.id})">
                            <i class="fas fa-check mr-1"></i>Abaikan
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    if (r._type === 'foto' && r.user_gallery) {
        const f = r.user_gallery;
        return `
            <div class="card p-5 border-l-4 border-l-orange-400">
                <div class="flex items-start gap-4 flex-wrap">
                    <img src="${f.image_url}" alt=""
                         class="w-24 h-20 object-cover rounded-lg cursor-pointer hover:opacity-80 transition flex-shrink-0"
                         onclick="openImgModal('${escAttr(f.image_url)}')">
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 mb-1">
                            <span class="text-xs font-semibold text-orange-600 uppercase tracking-wider">Laporan Foto</span>
                            <span class="status-${f.status || 'pending'}">${f.status || 'pending'}</span>
                        </div>
                        <p class="text-sm font-medium text-gray-800">${escHtml(f.title || '')}</p>
                        <p class="text-xs text-gray-500">oleh ${escHtml(f.username || 'Anonim')}</p>
                        ${r.reason ? `<p class="text-xs text-orange-600 mt-1">Alasan: ${escHtml(r.reason)}</p>` : ''}
                        <p class="text-xs text-gray-400 mt-1">Dilaporkan ${time}</p>
                    </div>
                    <div class="flex flex-col gap-2 flex-shrink-0">
                        <button class="btn-reject" onclick="rejectItem('foto', ${f.id})">
                            <i class="fas fa-ban mr-1"></i>Tolak Foto
                        </button>
                        <button class="btn-delete" onclick="deleteLaporan('gallery_reports', ${r.id})">
                            <i class="fas fa-check mr-1"></i>Abaikan
                        </button>
                    </div>
                </div>
            </div>
        `;
    }

    return '';
}

// ========== TAB FEEDBACK ==========
async function loadFeedback(area) {
    const { data, error } = await getSupabaseClient()
        .from('feedbacks')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
        area.innerHTML = emptyState('Belum Ada Feedback', 'Belum ada feedback yang masuk dari pengguna.');
        return;
    }

    const typeColor = { bug: 'text-red-500', suggestion: 'text-blue-500', praise: 'text-green-500' };
    const typeLabel = { bug: '🐛 Bug/Error', suggestion: '💡 Saran', praise: '⭐ Pujian' };

    area.innerHTML = `
        <div class="space-y-4">
            ${data.map(f => `
                <div class="card p-5">
                    <div class="flex items-start justify-between gap-4 flex-wrap">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <span class="text-sm font-semibold ${typeColor[f.type] || 'text-gray-500'}">
                                    ${typeLabel[f.type] || escHtml(f.type || '')}
                                </span>
                                <span class="text-xs text-gray-400">${formatTime(f.created_at)}</span>
                            </div>
                            <p class="text-sm text-gray-700 leading-relaxed">${escHtml(f.message || '')}</p>
                            ${f.email ? `<p class="text-xs text-blue-500 mt-2"><i class="fas fa-envelope mr-1"></i>${escHtml(f.email)}</p>` : ''}
                        </div>
                        <button class="btn-delete flex-shrink-0" onclick="deleteLaporan('feedbacks', ${f.id})">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ========== AKSI APPROVE / REJECT / DELETE ==========
async function approveItem(type, id) {
    await updateStatus(type, id, 'approved');
}

async function rejectItem(type, id) {
    await updateStatus(type, id, 'rejected');
}

async function updateStatus(type, id, status) {
    const table = type === 'pesan' ? 'pesan' : 'user_gallery';
    const el    = document.getElementById(`item-${type}-${id}`);

    if (el) el.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const { error } = await getSupabaseClient().from(table).update({ status }).eq('id', id);
        if (error) throw error;

        toast(
            status === 'approved' ? '✅ Berhasil di-approve!' : '🚫 Berhasil ditolak!',
            status === 'approved' ? 'green' : 'red'
        );

        // Animasi hilang jika filter bukan 'all'
        if (currentFilter !== 'all' && el) {
            el.style.transition = 'opacity 0.3s, transform 0.3s';
            el.style.opacity = '0';
            el.style.transform = 'scale(0.97)';
            setTimeout(() => el.remove(), 300);
        } else {
            loadContent();
        }

        loadStats();
    } catch {
        toast('❌ Gagal mengubah status', 'red');
        if (el) el.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}

async function deleteItem(type, id, imageUrl = '') {
    if (!confirm(`Yakin hapus ${type} ini secara permanen? Tindakan ini tidak bisa dibatalkan.`)) return;

    const table = type === 'pesan' ? 'pesan' : 'user_gallery';
    const el    = document.getElementById(`item-${type}-${id}`);

    try {
        // Hapus file dari storage jika foto
        if (imageUrl && type === 'foto') {
            try {
                const parts    = decodeURIComponent(imageUrl).split('/');
                const filePath = parts.slice(-2).join('/');
                await getSupabaseClient().storage.from('gallery_photos').remove([filePath]);
            } catch { /* lanjut meski gagal hapus storage */ }
        }

        const { error } = await getSupabaseClient().from(table).delete().eq('id', id);
        if (error) throw error;

        toast('🗑️ Berhasil dihapus!', 'gray');

        if (el) {
            el.style.transition = 'opacity 0.3s';
            el.style.opacity = '0';
            setTimeout(() => el.remove(), 300);
        }

        loadStats();
    } catch {
        toast('❌ Gagal menghapus', 'red');
    }
}

async function deleteLaporan(table, id) {
    try {
        await getSupabaseClient().from(table).delete().eq('id', id);
        toast('✅ Laporan dihapus', 'gray');
        loadContent();
        loadStats();
    } catch {
        toast('❌ Gagal menghapus laporan', 'red');
    }
}

// ========== MODAL GAMBAR ==========
function openImgModal(src) {
    document.getElementById('img-modal-src').src = decodeURIComponent(src);
    document.getElementById('img-modal').classList.add('active');
    document.body.style.overflow = 'hidden';
}

function closeImgModal() {
    document.getElementById('img-modal').classList.remove('active');
    document.body.style.overflow = 'auto';
}

// ========== HELPERS ==========
function showLoading(show) {
    const el = document.getElementById('loading-indicator');
    if (el) el.classList.toggle('hidden', !show);
    if (el) el.style.display = show ? 'flex' : 'none';
}

function emptyState(title, desc) {
    return `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
            <div class="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-check text-green-500 text-3xl"></i>
            </div>
            <h3 class="text-lg font-semibold text-gray-800 mb-2">${title}</h3>
            ${desc ? `<p class="text-gray-500 text-sm">${desc}</p>` : ''}
        </div>
    `;
}

function formatTime(str) {
    if (!str) return '';
    return new Date(str).toLocaleString('id-ID', {
        day: 'numeric', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });
}

function escHtml(str) {
    if (typeof str !== 'string') return '';
    return str
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function escAttr(str) {
    if (typeof str !== 'string') return '';
    return encodeURIComponent(str);
}

function toast(msg, color = 'gray') {
    const old = document.querySelector('.toast');
    if (old) old.remove();

    const colors = {
        green: 'bg-green-50 text-green-800 border border-green-200',
        red:   'bg-red-50 text-red-800 border border-red-200',
        gray:  'bg-white text-gray-700 border border-gray-200'
    };

    const el = document.createElement('div');
    el.className = `toast ${colors[color] || colors.gray}`;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}


// ════════════════════════════════════════════
// TAMBAHAN: Tab Ganti Nama & Pengaturan
// Kode asli di atas tidak diubah sama sekali
// ════════════════════════════════════════════

// ── Patch loadStats untuk tambahkan rename count ──
const _originalLoadStats = loadStats;
loadStats = async function() {
    await _originalLoadStats();
    try {
        const { count } = await getSupabaseClient()
            .from('user_change_requests')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        const c = count || 0;
        const statEl = document.getElementById('stat-rename');
        if (statEl) statEl.textContent = c;
        setBadge('rename', c);
    } catch { /* silent */ }
};

// ── Patch switchTab untuk sembunyikan filter di tab baru ──
const _originalSwitchTab = switchTab;
switchTab = function(tab) {
    _originalSwitchTab(tab);
    // Tambahan: sembunyikan filter untuk tab rename & settings juga
    const filterRow = document.getElementById('filter-row');
    if (filterRow && (tab === 'rename' || tab === 'settings')) {
        filterRow.style.display = 'none';
    }
};

// ── Patch loadContent untuk handle tab baru ──
const _originalLoadContent = loadContent;
loadContent = async function() {
    if (currentTab === 'rename') {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { doLogout(); return; }
        const area = document.getElementById('content-area');
        area.innerHTML = `<div class="flex justify-center py-16"><i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;
        try {
            await loadRename(area);
        } catch(err) {
            console.error('[loadRename error]', err);
            area.innerHTML = `<div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat data.</p>
                <p class="text-xs text-red-400 mt-2">${err.message || err}</p>
            </div>`;
        }
        return;
    }
    if (currentTab === 'settings') {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { doLogout(); return; }
        const area = document.getElementById('content-area');
        area.innerHTML = `<div class="flex justify-center py-16"><i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;
        try {
            await loadSettings(area);
        } catch(err) {
            console.error('[loadSettings error]', err);
            area.innerHTML = `<div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat data.</p>
                <p class="text-xs text-red-400 mt-2">${err.message || err}</p>
            </div>`;
        }
        return;
    }
    await _originalLoadContent();
};


// ════════════════════════════════════════════
// TAB GANTI NAMA
// ════════════════════════════════════════════

async function loadRename(area) {
    const { data, error } = await getSupabaseClient()
        .from('user_change_requests')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) throw error;

    const pending = (data || []).filter(r => r.status === 'pending');
    const others  = (data || []).filter(r => r.status !== 'pending');
    const all     = [...pending, ...others];

    if (all.length === 0) {
        area.innerHTML = emptyState('Tidak Ada Request', 'Belum ada permintaan ganti nama dari pengguna.');
        return;
    }

    area.innerHTML = `<div class="space-y-4">${all.map(renderRenameCard).join('')}</div>`;
}

function renderRenameCard(r) {
    const time     = formatTime(r.created_at);
    const reviewed = r.reviewed_at ? `· Ditinjau ${formatTime(r.reviewed_at)}` : '';
    const jurusan  = r.jurusan ? ` · ${escHtml(r.jurusan)}` : '';
    const statusBadge = `<span class="status-${r.status}">${r.status}</span>`;

    const actions = r.status === 'pending' ? `
        <button class="btn-approve" onclick="approveRename(${r.id}, '${escAttr(r.new_name)}', '${escAttr(r.device_fingerprint || '')}')">
            <i class="fas fa-check mr-1"></i>Setujui
        </button>
        <button class="btn-reject" onclick="rejectRename(${r.id})">
            <i class="fas fa-times mr-1"></i>Tolak
        </button>
    ` : `<span class="text-xs text-gray-400 italic">${escHtml(r.admin_note || '')}</span>`;

    return `
        <div class="card p-5" id="item-rename-${r.id}">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        ${statusBadge}
                        <span class="text-xs text-gray-400">${escHtml(r.role || '')}${jurusan}</span>
                        <span class="text-xs text-gray-400">${time} ${reviewed}</span>
                    </div>
                    <div class="flex items-center gap-3 mt-1">
                        <div class="text-sm">
                            <span class="text-gray-500 text-xs block mb-1">Nama Lama</span>
                            <span class="font-medium text-gray-700">${escHtml(r.old_name)}</span>
                        </div>
                        <i class="fas fa-arrow-right text-gray-300 text-xs mt-4"></i>
                        <div class="text-sm">
                            <span class="text-gray-500 text-xs block mb-1">Nama Baru</span>
                            <span class="font-semibold text-gray-900">${escHtml(r.new_name)}</span>
                        </div>
                    </div>
                    <p class="text-xs text-gray-400 mt-2 font-mono truncate">
                        FP: ${escHtml((r.device_fingerprint || '').slice(0, 16))}…
                    </p>
                </div>
                <div class="flex gap-2 flex-shrink-0 items-start">${actions}</div>
            </div>
        </div>
    `;
}

async function approveRename(requestId, newName, fpEncoded) {
    const fp  = decodeURIComponent(fpEncoded);
    const name = decodeURIComponent(newName);
    const el  = document.getElementById(`item-rename-${requestId}`);
    if (el) el.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const db  = getSupabaseClient();
        const now = new Date().toISOString();

        const { error: e1 } = await db.from('user_change_requests')
            .update({ status: 'approved', reviewed_at: now })
            .eq('id', requestId);
        if (e1) throw e1;

        await db.from('user_profiles')
            .update({ username: name })
            .eq('device_fingerprint', fp);

        await db.from('user_change_requests')
            .update({ status: 'rejected', admin_note: 'Request lain sudah disetujui', reviewed_at: now })
            .eq('device_fingerprint', fp)
            .eq('status', 'pending')
            .neq('id', requestId);

        toast('✅ Nama disetujui! Berlaku saat user buka halaman.', 'green');
        if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }
        setTimeout(() => { loadContent(); loadStats(); }, 300);

    } catch(e) {
        toast('❌ Gagal: ' + e.message, 'red');
        if (el) el.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}

async function rejectRename(requestId) {
    const note = prompt('Alasan penolakan (opsional):') ?? '';
    const el   = document.getElementById(`item-rename-${requestId}`);
    if (el) el.querySelectorAll('button').forEach(b => b.disabled = true);

    try {
        const { error } = await getSupabaseClient().from('user_change_requests')
            .update({ status: 'rejected', admin_note: note || 'Ditolak oleh admin', reviewed_at: new Date().toISOString() })
            .eq('id', requestId);
        if (error) throw error;

        toast('🚫 Request ditolak.', 'red');
        if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }
        setTimeout(() => { loadContent(); loadStats(); }, 300);

    } catch(e) {
        toast('❌ Gagal: ' + e.message, 'red');
        if (el) el.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}


// ════════════════════════════════════════════
// TAB PENGATURAN
// ════════════════════════════════════════════

async function loadSettings(area) {
    const { data, error } = await getSupabaseClient()
        .from('site_config').select('*').order('key');
    if (error) throw error;

    const map = {};
    (data || []).forEach(c => { map[c.key] = c; });

    const pesanClose   = map['pesan_close_date']?.value   || '';
    const galleryClose = map['gallery_close_date']?.value || '';

    area.innerHTML = `
        <div class="space-y-6">
            <div class="card p-6">
                <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <i class="fas fa-info-circle text-blue-500"></i>
                    Status Sistem Sekarang
                </h3>
                <p class="text-xs text-gray-400 mb-4">Berdasarkan konfigurasi yang tersimpan di database.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                    ${renderSettingsStatusCard('Sistem Pesan', pesanClose)}
                    ${renderSettingsStatusCard('Upload Galeri', galleryClose)}
                </div>
            </div>

            <div class="card p-6">
                <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <i class="fas fa-comment-slash text-yellow-500"></i>
                    Penutupan Sistem Pesan
                </h3>
                <p class="text-sm text-gray-500 mb-5">
                    Setelah tanggal ini, halaman pesan menjadi <strong>read-only</strong>.
                    Kosongkan untuk aktif terus.
                </p>
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-48">
                        <label class="block text-xs text-gray-500 mb-1 font-medium">Tanggal &amp; Jam Penutupan</label>
                        <input type="datetime-local" id="input-pesan-close"
                               value="${pesanClose ? toDatetimeLocal(pesanClose) : ''}"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <button onclick="saveConfig('pesan_close_date', 'input-pesan-close')" class="btn-approve px-4 py-2 flex items-center gap-2">
                        <i class="fas fa-save"></i>Simpan
                    </button>
                    <button onclick="clearConfig('pesan_close_date', 'input-pesan-close')" class="btn-reject px-4 py-2 flex items-center gap-2">
                        <i class="fas fa-undo"></i>Buka Kembali
                    </button>
                </div>
            </div>

            <div class="card p-6">
                <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                    <i class="fas fa-image text-orange-500"></i>
                    Penutupan Upload Galeri
                </h3>
                <p class="text-sm text-gray-500 mb-5">
                    Setelah tanggal ini, tombol upload foto tidak aktif.
                    Kosongkan untuk aktif terus.
                </p>
                <div class="flex flex-wrap gap-3 items-end">
                    <div class="flex-1 min-w-48">
                        <label class="block text-xs text-gray-500 mb-1 font-medium">Tanggal &amp; Jam Penutupan</label>
                        <input type="datetime-local" id="input-gallery-close"
                               value="${galleryClose ? toDatetimeLocal(galleryClose) : ''}"
                               class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                    </div>
                    <button onclick="saveConfig('gallery_close_date', 'input-gallery-close')" class="btn-approve px-4 py-2 flex items-center gap-2">
                        <i class="fas fa-save"></i>Simpan
                    </button>
                    <button onclick="clearConfig('gallery_close_date', 'input-gallery-close')" class="btn-reject px-4 py-2 flex items-center gap-2">
                        <i class="fas fa-undo"></i>Buka Kembali
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderSettingsStatusCard(label, closeDate) {
    const now    = new Date();
    const closed = closeDate && new Date(closeDate) < now;
    const color  = closed ? 'red' : 'green';
    const icon   = closed ? 'fa-lock' : 'fa-unlock';
    const status = closed ? 'DITUTUP' : 'AKTIF';
    const sub    = closeDate
        ? (closed ? `Ditutup sejak ${formatTime(closeDate)}` : `Akan ditutup ${formatTime(closeDate)}`)
        : 'Tidak ada tanggal penutupan';

    return `
        <div class="flex items-center gap-3 p-4 bg-${color}-50 border border-${color}-200 rounded-lg">
            <div class="w-10 h-10 rounded-full bg-${color}-100 flex items-center justify-center flex-shrink-0">
                <i class="fas ${icon} text-${color}-500"></i>
            </div>
            <div>
                <p class="font-semibold text-${color}-800 text-sm">${label} · ${status}</p>
                <p class="text-xs text-${color}-600 mt-0.5">${sub}</p>
            </div>
        </div>
    `;
}

async function saveConfig(key, inputId) {
    const inputEl = document.getElementById(inputId);
    if (!inputEl) return;
    const isoVal = inputEl.value ? new Date(inputEl.value).toISOString() : null;

    try {
        const { error } = await getSupabaseClient().from('site_config')
            .update({ value: isoVal, updated_at: new Date().toISOString() })
            .eq('key', key);
        if (error) throw error;

        toast(isoVal ? `✅ Disimpan: ${formatTime(isoVal)}` : '✅ Konfigurasi disimpan.', 'green');
        loadSettings(document.getElementById('content-area'));
    } catch(e) {
        toast('❌ Gagal: ' + e.message, 'red');
    }
}

async function clearConfig(key, inputId) {
    if (!confirm(`Hapus tanggal penutupan? Sistem akan aktif kembali.`)) return;
    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.value = '';

    try {
        const { error } = await getSupabaseClient().from('site_config')
            .update({ value: null, updated_at: new Date().toISOString() })
            .eq('key', key);
        if (error) throw error;

        toast('✅ Dibuka kembali. Sistem aktif.', 'green');
        loadSettings(document.getElementById('content-area'));
    } catch(e) {
        toast('❌ Gagal: ' + e.message, 'red');
    }
}

function toDatetimeLocal(iso) {
    if (!iso) return '';
    const d   = new Date(iso);
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}


// ════════════════════════════════════════════
// PATCH: tambah banned + words ke switchTab & loadContent
// ════════════════════════════════════════════

const _origSwitchTab2 = switchTab;
switchTab = function(tab) {
    _origSwitchTab2(tab);
    const filterRow = document.getElementById('filter-row');
    if (filterRow && (tab === 'banned' || tab === 'words')) {
        filterRow.style.display = 'none';
    }
};

const _origLoadContent2 = loadContent;
loadContent = async function() {
    if (currentTab === 'banned') {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { doLogout(); return; }
        const area = document.getElementById('content-area');
        area.innerHTML = `<div class="flex justify-center py-16"><i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;
        try { await loadBanned(area); } catch(err) {
            area.innerHTML = `<div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat data.</p>
                <p class="text-xs text-red-400 mt-2">${err.message}</p></div>`;
        }
        return;
    }
    if (currentTab === 'words') {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { doLogout(); return; }
        const area = document.getElementById('content-area');
        area.innerHTML = `<div class="flex justify-center py-16"><i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;
        try { await loadBlockedWords(area); } catch(err) {
            area.innerHTML = `<div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat data.</p>
                <p class="text-xs text-red-400 mt-2">${err.message}</p></div>`;
        }
        return;
    }
    await _origLoadContent2();
};

// Patch loadStats untuk banned count
const _origLoadStats2 = loadStats;
loadStats = async function() {
    await _origLoadStats2();
    try {
        const { count } = await getSupabaseClient()
            .from('banned_users')
            .select('*', { count: 'exact', head: true });
        setBadge('banned', count || 0);
    } catch { /* silent */ }
};


// ════════════════════════════════════════════
// TAB BANNED USERS
// ════════════════════════════════════════════

async function loadBanned(area) {
    const { data, error } = await getSupabaseClient()
        .from('banned_users')
        .select('*')
        .order('banned_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
        area.innerHTML = emptyState('Tidak Ada User yang Dibanned', 'Belum ada user yang dibanned.');
        return;
    }

    area.innerHTML = `
        <div class="mb-4 flex justify-between items-center">
            <p class="text-sm text-gray-500">${data.length} user dibanned</p>
            <button onclick="banManual()" class="btn-approve px-4 py-2 flex items-center gap-2">
                <i class="fas fa-ban"></i>Ban Manual
            </button>
        </div>
        <div class="space-y-4">
            ${data.map(renderBannedCard).join('')}
        </div>`;
}

function renderBannedCard(b) {
    const now       = new Date();
    const expired   = !b.is_permanent && b.expires_at && new Date(b.expires_at) < now;
    const expLabel  = b.is_permanent
        ? '<span class="status-rejected">Permanen</span>'
        : b.expires_at
            ? `<span class="status-${expired ? 'approved' : 'pending'}">${expired ? 'Expired' : 'Aktif s/d ' + formatTime(b.expires_at)}</span>`
            : '<span class="status-pending">Tidak ada batas</span>';

    return `
        <div class="card p-5" id="banned-${b.id}">
            <div class="flex items-start justify-between gap-4 flex-wrap">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-2 flex-wrap">
                        ${expLabel}
                        <span class="text-xs text-gray-400">Dibanned ${formatTime(b.banned_at)}</span>
                    </div>
                    <p class="text-sm text-gray-700 mb-1">
                        <span class="font-medium">Alasan:</span> ${escHtml(b.reason || 'Tidak ada alasan')}
                    </p>
                    <p class="text-xs text-gray-400 font-mono">Session: ${escHtml(b.session_id)}</p>
                </div>
                <div class="flex gap-2 flex-shrink-0">
                    <button class="btn-approve" onclick="unbanById(${b.id}, '${escAttr(b.session_id)}')">
                        <i class="fas fa-unlock mr-1"></i>Unban
                    </button>
                    <button class="btn-delete" onclick="deleteBan(${b.id})">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
}

async function unbanById(id, sessionId) {
    const el = document.getElementById(`banned-${id}`);
    if (el) el.querySelectorAll('button').forEach(b => b.disabled = true);
    try {
        const { error } = await getSupabaseClient()
            .from('banned_users').delete().eq('id', id);
        if (error) throw error;
        toast('✅ User berhasil di-unban', 'green');
        if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; }
        setTimeout(() => { loadContent(); loadStats(); }, 300);
    } catch(e) {
        toast('❌ Gagal unban: ' + e.message, 'red');
        if (el) el.querySelectorAll('button').forEach(b => b.disabled = false);
    }
}

async function deleteBan(id) {
    if (!confirm('Hapus record ban ini?')) return;
    try {
        await getSupabaseClient().from('banned_users').delete().eq('id', id);
        toast('🗑️ Record ban dihapus', 'gray');
        loadContent();
        loadStats();
    } catch(e) { toast('❌ Gagal: ' + e.message, 'red'); }
}

async function banManual() {
    const sessionId = prompt('Session ID user yang ingin di-ban:');
    if (!sessionId?.trim()) return;
    const reason = prompt('Alasan ban:') || 'Dibanned oleh admin';
    const durStr = prompt('Durasi ban (jam, kosongkan untuk permanen):');
    const dur    = durStr ? parseInt(durStr) : null;

    try {
        const expiresAt = dur ? new Date(Date.now() + dur * 3600000).toISOString() : null;
        const { error } = await getSupabaseClient().from('banned_users').insert([{
            session_id:   sessionId.trim(),
            reason,
            expires_at:   expiresAt,
            is_permanent: !dur,
            banned_at:    new Date().toISOString(),
        }]);
        if (error) throw error;
        toast(`✅ User dibanned${dur ? ` selama ${dur} jam` : ' permanen'}`, 'red');
        loadContent();
        loadStats();
    } catch(e) { toast('❌ Gagal: ' + e.message, 'red'); }
}


// ════════════════════════════════════════════
// TAB BLOCKED WORDS
// ════════════════════════════════════════════

const SEVERITY_COLORS = {
    high:   'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    low:    'bg-gray-100 text-gray-600 border-gray-200',
};

async function loadBlockedWords(area) {
    const { data, error } = await getSupabaseClient()
        .from('blocked_words')
        .select('*')
        .order('severity')
        .order('word');

    if (error) throw error;
    const words = data || [];

    area.innerHTML = `
        <!-- Form tambah kata -->
        <div class="card p-6 mb-6">
            <h3 class="font-semibold text-gray-800 mb-4 flex items-center gap-2">
                <i class="fas fa-plus-circle text-blue-500"></i>Tambah Kata Baru
            </h3>
            <div class="flex flex-wrap gap-3 items-end">
                <div class="flex-1 min-w-40">
                    <label class="block text-xs text-gray-500 mb-1">Kata</label>
                    <input type="text" id="new-word-input" placeholder="Ketik kata..." onkeydown="if(event.key==='Enter') addBlockedWord()"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
                <div>
                    <label class="block text-xs text-gray-500 mb-1">Severity</label>
                    <select id="new-word-severity"
                            class="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="high">High 🔴</option>
                        <option value="medium" selected>Medium 🟡</option>
                        <option value="low">Low ⚪</option>
                    </select>
                </div>
                <button onclick="addBlockedWord()" class="btn-approve px-4 py-2 flex items-center gap-2">
                    <i class="fas fa-plus"></i>Tambah
                </button>
            </div>
        </div>

        <!-- Daftar kata -->
        <div class="card p-6">
            <div class="flex items-center justify-between mb-4">
                <h3 class="font-semibold text-gray-800">${words.length} kata terblokir</h3>
                <div class="flex gap-2 text-xs">
                    <span class="px-2 py-1 rounded-full bg-red-100 text-red-700">${words.filter(w=>w.severity==='high').length} High</span>
                    <span class="px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">${words.filter(w=>w.severity==='medium').length} Medium</span>
                    <span class="px-2 py-1 rounded-full bg-gray-100 text-gray-600">${words.filter(w=>w.severity==='low').length} Low</span>
                </div>
            </div>
            <div class="flex flex-wrap gap-2" id="words-list">
                ${words.map(w => `
                    <div class="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm ${SEVERITY_COLORS[w.severity] || SEVERITY_COLORS.low}"
                         id="word-${w.id}">
                        <span>${escHtml(w.word)}</span>
                        <button onclick="toggleWordActive(${w.id}, ${w.is_active})"
                                class="ml-1 opacity-60 hover:opacity-100 transition"
                                title="${w.is_active ? 'Nonaktifkan' : 'Aktifkan'}">
                            <i class="fas fa-${w.is_active ? 'eye' : 'eye-slash'} text-xs"></i>
                        </button>
                        <button onclick="deleteWord(${w.id})"
                                class="opacity-60 hover:opacity-100 transition hover:text-red-600"
                                title="Hapus">
                            <i class="fas fa-times text-xs"></i>
                        </button>
                    </div>`).join('')}
            </div>
            ${words.length === 0 ? '<p class="text-gray-400 text-sm text-center py-8">Belum ada kata yang diblokir.</p>' : ''}
        </div>`;
}

async function addBlockedWord() {
    const word     = document.getElementById('new-word-input')?.value.trim().toLowerCase();
    const severity = document.getElementById('new-word-severity')?.value || 'medium';
    if (!word) { toast('❌ Isi kata terlebih dahulu', 'red'); return; }

    try {
        const { error } = await getSupabaseClient().from('blocked_words').insert([{
            word, severity, is_active: true,
        }]);
        if (error) throw error;
        document.getElementById('new-word-input').value = '';
        toast('✅ Kata berhasil ditambahkan', 'green');
        loadContent();
    } catch(e) {
        toast(e.message?.includes('duplicate') ? '❌ Kata sudah ada' : '❌ Gagal: ' + e.message, 'red');
    }
}

async function toggleWordActive(id, currentActive) {
    try {
        const { error } = await getSupabaseClient()
            .from('blocked_words')
            .update({ is_active: !currentActive })
            .eq('id', id);
        if (error) throw error;
        toast(currentActive ? '🔇 Kata dinonaktifkan' : '🔊 Kata diaktifkan', 'gray');
        loadContent();
    } catch(e) { toast('❌ Gagal: ' + e.message, 'red'); }
}

async function deleteWord(id) {
    if (!confirm('Hapus kata ini dari daftar?')) return;
    try {
        const { error } = await getSupabaseClient()
            .from('blocked_words').delete().eq('id', id);
        if (error) throw error;
        const el = document.getElementById(`word-${id}`);
        if (el) el.remove();
        toast('🗑️ Kata dihapus', 'gray');
    } catch(e) { toast('❌ Gagal: ' + e.message, 'red'); }
}


// ════════════════════════════════════════════
// TAB GALERI ADMIN
// Upload foto ke admin_gallery (folder admin-uploads/ di bucket gallery_photos)
// Menggunakan compressImage + WebP yang sama dengan galeri.js
// ════════════════════════════════════════════

const ADMIN_GALLERY_BUCKET = 'gallery_photos';
const ADMIN_GALLERY_FOLDER = 'admin-uploads';

// ── Patch switchTab: sembunyikan filter untuk tab admingaleri ──
const _origSwitchTabAdminGal = switchTab;
switchTab = function(tab) {
    _origSwitchTabAdminGal(tab);
    const filterRow = document.getElementById('filter-row');
    if (filterRow && tab === 'admingaleri') {
        filterRow.style.display = 'none';
    }
};

// ── Patch loadContent: handle tab admingaleri ──
const _origLoadContentAdminGal = loadContent;
loadContent = async function() {
    if (currentTab === 'admingaleri') {
        const { data: { session } } = await getSupabaseClient().auth.getSession();
        if (!session) { doLogout(); return; }
        const area = document.getElementById('content-area');
        area.innerHTML = `<div class="flex justify-center py-16">
            <i class="fas fa-circle-notch spin text-blue-500 text-3xl"></i></div>`;
        try { await loadAdminGaleri(area); }
        catch(err) {
            area.innerHTML = `<div class="bg-white rounded-xl shadow-sm p-12 text-center">
                <i class="fas fa-exclamation-triangle text-red-400 text-3xl mb-3 block"></i>
                <p class="text-gray-500">Gagal memuat galeri admin.</p>
                <p class="text-xs text-red-400 mt-2">${err.message}</p></div>`;
        }
        return;
    }
    await _origLoadContentAdminGal();
};


// ── LOAD TAB: tampil form upload + daftar foto admin ──
async function loadAdminGaleri(area) {
    const { data, error } = await getSupabaseClient()
        .from('admin_gallery')
        .select('id, title, description, photo_url, category, jurusan, display_order, is_active')
        .order('display_order', { ascending: true });

    if (error) throw error;
    const photos = data || [];

    area.innerHTML = `
        <!-- ── FORM UPLOAD ── -->
        <div class="card p-6 mb-8">
            <h3 class="font-semibold text-gray-800 mb-1 flex items-center gap-2">
                <i class="fas fa-cloud-upload-alt text-blue-500"></i>Upload Foto ke Galeri Admin
            </h3>
            <p class="text-xs text-gray-400 mb-5">
                Foto akan disimpan di folder <code class="bg-gray-100 px-1 rounded">admin-uploads/</code>
                dan langsung tampil di halaman galeri tanpa moderasi.
            </p>

            <!-- Preview -->
            <img id="ag-preview" src="" alt=""
                 class="hidden w-full max-h-52 object-cover rounded-xl mb-4">

            <!-- Drag-drop area -->
            <div id="ag-dropzone"
                 class="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center cursor-pointer
                        transition-all duration-200 hover:border-blue-400 hover:bg-blue-50 mb-5"
                 onclick="document.getElementById('ag-file').click()"
                 ondragover="event.preventDefault();this.classList.add('border-blue-400','bg-blue-50')"
                 ondragleave="this.classList.remove('border-blue-400','bg-blue-50')"
                 ondrop="event.preventDefault();this.classList.remove('border-blue-400','bg-blue-50');agHandleDrop(event.dataTransfer.files[0])">
                <i class="fas fa-cloud-upload-alt text-gray-300 text-4xl mb-3 block"></i>
                <p class="text-gray-500 text-sm">
                    <strong>Drag &amp; drop</strong> foto di sini, atau klik untuk pilih
                </p>
                <p class="text-xs text-gray-400 mt-1">WebP / JPG / PNG · maks. 15 MB</p>
            </div>
            <input type="file" id="ag-file" accept="image/*" class="hidden"
                   onchange="agHandleFile(this.files[0])">

            <!-- Fields -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">
                        Judul <span class="text-red-400">*</span>
                    </label>
                    <input type="text" id="ag-title" placeholder="Contoh: Praktik TSM Semester 5"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Kategori <span class="text-red-400">*</span></label>
                    <select id="ag-category"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="" disabled selected>Pilih kategori</option>
                        <option value="kelas">Kelas</option>
                        <option value="praktik">Praktik</option>
                        <option value="acara">Acara</option>
                        <option value="ekstra">Ekstra</option>
                        <option value="umum">Umum</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">Jurusan</label>
                    <select id="ag-jurusan"
                            class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                                   focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                        <option value="">Semua jurusan</option>
                        <option value="TSM">TSM</option>
                        <option value="MPLB">MPLB</option>
                        <option value="ATP">ATP</option>
                        <option value="APHP">APHP</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-medium text-gray-600 mb-1">
                        Urutan Tampil
                        <span class="text-gray-400 font-normal">(kosongkan = otomatis)</span>
                    </label>
                    <input type="number" id="ag-order" min="1" placeholder="Otomatis"
                           class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                                  focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
                </div>
            </div>

            <div class="mb-5">
                <label class="block text-xs font-medium text-gray-600 mb-1">
                    Deskripsi
                    <span class="text-gray-400 font-normal">(opsional)</span>
                </label>
                <textarea id="ag-desc" rows="2" placeholder="Ceritakan momen ini…"
                          class="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-none
                                 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
            </div>

            <!-- Progress bar -->
            <div id="ag-progress-wrap" class="hidden mb-4">
                <div class="flex justify-between text-xs text-gray-500 mb-1">
                    <span id="ag-progress-label">Mengompres...</span>
                    <span id="ag-progress-pct">0%</span>
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5">
                    <div id="ag-progress-bar" class="bg-blue-500 h-1.5 rounded-full transition-all duration-300" style="width:0%"></div>
                </div>
            </div>

            <button id="ag-submit-btn" onclick="agSubmit()"
                    class="btn-approve px-6 py-2.5 flex items-center gap-2">
                <i class="fas fa-upload"></i>Upload Foto
            </button>
        </div>

        <!-- ── DAFTAR FOTO ADMIN ── -->
        <div class="card p-6">
            <div class="flex items-center justify-between mb-5">
                <h3 class="font-semibold text-gray-800 flex items-center gap-2">
                    <i class="fas fa-images text-blue-400"></i>
                    Foto di Galeri Admin
                    <span class="text-sm font-normal text-gray-400">(${photos.length} foto)</span>
                </h3>
                <button onclick="loadAdminGaleri(document.getElementById('content-area'))"
                        class="text-xs text-gray-400 hover:text-blue-600 transition flex items-center gap-1">
                    <i class="fas fa-sync-alt"></i> Refresh
                </button>
            </div>

            ${photos.length === 0 ? `
                <div class="text-center py-12 text-gray-400">
                    <i class="fas fa-image text-4xl mb-3 block opacity-30"></i>
                    <p class="text-sm">Belum ada foto. Upload foto pertama di atas.</p>
                </div>` : `
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${photos.map(agRenderCard).join('')}
                </div>`
            }
        </div>`;
}


// ── RENDER CARD foto admin ──
function agRenderCard(p) {
    const jurusanLabel = { TSM: 'TSM', MP: 'MPLB', ATP: 'ATP', APHP: 'APHP' };
    return `
        <div class="card" id="ag-item-${p.id}">
            <div class="relative" style="padding-bottom:56.25%">
                <img src="${escHtml(p.photo_url)}" alt="${escHtml(p.title)}"
                     class="absolute inset-0 w-full h-full object-cover cursor-pointer hover:opacity-90 transition"
                     onclick="openImgModal('${escAttr(p.photo_url)}')">
                <!-- Urutan badge -->
                <div class="absolute top-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded-full backdrop-blur-sm">
                    #${p.display_order}
                </div>
                <!-- Status aktif badge -->
                <div class="absolute top-2 right-2">
                    <span class="${p.is_active
                        ? 'bg-green-100 text-green-700 border border-green-200'
                        : 'bg-gray-100 text-gray-500 border border-gray-200'}
                        text-xs px-2 py-0.5 rounded-full font-medium">
                        ${p.is_active ? 'Aktif' : 'Disembunyikan'}
                    </span>
                </div>
            </div>
            <div class="p-4">
                <div class="flex items-start justify-between gap-2 mb-1">
                    <p class="font-medium text-gray-800 text-sm truncate">${escHtml(p.title)}</p>
                    <span class="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded flex-shrink-0">${escHtml(p.category)}</span>
                </div>
                ${p.description
                    ? `<p class="text-xs text-gray-400 mb-2 line-clamp-2">${escHtml(p.description)}</p>`
                    : ''}
                ${p.jurusan
                    ? `<p class="text-xs text-gray-400 mb-3"><i class="fas fa-layer-group mr-1 opacity-50"></i>${escHtml(jurusanLabel[p.jurusan] || p.jurusan)}</p>`
                    : ''}
                <div class="flex gap-2 mt-3">
                    <button onclick="agToggleActive(${p.id}, ${p.is_active})"
                            class="${p.is_active ? 'btn-reject' : 'btn-approve'} flex-1 flex items-center justify-center gap-1">
                        <i class="fas fa-${p.is_active ? 'eye-slash' : 'eye'}"></i>
                        ${p.is_active ? 'Sembunyikan' : 'Tampilkan'}
                    </button>
                    <button onclick="agDeletePhoto(${p.id}, '${escAttr(p.photo_url)}')"
                            class="btn-delete flex items-center justify-center gap-1 px-3">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
        </div>`;
}


// ── KOMPRESI + KONVERSI WEBP (sama dengan galeri.js) ──
let _agWebpSupported = null;

function agIsWebpSupported() {
    if (_agWebpSupported !== null) return _agWebpSupported;
    const c = document.createElement('canvas');
    c.width = c.height = 1;
    c.getContext('2d');
    _agWebpSupported = c.toDataURL('image/webp').indexOf('image/webp') === 5;
    return _agWebpSupported;
}

function agCompressImage(file) {
    return new Promise((resolve, reject) => {
        if (!file.type.startsWith('image/')) { reject(new Error('Bukan file gambar')); return; }
        const MAX_DIM = 1920, QUALITY = 0.85;
        const img    = new Image();
        const blobUrl = URL.createObjectURL(file);
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
            ctx.fillStyle = '#fff';
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);
            const mime = agIsWebpSupported() ? 'image/webp' : 'image/jpeg';
            canvas.toBlob(blob => {
                if (blob?.size > 0) resolve(blob);
                else canvas.toBlob(jpg => jpg ? resolve(jpg) : reject(new Error('Konversi gagal')), 'image/jpeg', QUALITY);
            }, mime, QUALITY);
        };
        img.onerror = () => { URL.revokeObjectURL(blobUrl); reject(new Error('File tidak valid')); };
        img.src = blobUrl;
    });
}


// ── FILE HANDLER: drag-drop dan input ──
function agHandleDrop(file) {
    if (!file) return;
    agHandleFile(file);
}

function agHandleFile(file) {
    if (!file) return;
    if (file.size > 15 * 1024 * 1024) { toast('❌ Ukuran maksimal 15MB', 'red'); return; }
    if (!file.type.startsWith('image/')) { toast('❌ Hanya file gambar', 'red'); return; }

    // Simpan file ke data attribute sementara
    document.getElementById('ag-dropzone').dataset.file = '';
    window._agSelectedFile = file;

    // Preview
    const reader = new FileReader();
    reader.onload = e => {
        const pre = document.getElementById('ag-preview');
        const dz  = document.getElementById('ag-dropzone');
        if (pre) { pre.src = e.target.result; pre.classList.remove('hidden'); }
        if (dz)  dz.classList.add('hidden');
    };
    reader.readAsDataURL(file);
}


// ── PROGRESS HELPERS ──
function agSetProgress(label, pct) {
    const wrap  = document.getElementById('ag-progress-wrap');
    const lbl   = document.getElementById('ag-progress-label');
    const pctEl = document.getElementById('ag-progress-pct');
    const bar   = document.getElementById('ag-progress-bar');
    if (!wrap) return;
    wrap.classList.remove('hidden');
    if (lbl)   lbl.textContent   = label;
    if (pctEl) pctEl.textContent = pct + '%';
    if (bar)   bar.style.width   = pct + '%';
}

function agHideProgress() {
    document.getElementById('ag-progress-wrap')?.classList.add('hidden');
}


// ── SUBMIT UPLOAD ──
async function agSubmit() {
    const title    = document.getElementById('ag-title')?.value.trim();
    const category = document.getElementById('ag-category')?.value;
    const jurusan  = document.getElementById('ag-jurusan')?.value  || null;
    const desc     = document.getElementById('ag-desc')?.value.trim()    || '';
    const orderRaw = document.getElementById('ag-order')?.value.trim();
    const file     = window._agSelectedFile;

    // Validasi
    if (!title)    { toast('❌ Judul tidak boleh kosong', 'red'); return; }
    if (!category) { toast('❌ Pilih kategori terlebih dahulu', 'red'); return; }
    if (!file)     { toast('❌ Pilih foto terlebih dahulu', 'red'); return; }

    const btn = document.getElementById('ag-submit-btn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch spin mr-2"></i>Mengunggah...'; }

    try {
        const db = getSupabaseClient();

        // ── 1. Tentukan display_order ──
        let displayOrder;
        if (orderRaw !== '') {
            displayOrder = parseInt(orderRaw, 10);
            if (isNaN(displayOrder) || displayOrder < 1) {
                toast('❌ Urutan tampil harus berupa angka positif', 'red');
                return;
            }
        } else {
            // Otomatis: max yang ada + 1
            agSetProgress('Menghitung urutan...', 10);
            const { data: maxData } = await db
                .from('admin_gallery')
                .select('display_order')
                .order('display_order', { ascending: false })
                .limit(1)
                .maybeSingle();
            displayOrder = (maxData?.display_order ?? 0) + 1;
        }

        // ── 2. Kompres + konversi WebP ──
        agSetProgress('Mengompres gambar...', 25);
        const blob = await agCompressImage(file);

        // ── 3. Tentukan path file di storage ──
        const mimeToExt = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
        const ext  = mimeToExt[blob.type] || 'jpg';
        const path = `${ADMIN_GALLERY_FOLDER}/${Date.now()}-${Math.random().toString(36).slice(2, 9)}.${ext}`;

        // ── 4. Upload ke storage ──
        agSetProgress('Mengunggah foto...', 55);
        const { error: upErr } = await db.storage
            .from(ADMIN_GALLERY_BUCKET)
            .upload(path, blob, { contentType: blob.type || 'image/jpeg' });
        if (upErr) throw upErr;

        // ── 5. Ambil public URL ──
        const { data: urlData } = db.storage.from(ADMIN_GALLERY_BUCKET).getPublicUrl(path);

        // ── 6. Insert ke admin_gallery ──
        agSetProgress('Menyimpan ke database...', 80);
        const { error: dbErr } = await db.from('admin_gallery').insert([{
            title,
            description:   desc,
            photo_url:     urlData.publicUrl,
            category,
            jurusan,
            display_order: displayOrder,
            is_active:     true,
        }]);
        if (dbErr) throw dbErr;

        agSetProgress('Selesai!', 100);
        setTimeout(() => {
            toast('✅ Foto berhasil diupload ke galeri admin!', 'green');
            agHideProgress();
            // Reset form
            window._agSelectedFile = null;
            ['ag-title','ag-desc','ag-order'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.value = '';
            });
            const cat = document.getElementById('ag-category'); if (cat) cat.value = '';
            const jur = document.getElementById('ag-jurusan');  if (jur) jur.value = '';
            const pre = document.getElementById('ag-preview');  if (pre) { pre.src = ''; pre.classList.add('hidden'); }
            const dz  = document.getElementById('ag-dropzone'); if (dz)  dz.classList.remove('hidden');
            const fi  = document.getElementById('ag-file');     if (fi)  fi.value = '';
            // Reload daftar
            loadAdminGaleri(document.getElementById('content-area'));
        }, 600);

    } catch(err) {
        toast('❌ Gagal upload: ' + err.message, 'red');
        agHideProgress();
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-upload mr-2"></i>Upload Foto'; }
    }
}


// ── TOGGLE AKTIF / SEMBUNYIKAN ──
async function agToggleActive(id, currentActive) {
    try {
        const { error } = await getSupabaseClient()
            .from('admin_gallery')
            .update({ is_active: !currentActive })
            .eq('id', id);
        if (error) throw error;
        toast(currentActive ? '👁 Foto disembunyikan dari galeri' : '✅ Foto ditampilkan di galeri', 'gray');
        loadAdminGaleri(document.getElementById('content-area'));
    } catch(e) {
        toast('❌ Gagal: ' + e.message, 'red');
    }
}


// ── HAPUS FOTO ADMIN ──
async function agDeletePhoto(id, encodedUrl) {
    if (!confirm('Hapus foto ini secara permanen? Tindakan ini tidak dapat dibatalkan.')) return;

    try {
        const db  = getSupabaseClient();
        const url = decodeURIComponent(encodedUrl);

        // Hapus file dari storage
        try {
            const parts    = url.split('/');
            const filePath = parts.slice(-2).join('/'); // "admin-uploads/filename.webp"
            await db.storage.from(ADMIN_GALLERY_BUCKET).remove([filePath]);
        } catch { /* lanjut meski storage gagal */ }

        // Hapus row dari DB
        const { error } = await db.from('admin_gallery').delete().eq('id', id);
        if (error) throw error;

        toast('🗑️ Foto dihapus', 'gray');

        const el = document.getElementById(`ag-item-${id}`);
        if (el) {
            el.style.transition = 'opacity 0.3s';
            el.style.opacity    = '0';
            setTimeout(() => {
                el.remove();
                // Update jumlah di heading
                const area = document.getElementById('content-area');
                const countEl = area?.querySelector('h3 .text-gray-400');
                if (countEl) {
                    const current = parseInt(countEl.textContent) || 0;
                    countEl.textContent = `(${Math.max(0, current - 1)} foto)`;
                }
            }, 300);
        }
    } catch(e) {
        toast('❌ Gagal hapus: ' + e.message, 'red');
    }
}
