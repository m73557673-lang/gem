from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from typing import List, Optional, Dict, Any
import datetime

from backend.database import get_db
from backend.models import (
    Incident,
    IncidentTimeline,
    Service,
    Evidence,
    Metric,
    Recommendation,
    Postmortem,
    LogEvent,
    Deployment
)
from backend.schemas import (
    IncidentResponse,
    IncidentCreate,
    IncidentTimelineResponse,
    IncidentTransitionRequest,
    InvestigationStatusResponse,
    EvidenceResponse,
    MetricResponse,
    RecommendationResponse,
    PostmortemResponse
)
from backend.services.incident_engine import (
    IncidentDetectionEngine,
    transition_incident_state,
    record_timeline_event,
    get_orchestrator,
    VALID_STATES
)

router = APIRouter(tags=["Incidents"])

@router.get("/incidents", response_model=List[IncidentResponse])
@router.get("/api/incidents", response_model=List[IncidentResponse])
def list_incidents(
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    status: Optional[str] = Query(None, description="Filter by status"),
    severity: Optional[str] = Query(None, description="Filter by severity"),
    service_id: Optional[int] = Query(None, description="Filter by service ID"),
    db: Session = Depends(get_db)
):
    """Retrieve incidents with pagination and filtering."""
    query = db.query(Incident)
    if status and status.upper() != "ALL":
        query = query.filter(Incident.status.ilike(status))
    if severity and severity.upper() != "ALL":
        query = query.filter(Incident.severity.ilike(severity))
    if service_id is not None:
        query = query.filter(Incident.service_id == service_id)

    incidents = query.order_by(Incident.created_at.desc()).offset(skip).limit(limit).all()

    result = []
    for inc in incidents:
        service_name = inc.service.name if inc.service else f"Service-{inc.service_id}"
        resp = IncidentResponse(
            id=inc.id,
            title=inc.title,
            severity=inc.severity,
            status=inc.status,
            service_id=inc.service_id,
            created_at=inc.created_at,
            resolved_at=inc.resolved_at,
            service_name=service_name
        )
        result.append(resp)
    return result

@router.post("/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
@router.post("/api/incidents", response_model=IncidentResponse, status_code=status.HTTP_201_CREATED)
def create_incident(data: IncidentCreate, db: Session = Depends(get_db)):
    """Create a new incident with initial timeline record."""
    service = db.query(Service).filter(Service.id == data.service_id).first()
    if not service:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service with id {data.service_id} not found."
        )

    initial_status = data.status.lower() if data.status else "detected"
    if initial_status not in VALID_STATES:
        initial_status = "detected"

    incident = Incident(
        title=data.title if data.title.startswith("[SYNTHETIC]") else f"[SYNTHETIC] {data.title}",
        severity=data.severity.upper(),
        status=initial_status,
        service_id=data.service_id,
        created_at=datetime.datetime.utcnow(),
        resolved_at=None
    )
    db.add(incident)

    if incident.severity in ["CRITICAL", "HIGH"]:
        service.status = "DEGRADED"

    db.commit()
    db.refresh(incident)

    # Initial timeline entry
    record_timeline_event(
        db=db,
        incident_id=incident.id,
        from_state=None,
        to_state=initial_status,
        actor="Operator",
        message=f"Incident registered manually with severity {incident.severity}."
    )

    return IncidentResponse(
        id=incident.id,
        title=incident.title,
        severity=incident.severity,
        status=incident.status,
        service_id=incident.service_id,
        created_at=incident.created_at,
        resolved_at=incident.resolved_at,
        service_name=service.name
    )

# ----------------- DETECTION ENDPOINT -----------------
@router.post("/incidents/detect")
@router.post("/api/incidents/detect")
def detect_incidents(db: Session = Depends(get_db)):
    """
    Evaluate recent telemetry against configurable thresholds.
    Creates incidents for breaches, deduplicates active events, records timeline transitions.
    """
    result = IncidentDetectionEngine.evaluate_telemetry(db, actor="DetectionEngine")
    return result

