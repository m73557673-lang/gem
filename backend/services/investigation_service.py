from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.models import InvestigationHypothesis, Incident, EvidenceItem, AuditLog

class InvestigationService:
    @staticmethod
    def get_hypotheses_by_incident(db: Session, incident_id: str) -> List[InvestigationHypothesis]:
        return db.query(InvestigationHypothesis).filter(
            InvestigationHypothesis.incident_id == incident_id
        ).order_by(InvestigationHypothesis.confidence_score.desc()).all()

    @staticmethod
    def run_ai_investigation_analysis(db: Session, incident_id: str) -> List[InvestigationHypothesis]:
        """
        Simulated AI root cause engine that correlates evidence items, logs,
        and topology metrics to score hypotheses.
        Modular provider adapter can be plugged in here in future phases.
        """
        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            return []

        evidences = db.query(EvidenceItem).filter(EvidenceItem.incident_id == incident_id).all()
        evidence_ids = [e.id for e in evidences]

        existing = db.query(InvestigationHypothesis).filter(
            InvestigationHypothesis.incident_id == incident_id
        ).all()

        if existing:
            return existing

        # Generate a default high-confidence hypothesis based on evidence
        new_hyp = InvestigationHypothesis(
            id=f"HYP-{abs(hash(incident_id)) % 900 + 100}",
            incident_id=incident_id,
            root_cause_title=f"Resource exhaustion & latency cascade in {incident.service}",
            description=f"Automated correlation across {len(evidences)} telemetry artifacts reveals saturated bottlenecks affecting {incident.service}.",
            confidence_score=0.91,
            supporting_evidence=evidence_ids,
            status="PROPOSED",
            suggested_runbook_id="RB-PG-POOL-01"
        )
        db.add(new_hyp)
        db.add(AuditLog(
            action="INVESTIGATION_TRIGGERED",
            actor="AI Engine Adapter",
            details=f"Generated hypothesis {new_hyp.id} for incident {incident_id}"
        ))
        db.commit()
        db.refresh(new_hyp)
        return [new_hyp]
