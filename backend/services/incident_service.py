from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.models import Incident, AuditLog
from backend.schemas import IncidentCreate, IncidentUpdate

class IncidentService:
    @staticmethod
    def get_all(db: Session, status: Optional[str] = None, severity: Optional[str] = None) -> List[Incident]:
        query = db.query(Incident)
        if status:
            query = query.filter(Incident.status == status)
        if severity:
            query = query.filter(Incident.severity == severity)
        return query.order_by(Incident.started_at.desc()).all()

    @staticmethod
    def get_by_id(db: Session, incident_id: str) -> Optional[Incident]:
        return db.query(Incident).filter(Incident.id == incident_id).first()

    @staticmethod
    def create(db: Session, data: IncidentCreate) -> Incident:
        count = db.query(Incident).count()
        new_id = f"INC-{8925 + count}"
        incident = Incident(
            id=new_id,
            title=data.title,
            severity=data.severity,
            status=data.status,
            service=data.service,
            environment=data.environment,
            description=data.description,
            started_at=datetime.datetime.utcnow(),
            ai_confidence=0.88,
            is_synthetic=True
        )
        db.add(incident)
        db.add(AuditLog(
            action="INCIDENT_CREATED",
            actor="SRE Commander",
            details=f"Created synthetic incident {new_id}: {data.title}"
        ))
        db.commit()
        db.refresh(incident)
        return incident

    @staticmethod
    def update(db: Session, incident_id: str, data: IncidentUpdate) -> Optional[Incident]:
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return None

        update_dict = data.dict(exclude_unset=True)
        for key, value in update_dict.items():
            setattr(incident, key, value)

        if data.status == "RESOLVED" and not incident.resolved_at:
            incident.resolved_at = datetime.datetime.utcnow()

        db.add(AuditLog(
            action="INCIDENT_UPDATED",
            actor="SRE Commander",
            details=f"Updated incident {incident_id} fields: {list(update_dict.keys())}"
        ))
        db.commit()
        db.refresh(incident)
        return incident