# ----------------- INVESTIGATION ENDPOINTS -----------------
@router.post("/incidents/{incident_id}/investigate")
@router.post("/api/incidents/{incident_id}/investigate")
def investigate_incident(
    incident_id: int,
    actor: str = Query("Operator", description="Operator or agent name initiating investigation"),
    db: Session = Depends(get_db)
):
    """
    Run the deterministic investigation workflow without an LLM.
    Collects telemetry window, correlates deployments, extracts logs, builds evidence,
    synthesizes recommendation, and transitions state to 'awaiting_approval'.
    """
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    orchestrator = get_orchestrator("deterministic")
    investigation_result = orchestrator.run_investigation(db=db, incident=inc, actor=actor)
    return investigation_result

@router.get("/incidents/{incident_id}/investigation")
@router.get("/api/incidents/{incident_id}/investigation")
def get_investigation_status(incident_id: int, db: Session = Depends(get_db)):
    """Retrieve current investigation progress and findings."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    rec = db.query(Recommendation).filter(Recommendation.incident_id == incident_id).first()
    ev_count = db.query(Evidence).filter(Evidence.incident_id == incident_id).count()
    timeline = db.query(IncidentTimeline).filter(IncidentTimeline.incident_id == incident_id).order_by(IncidentTimeline.timestamp.asc()).all()

    is_completed = inc.status in ["awaiting_approval", "remediating", "validating", "resolved"]

    return {
        "incident_id": inc.id,
        "status": "completed" if is_completed else ("running" if inc.status == "investigating" else "idle"),
        "incident_state": inc.status,
        "progress_pct": 100 if is_completed else (50 if inc.status == "investigating" else 0),
        "current_step": "Awaiting human operator approval" if is_completed else (
            "Analyzing telemetry and logs" if inc.status == "investigating" else "Ready to investigate"
        ),
        "steps_log": [
            f"Current state: {inc.status}",
            f"Correlated evidence count: {ev_count}",
            f"Recommendation available: {'Yes' if rec else 'No'}"
        ],
        "findings": {
            "evidence_count": ev_count,
            "has_recommendation": rec is not None,
            "recommendation_action": rec.action if rec else None
        },
        "timeline": [
            {
                "id": t.id,
                "incident_id": t.incident_id,
                "from_state": t.from_state,
                "to_state": t.to_state,
                "actor": t.actor,
                "message": t.message,
                "timestamp": t.timestamp
            }
            for t in timeline
        ]
    }

# ----------------- TIMELINE & TRANSITION ENDPOINTS -----------------
@router.get("/incidents/{incident_id}/timeline", response_model=List[IncidentTimelineResponse])
@router.get("/api/incidents/{incident_id}/timeline", response_model=List[IncidentTimelineResponse])
def get_incident_timeline(incident_id: int, db: Session = Depends(get_db)):
    """Retrieve chronological audit timeline of all state transitions and events for an incident."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    timeline = db.query(IncidentTimeline).filter(
        IncidentTimeline.incident_id == incident_id
    ).order_by(IncidentTimeline.timestamp.asc()).all()

    return timeline

