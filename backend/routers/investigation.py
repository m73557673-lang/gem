from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import HypothesisResponse
from backend.services.investigation_service import InvestigationService

router = APIRouter(prefix="/api/investigation", tags=["Investigation"])

@router.get("/{incident_id}", response_model=List[HypothesisResponse])
def get_hypotheses(incident_id: str, db: Session = Depends(get_db)):
    """Retrieve scored root cause hypotheses for an incident."""
    return InvestigationService.get_hypotheses_by_incident(db=db, incident_id=incident_id)

@router.post("/{incident_id}/analyze", response_model=List[HypothesisResponse])
def trigger_analysis(incident_id: str, db: Session = Depends(get_db)):
    """Trigger AI root cause analysis correlation engine on incident evidence."""
    hypotheses = InvestigationService.run_ai_investigation_analysis(db=db, incident_id=incident_id)
    if not hypotheses:
        raise HTTPException(status_code=404, detail=f"Incident {incident_id} not found or no evidence available.")
    return hypotheses
