import urllib.request
import urllib.parse
import json
import sys

BASE_URL = "http://127.0.0.1:8000"

def request(method, path, data=None, token=None):
    url = BASE_URL + path
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Cookie'] = f'access_token={token}'
        
    req_data = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            res_data = response.read().decode('utf-8')
            return json.loads(res_data) if res_data else None, response.headers
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode('utf-8')}")
        sys.exit(1)
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

def run_tests():
    print("Testing /auth/register...")
    res, _ = request("POST", "/auth/register", {"identifier": "newuser", "display_name": "New User"})
    print("Register Response:", res)
    
    print("\nTesting /auth/verify...")
    res, headers = request("POST", "/auth/verify", {"identifier": "newuser", "otp": "123456"})
    print("Verify Response:", res)
    token = res.get("access_token")
    
    print("\nTesting /auth/me...")
    res, _ = request("GET", "/auth/me", token=token)
    print("Me Response:", res)
    user_id = res['id']
    
    print("\nTesting /conversations POST...")
    # Get a seeded user to create a conversation with
    # Actually we can just query contacts (which will be empty for this new user, but we can just use bob's id if we knew it. Let's just create a group instead, since it takes participant_ids. Wait, if we pass empty, it'll fail. Let's register another user)
    res2, _ = request("POST", "/auth/verify", {"identifier": "newuser2", "otp": "123456"})
    user2_id = res2["user_id"]
    
    res, _ = request("POST", "/conversations/", {"type": "direct", "participant_ids": [user2_id]}, token=token)
    print("Create Conv Response:", res)
    conv_id = res['id']
    
    print("\nTesting /conversations/search...")
    res, _ = request("GET", "/conversations/search?q=", token=token)
    print("Search Response:", [c['id'] for c in res])
    
    print(f"\nTesting /conversations/{conv_id}/messages POST...")
    res, _ = request("POST", f"/conversations/{conv_id}/messages", {"content": "Hello world!"}, token=token)
    print("Send Message Response:", res)
    msg_id = res['id']
    
    print(f"\nTesting /conversations/{conv_id}/messages GET...")
    res, _ = request("GET", f"/conversations/{conv_id}/messages", token=token)
    print("Get Messages Response:", res)
    
    print(f"\nTesting /conversations/{conv_id}/read POST...")
    res, _ = request("POST", f"/conversations/{conv_id}/read", {"message_id": msg_id}, token=token)
    print("Mark Read Response:", res)
    
    print("\nAll tests passed successfully.")

if __name__ == "__main__":
    run_tests()
