# Agent–Engine Tool Contract v0.2

> Kontrak antara **AI QA Agent** dan **Engine** (TestRails control plane +
> device layer). Semua integrasi dibangun di atas kontrak ini.
>
> Branch: `feature/ai-qa-agent-engine` · Status: DRAFT
> v0.2: otak agent pindah ke VPS; device host terpisah; Android-first
> (iOS deferral); tambah Laptop Runner Protocol.

---

## 1. Prinsip

1. **Agent hanya untuk kerja "mikir"**: explore app, generate skenario, repair
   flow yang rusak. **Replay regression = deterministik, tanpa agent.**
2. **Kontrak sama untuk web & mobile** — adaptor yang beda, API yang sama.
3. **Safety first**: aksi write di app production wajib lewat approval gate;
   captcha selalu human-in-the-loop; allowlist per app.
4. **Semua hasil = artifact** (spec 29119, flow YAML, screenshot, report).
5. **Scope: Android-first.** iOS (WDA/Mac) ditunda — desain kontrak tetap
   platform-agnostic, adaptor iOS menyusul.

## 2. Topologi

```
VPS — control plane + agent brain          Device hosts (terpisah)
┌───────────────────────────────┐          ┌─────────────────────────────┐
│ TestRails API + UI            │          │ A. Mac (existing)           │
│ Redis queue (jobs)            │  tailnet │    adb + Maestro + emulator │
│ Postgres (state/artifact)     │◄─SSH/WS──│ B. QA laptops (distributed) │
│ AGENT WORKER (Hermes profile) │─outbound─│    vet-agent daemon + adb   │
│  - explore / repair / audit   │          │    (Windows OK, no inbound) │
│  - Playwright (web explore)   │          │ C. Mini PC lab (nanti)      │
└───────────────────────────────┘          └─────────────────────────────┘
```

- **Otak agent jalan di VPS** (LLM calls via API; Playwright untuk web).
- **Tangan (adb/Maestro/emulator) selalu di device host** — hardware reality:
  emulator butuh KVM, HP butuh USB. VPS tidak menjalankan device.
- Worker ↔ device host lewat **device gateway** (§3.5): SSH batch (pilot) →
  HTTP daemon (production). QA **tidak pernah** memegang SSH.
- QA laptop = klien browser only; opsional jadi device host via daemon (§3.6).

## 3. Job Queue Contract

### 3.1 Tipe job

| type | deskripsi | input | output |
|---|---|---|---|
| `explore` | Agent jelajah app → skenario + flow | appId, target (web url / package), credentialsRef, guardrails | Spec29119, MaestroFlow[], DetectabilityReport, DefectReport[] |
| `replay` | Jalankan flow existing (tanpa agent) | runId (TestRun), flowPaths[], deviceId | RunResult (per-flow pass/fail + artifacts) |
| `repair` | Agent perbaiki flow yang gagal | failedRunId, failingFlows[] | FlowFix[] (diff), updated flows |
| `audit` | Detectability audit satu layar/app | target, screens[] | DetectabilityReport |

### 3.2 Job schema ( tabel `AgentJob` + Redis `queue:agent-jobs` )

```json
{
  "jobId": "uuid",
  "type": "explore",
  "appId": "id.co.bankraya.isdm",
  "platform": "android",
  "target": { "package": "id.co.bankraya.isdm", "baseUrl": null },
  "credentialsRef": "vault://apps/raya/qa-account",
  "guardrails": "profiles/raya.yaml",
  "runnerId": "uuid-of-device-host",  // optional; kosong = pool pilih
  "deviceId": "emulator-5554",
  "requestedBy": "user-uuid",
  "priority": 5                        // kecil = duluan; repair/explore > batch
}
```

States: `queued → claimed → running → awaiting_approval? → done | failed`
(heartbeat 15s; claimed tanpa heartbeat 60s = requeued).

### 3.3 Worker protocol (VPS)

```
claim: POST /api/agent-jobs/:id/claim   (atomic, workerId)
run  : heartbeat PATCH /api/agent-jobs/:id {status}
       mobile: delegasi ke device gateway (§3.5); web: lokal Playwright
push : POST /api/agent-jobs/:id/artifacts (multipart)
done : PATCH /api/agent-jobs/:id {status, summary, artifactIds[]}
```

### 3.4 Konkurensi & scaling

- Replay concurrency = jumlah **device**, bukan jumlah QA (queue menampung).
- Agent workers: mulai 2 (explore + repair); naik ~1 worker per device host.
- 20 QA concurrent = antrean lebih panjang, **bukan** lebih banyak agent.

### 3.5 Device Gateway (transport worker → device host)

| Fase | Transport | Catatan |
|---|---|---|
| Pilot | SSH batch + ControlMaster (multiplex) ke host | per-JOB, bukan per-tap |
| Production | `vet-gateway` daemon di host (HTTP :8100, launchd/systemd) | `/tap /dump /screenshot /run-flow /health`, per-device lock, reconnect aman |

