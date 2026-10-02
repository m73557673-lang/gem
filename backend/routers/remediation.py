from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.schemas import RemediationActionResponse, RemediationApprovalRequest
from backend.services.remediation_service import RemediationService

router = APIRouter(prefix="/api/remediation", tags=["Remediation"])

@router.get("", response_model=List[RemediationActionResponse])
def get_remediation_actions(
    incident_id: Optional[str] = Query(None, description="Filter by incident ID"),
    db: Session = Depends(get_db)
):
    """Retrieve all proposed and approved remediation actions."""
    return RemediationService.get_all(db=db, incident_id=incident_id)

@router.get("/{action_id}", response_model=RemediationActionResponse)
def get_remediation_action(action_id: str, db: Session = Depends(get_db)):
    """Retrieve details for a single remediation action."""
    action = RemediationService.get_by_id(db=db, action_id=action_id)
    if not action:
        raise HTTPException(status_code=404, detail=f"Action {action_id} not found.")
    return action

@router.post("/{action_id}/approve", response_model=RemediationActionResponse)
def approve_action(
    action_id: str,
    payload: RemediationApprovalRequest,
    db: Session = Depends(get_db)
):
    """Human SRE explicitly approves a remediation action. Requires confirmation phrase."""
    try:
        return RemediationService.approve_action(
            db=db,
            action_id=action_id,
            approved_by=payload.approved_by,
            confirmation_phrase=payload.confirmation_phrase
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{action_id}/reject", response_model=RemediationActionResponse)
def reject_action(
    action_id: str,
    reason: str = Query("Rejected by on-call engineer"),
    rejected_by: str = Query("On-Call SRE Engineer"),
    db: Session = Depends(get_db)
):
    """Reject a proposed remediation plan."""
    try:
        return RemediationService.reject_action(
            db=db,
            action_id=action_id,
            rejected_by=rejected_by,
            reason=reason
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/{action_id}/simulate-execution", response_model=RemediationActionResponse)
def simulate_execution(action_id: str, db: Session = Depends(get_db)):
    """
    Executes simulated remediation within an isolated safety sandbox.
    Guarantees no real infrastructure changes are triggered.
    """
    try:
        return RemediationService.execute_simulation(db=db, action_id=action_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
