from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from backend.database import get_db
from backend.schemas import PostmortemResponse
from backend.services.postmortem_service import PostmortemService

router = APIRouter(prefix="/api/postmortems", tags=["Postmortems"])

@router.get("", response_model=List[PostmortemResponse])
def get_all_postmortems(db: Session = Depends(get_db)):
    """Retrieve all incident postmortems."""
    return PostmortemService.get_all(db=db)

@router.get("/{incident_id}", response_model=PostmortemResponse)
def get_postmortem_for_incident(incident_id: str, db: Session = Depends(get_db)):
    """Retrieve postmortem for a specific incident."""
    pm = PostmortemService.get_by_incident(db=db, incident_id=incident_id)
    if not pm:
        raise HTTPException(status_code=404, detail=f"No postmortem found for incident {incident_id}.")
    return pm

@router.post("/generate/{incident_id}", response_model=PostmortemResponse)
def generate_postmortem(incident_id: str, db: Session = Depends(get_db)):
    """Automatically synthesize and generate an SRE postmortem based on evidence, root causes, and remediation."""
    try:
        return PostmortemService.generate_postmortem_for_incident(db=db, incident_id=incident_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
