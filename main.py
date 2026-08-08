from os import getenv

from fastapi import FastAPI
from pydantic import BaseModel
import redis
from fastapi.responses import RedirectResponse
from dotenv import load_dotenv
from utils import encode_base62

load_dotenv()

app = FastAPI()


class URLRepository:
    def __init__(self, redis_client):
        self.redis_client = redis_client

    def get_next_id(self):
        return self.redis_client.incr("url_counter")

    def save_url(self, short_code, long_url):
        self.redis_client.set(short_code, long_url)


class URLService:

    def __init__(self, repository: URLRepository):
        self.repo = repository

    def shorten(self, long_url: str) -> str:
        url_id = self.repo.get_next_id()
        short_code = encode_base62(url_id)
        self.repo.save_url(short_code, long_url)
        return short_code

    def redirect(self, short_code: str) -> str:
        long_url = self.repo.redis_client.get(short_code)
        return long_url


# Connect to our local Redis container
r = redis.Redis(host=getenv('HOST'), port=int(getenv('PORT')),
                db=int(getenv('db')), decode_responses=True)
url_repository = URLRepository(r)
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
    long_url = url_service.redirect(short_code)
    if long_url:
        return RedirectResponse(long_url)
    else:
        return {"error": "Short URL not found"}
