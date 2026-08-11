from os import getenv

from fastapi import FastAPI
from pydantic import BaseModel
import redis
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from utils import encode_base62
from abc import ABC, abstractmethod

load_dotenv()

app = FastAPI()


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

    def __init__(self, redis_client):
        self.redis_client = redis_client

    def get_next_id(self):
        return self.redis_client.incr("url_counter")

    def save_url(self, short_code, long_url):
        self.redis_client.set(short_code, long_url)

    def get_url(self, short_code):
        return self.redis_client.get(short_code)


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


# Connect to our local Redis container
r = redis.from_url(getenv("REDIS_URL"))
url_repository = RedisURLRepository(r)
url_service = URLService(url_repository)


# Pydantic model to validate incoming POST data

class URLRequest(BaseModel):
    long_url: str


@app.post("/shorten")
def shorten_url(request: URLRequest):
    short_code = url_service.shorten(request.long_url)
    return {"short_url": f"http://localhost:8000/{short_code}"}


@app.get("/{short_code}")
def redirect_url(short_code: str):
    long_url = url_service.get_long_url(short_code)
    if long_url:
        return RedirectResponse(long_url)
    else:
        return {"error": "Short URL not found"}