Auth: kunci SSH khusus user `vet-runner` (no sudo, whitelist adb/maestro) —
atau token daemon. Semua via tailnet; tanpa port publik.

### 3.6 Laptop Runner Protocol (distributed, Android-only, QA laptop)

QA colok HP ke laptop Windows/Mac/Linux → device muncul di UI VET.

```
vet-agent daemon (laptop QA)                 VPS
- outbound WSS ke VPS  ───────────────────►  device registry:
- register(token, devices[])                 Device{type: laptop-agent,
- terima job → eksekusi via ADB langsung      online, reservedBy}
- stream screenshot/log per step
- offline = job reroute otomatis
```

- Eksekusi flow di laptop = **executor ADB kecil milik engine** (bukan
  Maestro CLI — Windows-native friendly); format flow tetap §4.
- Best practice: HP test khusus (bukan HP pribadi), akun test-only,
  DND saat run, cleanup steps di akhir flow.
- iOS TIDAK didukung dari laptop Windows (butuh Mac) — sesuai scope.

## 4. Tool Primitives (dipanggil agent selama explore/repair)

| Tool | Params | Returns |
|---|---|---|
| `screen.read` | deviceId \| browserPage | hierarchy (text/bounds/clickable) + screenshot b64 |
| `screen.vision` | screenshot b64, question | elemen + koordinat + confidence |
| `act.tap` | ladder: `{text} \| {contains} \| {point:"x,y"}` | hasil + post-screenshot |
| `act.input` | ladder target, value (masked in logs) | ok/err |
| `act.navigate` | android: monkey/launch · web: goto | ok |
| `app.state` | deviceId | currentFocus, pid, crashOracle |
| `flow.save` | steps[] (ladder + point + asserts) | MaestroFlow YAML (+flowId) |

**Selector ladder (wajib, urut):** `text → grouped-text → resource-id →
point`. Setiap step menyimpan ladder terpakai (bahan self-healing).

## 5. Guardrail config (per app, `profiles/*.yaml`)

```yaml
app: id.co.bankraya.isdm
env: PROD                          # PROD | TEST
allowlist_screens: [LoginScreen, HomeScreen, AbsensiScreen, PresensiScreen]
forbidden_actions: [submit_leave, submit_permission, check_out]
write_actions:
  - { action: check_in, requires_approval: true }
captcha: human_in_the_loop
session_timeout_guard: true
max_steps_per_job: 150
```

`env: PROD` → approval tidak bisa dioverride oleh job.

## 6. Output Contracts

1. **Spec29119** — conditions/cases/traceability (schema `iso29119.py`) →
   TestCase/TestSuite + JSON.
2. **MaestroFlow[]** — YAML per skenario (ladder §4).
3. **DetectabilityReport** — per layar `{screen, total, byText, byGrouped,
   byGhost[], score}` + screenshot.
4. **DefectReport** — `{title, severity, steps[], evidence[], expected,
   observed}`.

## 7. Device Booking API

```
GET  /api/devices                  → [{id, platform, type, status, reservedBy}]
POST /api/devices/{id}/reserve     {holder, ttlMinutes}
POST /api/devices/{id}/release
```
Job tanpa `deviceId` ambil device `idle` dari pool. Device `busy` menolak job.

## 8. 29119 Sidecar (Python container)

- `iso29119-sidecar`: `POST /generate` (structure → spec), `POST /report`.
- Backend Node memanggil `http://iso29119:8100` (compose yang sama).
- Sumber skema: `iso-tester-agent/iso29119.py` (36 test hijau).

## 9. Worked Example — Jagat Raya (sesi 10–11 Sep, manual today; kontrak ini
harus bisa mereplay-nya programatically)

```
explore → screen.read(login) → act.input(PN/pass)
→ captcha: screen.vision → human_in_the_loop → act.tap(Masuk)
→ per modul: screen.read + act.tap + back
→ absen: DIALOG GHOST → ladder fallthrough → act.tap{point:"70%,62%"}
→ app.state (crash oracle) → verify by text
→ flow.save + Spec29119(43) + Detectability(70/20/10) + DefectReport(5)
```

## 10. Security

- Kredensial: vault ref, di-inject saat job, tak pernah di log/artifact.
- `env: PROD` → approval wajib (UI, Notification model).
- AuditLog: semua job, approval, act.*.
- Runner access: user khusus, key/token, tailnet-only, whitelist perintah.

## 11. Keputusan terbuka

- [ ] Vision provider (GLM-4.5v vs Claude vision) + fallback human loop UI
- [x] iOS → DITUNDA (Android-first); kontrak tetap platform-agnostic
- [x] Topologi → otak di VPS, device host terpisah (Mac → mini PC lab)
- [ ] Retensi artifact (usulan: screenshot/video 14 hari)
