#!/usr/bin/env python3
"""
Test Automation Template - Login Feature
Backend API Tests using pytest
"""

import pytest
import requests
from datetime import datetime, timedelta

BASE_URL = "http://localhost:3000/api"
TEST_USER = {"email": "test@example.com", "password": "password123"}


class TestLoginAPI:
    """US-001: Login dengan Email dan Password"""

    def test_login_success(self):
        """TC-001.4: Login with valid credentials"""
        response = requests.post(f"{BASE_URL}/auth/login", json=TEST_USER)
        assert response.status_code == 200
        assert "token" in response.json()
        assert "user" in response.json()

    def test_login_invalid_password(self):
        """TC-001.5: Error message for wrong credentials"""
        payload = {"email": TEST_USER["email"], "password": "wrongpassword"}
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        assert response.status_code == 401
        assert "Email atau password salah" in response.json()["message"]

    def test_login_nonexistent_user(self):
        """TC-001.5: Error message for non-existent user"""
        payload = {"email": "nonexistent@test.com", "password": "password123"}
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        assert response.status_code == 401
        assert "Email atau password salah" in response.json()["message"]

    def test_login_sql_injection_protection(self):
        """SEC-001: SQL Injection protection"""
        payload = {"email": "' OR '1'='1", "password": "anything"}
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        assert response.status_code == 401


class TestSessionManagement:
    """US-002 & US-005: Remember Me & Session Validation"""

    def test_remember_me_session_duration(self):
        """TC-002.2: 30-day session with remember me"""
        payload = {**TEST_USER, "rememberMe": True}
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        token = response.json()["token"]
        # Decode JWT and check expiry
        # Should be ~30 days from now

    def test_session_expiry_short(self):
        """TC-002.3: 2-hour session without remember me"""
        payload = {**TEST_USER, "rememberMe": False}
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        # Check token expiry ~2 hours

    def test_logout_clears_session(self):
        """TC-004.3: Logout removes server session"""
        # Login first
        login_res = requests.post(f"{BASE_URL}/auth/login", json=TEST_USER)
        token = login_res.json()["token"]

        # Logout
        headers = {"Authorization": f"Bearer {token}"}
        logout_res = requests.post(f"{BASE_URL}/auth/logout", headers=headers)
        assert logout_res.status_code == 200

        # Try to use token
        protected_res = requests.get(f"{BASE_URL}/user/profile", headers=headers)
        assert protected_res.status_code == 401


class TestRateLimiting:
    """US-007: Rate Limiting & Brute Force Protection"""

    def test_rate_limit_5_attempts(self):
        """TC-007.1: Max 5 attempts per minute"""
        payload = {"email": "test@test.com", "password": "wrong"}

        # 5 attempts should work
        for i in range(5):
            response = requests.post(f"{BASE_URL}/auth/login", json=payload)
            assert response.status_code == 401

        # 6th attempt should be rate limited
        response = requests.post(f"{BASE_URL}/auth/login", json=payload)
        assert response.status_code == 429  # Too Many Requests

    def test_rate_limit_block_duration(self):
        """TC-007.2: 15-minute block after 5 failures"""
        # Implementation depends on rate limiting system
        pass


class TestForgotPassword:
    """US-003: Forgot Password"""

    def test_forgot_password_valid_email(self):
        """TC-003.3: Reset email sent successfully"""
        response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"email": TEST_USER["email"]}
        )
        assert response.status_code == 200

    def test_forgot_password_invalid_email(self):
        """Graceful handling of non-existent email"""
        response = requests.post(
            f"{BASE_URL}/auth/forgot-password",
            json={"email": "nonexistent@test.com"}
        )
        # Should return 200 even if email doesn't exist (security)
        assert response.status_code == 200


# Run with: pytest test-automation-template.py -v
if __name__ == "__main__":
    pytest.main([__file__, "-v"])
