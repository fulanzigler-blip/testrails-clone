# Lessons Learned — TestRails Clone

> Project-specific lessons. General pipeline lessons: `~/sdlc-pipeline/lessons_learn.md`

---

## Maestro Integration

### Java path di Mac runner
Java ada di `/Users/clawbot/jdk17/Contents/Home/bin/java` — bukan di system path default. `/usr/libexec/java_home` return kosong di SSH non-interactive session. Hardcode `JAVA_HOME=/Users/clawbot/jdk17/Contents/Home`.

### Discipline Tracker app — Login screen
- Email field: `hintText="nama@company.com"` (tidak ada resource-id)
- Password field: label `"Password"`, hintText = karakter unicode (tidak reliable)
- Submit button: `accessibilityText="Masuk"` (bukan "Login")
- App ID: `com.disciplinetracker.app`
- Demo accounts di login screen: Manager (`budi@company.com`), Internal (`andi@company.com`), Outsource (`tono@vendor.com`)

### Flow yang verified jalan
```yaml
appId: com.disciplinetracker.app
---
- launchApp
- waitForAnimationToEnd
- tapOn: "nama@company.com"
- inputText: "{email}"
- tapOn: "Password"
- inputText: "{password}"
- hideKeyboard
- tapOn: "Masuk"
- waitForAnimationToEnd
```

### Mac runner
- Host: `100.76.181.104`, user: `clawbot`, key: `/home/clawdbot/.ssh/id_ed25519`
- Flows dir: `/Users/clawbot/maestro-flows/`
- Device: Huawei (`SDE0219926003245`), Android 33, pixel_6 profile
- Maestro version: 2.4.0

---

## Backend

### Field naming inconsistency
Backend API return camelCase tapi beberapa TypeScript type define snake_case. Fix dengan `?? fallback`:
```typescript
run.passRate ?? run.pass_rate ?? 0
```

### Prisma pagination bug
Semua route yang terima `page`/`perPage` dari query string harus `parseInt()` — sudah fix di `test-suites.ts` dan `test-cases.ts`.

### JWT expiry
Set ke `2h` di `.env` karena crawl bisa butuh waktu lama. Default 15m terlalu pendek.

---

## Crawl & Generate

### Two-phase login detection
Phase 1: `POST /test-cases/detect-login-screen` — deteksi fields tanpa credential, simpan raw hierarchy.
Phase 2: `POST /test-cases/crawl-generate` — kirim `loginSummary`, `rawHierarchy`, dan `credentials`.

### Login flow generation: no AI
Login flow YAML dibangun deterministik dari `rawHierarchy` — extract hintText fields dan accessibilityText button. AI tidak dipakai untuk ini karena terlalu sering halusinasi element yang tidak ada.

### AI-generated non-login flows
AI dikasih list element nyata dari hierarchy (`Available UI elements`) dan diwajibkan hanya pakai yang ada di list. `tapOn: {point: "X%,Y%"}` sebagai fallback kalau tidak ada text yang cocok.

### Clear flows before save
`saveFlowsToMac(flows, clearFirst=true)` — hapus semua `.yaml` lama sebelum simpan yang baru supaya tidak ada duplikat/file stale.
