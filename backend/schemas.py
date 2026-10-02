from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict
from datetime import datetime

# ----------------- Service Schemas -----------------
class ServiceBase(BaseModel):
    name: str
    environment: str = "production"
    owner: str = "SRE Team"
    status: str = "HEALTHY"

class ServiceCreate(ServiceBase):
    pass

class ServiceResponse(ServiceBase):
    id: int

    class Config:
        from_attributes = True

# ----------------- Incident Schemas -----------------
class IncidentBase(BaseModel):
    title: str = Field(..., min_length=3, max_length=255)
    severity: str = Field("HIGH", description="CRITICAL, HIGH, MEDIUM, LOW")
    status: str = Field("detected", description="detected, investigating, awaiting_approval, remediating, validating, resolved, failed")
    service_id: int

class IncidentCreate(IncidentBase):
    pass

class IncidentResponse(IncidentBase):
    id: int
    created_at: datetime
    resolved_at: Optional[datetime] = None
    service_name: Optional[str] = None

    class Config:
        from_attributes = True

# ----------------- Timeline Schemas -----------------
class IncidentTimelineResponse(BaseModel):
    id: int
    incident_id: int
    from_state: Optional[str] = None
    to_state: str
    actor: str
    message: str
    timestamp: datetime

    class Config:
        from_attributes = True

class IncidentTransitionRequest(BaseModel):
    to_state: str
    actor: str = "Operator"
    message: str = "Manual transition via console"

# ----------------- LogEvent Schemas -----------------
class LogEventResponse(BaseModel):
    id: int
    service_id: int
    timestamp: datetime
    level: str
    message: str

    class Config:
        from_attributes = True

# ----------------- Deployment Schemas -----------------
class DeploymentResponse(BaseModel):
    id: int
    service_id: int
    version: str
    changes: str
    timestamp: datetime

    class Config:
        from_attributes = True

# ----------------- Metric Schemas -----------------
class MetricResponse(BaseModel):
    id: int
    service_id: int
    timestamp: datetime
    metric_name: str
    value: float

    class Config:
        from_attributes = True

# ----------------- KnowledgeDocument Schemas -----------------
class KnowledgeDocumentResponse(BaseModel):
    id: int
    title: str
    type: str
    content: str
    source: str

    class Config:
        from_attributes = True

# ----------------- Evidence Schemas -----------------
class EvidenceResponse(BaseModel):
    id: int
    incident_id: int
    source_type: str
    source_id: Optional[int] = None
    relevance: float
    detail: Optional[str] = None

    class Config:
        from_attributes = True

# ----------------- Recommendation Schemas -----------------
class RecommendationResponse(BaseModel):
    id: int
    incident_id: int
    action: str
    risk: str
    confidence: float

    class Config:
        from_attributes = True

# ----------------- Action Schemas -----------------
class ActionResponse(BaseModel):
    id: int
    incident_id: int
    approved_by: Optional[str] = None
    status: str
    result: Optional[str] = None

    class Config:
        from_attributes = True

# ----------------- Postmortem Schemas -----------------
class PostmortemResponse(BaseModel):
    id: int
    incident_id: int
    summary: str
    root_cause: str
    prevention: str

    class Config:
        from_attributes = True

# ----------------- Investigation Schemas -----------------
class InvestigationStatusResponse(BaseModel):
    incident_id: int
    status: str  # idle, running, completed, failed
    incident_state: str  # detected, investigating, awaiting_approval, etc.
    progress_pct: int
    current_step: str
    steps_log: List[str]
    findings: Dict[str, Any]
    timeline: List[IncidentTimelineResponse]
    recommendation: Optional[RecommendationResponse] = None

# ----------------- Health Check Schema -----------------
class HealthCheckResponse(BaseModel):
    status: str
    timestamp: datetime
    database: str
    active_incidents: int
    services_count: int
    version: str
    synthetic_mode: bool = True
