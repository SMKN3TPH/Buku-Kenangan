# Pernah di Sini

> *"yang tersisa bukan siapa yang paling terlihat, tapi siapa yang pernah ada."*

Buku kenangan digital angkatan 2026 — SMK Negeri 3 Tapung Hulu.

**[→ Buka Website](https://smkn3tph.github.io/Perpisahan/)**

---

## Tentang

**Pernah di Sini** adalah buku kenangan berbasis web untuk angkatan 2023–2026 SMKN 3 Tapung Hulu. Dibangun sebagai ruang untuk menyimpan nama, foto, dan pesan sebelum semuanya benar-benar berpisah.

Tidak dibuat untuk terlihat hebat. Dibuat supaya diingat.

---

## Halaman

| Halaman | Deskripsi |
|---|---|
| `index.html` | Sampul — pintu masuk |
| `pembuka.html` | Catatan angkatan & tempat-tempat yang menyimpan cerita |
| `angkatan.html` | Arsip 68 nama, filter jurusan & inisial |
| `galeri.html` | Foto dokumentasi resmi + kiriman teman-teman |
| `pesan.html` | Buku pesan — tulis kenangan sebelum waktunya habis |
| `pustaka.html` | Profil sekolah & tautan resmi |

---

## Stack

- **Frontend** — HTML, CSS, Vanilla JavaScript. Tanpa framework.
- **Backend** — [Supabase](https://supabase.com) (database + storage + auth)
- **Deploy** — GitHub Pages

---

## Struktur File

```
├── index.html          # Sampul
├── pembuka.html        # Pembuka & catatan angkatan
├── angkatan.html       # Daftar siswa
├── galeri.html         # Galeri foto
├── pesan.html          # Buku pesan
├── pustaka.html        # Info sekolah
├── admin.html          # Dashboard admin (moderasi)
│
├── style.css           # Design system — CSS variables, komponen shared
├── utils.js            # Shared utilities (escHtml, formatTimeAgo, page transition, dll)
├── config.js           # Konfigurasi Supabase
├── supabase.js         # Semua fungsi database & storage
├── user-memory.js      # Sistem identitas user (fingerprint, profil, session)
├── galeri.js           # Logic halaman galeri
├── pesan.js            # Logic halaman pesan
└── admin.js            # Logic dashboard admin
```

---

## Fitur

**Galeri**
- Upload foto dengan kompresi otomatis & konversi WebP
- Masonry grid dengan lazy loading
- Modal preview dengan zoom (scroll/pinch), pan, swipe navigasi antar foto
- Sistem reaksi emoji per foto
- Like & view count

**Pesan**
- Kiriman pesan dengan sistem kuota (3 pesan / 4 jam)
- Filter per jurusan
- Reaksi emoji & like per pesan
- Moderasi sebelum tampil

**Angkatan**
- Arsip 68 siswa dengan filter jurusan & inisial
- Data real-time dari Supabase

**Sistem identitas**
- Profil user tersimpan via device fingerprint + localStorage + cookie
- Tidak perlu login — isi profil sekali, dikenali di kunjungan berikutnya
- Request ganti nama melalui moderasi admin

**Admin dashboard**
- Moderasi foto & pesan (approve / reject)
- Upload foto ke galeri admin
- Manajemen banned users & kata kasar
- Pengaturan tanggal penutupan sistem

---

## Setup Lokal

Clone repo dan buka langsung di browser — tidak perlu build step.

```bash
git clone https://github.com/smkn3tph/Perpisahan.git
cd Perpisahan
```

Buka `index.html` di browser. Untuk fitur yang butuh koneksi database (galeri, pesan, dll), perlu koneksi internet karena Supabase berjalan di cloud.

---

## Environment

Konfigurasi Supabase ada di `config.js`:

```js
const CONFIG = {
    SUPABASE_URL: '...',
    SUPABASE_ANON_KEY: '...',
};
```

`SUPABASE_ANON_KEY` yang dipakai adalah **publishable key** — aman untuk diekspos di frontend. Akses data dikontrol oleh Row Level Security (RLS) di Supabase.

---

## Tabel Database (Supabase)

| Tabel | Fungsi |
|---|---|
| `students` | Data siswa angkatan |
| `user_profiles` | Profil user (nama, role, jurusan, fingerprint) |
| `user_gallery` | Foto kiriman user |
| `admin_gallery` | Foto dokumentasi resmi |
| `pesan` | Pesan kenangan |
| `pesan_reaksi` | Reaksi emoji per pesan |
| `galeri_reaksi` | Reaksi emoji per foto |
| `message_likes` | Like per pesan |
| `gallery_likes` | Like per foto |
| `banned_users` | Daftar user yang dibanned |
| `blocked_words` | Kata-kata yang diblokir |
| `user_change_requests` | Request ganti nama |
| `site_config` | Konfigurasi sistem (tanggal penutupan, dll) |

**Storage bucket:** `gallery_photos`
- `user-uploads/` — foto kiriman user
- `admin-uploads/` — foto dokumentasi resmi

---

## Lisensi

Kode bebas digunakan dan dimodifikasi untuk keperluan serupa — buku kenangan sekolah lain, angkatan lain.

Konten (teks, nama siswa, foto) adalah milik angkatan 2026 SMKN 3 Tapung Hulu.

---

<p align="center">
  Angkatan 2023 – 2026 &nbsp;·&nbsp; SMK Negeri 3 Tapung Hulu<br>
  <em>Nggak selalu kompak. Tapi pernah ada.</em>
</p>
