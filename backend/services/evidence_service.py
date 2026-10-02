from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.models import EvidenceItem, AuditLog

class EvidenceService:
    @staticmethod
    def get_by_incident(db: Session, incident_id: str) -> List[EvidenceItem]:
        return db.query(EvidenceItem).filter(
            EvidenceItem.incident_id == incident_id
        ).order_by(EvidenceItem.timestamp.desc()).all()

    @staticmethod
    def add_evidence(
        db: Session,
        incident_id: str,
        ev_type: str,
        source_service: str,
        summary: str,
        payload: str,
        confidence_score: float = 0.9
    ) -> EvidenceItem:
        new_id = f"EVD-{datetime.datetime.utcnow().strftime('%M%S')}"
        item = EvidenceItem(
            id=new_id,
            incident_id=incident_id,
            type=ev_type,
            timestamp=datetime.datetime.utcnow(),
            source_service=source_service,
            summary=summary,
            payload=payload,
            confidence_score=confidence_score
        )
        db.add(item)
        db.add(AuditLog(
            action="EVIDENCE_CORRELATED",
            actor="Telemetry Ingestor",
            details=f"Added evidence {new_id} ({ev_type}) for incident {incident_id}"
        ))
        db.commit()
        db.refresh(item)
        return item
