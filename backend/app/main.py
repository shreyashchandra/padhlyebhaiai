import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from .config import settings
from .db import sync_schema
from .routers import auth, catalog, flashcards, help, plans, progress, quizzes, subjects, tutor, videos
from .services.research import research_available

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("padhlyebhai")


@asynccontextmanager
async def lifespan(_: FastAPI):
    sync_schema()
    if not settings.openai_api_key:
        logger.warning("OPENAI_API_KEY is not set - AI features will return 503 until it is configured.")
    yield


app = FastAPI(
    title="PadhLeBhai AI API",
    version="2.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(GZipMiddleware, minimum_size=1024)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    started = time.perf_counter()
    response = await call_next(request)
    if request.url.path.startswith("/api"):
        logger.info(
            "%s %s -> %s (%.0f ms)",
            request.method,
            request.url.path,
            response.status_code,
            (time.perf_counter() - started) * 1000,
        )
    return response


@app.exception_handler(Exception)
async def unhandled_error(request: Request, exc: Exception):
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(settings.openai_api_key),
        "web_research": research_available(),
        "youtube": bool(settings.youtube_api_key),
    }


for module in (auth, catalog, subjects, plans, tutor, quizzes, flashcards, progress, help, videos):
    app.include_router(module.router)
