# Agent–Engine Tool Contract v0.1

> Kontrak antara **AI QA Agent** (Hermes worker di runner) dan **Engine**
> (TestRails control plane + device layer). Semua integrasi dibangun di atas
> kontrak ini — bukan di atas vibes.
>
> Branch: `feature/ai-qa-agent-engine` · Status: DRAFT untuk review

---

## 1. Prinsip

1. **Agent hanya untuk kerja "mikir"**: explore app, generate skenario, repair
   flow yang rusak. **Replay regression = deterministik, tanpa agent.**
2. **Kontrak sama untuk web & mobile** — adaptor yang beda, API yang sama.
3. **Safety first**: aksi write di app production wajib lewat approval gate;
   captcha selalu human-in-the-loop; allowlist per app.
4. **Semua hasil = artifact** (spec 29119, flow YAML, screenshot, report) —
   tersimpan di control plane, bisa diaudit.

## 2. Topologi

```
VPS (control plane)          Mac runner (device lab)
┌──────────────────┐         ┌─────────────────────────────┐
│ TestRails API    │◄─HTTP──►│ agent-worker (Hermes profile)│
│ Redis queue      │─jobs───►│   ├─ tool-client             │
│ Postgres (state) │         │   ├─ Maestro + ADB + emulator│
│ UI (device portal)│        │   └─ Playwright (web)        │
└──────────────────┘         └─────────────────────────────┘
```

- VPS: enqueue job, simpan state/artifact, sajikan UI. **Tidak** menjalankan
  emulator maupun agent ( resource-constrained: 2c/3.7GB ).
- Runner: polling job dari queue, menjalankan agent / replay, push artifact.

## 3. Job Queue Contract

### 3.1 Tipe job

| type | deskripsi | input | output |
|---|---|---|---|
| `explore` | Agent jelajah app → skenario + flow | appId, target (web url / package), credentialsRef, guardrails | Spec29119, MaestroFlow[], DetectabilityReport, DefectReport[] |
| `replay` | Jalankan flow existing (tanpa agent) | runId (TestRun), flowPaths[], deviceId | RunResult (per-flow pass/fail + artifacts) |
| `repair` | Agent perbaiki flow yang gagal | failedRunId, failingFlows[] | FlowFix[] (diff), updated flows |
| `audit` | Detectability audit satu layar/app | target, screens[] | DetectabilityReport |

### 3.2 Job schema (Redis `queue:agent-jobs`, JSON)

```json
{
  "jobId": "uuid",
  "type": "explore",
  "appId": "id.co.bankraya.isdm",
  "platform": "android",            // android | ios | web
  "target": { "package": "id.co.bankraya.isdm", "baseUrl": null },
  "credentialsRef": "vault://apps/raya/qa-account",   // never inline secrets
  "guardrails": "profiles/raya.yaml",                 // see §5
  "deviceId": "emulator-5554",      // optional; else pool picks
  "requestedBy": "user-uuid",
  "createdAt": "2026-09-11T03:00:00Z"
}
```

States: `queued → claimed → running → awaiting_approval? → done | failed`
(heartbeat tiap 15s; claimed tanpa heartbeat 60s = requeued).

### 3.3 Worker protocol

```
BRPOP queue:agent-jobs  → SET job:{id} status/heartbeat (hash) → run
→ push artifacts: POST /api/agent/artifacts (multipart: spec/flow/png/xml)
→ PATCH /api/agent/jobs/{id} {status, summary, artifactIds[]}
```

## 4. Tool Primitives (dipanggil agent DURASI explore/repair)

Semua via HTTP ke engine (atau lokal lib di runner). Response selalu
`{ok, data|error, telemetry}`.

