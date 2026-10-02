from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.models import Service
from backend.schemas import ServiceResponse

router = APIRouter(tags=["Services"])

@router.get("/services", response_model=List[ServiceResponse])
@router.get("/api/services", response_model=List[ServiceResponse])
def get_services(
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Limit items per page"),
    status: Optional[str] = Query(None, description="Filter by status (HEALTHY, DEGRADED, OUTAGE)"),
    environment: Optional[str] = Query(None, description="Filter by environment"),
    db: Session = Depends(get_db)
):
    """Retrieve all monitored microservices with optional filtering and pagination."""
    query = db.query(Service)
    if status:
        query = query.filter(Service.status == status)
    if environment:
        query = query.filter(Service.environment == environment)
    return query.offset(skip).limit(limit).all()
