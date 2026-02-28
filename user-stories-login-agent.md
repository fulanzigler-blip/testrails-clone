# User Stories - Login Feature

## 1. Login dengan Email dan Password

### User Story
**As a** registered user  
**I want** to log in using my email and password  
**So that** I can access my personal account and use the application securely

### Acceptance Criteria
- [x] User dapat memasukkan email dan password pada form login
- [x] Validasi format email harus benar (contoh: user@example.com)
- [x] Password harus terenkripsi saat dikirim ke server
- [x] Sistem menampilkan error jika email tidak terdaftar
- [x] Sistem menampilkan error jika password salah
- [x] Setelah login berhasil, user diarahkan ke dashboard/homepage
- [x] User mendapatkan token/session ID untuk autentikasi
- [x] Waktu respons login maksimal 2 detik

### Priority: **P0** (Must Have)

---

## 2. Remember Me

### User Story
**As a** registered user  
**I want** to stay logged in even after closing the browser  
**So that** I don't have to re-enter my credentials every time I visit the application

### Acceptance Criteria
- [x] Checkbox "Remember Me" tersedia pada form login
- [x] Jika dicentang, session berlangsung selama 30 hari
- [x] Jika TIDAK dicentang, session berakhir saat browser ditutup
- [x] Token "Remember Me" disimpan secara aman (HttpOnly cookie/secure storage)
- [x] User dapat mencabut "Remember Me" dari pengaturan akun
- [x] Token di-refresh secara periodic untuk keamanan
- [x] Token invalid jika user mengganti password

### Priority: **P1** (Should Have)

---

## 3. Forgot Password

### User Story
**As a** registered user who forgot their password  
**I want** to reset my password via email  
**So that** I can regain access to my account without contacting support

### Acceptance Criteria
- [x] Link "Forgot Password?" tersedia pada form login
- [x] User memasukkan email yang terdaftar
- [x] Sistem mengirimkan email reset password (jika email valid)
- [x] Link reset password berlaku selama 24 jam
- [x] Link reset password hanya bisa digunakan sekali
- [x] User dapat membuat password baru dengan minimal 8 karakter, 1 huruf besar, 1 angka, 1 simbol
- [x] User mendapatkan konfirmasi setelah password berhasil diubah
- [x] Semua session aktif user di-logout setelah reset password
- [x] Pesan yang sama ditampilkan ("Jika email terdaftar, kami akan mengirimkan link") meski email tidak ada untuk mencegah enumeration attack

### Priority: **P0** (Must Have)

---

## 4. Logout

### User Story
**As a** logged-in user  
**I want** to log out of my account  
**So that** my account remains secure when using a shared or public device

### Acceptance Criteria
- [x] Tombol "Logout" tersedia di navbar/menu user
- [x] Click logout menghapus session/token di server
- [x] Click logout menghapus token dari local storage/cookies
- [x] User diarahkan kembali ke halaman login setelah logout
- [x] User tidak dapat mengakses halaman protected setelah logout (redirect ke login)
- [x] Semua session user di device tersebut dihapus
- [x] Notifikasi "Berhasil logout" ditampilkan

### Priority: **P0** (Must Have)

---

## 5. Rate Limiting (Brute Force Protection)

### User Story
**As a** system administrator  
**I want** to limit failed login attempts  
**So that** brute force attacks can be prevented and account security is maintained

### Acceptance Criteria
- [x] Sistem mencatat jumlah failed login attempts per IP address dan per account
- [x] Setelah 5 kali gagal login, account di-lock selama 15 menit
- [x] Rate limiting berlaku untuk kombinasi IP + account
- [x] Saat di-lock, pesan error: "Terlalu banyak percobaan. Silakan coba lagi dalam 15 menit"
- [x] Reset counter failed attempts setelah login berhasil
- [x] Failed attempts log disimpan untuk audit keamanan
- [x] Admin dapat melihat log failed attempts di dashboard
- [x] Progressive delay: setiap 3 kali gagal, delay bertambah 3 detik
- [x] CAPTCHA muncul setelah 3 kali gagal (opsional)

### Priority: **P1** (Should Have)

---

## 6. Session Timeout

### User Story
**As a** logged-in user  
**I want** my session to expire after a period of inactivity  
**So that** my account remains secure if I leave my device unattended

### Acceptance Criteria
- [x] Idle timeout: session otomatis expired setelah 30 menit tidak ada aktivitas
- [x] User mendapatkan warning popup 5 menit sebelum timeout
- [x] User dapat menekan "Stay Logged In" untuk memperpanjang session
- [x] Absolute timeout: session maksimal 8 jam meski user aktif
- [x] Timeout menghapus session di server (tidak hanya di client)
- [x] Setelah timeout, user diarahkan ke form login dengan pesan "Session expired"
- [x] Aktivitas (mouse movement, keypress, swipe) dianggap sebagai active

### Priority: **P1** (Should Have)

---

## Prioritas Keseluruhan

| Feature | Priority |
|---------|----------|
| Login Email/Password | P0 |
| Forgot Password | P0 |
| Logout | P0 |
| Rate Limiting | P1 |
| Session Timeout | P1 |
| Remember Me | P1 |

### Keterangan Prioritas:
- **P0 (Must Have)**: Fitur wajib ada untuk MVP, aplikasi tidak berfungsi tanpanya
- **P1 (Should Have)**: Fitur penting untuk UX dan keamanan, dapat ditunda 1 sprint
- **P2 (Nice to Have)**: Fitur tambahan yang dapat diimplementasikan di sprint berikutnya