@router.post("/incidents/{incident_id}/transition", response_model=IncidentResponse)
@router.post("/api/incidents/{incident_id}/transition", response_model=IncidentResponse)
def transition_incident(
    incident_id: int,
    payload: IncidentTransitionRequest,
    db: Session = Depends(get_db)
):
    """Explicitly transition an incident state with validation and audit logging."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    try:
        updated = transition_incident_state(
            db=db,
            incident=inc,
            to_state=payload.to_state,
            actor=payload.actor,
            message=payload.message
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    return IncidentResponse(
        id=updated.id,
        title=updated.title,
        severity=updated.severity,
        status=updated.status,
        service_id=updated.service_id,
        created_at=updated.created_at,
        resolved_at=updated.resolved_at,
        service_name=updated.service.name if updated.service else None
    )

# ----------------- SUB-RESOURCE ENDPOINTS -----------------
@router.get("/incidents/{incident_id}", response_model=IncidentResponse)
@router.get("/api/incidents/{incident_id}", response_model=IncidentResponse)
def get_incident(incident_id: int, db: Session = Depends(get_db)):
    """Retrieve details for a single incident by ID."""
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )
    return IncidentResponse(
        id=inc.id,
        title=inc.title,
        severity=inc.severity,
        status=inc.status,
        service_id=inc.service_id,
        created_at=inc.created_at,
        resolved_at=inc.resolved_at,
        service_name=inc.service.name if inc.service else None
    )

@router.get("/incidents/{incident_id}/evidence", response_model=List[EvidenceResponse])
@router.get("/api/incidents/{incident_id}/evidence", response_model=List[EvidenceResponse])
def get_incident_evidence(
    incident_id: int,
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(50, ge=1, le=100, description="Page limit"),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    evidences = db.query(Evidence).filter(
        Evidence.incident_id == incident_id
    ).order_by(Evidence.relevance.desc()).offset(skip).limit(limit).all()

    result = []
    for ev in evidences:
        detail_msg = None
        if ev.source_type == "LOG" and ev.source_id:
            log_item = db.query(LogEvent).filter(LogEvent.id == ev.source_id).first()
            if log_item:
                detail_msg = f"[{log_item.level}] {log_item.message}"
        elif ev.source_type == "DEPLOYMENT" and ev.source_id:
            dep_item = db.query(Deployment).filter(Deployment.id == ev.source_id).first()
            if dep_item:
                detail_msg = f"Deployment {dep_item.version}: {dep_item.changes}"
        elif ev.source_type == "ALERT":
            detail_msg = f"Prometheus Alert: {inc.service.name if inc.service else 'Service'} saturation threshold breach"
        elif ev.source_type == "METRIC":
            detail_msg = f"Metric anomaly: sustained p95 latency spike > 2000ms"

        result.append(EvidenceResponse(
            id=ev.id,
            incident_id=ev.incident_id,
            source_type=ev.source_type,
            source_id=ev.source_id,
            relevance=ev.relevance,
            detail=detail_msg
        ))
    return result

@router.get("/incidents/{incident_id}/metrics", response_model=List[MetricResponse])
@router.get("/api/incidents/{incident_id}/metrics", response_model=List[MetricResponse])
def get_incident_metrics(
    incident_id: int,
    skip: int = Query(0, ge=0, description="Offset for pagination"),
    limit: int = Query(100, ge=1, le=500, description="Page limit"),
    metric_name: Optional[str] = Query(None, description="Filter by metric name"),
    db: Session = Depends(get_db)
):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    query = db.query(Metric).filter(Metric.service_id == inc.service_id)
    if metric_name:
        query = query.filter(Metric.metric_name == metric_name)

    metrics = query.order_by(Metric.timestamp.desc()).offset(skip).limit(limit).all()
    return metrics

@router.get("/incidents/{incident_id}/recommendation", response_model=RecommendationResponse)
@router.get("/api/incidents/{incident_id}/recommendation", response_model=RecommendationResponse)
def get_incident_recommendation(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    rec = db.query(Recommendation).filter(
        Recommendation.incident_id == incident_id
    ).order_by(Recommendation.confidence.desc()).first()

    if not rec:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No recommendation found for incident {incident_id}."
        )
    return rec

@router.get("/incidents/{incident_id}/postmortem", response_model=PostmortemResponse)
@router.get("/api/incidents/{incident_id}/postmortem", response_model=PostmortemResponse)
def get_incident_postmortem(incident_id: int, db: Session = Depends(get_db)):
    inc = db.query(Incident).filter(Incident.id == incident_id).first()
    if not inc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Incident with id {incident_id} not found."
        )

    pm = db.query(Postmortem).filter(Postmortem.incident_id == incident_id).first()
    if not pm:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No postmortem available for incident {incident_id}."
        )
    return pm
