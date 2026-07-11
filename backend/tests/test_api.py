import pytest
from httpx import AsyncClient, ASGITransport
import asyncio
from app.main import app

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.mark.asyncio
async def test_health_check():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        response = await ac.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        # Register
        test_username = "testuser99"
        res = await ac.post("/auth/register", json={"identifier": test_username, "display_name": "Test User"})
        # If already exists due to repeated test runs, handle both
        assert res.status_code in [200, 400]
        
        # Verify
        res = await ac.post("/auth/verify", json={"identifier": test_username, "otp": "123456"})
        assert res.status_code == 200
        
        # Login
        res = await ac.post("/auth/login", json={"identifier": test_username, "otp": "123456"})
        assert res.status_code == 200
        assert "access_token" in res.json()
        assert res.cookies.get("access_token") is not None
        
        # Me
        res_me = await ac.get("/auth/me")
        assert res_me.status_code == 200
        assert res_me.json()["username"] == test_username
