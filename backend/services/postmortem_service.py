from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.models import Postmortem, Incident, EvidenceItem, InvestigationHypothesis, RemediationAction, AuditLog

class PostmortemService:
    @staticmethod
    def get_all(db: Session) -> List[Postmortem]:
        return db.query(Postmortem).order_by(Postmortem.created_at.desc()).all()

    @staticmethod
    def get_by_incident(db: Session, incident_id: str) -> Optional[Postmortem]:
        return db.query(Postmortem).filter(Postmortem.incident_id == incident_id).first()

    @staticmethod
    def generate_postmortem_for_incident(db: Session, incident_id: str) -> Postmortem:
        existing = db.query(Postmortem).filter(Postmortem.incident_id == incident_id).first()
        if existing:
            return existing

        incident = db.query(Incident).filter(Incident.id == incident_id).first()
        if not incident:
            raise ValueError(f"Incident {incident_id} not found.")

        evidences = db.query(EvidenceItem).filter(EvidenceItem.incident_id == incident_id).all()
        hypotheses = db.query(InvestigationHypothesis).filter(InvestigationHypothesis.incident_id == incident_id).all()
        remediations = db.query(RemediationAction).filter(RemediationAction.incident_id == incident_id).all()

        root_cause_text = hypotheses[0].description if hypotheses else "Unresolved root cause pending investigation."

        # Compile timeline
        timeline = [
            {"time": incident.started_at.strftime("%H:%M UTC"), "event": f"Incident triggered: {incident.title}"}
        ]
        for ev in evidences[:4]:
            timeline.append({
                "time": ev.timestamp.strftime("%H:%M UTC"),
                "event": f"[{ev.type}] {ev.summary}"
            })
        if incident.resolved_at:
            timeline.append({
                "time": incident.resolved_at.strftime("%H:%M UTC"),
                "event": "Remediation verified; incident resolved in simulation."
            })

        postmortem = Postmortem(
            id=f"PM-{incident.id.replace('INC-', '')}",
            incident_id=incident_id,
            title=f"Incident Postmortem: {incident.title}",
            executive_summary=f"Automated postmortem generated for {incident.id} affecting {incident.service}. "
                              f"Total customer impact duration: ~24 minutes. "
                              f"Root cause was rapidly identified via autonomous evidence correlation.",
            root_cause=root_cause_text,
            impact_summary=f"Degraded {incident.service} performance with elevated p99 latencies and connection pool exhaustion.",
            timeline_events=timeline,
            preventative_actions=[
                {"action": f"Set up automated canary alerts on {incident.service} pool utilization threshold > 80%", "owner": "Core SRE", "status": "PLANNED"},
                {"action": "Mandate database query timeout caps (3000ms max) in ORM config", "owner": "Backend Chapter", "status": "IN_PROGRESS"},
                {"action": "Add load test step in CI pipeline simulating concurrent billing cycles", "owner": "QA Automation", "status": "PLANNED"}
            ],
            status="PUBLISHED" if incident.status == "RESOLVED" else "DRAFT",
            created_at=datetime.datetime.utcnow()
        )

        db.add(postmortem)
        db.add(AuditLog(
            action="POSTMORTEM_GENERATED",
            actor="AI Commander Postmortem Generator",
            details=f"Generated postmortem for {incident_id}"
        ))
        db.commit()
        db.refresh(postmortem)
        return postmortem
