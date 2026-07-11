import asyncio
import websockets
import json
import urllib.request
import urllib.parse
from contextlib import asynccontextmanager
import uuid
import sys

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

def request(method, path, data=None, token=None, assert_status=None):
    url = BASE_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Cookie'] = f'access_token={token}'
        
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            status = response.getcode()
            if assert_status and status != assert_status:
                raise Exception(f"Expected {assert_status}, got {status}")
            return json.loads(res_data) if res_data else None
    except urllib.error.HTTPError as e:
        if assert_status and e.code == assert_status:
            return None
        print(f"HTTP Error {e.code} on {path}: {e.read().decode('utf-8')}")
        raise e

async def test_edge_cases():
    print("=== Testing Edge Cases ===")
    
    uid_a = str(uuid.uuid4())[:8]
    uid_b = str(uuid.uuid4())[:8]
    uid_c = str(uuid.uuid4())[:8]
    
    # 1. Setup 3 Users
    print("Setting up Users...")
    request("POST", "/auth/register", {"identifier": f"user_a_{uid_a}", "display_name": "A"})
    res_a = request("POST", "/auth/verify", {"identifier": f"user_a_{uid_a}", "otp": "123456"})
    token_a = res_a['access_token']
    
    request("POST", "/auth/register", {"identifier": f"user_b_{uid_b}", "display_name": "B"})
    res_b = request("POST", "/auth/verify", {"identifier": f"user_b_{uid_b}", "otp": "123456"})
    token_b = res_b['access_token']
    user_b_id = res_b['user_id']
    
    request("POST", "/auth/register", {"identifier": f"user_c_{uid_c}", "display_name": "C"})
    res_c = request("POST", "/auth/verify", {"identifier": f"user_c_{uid_c}", "otp": "123456"})
    token_c = res_c['access_token']
    
    # 2. A and B have a conversation
    conv = request("POST", "/conversations/", {"type": "direct", "participant_ids": [user_b_id]}, token=token_a)
    conv_id = conv['id']
    
    # 3. Security: C tries to send a message to A and B's conversation
    print("Testing Security: unauthorized message send...")
    try:
        request("POST", f"/conversations/{conv_id}/messages", {"content": "Hacked"}, token=token_c, assert_status=403)
        print(" -> SUCCESS: 403 Forbidden correctly returned.")
    except Exception as e:
        print(" -> FAILED: C was able to send or unexpected error.")
        sys.exit(1)
        
    # 4. Security: C tries to fetch A and B's conversation messages
    print("Testing Security: unauthorized message read...")
    try:
        request("GET", f"/conversations/{conv_id}/messages", token=token_c, assert_status=403)
        print(" -> SUCCESS: 403 Forbidden correctly returned.")
    except Exception as e:
        print(" -> FAILED: C was able to read or unexpected error.")
        sys.exit(1)
        
    # 5. WS Invalid Token
    print("Testing WS Security: invalid token...")
    try:
        async with websockets.connect(f"{WS_URL}?token=invalid_token") as ws:
            pass
        print(" -> FAILED: Connection accepted with invalid token.")
        sys.exit(1)
    except websockets.exceptions.InvalidStatus as e:
        if e.response.status_code == 403:
            print(" -> SUCCESS: Invalid token rejected (403 Forbidden).")
        else:
            print(f" -> SUCCESS: Invalid token rejected ({e.response.status_code}).")
            
    # 6. WS Multi-connection
    print("Testing WS Multi-connection presence...")
    ws1 = await websockets.connect(f"{WS_URL}?token={token_a}")
    ws2 = await websockets.connect(f"{WS_URL}?token={token_a}")
    
    # Close one
    await ws1.close()
    await asyncio.sleep(0.5)
    
    # Check if A is still online via API
    me = request("GET", "/auth/me", token=token_a)
    if not me['is_online']:
        print(" -> FAILED: User A went offline after closing only 1 of 2 connections.")
        sys.exit(1)
    else:
        print(" -> SUCCESS: User A remains online while 2nd connection is active.")
        
    # Close second
    await ws2.close()
    await asyncio.sleep(0.5)
    
    me = request("GET", "/auth/me", token=token_a)
    if me['is_online']:
        print(" -> FAILED: User A is still online after closing all connections.")
        sys.exit(1)
    else:
        print(" -> SUCCESS: User A went offline after closing all connections.")
        
    print("\nAll edge case tests passed successfully!")

if __name__ == "__main__":
    asyncio.run(test_edge_cases())
