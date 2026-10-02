from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import EvidenceItemResponse
from backend.services.evidence_service import EvidenceService

router = APIRouter(prefix="/api/evidence", tags=["Evidence Chain"])

@router.get("/{incident_id}", response_model=List[EvidenceItemResponse])
def get_evidence_chain(incident_id: str, db: Session = Depends(get_db)):
    """Retrieve chronological evidence chain (logs, traces, alerts, metrics) for an incident."""
    return EvidenceService.get_by_incident(db=db, incident_id=incident_id)
