from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List, Dict, Any
import random
import datetime
from backend.database import get_db
from backend.models import ServiceStatus
from backend.schemas import ServiceStatusResponse

router = APIRouter(prefix="/api/services", tags=["Services & Metrics"])

@router.get("", response_model=List[ServiceStatusResponse])
def get_services(db: Session = Depends(get_db)):
    """Retrieve all monitored microservices with synthetic health indicators."""
    return db.query(ServiceStatus).all()

@router.get("/metrics/synthetic-telemetry")
def get_synthetic_telemetry() -> Dict[str, Any]:
    """
    Returns synthetic timeseries telemetry data for metric visualization.
    Explicitly labelled as synthetic simulation data.
    """
    now = datetime.datetime.utcnow()
    points = []
    # 20 historical intervals
    for i in range(20, -1, -1):
        t = now - datetime.timedelta(minutes=i * 2)
        # Simulate spike around 18 minutes ago
        if i <= 9:
            auth_latency = random.randint(2200, 4800)
            auth_error_rate = round(random.uniform(14.0, 22.5), 2)
            pool_util = random.randint(95, 100)
        else:
            auth_latency = random.randint(35, 60)
            auth_error_rate = round(random.uniform(0.01, 0.08), 2)
            pool_util = random.randint(20, 35)

        points.append({
            "timestamp": t.strftime("%H:%M"),
            "auth_billing_latency_ms": auth_latency,
            "auth_billing_error_rate": auth_error_rate,
            "pool_saturation_pct": pool_util,
            "search_indexer_mem_pct": min(100, 50 + (20 - i) * 2.5),
            "is_synthetic": True
        })

    return {
        "telemetry_source": "SYNTHETIC_SIMULATOR",
        "description": "Simulated operational metrics for SRE incident response testing.",
        "series": points
    }
