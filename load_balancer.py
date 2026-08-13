from fastapi import FastAPI, Request
import requests

app = FastAPI()

# Our pool of backend FastAPI servers 🖥️🖥️🖥️
SERVERS = [
    "http://localhost:8001",
    "http://localhost:8002",
    "http://localhost:8003"
]
current_server_index = 0

# This special route catches ALL paths and HTTP methods


@app.api_route("/{path:path}", methods=["GET", "POST"])
async def route_traffic(path: str, request: Request):
    global current_server_index

    # TODO 1: Calculate the correct index using current_server_index and the modulo operator %
    server_index = current_server_index % len(SERVERS)

    # TODO 2: Grab the target server URL from the SERVERS list
    target_server = SERVERS[server_index]

    # TODO 3: Increment current_server_index by 1 so the next request goes to the next server
    current_server_index += 1

    # (We will add the code to actually forward the request next!)
    if path == "shorten":
        # Forward the request to the target server
        response = requests.post(f"{target_server}/{path}", json=await request.json())
    return {"message": f"Request would be forwarded to {target_server}/{path}"}
