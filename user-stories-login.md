# User Stories - Fitur Login

## 📌 Epic: Authentication

### US-001: Login dengan Email dan Password
**As a** pengguna terdaftar  
**I want** masuk ke aplikasi menggunakan email dan password  
**So that** saya bisa mengakses akun pribadi saya

**Acceptance Criteria:**
- [ ] Field email validasi format email
- [ ] Field password minimal 8 karakter
- [ ] Tombol "Login" disabled sampai semua field valid
- [ ] Error message jika kredensial salah (tanpa leak info valid/invalid)
- [ ] Redirect ke dashboard setelah login sukses
- [ ] Loading state saat proses login

**Priority:** P0 (Must Have)

---

### US-002: Remember Me / Stay Logged In
**As a** pengguna  
**I want** tetap login di perangkat yang sama  
**So that** saya tidak perlu login ulang setiap buka aplikasi

**Acceptance Criteria:**
- [ ] Checkbox "Remember me" saat login
- [ ] Session bertahan 30 hari jika dicentang
- [ ] Session expire 2 jam jika tidak dicentang
- [ ] Logout manual menghapus semua session

**Priority:** P1 (Should Have)

---

### US-003: Lupa Password
**As a** pengguna yang lupa password  
**I want** reset password via email  
**So that** saya bisa kembali mengakses akun

**Acceptance Criteria:**
- [ ] Link "Forgot password?" di halaman login
- [ ] Input email untuk kirim reset link
- [ ] Email reset terkirim dalam < 1 menit
- [ ] Reset link valid selama 1 jam
- [ ] Password baru harus beda dengan password lama
- [ ] Notifikasi sukses setelah reset

**Priority:** P1 (Should Have)

---

### US-004: Logout
**As a** pengguna yang login  
**I want** keluar dari akun saya  
**So that** akun saya aman saat selesai menggunakan aplikasi

**Acceptance Criteria:**
- [ ] Tombol "Logout" di menu/navigasi
- [ ] Konfirmasi logout (opsional toggle)
- [ ] Session dihapus dari server
- [ ] Redirect ke halaman login
- [ ] Cache local storage di-clear

**Priority:** P0 (Must Have)

---

### US-005: Validasi Sesi / Auto-Logout
**As a** pengguna  
**I want** otomatis logout jika idle terlalu lama  
**So that** akun saya tetap aman

**Acceptance Criteria:**
- [ ] Detect idle selama 30 menit
- [ ] Warning popup 5 menit sebelum auto-logout
- [ ] Extend session jika user interact dengan warning
- [ ] Redirect ke login setelah auto-logout
- [ ] Pesan "Session expired" ditampilkan

**Priority:** P2 (Could Have)

---

### US-006: Login dengan OAuth (Google)
**As a** pengguna  
**I want** login pakai akun Google saya  
**So that** lebih cepat tanpa harus ingat password baru

**Acceptance Criteria:**
- [ ] Tombol "Login with Google"
- [ ] OAuth flow redirect berjalan lancar
- [ ] Auto-create account jika email belum terdaftar
- [ ] Link OAuth ke account existing jika email sudah ada
- [ ] Profile picture dan nama dari Google digunakan

**Priority:** P2 (Could Have)

---

### US-007: Rate Limiting Login
**As a** sistem  
**I want** membatasi percobaan login  
**So that** mencegah brute force attack

**Acceptance Criteria:**
- [ ] Maksimal 5 login attempt per menit per IP
- [ ] Block 15 menit setelah 5x gagal
- [ ] CAPTCHA muncul setelah 3x gagal
- [ ] Notifikasi email jika terjadi multiple failed attempts

**Priority:** P1 (Should Have)

---

## 📝 Notes

- Semua endpoint login harus HTTPS
- Password disimpan dengan bcrypt (cost factor 12+)
- JWT token untuk session management
- Audit log untuk setiap login/logout

---
*Created: 2026-02-27*  
*Status: Draft - Ready for review*
