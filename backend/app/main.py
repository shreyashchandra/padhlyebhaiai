import logging
import re
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
    logger.info("CORS allowed origins: %s%s", settings.cors_origins, f" + regex {settings.cors_origin_regex}" if settings.cors_origin_regex else "")
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

# Starlette runs the LAST-added middleware first. Order, outermost -> innermost:
#   log_requests -> CORS -> GZip -> catch_errors -> routes
# catch_errors sits inside CORS so even 500 responses carry CORS headers; otherwise
# the browser reports a misleading "CORS error" that hides the real failure.


@app.middleware("http")
async def catch_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        logger.exception("Unhandled error on %s %s", request.method, request.url.path)
        return JSONResponse(status_code=500, content={"detail": "Something went wrong on our side. Please try again."})


app.add_middleware(GZipMiddleware, minimum_size=1024)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

_cors_pattern = re.compile(settings.cors_origin_regex) if settings.cors_origin_regex else None
_warned_origins: set[str] = set()


def _origin_allowed(origin: str) -> bool:
    return origin in settings.cors_origins or bool(_cors_pattern and _cors_pattern.fullmatch(origin))


@app.middleware("http")
async def log_requests(request: Request, call_next):
    origin = request.headers.get("origin")
    if origin and not _origin_allowed(origin) and origin not in _warned_origins:
        _warned_origins.add(origin)
        logger.warning(
            "CORS: blocked requests from origin %s. Allowed: %s%s. "
            "Add it to FRONTEND_URL (comma-separated) if it is your frontend.",
            origin,
            ", ".join(settings.cors_origins) or "(none)",
            f" + regex {settings.cors_origin_regex}" if settings.cors_origin_regex else "",
        )
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


@app.get("/api/health")
def health_check():
    return {
        "status": "ok",
        "ai_configured": bool(settings.openai_api_key),
        "web_research": research_available(),
        "youtube": bool(settings.youtube_api_key),
        # Public by nature (browsers send Origin on every request); shown to make CORS setup easy to verify.
        "cors_allowed_origins": settings.cors_origins,
        "cors_origin_regex": settings.cors_origin_regex,
    }


for module in (auth, catalog, subjects, plans, tutor, quizzes, flashcards, progress, help, videos):
    app.include_router(module.router)
