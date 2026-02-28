# Test Cases - Login Feature

## US-001: Login dengan Email dan Password

### TC-001.1: Valid Email Format Validation
**Priority:** P0 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open login page | Page loads successfully |
| 2 | Enter "invalid" in email field | Validation error shows "Format email tidak valid" |
| 3 | Enter "test@" in email field | Validation error persists |
| 4 | Enter "test@example.com" | No error, field valid |

### TC-001.2: Password Minimum Length Validation
**Priority:** P0 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter email valid | Field accepted |
| 2 | Enter password "1234567" (7 chars) | Error: "Password minimal 8 karakter" |
| 3 | Enter password "12345678" (8 chars) | No error, field valid |

### TC-001.3: Login Button State (Disabled Until Valid)
**Priority:** P0 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Load login page | Login button disabled |
| 2 | Fill valid email only | Button still disabled |
| 3 | Fill valid password only | Button still disabled |
| 4 | Fill both valid email & password | Button enabled |

### TC-001.4: Login with Valid Credentials
**Priority:** P0 | **Type:** E2E
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter valid email: "user@test.com" | Field filled |
| 2 | Enter valid password: "password123" | Field filled (masked) |
| 3 | Click Login button | Loading indicator shows |
| 4 | Wait for response | Redirect to dashboard |
| 5 | Verify URL | /dashboard present |

### TC-001.5: Login with Invalid Credentials - Error Message
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter valid email format | Field filled |
| 2 | Enter wrong password | Field filled |
| 3 | Click Login | Error message shown |
| 4 | Verify error text | "Email atau password salah" (generic) |
| 5 | Verify no leak | No indication which field is wrong |

### TC-001.6: Loading State During Login
**Priority:** P0 | **Type:** UI/UX
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fill valid credentials | Ready to submit |
| 2 | Click Login button | Button shows spinner/loading |
| 3 | Verify button state | Disabled during loading |
| 4 | After response | Loading state removed |

---

## US-002: Remember Me / Stay Logged In

### TC-002.1: Remember Me Checkbox Present
**Priority:** P1 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open login page | Checkbox "Ingat saya" visible |
| 2 | Verify default state | Unchecked by default |

### TC-002.2: Session Persistence - Remember Me Checked
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login with "Remember me" checked |
| 2 | Close browser | Session persists |
| 3 | Reopen after 24 hours | Still logged in |
| 4 | Check cookie expiry | JWT cookie expiry = 30 days |

### TC-002.3: Session Expiry - Remember Me Unchecked
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login without "Remember me" | Session created |
| 2 | Wait 2+ hours | Session expires |
| 3 | Refresh page | Redirected to login |

### TC-002.4: Manual Logout Clears All Sessions
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login with remember me | Session active |
| 2 | Click Logout | Redirect to login |
| 3 | Reopen browser | Must login again |

---

## US-003: Lupa Password

### TC-003.1: Forgot Password Link Visible
**Priority:** P1 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open login page | Link "Lupa password?" visible |
| 2 | Click link | Navigate to reset page |

### TC-003.2: Reset Email Input
**Priority:** P1 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open forgot password page | Email input visible |
| 2 | Enter invalid email | Validation error |
| 3 | Enter valid email | Submit enabled |

### TC-003.3: Reset Email Sent Successfully
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter valid registered email | Field filled |
| 2 | Click "Kirim link reset" | Success message shown |
| 3 | Check email delivery | Email received < 1 min |

### TC-003.4: Reset Link Expiry (1 Hour)
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Request reset link | Link received |
| 2 | Wait 1+ hour | - |
| 3 | Click link | Error: "Link sudah expired" |

### TC-003.5: New Password Different from Old
**Priority:** P1 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Use valid reset link | Reset form shows |
| 2 | Enter old password | Error: "Password baru harus berbeda" |
| 3 | Enter new unique password | Success |

### TC-003.6: Success Notification After Reset
**Priority:** P1 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Complete reset password | Submit clicked |
| 2 | Verify notification | "Password berhasil diubah" shown |
| 3 | Auto-redirect | Redirect to login after 3s |

---

## US-004: Logout

### TC-004.1: Logout Button Accessible
**Priority:** P0 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login successfully | Dashboard shown |
| 2 | Verify logout location | Button in menu/nav |

### TC-004.2: Logout Confirmation Flow
**Priority:** P0 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Logout | Confirmation dialog shown |
| 2 | Click Cancel | Dialog closes, stay logged in |
| 3 | Click Logout → Confirm | Logout successful |

### TC-004.3: Session Removed from Server
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login | Session created (check token) |
| 2 | Logout | 200 OK response |
| 3 | Reuse old token | 401 Unauthorized |

### TC-004.4: Local Storage Cleared
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login | localStorage has auth data |
| 2 | Logout | localStorage auth keys removed |
| 3 | Check cookies | Auth cookies cleared |

---

## US-005: Validasi Sesi / Auto-Logout

### TC-005.1: Idle Detection
**Priority:** P2 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login | Active session |
| 2 | Stay idle 25 minutes | Session still active |
| 3 | Stay idle 30+ minutes | Warning or logout |

