# Pernah di Sini — SMK Negeri 3 Tapung Hulu
**Buku Kenangan Digital · Angkatan 2026**

> *68 nama, 4 cerita. Tidak semuanya sampai pada halaman yang sama.*

---

## Daftar Isi

1. [Tentang Proyek](#tentang-proyek)
2. [Tech Stack](#tech-stack)
3. [Struktur File](#struktur-file)
4. [Halaman & Fitur](#halaman--fitur)
5. [Database (Supabase)](#database-supabase)
6. [Konfigurasi](#konfigurasi)
7. [Deployment](#deployment)
8. [Panduan Pengembangan](#panduan-pengembangan)
9. [Profil Pengguna](#profil-pengguna)
10. [Galeri & Upload Foto](#galeri--upload-foto)
11. [Keamanan](#keamanan)
12. [Catatan Desain](#catatan-desain)
13. [User Behavior Profile](#user-behavior-profile)

---

## Tentang Proyek

**Pernah di Sini** adalah website buku kenangan digital untuk angkatan 2026 SMK Negeri 3 Tapung Hulu. Dibangun sebagai static site yang di-host di Vercel, dengan Supabase sebagai backend untuk data siswa, galeri foto, pesan, dan profil pengguna.

**URL Produksi:** https://pernahdisini.vercel.app  
**Repository:** https://github.com/SMKN3TPH/Perpisahan  

---

## Tech Stack

| Layer | Teknologi |
|-------|-----------|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Styling | CSS custom properties (dark theme), satu file `style.css` |
| Backend | Supabase (PostgreSQL + Storage + Auth) |
| Hosting | Vercel (static site, auto-deploy dari GitHub) |
| Font | Playfair Display + DM Sans (Google Fonts) |

---

## Struktur File

```
/
├── index.html          # Landing cover (sampul)
├── pembuka.html        # Halaman pembuka / narasi
├── angkatan.html       # Daftar siswa & filter jurusan
├── galeri.html         # Galeri foto (admin + kiriman)
├── pesan.html          # Pesan kenangan
├── pustaka.html        # Info sekolah & profil
├── admin.html          # Panel admin (upload foto resmi)
├── style.css           # SEMUA CSS (consolidated, tidak ada inline style)
├── utils.js            # Helper global: escHtml, formatTimeAgo, JURUSAN_LIST, dll
├── config.js           # Supabase URL & anon key
├── supabase.js         # Semua query Supabase
├── galeri.js           # Logic galeri foto
├── pesan.js            # Logic pesan kenangan
├── admin.js            # Logic admin panel
├── user-memory.js      # Profil pengguna: cookie, fingerprint, ProfileModal
└── og.jpg              # Open Graph image untuk preview WhatsApp/sosmed
```

---

## Halaman & Fitur

### `index.html` — Sampul
- Landing page animasi dengan judul "Pernah di Sini"
- Open Graph meta tags untuk preview link WhatsApp
- Tombol masuk ke `pembuka.html`

### `pembuka.html` — Pembuka
- Narasi panjang berbasis scroll dengan animasi fade-in
- Section: prose, angka statistik (4 jurusan, 68 siswa, 3 tahun, 4 wali kelas), tempat kenangan, navigasi halaman

### `angkatan.html` — Arsip Angkatan
- Filter jurusan: TSM, MPLB, ATP, APHP (4 card clickable)
- Filter inisial nama (A–Z)
- Section Ketua Program Kompetensi (hardcoded)
- Daftar 68 siswa dari Supabase dengan avatar, nama, ID, badge jurusan
- Skeleton loading saat fetch

### `galeri.html` — Galeri Kenangan
- **Dokumentasi Resmi**: foto yang diupload admin, filter jurusan & kategori
- **Kiriman Teman-teman**: foto upload user, like, reaksi emoji
- Upload foto: cek profil dulu → pilih foto → isi judul/kategori → submit
- Kuota upload: 3 foto per 3.5 jam (localStorage)
- Modal zoom foto: pinch-to-zoom, swipe navigasi, auto-hide nav arrows
- Animasi slide saat pindah foto di modal

### `pesan.html` — Pesan Kenangan
- Form kirim pesan (nama dari profil, bukan input manual)
- Filter pesan per jurusan
- Like & reaksi emoji per pesan
- Kuota pesan: 3 per hari (localStorage)
- Profil modal muncul saat pertama kali klik kirim

### `pustaka.html` — Pustaka
- Info profil sekolah (nama, NPSN, akreditasi, dll)
- Daftar wali kelas, ketua program kompetensi
- Link media sosial sekolah

### `admin.html` — Admin Panel
- Login via Supabase Auth (email + password)
- Upload foto dokumentasi resmi
- Approve/reject foto kiriman user
- Approve/reject request ganti nama

---

## Database (Supabase)

### Tabel: `students`
```sql
id          SERIAL PRIMARY KEY
name        TEXT NOT NULL
jurusan     TEXT CHECK (jurusan IN ('TSM', 'MPLB', 'ATP', 'APHP'))
nisn        TEXT
photo_url   TEXT
wali_kelas  TEXT
angkatan    INTEGER DEFAULT 2026
is_active   BOOLEAN DEFAULT true
created_at  TIMESTAMPTZ
updated_at  TIMESTAMPTZ
```

### Tabel: `admin_gallery`
```sql
id          SERIAL PRIMARY KEY
photo_url   TEXT NOT NULL
title       TEXT
category    TEXT  -- kelas, praktik, acara, ekstra
jurusan     TEXT  -- TSM, MPLB, ATP, APHP, atau null (semua)
reaksi      JSONB DEFAULT '{}'
is_active   BOOLEAN DEFAULT true
created_at  TIMESTAMPTZ
```

### Tabel: `user_gallery`
```sql
id           SERIAL PRIMARY KEY
image_url    TEXT NOT NULL
title        TEXT
description  TEXT
category     TEXT  -- kelas, praktik, acara, ekstra, umum
username     TEXT
role         TEXT
jurusan      TEXT
likes_count  INTEGER DEFAULT 0
views_count  INTEGER DEFAULT 0
reaksi       JSONB DEFAULT '{}'
is_approved  BOOLEAN DEFAULT false
created_at   TIMESTAMPTZ
```

### Tabel: `messages`
```sql
id          SERIAL PRIMARY KEY
username    TEXT NOT NULL
role        TEXT
jurusan     TEXT
content     TEXT NOT NULL
likes_count INTEGER DEFAULT 0
reaksi      JSONB DEFAULT '{}'
created_at  TIMESTAMPTZ
```

### Tabel: `user_profiles`
```sql
id                 SERIAL PRIMARY KEY
session_id         TEXT UNIQUE
device_fingerprint TEXT UNIQUE
username           TEXT
role               TEXT
jurusan            TEXT
angkatan           TEXT  -- untuk alumni
last_seen          TIMESTAMPTZ
```

### Tabel: `user_change_requests`
```sql
id                 SERIAL PRIMARY KEY
device_fingerprint TEXT
old_name           TEXT
new_name           TEXT
role               TEXT
jurusan            TEXT
status             TEXT  -- pending, approved, applied
created_at         TIMESTAMPTZ
```

### Tabel: `site_config`
```sql
key   TEXT PRIMARY KEY
value TEXT
```
Digunakan untuk: `gallery_close_date`

---

## Konfigurasi

### `config.js`
```javascript
const SUPABASE_URL = 'https://xxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGc...';
```

> **Catatan:** Pakai anon key, aman untuk public repo selama RLS aktif.

### `utils.js` — Konstanta Global
```javascript
const JURUSAN_LIST  = ['TSM', 'MPLB', 'ATP', 'APHP'];
const JURUSAN_LABEL = { TSM:'TSM', MPLB:'MPLB', ATP:'ATP', APHP:'APHP' };
const EMOJI_LIST    = ['❤️', '🔥', '😂', '😭', '👏'];
```

---

## Deployment

### Auto-deploy via Vercel
1. Push ke GitHub → Vercel otomatis deploy (~30–60 detik)
2. Tidak perlu build command (static site)
3. Domain: `pernahdisini.vercel.app`

### Open Graph (Preview Link WhatsApp)
```html
<meta property="og:image" content="https://pernahdisini.vercel.app/og.jpg">
```
- File `og.jpg` ada di root repo (ukuran ideal 1200×630px, di bawah 300KB)

---

## Panduan Pengembangan

### Aturan CSS
- **Semua CSS** ada di `style.css` — tidak ada `<style>` tag di HTML
- Pakai CSS custom properties (`var(--gold)`, dll) bukan hardcode warna
- Tidak ada `rgba()` untuk warna utama — gunakan hex
- `color-scheme: dark` di `:root` mencegah browser override

### Aturan JavaScript
- Tidak ada inline JS di HTML (kecuali script tag di bawah body untuk init)
- Helper global (`escHtml`, `formatTimeAgo`, `showToast`) ada di `utils.js`
- Semua query Supabase ada di `supabase.js`

### Menambah/Edit Data Statis
Data berikut **hardcoded** di `angkatan.html` (bukan dari database):
```html
<!-- Ketua Program Kompetensi -->
TSM  : Roy Indra Setiawan
MPLB : Elvi Hartati, S.E
ATP  : Masdiyanto, S. P
APHP : Gustri Sarah Br. Regar, S. P
```

Data wali kelas diambil otomatis dari kolom `wali_kelas` di tabel `students`.

### Menambah Jurusan
Jika ada jurusan baru, update di:
1. `utils.js` → `JURUSAN_LIST` dan `JURUSAN_LABEL`
2. `angkatan.html` → HTML card jurusan
3. `galeri.html` → HTML card filter jurusan + counter ID
4. `user-memory.js` → option di ProfileModal
5. `style.css` → warna `.colored-XXXX` dan `.jurusan-card[data-jurusan="XXXX"]`
6. Supabase → update CHECK constraint di tabel `students`

---

## Profil Pengguna

### Alur Profil (`user-memory.js`)

```
Buka halaman → Silent init (cek localStorage/cookie/fingerprint/Supabase)
     ↓
Sudah punya profil → Tampilkan chip navbar, welcome back toast
     ↓
Belum punya profil → Tidak ada popup (biarkan browsing dulu)
     ↓
Klik Upload / Kirim Pesan → Tampilkan ProfileModal
     ↓
Isi nama + peran (+ jurusan jika Siswa/Alumni + angkatan jika Alumni)
     ↓
Simpan ke localStorage + cookie + Supabase user_profiles
```

### Penyimpanan Profil
1. **localStorage** — cache utama, paling cepat
2. **Cookie** — fallback cross-tab
3. **Device fingerprint** → Supabase `user_profiles` — persist antar sesi

### Ganti Nama
- User klik chip nama di navbar → RenameModal
- Request masuk ke `user_change_requests` dengan status `pending`
- Admin approve → status `applied` → nama otomatis update saat user buka halaman

### Catatan: Mode Incognito
Incognito selalu dianggap "tamu baru" karena localStorage & cookie tidak persist. Ini by design — tidak ada workaround yang bisa bypass browser privacy.

---

## Galeri & Upload Foto

### Kuota Upload
```javascript
const UPLOAD_MAX  = 3;           // Maksimal 3 upload
const REGEN_MS    = 3.5 * 3600000; // Regen 1 kuota per 3.5 jam
const UPLOAD_KEY  = '_pds_upload_log'; // Key localStorage
```

### Alur Upload
1. Klik "Tambahkan fotomu"
2. Cek profil → tampilkan ProfileModal jika belum ada
3. Pilih foto → compress/convert ke WebP (fallback JPEG)
4. Isi judul, deskripsi (opsional), kategori, jurusan (jika kategori = kelas)
5. Upload ke Supabase Storage → insert ke `user_gallery` dengan `is_approved = false`
6. Admin approve dari admin panel

### Kompresi Gambar
- Max dimensi: 1920px
- Quality: 0.85
- Format: WebP (jika browser support), fallback JPEG

### Load More (Append, bukan Replace)
- Saat klik "Lihat lebih banyak", foto baru di-**append** ke grid
- Grid tidak di-reset, layout tidak berubah
- `PER_PAGE = 10` foto per halaman

---

## Keamanan

### Yang Sudah Aman
- Supabase anon key (by design untuk frontend)
- Row Level Security (RLS) di Supabase — wajib aktif
- Admin panel hanya bisa diakses dengan login Supabase Auth
- Validasi nama pengguna di client (filter kata kasar, minimal 2 karakter)

### Yang Perlu Diperhatikan
- `user_profiles` bisa membengkak jika banyak tamu. Solusi yang direkomendasikan:
  - Jangan simpan profil `role = 'Anonim'` ke Supabase (simpan di localStorage saja)
  - Cleanup berkala dengan query:
    ```sql
    DELETE FROM user_profiles
    WHERE role = 'Anonim' OR last_seen < NOW() - INTERVAL '90 days';
    ```
- Rate limiting upload foto ada di localStorage (bisa dibypass dengan hapus storage)
- Untuk proteksi lebih, tambahkan RLS policy di `user_gallery`:
  ```sql
  -- Maksimal 3 insert per fingerprint per hari
  CREATE POLICY "limit uploads"
  ON user_gallery FOR INSERT
  WITH CHECK (
    (SELECT COUNT(*) FROM user_gallery
     WHERE device_fingerprint = current_setting('request.headers')::json->>'x-fingerprint'
     AND created_at > NOW() - INTERVAL '1 day') < 3
  );
  ```

---

## Catatan Desain

### Color System
```css
:root {
  --bg:          #0D0D0D;   /* Background utama */
  --bg-raised:   #141414;   /* Background elevated */
  --bg-card:     #1A1A1A;   /* Card background */
  --border:      #333330;   /* Garis grid */
  --border-gold: #6a5a30;   /* Garis aksen emas */
  --text:        #E8E2D6;   /* Teks utama */
  --text-muted:  #C8BEB0;   /* Teks sekunder */
  --text-dim:    #8A8070;   /* Teks tersier/label */
  --gold:        #B99B5A;   /* Aksen utama */
  --gold-bright: #D4B878;   /* Aksen hover */
  --gold-dim:    #7A6535;   /* Aksen redup */
}
```

### Tipografi
- **Judul**: Playfair Display (serif, italic untuk aksen)
- **Body**: DM Sans (weight 300, 400, 500)

### Prinsip Layout
- Mobile-first, max-width `480px` untuk konten utama
- Tablet breakpoint: `768px`
- Desktop breakpoint: `1024px` (max-width `1200px`)
- Navbar sticky, footer nav fixed di bawah
- Semua padding mobile: `16–24px`

### Jurusan & Warna
| Jurusan | Warna | Keterangan |
|---------|-------|------------|
| TSM | `#E05C50` (merah) | Teknik Sepeda Motor |
| MPLB | `#D4AC0D` (kuning) | Manajemen Perkantoran dan Layanan Bisnis |
| ATP | `#27AE60` (hijau) | Agribisnis Tanaman Perkebunan |
| APHP | `#3498DB` (biru) | Agribisnis Pengolahan Hasil Pertanian |

---

## User Behavior Profile

> Bagian ini mendokumentasikan pola kerja, keputusan, dan gaya interaksi pengembang selama sesi pembangunan proyek ini. Berguna untuk melanjutkan pengembangan secara konsisten.

---

### 1. Working Instructions

- **Jangan ubah file yang tidak disebutkan.** Kalau cuma minta fix CSS, jangan ubah JS dan sebaliknya.
- **Output hanya file yang berubah** — jangan ZIP semua file kalau cuma 1–2 yang berubah.
- **Jangan pakai ZIP** untuk mengurangi pemakaian token kecuali diminta eksplisit.
- **Baca file yang aktif di GitHub terlebih dahulu** sebelum edit — jangan apply ke versi lokal yang mungkin berbeda.
- **Jangan pisahkan JS ke file terpisah** tanpa diminta.
- **Jangan ubah logic JS** saat diminta hanya perbaikan CSS/layout.
- **Jangan pakai `rgba()`** untuk warna border dan background — pakai hex.
- **Jangan buat `<style>` inline di HTML** — semua CSS harus di `style.css`.
- **Teks tidak boleh muted/redup** — semua teks harus cukup terang untuk dibaca.
- **Garis grid harus terlihat** — border warna cukup kontras.
- **Konfirmasi dulu sebelum membuat perubahan besar** yang tidak diminta secara eksplisit.

---

### 2. Project Overview

**Proyek:** Buku kenangan digital (yearbook website) untuk angkatan 2026 SMK Negeri 3 Tapung Hulu.

**Stack:** Vanilla JS + HTML/CSS, Supabase, Vercel (GitHub Pages sebelumnya).

**Tujuan:** Website yang bisa diakses siswa untuk melihat daftar angkatan, galeri foto, kirim pesan kenangan, dan info sekolah.

**Perubahan arah:**
- Awalnya multi-file CSS → dikonsolidasikan ke satu `style.css`
- Domain dari GitHub Pages → pindah ke Vercel dengan domain custom
- Filter jurusan awalnya card grid → sempat dicoba dropdown → kembali ke card grid
- Popup profil: awalnya muncul saat halaman load → diubah ke muncul saat pertama kali upload/kirim

---

### 3. Key Decisions

- **Satu `style.css`** untuk semua halaman — tidak ada inline `<style>`
- **Vanilla JS** tanpa framework — tidak pakai React/Vue
- **Supabase anon key** di frontend — aman karena RLS aktif
- **Tidak pakai Tailwind** (walaupun pernah disebut) karena CSS custom properties tidak compatible tanpa build pipeline
- **Profil modal muncul saat aksi** (upload/kirim), bukan saat halaman dibuka
- **Load more = append**, bukan replace — mencegah layout grid bergeser
- **Jurusan "MP" di-rename ke "MPLB"** di semua file dan database
- **Label "Kepala Jurusan" diganti ke "Ketua Program Kompetensi"** sesuai struktur sekolah
- **Admin panel tetap di repo yang sama** — tidak dipisahkan, aman karena butuh Supabase Auth
- **OG image pakai file statis** (`og.jpg`) bukan dynamic generation — lebih simpel dan reliable

---

### 4. Decision Patterns

- **Validasi lewat screenshot** — perubahan selalu dikonfirmasi dengan screenshot sebelum lanjut ke perubahan berikutnya
- **Incremental, bukan big bang** — perubahan kecil per iterasi, bukan rewrite total
- **Preferensi reversi** — kalau perubahan baru ternyata lebih buruk, langsung minta balik ke versi sebelumnya
- **Eksplorasi dulu, putuskan setelah lihat opsi** — misal: tanya "kayak gimana dropdown itu?" sebelum memutuskan pakai atau tidak
- **Tanya kalau belum yakin** — pertanyaan pendek sebelum eksekusi, terutama untuk keputusan arsitektur
- **Scope ketat** — tolak perubahan yang tidak diminta, meski terlihat "lebih baik"

---

### 5. Prompting Style

- **Kalimat pendek, langsung ke intinya** — "Ini kenapa foto nya banyak yang nggak bisa di load"
- **Konteks visual lewat screenshot** — lebih sering kasih screenshot daripada deskripsi panjang
- **Koreksi langsung tanpa basa-basi** — "Kenapa malah di hapus total, aku minta di pindah bukan di hapus"
- **Tanya singkat untuk klarifikasi** — "Aman nggak?", "Perlu diisi nggak?", "Bisa nggak?"
- **Upload file langsung** saat perlu context kode — tidak copas manual kalau bisa upload
- **Konfirmasi pemahaman** sebelum eksekusi untuk perubahan yang berimplikasi besar

---

### 6. Execution Style

- **Kirim screenshot setelah implementasi** — validasi visual sebelum lanjut
- **Langsung tunjuk masalah** di screenshot — "ini kenapa", "itu yang salah"
- **Satu masalah per iterasi** — jarang request banyak hal sekaligus
- **Cepat switch direction** kalau hasil tidak sesuai — tidak memaksa solusi yang tidak cocok
- **Tidak suka output berlebihan** — "jangan pakai zip", "ini aja?"

---

### 7. Preferences

- **Simpel > kompleks** — tolak dropdown jika card lebih jelas, tolak framework jika vanilla cukup
- **Visual > teknikal** — prioritas tampilan yang "keliatan bagus" dan "nggak berjarak"
- **Kontrol penuh** — tidak suka perubahan yang tidak diminta, meski kecil
- **Mobile-first** — semua evaluasi dari HP, desktop adalah bonus
- **Dark theme konsisten** — tidak mau ada elemen yang terlihat terang/putih di mobile
- **Compact layout** — "buat lebih compact, lebih padet, jangan bikin penuh satu layar"
- **Informasi langsung keliatan** — tidak suka info penting yang harus diklik/dibuka dulu

---

### 8. Improvement Signals

| Masalah | Ekspektasi |
|---------|-----------|
| Popup profil muncul saat buka halaman | Hanya muncul saat klik upload/kirim |
| Load more reset layout grid | Append foto baru, tidak reset grid |
| CSS inline di HTML | Semua CSS di `style.css` |
| Warna teks terlalu redup di mobile | Semua teks harus terbaca tanpa effort |
| Garis grid hampir tidak terlihat | Border lebih tebal/terang |
| Foto ukuran sama semua (aspect-ratio 4/3) | Ikuti rasio asli gambar |
| Nav arrows nutupin gambar di modal | Pindahkan ke bawah, auto-hide setelah beberapa detik |
| Reaction picker tidak mendorong foto di bawahnya | Resize grid item setelah picker expand |
| Section filter + kajur terlalu besar | Compact, muat dalam satu layar |
| `rgba()` untuk warna → inkonsisten antar browser | Gunakan hex |

---

### 9. Stable Traits

- **Perfeksionis visual** — detail kecil seperti jarak, warna, dan keterbacaan selalu diperhatikan
- **Pragmatis teknologi** — pilih yang paling simpel yang bisa menyelesaikan masalah
- **Iteratif dengan validasi** — tidak langsung percaya output, selalu cek dengan screenshot
- **Scope-aware** — tahu batas antara "perbaiki ini" dan "ubah semuanya"
- **Mobile-centric** — semua keputusan visual dinilai dari perspektif mobile
- **Komunikasi langsung** — koreksi tanpa basa-basi, permintaan tanpa preamble panjang
- **Tidak suka overhead** — ZIP, file berlebihan, atau perubahan yang tidak diminta = friction
- **Konsistensi naming** — perubahan nama/label harus konsisten di semua file dan database
