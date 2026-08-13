import os
from os import getenv
from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse, FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import redis
from dotenv import load_dotenv
from utils import encode_base62
from abc import ABC, abstractmethod

load_dotenv()

app = FastAPI(title="MinURL API", description="Minimalist & Fast URL Shortener")

# Enable CORS for frontend flexibility
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class AbstractURLRepository(ABC):
    @abstractmethod
    def get_next_id(self):
        pass

    @abstractmethod
    def save_url(self, short_code, long_url):
        pass

    @abstractmethod
    def get_url(self, short_code):
        pass


class RedisURLRepository(AbstractURLRepository):

    def __init__(self, redis_client_primary, redis_client_replica):
        self.redis_client_primary = redis_client_primary
        self.redis_client_replica = redis_client_replica

    def get_next_id(self):
        return self.redis_client_primary.incr("url_counter")

    def save_url(self, short_code, long_url):
        self.redis_client_primary.set(short_code, long_url)

    def get_url(self, short_code):
        return self.redis_client_replica.get(short_code)


class InMemoryURLRepository(AbstractURLRepository):
    """In-memory fallback repository when Redis is unavailable during local development."""

    def __init__(self):
        self.counter = 100000
        self.storage = {}

    def get_next_id(self):
        self.counter += 1
        return self.counter

    def save_url(self, short_code, long_url):
        self.storage[short_code] = long_url

    def get_url(self, short_code):
        return self.storage.get(short_code)


class URLService:

    def __init__(self, repository: AbstractURLRepository):
        self.repo = repository

    def shorten(self, long_url: str) -> str:
        url_id = self.repo.get_next_id()
        short_code = encode_base62(url_id)
        self.repo.save_url(short_code, long_url)
        return short_code

    def get_long_url(self, short_code: str) -> str:
        long_url = self.repo.get_url(short_code)
        return long_url


# Initialize repository with Redis or fallback to In-Memory
primary_url = getenv("REDIS_URL_PRIMARY")
replica_url = getenv("REDIS_URL_REPLICA")

try:
    if primary_url and replica_url:
        r_primary = redis.from_url(primary_url, decode_responses=True, socket_connect_timeout=1)
        r_replica = redis.from_url(replica_url, decode_responses=True, socket_connect_timeout=1)
        # Test connection
        r_primary.ping()
        url_repository = RedisURLRepository(r_primary, r_replica)
        print("Connected to Redis clusters.")
    else:
        print("Redis URLs not provided. Falling back to InMemoryURLRepository.")
        url_repository = InMemoryURLRepository()
except Exception as e:
    print(f"Could not connect to Redis ({e}). Using InMemoryURLRepository fallback.")
    url_repository = InMemoryURLRepository()

url_service = URLService(url_repository)


# Pydantic model to validate incoming POST data
class URLRequest(BaseModel):
    long_url: str


# Mount static assets directory
static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.exists(static_dir):
    app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
def serve_frontend():
    index_file = os.path.join(static_dir, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    return {"message": "MinURL API is running. Place index.html in static/"}


@app.post("/shorten")
def shorten_url(url_data: URLRequest, request: Request):
    short_code = url_service.shorten(url_data.long_url)
    base_url = str(request.base_url)
    return {"short_url": f"{base_url}{short_code}"}


@app.get("/{short_code}")
def redirect_url(short_code: str):
    # Ignore static and favicon requests
    if short_code in ("favicon.ico", "static", "docs", "openapi.json"):
        return {"error": "Not found"}
    long_url = url_service.get_long_url(short_code)
    if long_url:
        return RedirectResponse(long_url)
    else:
        return {"error": "Short URL not found"}