### TC-005.2: Warning Popup Before Auto-Logout
**Priority:** P2 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login | Active session |
| 2 | Wait until 25 minutes idle | Warning popup shown |
| 3 | Popup text | "Sesi akan berakhir dalam 5 menit" |

### TC-005.3: Extend Session on Interaction
**Priority:** P2 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Wait for warning popup | Popup visible |
| 2 | Click "Lanjutkan sesi" | Session extended |
| 3 | Verify | No auto-logout occurs |

### TC-005.4: Auto-Logout After No Response
**Priority:** P2 | **Type:** E2E
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Wait for warning | Popup shown (t=25min) |
| 2 | Wait 5 more minutes | Auto-logout executes |
| 3 | Redirect | Sent to login page |
| 4 | Error message | "Sesi telah berakhir" displayed |

---

## US-006: Login dengan OAuth (Google)

### TC-006.1: Google Login Button Visible
**Priority:** P2 | **Type:** UI
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Open login page | "Login dengan Google" button visible |
| 2 | Verify icon | Google icon present |

### TC-006.2: OAuth Redirect Flow
**Priority:** P2 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Click Google login | Redirect to Google consent |
| 2 | Approve on Google | Redirect back to app |
| 3 | Landing page | Dashboard shown |

### TC-006.3: Auto-Create New Account
**Priority:** P2 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Use new Google email | Not registered before |
| 2 | Complete OAuth flow | Account auto-created |
| 3 | Verify dashboard | Logged in successfully |

### TC-006.4: Link OAuth to Existing Account
**Priority:** P2 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Use registered email via Google | Already has account |
| 2 | Complete OAuth | Linked to existing account |
| 3 | Verify data | Profile preserved |

### TC-006.5: Google Profile Data Synced
**Priority:** P2 | **Type:** Functional
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login with Google | First time |
| 2 | Check profile | Name from Google displayed |
| 3 | Check avatar | Google profile picture used |

---

## US-007: Rate Limiting Login

### TC-007.1: Max 5 Attempts Per Minute Per IP
**Priority:** P1 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Attempt login 5x with wrong password | All 5 attempts processed |
| 2 | 6th attempt within 1 min | Error: "Terlalu banyak percobaan" |
| 3 | Wait 1 minute | Can attempt again |

### TC-007.2: 15-Minute Block After 5 Failures
**Priority:** P1 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fail login 5 times in a row | 5 errors shown |
| 2 | 6th attempt | Blocked message |
| 3 | Attempt after 10 min | Still blocked |
| 4 | Attempt after 15+ min | Login works |

### TC-007.3: CAPTCHA After 3 Failed Attempts
**Priority:** P1 | **Type:** UI/Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Fail login 1x | No CAPTCHA |
| 2 | Fail login 2x | No CAPTCHA |
| 3 | Fail login 3x | CAPTCHA appears |
| 4 | 4th+ attempt | Must solve CAPTCHA |

### TC-007.4: Email Notification on Multiple Failed Attempts
**Priority:** P1 | **Type:** Integration
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Attempt wrong password 3x | - |
| 2 | Check email | Security alert email received |
| 3 | Email content | Mentions "percobaan login gagal" |

---

## Security Test Cases

### SEC-001: SQL Injection in Login Fields
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter `' OR '1'='1` in email | Input sanitized |
| 2 | Enter `"; DROP TABLE users; --` | Input rejected |
| 3 | Submit | Generic error, no SQL error leaked |

### SEC-002: XSS in Login Fields
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Enter `<script>alert('xss')</script>` | Script not executed |
| 2 | Submit | Generic error, payload sanitized |

### SEC-003: HTTPS Enforcement
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Access http:// | Auto-redirect to https:// |
| 2 | Verify certificate | Valid SSL cert |

### SEC-004: Password Stored with bcrypt
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Check database | Password is bcrypt hash |
| 2 | Verify cost factor | Cost >= 12 |

### SEC-005: JWT Implementation
**Priority:** P0 | **Type:** Security
| Step | Action | Expected Result |
|------|--------|----------------|
| 1 | Login | JWT returned |
| 2 | Decode token | Contains user ID, exp |
| 3 | Verify signed | Signature valid |
| 4 | Tamper test | Modified token rejected |

---

## Performance Test Cases

### PERF-001: Login Response Time
**Priority:** P1 | **Type:** Performance
| Metric | Target |
|--------|--------|
| API response | < 200ms |
| Page load | < 2s |

### PERF-002: Concurrent Login Load
**Priority:** P1 | **Type:** Load Testing
| Scenario | Target |
|----------|--------|
| 100 concurrent logins | < 1s avg response |
| 1000 concurrent logins | < 3s avg response |

---

## Regression Test Suite

To run after any changes:
- [ ] TC-001.4: Valid login flow
- [ ] TC-001.5: Invalid credentials error
- [ ] TC-004.3: Logout clears session
- [ ] SEC-001: SQL injection protection
- [ ] PERF-001: Response time < 200ms