| Tool | Params | Returns |
|---|---|---|
| `screen.read` | deviceId \| browserPage | hierarchy (nodes/text/bounds/clickable) + screenshot b64 |
| `screen.vision` | screenshot b64, question | teks/elemen + koordinat + confidence (vision model) |
| `act.tap` | ladder: `{text} \| {contains} \| {point:"x,y"}` | hasil + post-screenshot |
| `act.input` | ladder target, value (masked in logs) | ok/err |
| `act.navigate` | android: monkey/launch · web: goto url | ok |
| `app.state` | deviceId | currentFocus, pid, crashOracle result |
| `flow.save` | steps[] (ladder + point + asserts) | MaestroFlow YAML (+ flowId) |

**Selector ladder (wajib, urut):** `text → grouped-text (contains) →
resource-id → point (koordinat, dari vision atau dump)` — tiap step menyimpan
ladder yang dipakai, untuk self-healing (§ Phase 3).

## 5. Guardrail config (per app, YAML di repo `profiles/`)

```yaml
app: id.co.bankraya.isdm
env: PROD                          # PROD | TEST
allowlist_screens:
  - LoginScreen
  - HomeScreen
  - AbsensiScreen
  - PresensiScreen
forbidden_actions:                 # never auto-run, always approval
  - submit_leave
  - submit_permission
  - check_out
write_actions:                     # dry-run by default
  - { action: check_in, requires_approval: true }
captcha: human_in_the_loop         # engine pauses, QA fills
session_timeout_guard: true        # re-login flow if mCurrentFocus changes
max_steps_per_job: 150
```

## 6. Output Contracts

1. **Spec29119** — skema `iso29119.generate_spec` (conditions, cases,
   traceability) → disimpan sebagai TestCase/TestSuite di TestRails + JSON
   lengkap.
2. **MaestroFlow[]** — YAML per skenario, memakai ladder §4.
3. **DetectabilityReport** — per layar:
   `{screen, total, byText, byGrouped, byGhost[], score}` + screenshot.
4. **DefectReport** — `{title, severity, steps[], evidence[], expected,
   observed}`.

## 7. Device Booking API (device portal, anti-tabrakan)

```
GET  /api/devices                  → [{id, platform, status, reservedBy, ...}]
POST /api/devices/{id}/reserve     {holder: jobId|userId, ttlMinutes}
POST /api/devices/{id}/release
```
- Job tanpa `deviceId` otomatis ambil device `idle`.
- Device `busy` menolak job baru (queue menunggu).

## 8. 29119 Sidecar (Python, di compose yang sama)

- Container `iso29119-sidecar`: `POST /generate` (page structure → spec),
  `POST /report` (cases+results → status report).
- Backend Node memanggil via service name (http://iso29119:8100).
- Sumber kebenaran skema: `iso-tester-agent/iso29119.py` (36 test hijau).

## 9. Worked Example — Jagat Raya (sesi 10–11 Sep, mode manual hari ini)

Urutan yang HARUS bisa direplay oleh kontrak ini:

```
explore(job) → screen.read(login) → act.input(PN) → act.input(pass)
→ captcha: screen.vision → human_in_the_loop → act.tap(Masuk)
→ screen.read(home) → per modul: screen.read + act.tap + back
→ absen: act.tap(Absen Datang) → DIALOG GHOST → ladder fallthrough → point
   {point:"70%,62%"} → app.state (crash oracle) → verify via text
→ flow.save + Spec29119(43 cases) + DetectabilityReport(70/20/10)
   + DefectReport(radius-not-enforced, stale-captcha, a11y-dialog, ...)
```

## 10. Security

- Kredensial app: vault ref only, di-inject ke worker saat job berjalan,
  **tidak pernah** masuk log/artifact.
- `env: PROD` → guardrail `requires_approval` tidak bisa dioverride oleh
  job; approval via UI (Notification model yang sudah ada).
- AuditLog: semua job, approval, dan act.* tercatat.

## 11. Keputusan terbuka

- [ ] Vision provider (GLM-4.5v vs Claude vision) + fallback human loop UI
- [ ] iOS: WDA adaptor — diprioritaskan setelah Android stabil
- [ ] Retensi artifact (usulan: screenshot/video 14 hari)
