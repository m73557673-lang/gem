import time
import logging
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from backend.config import settings
from backend.database import init_db, SessionLocal
from backend.seed import seed_database
from backend.routers import (
    health,
    services,
    incidents,
    knowledge,
    simulation
)

# Configure structured logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s"
)
logger = logging.getLogger("incident-commander")

app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="Autonomous AI-Powered Incident Commander - SRE/DevOps Incident Response Platform"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing & structured logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.time()
    response = await call_next(request)
    duration_ms = round((time.time() - start_time) * 1000, 2)
    logger.info(
        f"method={request.method} path={request.url.path} status={response.status_code} duration={duration_ms}ms"
    )
    response.headers["X-Response-Time"] = f"{duration_ms}ms"
    return response

# Global exception handler
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception on {request.url.path}: {str(exc)}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error occurred in Incident Commander service."}
    )

# Include routers
app.include_router(health.router)
app.include_router(services.router)
app.include_router(incidents.router)
app.include_router(knowledge.router)
app.include_router(simulation.router)

# Startup event: Initialize SQLite database and seed initial synthetic scenario
@app.on_event("startup")
def on_startup():
    logger.info("Initializing SQLite database tables and synthetic SRE scenarios...")
    init_db()
    db = SessionLocal()
    try:
        seed_database(db)
        logger.info("SQLite database initialized and synthetic scenarios seeded successfully.")
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=settings.HOST, port=settings.PORT, reload=True)
