import asyncio
import websockets
import json
import urllib.request
import urllib.parse
from contextlib import asynccontextmanager

BASE_URL = "http://127.0.0.1:8000"
WS_URL = "ws://127.0.0.1:8000/ws"

def request(method, path, data=None, token=None):
    url = BASE_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Cookie'] = f'access_token={token}'
        
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    with urllib.request.urlopen(req) as response:
        res_data = response.read().decode('utf-8')
        return json.loads(res_data) if res_data else None

async def test_websocket_flow():
    import uuid
    uid_a = str(uuid.uuid4())[:8]
    uid_b = str(uuid.uuid4())[:8]
    
    # 1. Register & Login User A
    print("Setting up User A...")
    request("POST", "/auth/register", {"identifier": f"ws_user_a_{uid_a}", "display_name": "User A"})
    res_a = request("POST", "/auth/verify", {"identifier": f"ws_user_a_{uid_a}", "otp": "123456"})
    token_a = res_a['access_token']
    
    # 2. Register & Login User B
    print("Setting up User B...")
    request("POST", "/auth/register", {"identifier": f"ws_user_b_{uid_b}", "display_name": "User B"})
    res_b = request("POST", "/auth/verify", {"identifier": f"ws_user_b_{uid_b}", "otp": "123456"})
    token_b = res_b['access_token']
    user_b_id = res_b['user_id']
    
    # 3. Create conversation A -> B
    print("Creating conversation...")
    conv = request("POST", "/conversations/", {"type": "direct", "participant_ids": [user_b_id]}, token=token_a)
    conv_id = conv['id']
    
    print("Connecting WebSockets...")
    # Connect both
    async with websockets.connect(f"{WS_URL}?token={token_a}") as ws_a, \
               websockets.connect(f"{WS_URL}?token={token_b}") as ws_b:
               
        # User A starts typing
        print("User A starts typing...")
        await ws_a.send(json.dumps({
            "type": "typing.start",
            "payload": {"conversation_id": conv_id}
        }))
        
        # User B should receive typing event
        print("User B waiting for typing event...")
        try:
            msg_b = await asyncio.wait_for(ws_b.recv(), timeout=3.0)
            print("User B received:", msg_b)
            assert json.loads(msg_b)['type'] == 'typing.update'
        except Exception as e:
            print(f"Error on B recv: {e}")
            return
        
        # User A sends a message via REST
        print("User A sending message via REST...")
        msg_res = request("POST", f"/conversations/{conv_id}/messages", {"content": "WS Test Message"}, token=token_a)
        msg_id = msg_res['id']
        
        # User B should receive message.new
        msg_b = await ws_b.recv()
        print("User B received:", msg_b)
        event_b = json.loads(msg_b)
        assert event_b['type'] == 'message.new'
        assert event_b['payload']['id'] == msg_id
        
        # User B sends message.ack via WS
        print("User B sending message.ack...")
        await ws_b.send(json.dumps({
            "type": "message.ack",
            "payload": {"message_id": msg_id}
        }))
        
        # User A should receive message.delivered
        msg_a = await ws_a.recv()
        print("User A received:", msg_a)
        event_a = json.loads(msg_a)
        assert event_a['type'] == 'message.delivered'
        assert event_a['payload']['message_id'] == msg_id
        
        print("\nWebSocket flow test passed successfully!")

if __name__ == "__main__":
    asyncio.run(test_websocket_flow())
