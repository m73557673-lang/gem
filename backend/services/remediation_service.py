from typing import List, Optional
import datetime
from sqlalchemy.orm import Session
from backend.models import RemediationAction, Incident, ServiceStatus, AuditLog

class RemediationService:
    @staticmethod
    def get_all(db: Session, incident_id: Optional[str] = None) -> List[RemediationAction]:
        query = db.query(RemediationAction)
        if incident_id:
            query = query.filter(RemediationAction.incident_id == incident_id)
        return query.all()

    @staticmethod
    def get_by_id(db: Session, action_id: str) -> Optional[RemediationAction]:
        return db.query(RemediationAction).filter(RemediationAction.id == action_id).first()

    @staticmethod
    def approve_action(
        db: Session,
        action_id: str,
        approved_by: str,
        confirmation_phrase: str
    ) -> RemediationAction:
        action = db.query(RemediationAction).filter(RemediationAction.id == action_id).first()
        if not action:
            raise ValueError(f"Remediation action {action_id} not found.")

        # Require explicit confirmation phrase to guarantee human intent
        if confirmation_phrase.strip().lower() != "approve remediation":
            raise ValueError("Human approval requires exact confirmation phrase: 'APPROVE REMEDIATION'")

        action.human_approval_status = "APPROVED"
        action.approved_by = approved_by
        action.approved_at = datetime.datetime.utcnow()

        db.add(AuditLog(
            action="REMEDIATION_APPROVED",
            actor=approved_by,
            details=f"Human SRE approved remediation {action_id}: {action.title}"
        ))
        db.commit()
        db.refresh(action)
        return action

    @staticmethod
    def reject_action(db: Session, action_id: str, rejected_by: str, reason: str) -> RemediationAction:
        action = db.query(RemediationAction).filter(RemediationAction.id == action_id).first()
        if not action:
            raise ValueError(f"Remediation action {action_id} not found.")

        action.human_approval_status = "REJECTED"
        action.audit_notes = f"Rejected by {rejected_by}: {reason}"

        db.add(AuditLog(
            action="REMEDIATION_REJECTED",
            actor=rejected_by,
            details=f"Remediation {action_id} rejected. Reason: {reason}"
        ))
        db.commit()
        db.refresh(action)
        return action

    @staticmethod
    def execute_simulation(db: Session, action_id: str) -> RemediationAction:
        """
        Simulate remediation execution safely in an isolated sandbox.
        Validates simulated recovery and updates simulated telemetry metrics.
        """
        action = db.query(RemediationAction).filter(RemediationAction.id == action_id).first()
        if not action:
            raise ValueError(f"Remediation action {action_id} not found.")

        if action.human_approval_status != "APPROVED":
            raise ValueError("Safety guardrail: Action cannot be executed without prior human SRE approval.")

        action.execution_status = "SIMULATING"
        db.commit()

        # Generate simulated execution telemetry output
        now_str = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S UTC")
        sim_output = (
            f"=== [SYNTHETIC SIMULATION SANDBOX EXECUTION] ===\n"
            f"Execution started at: {now_str}\n"
            f"Executing Action: {action.title}\n\n"
            f"Step 1/3: Terminating hung database connections in state 'idle in transaction' > 45s...\n"
            f"  -> SUCCESS: Terminated 42 zombie backend worker PIDs.\n"
            f"Step 2/3: Applying configuration patch: default_pool_size=180...\n"
            f"  -> SUCCESS: PgBouncer config reloaded gracefully without dropped traffic.\n"
            f"Step 3/3: Triggering rolling deployment restart on {action.incident_id} pods...\n"
            f"  -> SUCCESS: 6/6 pods reported READY in 24 seconds.\n\n"
            f"--- POST-REMEDIATION SIMULATED HEALTH VERIFICATION ---\n"
            f"[Metric Check] PgBouncer pool saturation: 100% -> 28% (HEALTHY)\n"
            f"[Metric Check] auth-billing-gateway p95 latency: 2,100ms -> 42ms (NOMINAL)\n"
            f"[Metric Check] HTTP error rate: 18.4% -> 0.02% (NOMINAL)\n"
            f"STATUS: Simulated recovery verified successfully. Zero anomalies detected."
        )

        action.execution_output = sim_output
        action.execution_status = "COMPLETED"

        # Update Incident status to MITIGATING or RESOLVED
        incident = db.query(Incident).filter(Incident.id == action.incident_id).first()
        if incident:
            incident.status = "RESOLVED"
            incident.resolved_at = datetime.datetime.utcnow()

        # Update affected service health to HEALTHY in simulation
        if incident:
            service = db.query(ServiceStatus).filter(ServiceStatus.name == incident.service).first()
            if service:
                service.health_status = "HEALTHY"
                service.error_rate_percent = 0.02
                service.p95_latency_ms = 42.0
                service.p99_latency_ms = 85.0
                service.active_incident_count = max(0, service.active_incident_count - 1)

        db.add(AuditLog(
            action="REMEDIATION_SIMULATION_EXECUTED",
            actor="Simulated Execution Engine",
            details=f"Simulated execution for {action_id} completed. Service recovered."
        ))
        db.commit()
        db.refresh(action)
        return action
