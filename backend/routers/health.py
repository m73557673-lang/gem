from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
import datetime
from backend.database import get_db
from backend.models import Incident, Service
from backend.schemas import HealthCheckResponse
from backend.config import settings

router = APIRouter(tags=["Health"])

@router.get("/health", response_model=HealthCheckResponse)
@router.get("/api/health", response_model=HealthCheckResponse)
def health_check(db: Session = Depends(get_db)):
    """Health check validating SQLite database connection, service count, and active incidents."""
    db_status = "healthy (sqlite)"
    try:
        db.execute(text("SELECT 1"))
    except Exception as e:
        db_status = f"unhealthy: {str(e)}"

    active_count = db.query(Incident).filter(Incident.status != "RESOLVED").count()
    services_count = db.query(Service).count()

    return HealthCheckResponse(
        status="UP" if "healthy" in db_status else "DEGRADED",
        timestamp=datetime.datetime.utcnow(),
        database=db_status,
        active_incidents=active_count,
        services_count=services_count,
        version=settings.APP_VERSION,
        synthetic_mode=True
    )
