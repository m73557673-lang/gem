import datetime
from abc import ABC, abstractmethod
from typing import Dict, List, Any, Optional, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import text

from backend.models import (
    Incident,
    IncidentTimeline,
    Service,
    Metric,
    LogEvent,
    Deployment,
    Evidence,
    Recommendation,
    Action
)

# ----------------- VALID STATES -----------------
VALID_STATES = [
    "detected",
    "investigating",
    "awaiting_approval",
    "remediating",
    "validating",
    "resolved",
    "failed"
]

# ----------------- CONFIGURABLE THRESHOLDS -----------------
DEFAULT_THRESHOLDS = {
    "error_rate": {
        "CRITICAL": 5.0,   # >= 5.0% error rate
        "HIGH": 1.0,       # >= 1.0% error rate
        "MEDIUM": 0.5      # >= 0.5% error rate
    },
    "latency_p95": {
        "CRITICAL": 2000.0, # >= 2000ms latency
        "HIGH": 500.0,      # >= 500ms latency
        "MEDIUM": 200.0     # >= 200ms latency
    },
    "pool_utilization": {
        "CRITICAL": 95.0,  # >= 95% saturation
        "HIGH": 80.0       # >= 80% saturation
    }
}

# ----------------- STATE TRANSITION & TIMELINE -----------------
def record_timeline_event(
    db: Session,
    incident_id: int,
    to_state: str,
    from_state: Optional[str] = None,
    actor: str = "System",
    message: str = ""
) -> IncidentTimeline:
    """Record an immutable chronological audit transition in the database."""
    entry = IncidentTimeline(
        incident_id=incident_id,
        from_state=from_state,
        to_state=to_state,
        actor=actor,
        message=message,
        timestamp=datetime.datetime.utcnow()
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry

def transition_incident_state(
    db: Session,
    incident: Incident,
    to_state: str,
    actor: str = "Operator",
    message: str = ""
) -> Incident:
    """Validate and transition an incident between allowed states."""
    to_state_clean = to_state.strip().lower()
    if to_state_clean not in VALID_STATES:
        raise ValueError(f"Invalid incident state '{to_state}'. Must be one of: {', '.join(VALID_STATES)}")

    old_state = incident.status.lower()
    if old_state == to_state_clean:
        return incident

    incident.status = to_state_clean
    if to_state_clean == "resolved":
        incident.resolved_at = datetime.datetime.utcnow()

    record_timeline_event(
        db=db,
        incident_id=incident.id,
        from_state=old_state,
        to_state=to_state_clean,
        actor=actor,
        message=message or f"State transitioned from '{old_state}' to '{to_state_clean}'"
    )

    db.commit()
    db.refresh(incident)
    return incident

# ----------------- THRESHOLD DETECTION ENGINE -----------------
class IncidentDetectionEngine:
    """Monitors synthetic telemetry against configurable thresholds and creates deduplicated incidents."""

    @classmethod
    def evaluate_telemetry(
        cls,
        db: Session,
        thresholds: Dict[str, Any] = DEFAULT_THRESHOLDS,
        actor: str = "DetectionEngine"
    ) -> Dict[str, Any]:
        """
        Scan recent metrics per service.
        Detects threshold breaches, assigns severity, deduplicates against active incidents,
        and transitions created incidents to 'detected' with a timeline audit entry.
        """
        now = datetime.datetime.utcnow()
        time_window = now - datetime.timedelta(minutes=15)

        services = db.query(Service).all()
        created_incidents = []
        deduplicated_count = 0
        breaches_found = []

        for svc in services:
            # Query recent metrics for this service
            recent_metrics = db.query(Metric).filter(
                Metric.service_id == svc.id,
                Metric.timestamp >= time_window
            ).all()

            if not recent_metrics:
                continue

            # Group metric values by name
            metric_map: Dict[str, List[float]] = {}
            for m in recent_metrics:
                metric_map.setdefault(m.metric_name, []).append(m.value)

            # Evaluate thresholds
            breach_reasons = []
            highest_severity = None

            # 1. Error rate check
            if "error_rate" in metric_map:
                max_err = max(metric_map["error_rate"])
                if max_err >= thresholds["error_rate"]["CRITICAL"]:
                    highest_severity = "CRITICAL"
                    breach_reasons.append(f"Error rate reached {max_err:.2f}% (CRITICAL threshold >= {thresholds['error_rate']['CRITICAL']}%)")
                elif max_err >= thresholds["error_rate"]["HIGH"] and highest_severity != "CRITICAL":
                    highest_severity = "HIGH"
                    breach_reasons.append(f"Error rate reached {max_err:.2f}% (HIGH threshold >= {thresholds['error_rate']['HIGH']}%)")
                elif max_err >= thresholds["error_rate"]["MEDIUM"] and not highest_severity:
                    highest_severity = "MEDIUM"
                    breach_reasons.append(f"Error rate reached {max_err:.2f}% (MEDIUM threshold >= {thresholds['error_rate']['MEDIUM']}%)")

            # 2. Latency p95 check
            if "latency_p95" in metric_map:
                max_lat = max(metric_map["latency_p95"])
                if max_lat >= thresholds["latency_p95"]["CRITICAL"]:
                    highest_severity = "CRITICAL"
                    breach_reasons.append(f"p95 latency reached {max_lat:.0f}ms (CRITICAL threshold >= {thresholds['latency_p95']['CRITICAL']}ms)")
                elif max_lat >= thresholds["latency_p95"]["HIGH"] and highest_severity != "CRITICAL":
                    highest_severity = "HIGH"
                    breach_reasons.append(f"p95 latency reached {max_lat:.0f}ms (HIGH threshold >= {thresholds['latency_p95']['HIGH']}ms)")
                elif max_lat >= thresholds["latency_p95"]["MEDIUM"] and not highest_severity:
                    highest_severity = "MEDIUM"
                    breach_reasons.append(f"p95 latency reached {max_lat:.0f}ms (MEDIUM threshold >= {thresholds['latency_p95']['MEDIUM']}ms)")

            # 3. Pool utilization check
            if "pool_utilization" in metric_map:
                max_pool = max(metric_map["pool_utilization"])
                if max_pool >= thresholds["pool_utilization"]["CRITICAL"]:
                    highest_severity = "CRITICAL"
                    breach_reasons.append(f"Database connection pool saturation reached {max_pool:.1f}% (CRITICAL >= {thresholds['pool_utilization']['CRITICAL']}%)")

            if highest_severity:
                breaches_found.append({
                    "service_id": svc.id,
                    "service_name": svc.name,
                    "severity": highest_severity,
                    "reasons": breach_reasons
                })

                # Deduplication check: Avoid duplicate incidents for the same active event
                existing_active = db.query(Incident).filter(
                    Incident.service_id == svc.id,
                    Incident.status.notin_(["resolved", "failed"])
                ).first()

                if existing_active:
                    deduplicated_count += 1
                    # Append audit observation to existing incident
                    record_timeline_event(
                        db=db,
                        incident_id=existing_active.id,
                        from_state=existing_active.status,
                        to_state=existing_active.status,
                        actor=actor,
                        message=f"Deduplication: Active incident exists. Threshold breach reaffirmed: {'; '.join(breach_reasons)}"
                    )
                else:
                    # Create new incident in 'detected' state
                    title = f"[SYNTHETIC] {highest_severity} Breach on {svc.name}: {breach_reasons[0]}"
                    incident = Incident(
                        title=title,
                        severity=highest_severity,
                        status="detected",
                        service_id=svc.id,
                        created_at=now,
                        resolved_at=None
                    )
                    db.add(incident)
                    db.commit()
                    db.refresh(incident)

                    # Initial audit timeline entry
                    record_timeline_event(
                        db=db,
                        incident_id=incident.id,
                        from_state=None,
                        to_state="detected",
                        actor=actor,
                        message=f"Threshold breach detected by {actor}: {'; '.join(breach_reasons)}"
                    )

                    # Mark service degraded
                    svc.status = "OUTAGE" if highest_severity == "CRITICAL" else "DEGRADED"
                    db.commit()

                    created_incidents.append(incident)

        return {
            "breaches_detected": len(breaches_found),
            "incidents_created": len(created_incidents),
            "deduplicated": deduplicated_count,
            "created_incident_ids": [i.id for i in created_incidents],
            "details": breaches_found
        }

# ----------------- MODULAR INVESTIGATION ORCHESTRATOR -----------------
class BaseInvestigationOrchestrator(ABC):
    """Abstract interface for incident investigation orchestration (supports deterministic & future AI agents)."""

    @abstractmethod
    def run_investigation(self, db: Session, incident: Incident, actor: str) -> Dict[str, Any]:
        """Orchestrate investigation workflow and return structured findings."""
        pass

class DeterministicInvestigationOrchestrator(BaseInvestigationOrchestrator):
    """Deterministic investigation orchestrator that correlates telemetry, deployments, logs, and runbooks."""

    def run_investigation(self, db: Session, incident: Incident, actor: str = "Operator") -> Dict[str, Any]:
        # Step 1: Transition state to 'investigating'
        transition_incident_state(
            db=db,
            incident=incident,
            to_state="investigating",
            actor=actor,
            message=f"Investigation initiated by {actor}. Starting root-cause analysis workflow."
        )

        steps_log = ["Phase 1: State transitioned to 'investigating'."]
        now = datetime.datetime.utcnow()
        window_start = incident.created_at - datetime.timedelta(minutes=30)
        window_end = now + datetime.timedelta(minutes=5)

        # Step 2: Collect telemetry metrics in the incident window
        steps_log.append(f"Phase 2: Querying telemetry metrics window [{window_start.strftime('%H:%M:%S')} - {window_end.strftime('%H:%M:%S')}].")
        metrics = db.query(Metric).filter(
            Metric.service_id == incident.service_id,
            Metric.timestamp >= window_start,
            Metric.timestamp <= window_end
        ).all()

        max_latency = max([m.value for m in metrics if m.metric_name == "latency_p95"], default=0.0)
        max_error_rate = max([m.value for m in metrics if m.metric_name == "error_rate"], default=0.0)
        max_pool = max([m.value for m in metrics if m.metric_name == "pool_utilization"], default=0.0)

        # Step 3: Collect deployment changes in window
        steps_log.append("Phase 3: Inspecting deployment commit log and configuration diffs.")
        deployments = db.query(Deployment).filter(
            Deployment.service_id == incident.service_id,
            Deployment.timestamp >= window_start,
            Deployment.timestamp <= window_end
        ).order_by(Deployment.timestamp.desc()).all()

        culprit_deploy = None
        for d in deployments:
            if "DB_POOL_SIZE" in d.changes or "perf(db)" in d.changes:
                culprit_deploy = d
                break
        if not culprit_deploy and deployments:
            culprit_deploy = deployments[0]

        # Step 4: Collect application error logs in window
        steps_log.append("Phase 4: Scanning application error logs for fatal stacktraces & timeouts.")
        error_logs = db.query(LogEvent).filter(
            LogEvent.service_id == incident.service_id,
            LogEvent.level.in_(["ERROR", "FATAL", "WARN"]),
            LogEvent.timestamp >= window_start,
            LogEvent.timestamp <= window_end
        ).order_by(LogEvent.timestamp.asc()).all()

        # Step 5: Synthesize and store Correlated Evidence
        steps_log.append("Phase 5: Correlating evidence records with relevance scoring.")
        db.query(Evidence).filter(Evidence.incident_id == incident.id).delete()

        evidences_to_add = []
        if culprit_deploy:
            evidences_to_add.append(Evidence(
                incident_id=incident.id,
                source_type="DEPLOYMENT",
                source_id=culprit_deploy.id,
                relevance=0.98
            ))

        for log in error_logs[:3]:
            evidences_to_add.append(Evidence(
                incident_id=incident.id,
                source_type="LOG",
                source_id=log.id,
                relevance=0.95
            ))

        evidences_to_add.append(Evidence(
            incident_id=incident.id,
            source_type="METRIC",
            source_id=None,
            relevance=0.93
        ))
        evidences_to_add.append(Evidence(
            incident_id=incident.id,
            source_type="ALERT",
            source_id=None,
            relevance=0.99
        ))

        db.add_all(evidences_to_add)
        db.flush()

        # Step 6: Formulate Recommendation
        steps_log.append("Phase 6: Formulating targeted remediation recommendation & human approval action.")
        action_text = (
            f"Rollback deployment {culprit_deploy.version if culprit_deploy else 'v2.4.1-rc1'} to v2.4.0. "
            "Reconfigure Checkout Service DB_POOL_SIZE from 10 back to 50, and restart pod replicas to drain hung connection queues."
            if culprit_deploy else
            "Scale database connection pool ceiling to 50 and execute rolling restart of Checkout Service pods."
        )

        db.query(Recommendation).filter(Recommendation.incident_id == incident.id).delete()
        recommendation = Recommendation(
            incident_id=incident.id,
            action=action_text,
            risk="LOW",
            confidence=0.97
        )
        db.add(recommendation)

        # Step 7: Create human authorization Action
        db.query(Action).filter(Action.incident_id == incident.id).delete()
        action_item = Action(
            incident_id=incident.id,
            approved_by=None,
            status="PENDING",
            result="Awaiting SRE operator authorization. Rollback to DB_POOL_SIZE=50 prepared."
        )
        db.add(action_item)
        db.commit()

        # Step 8: Transition to 'awaiting_approval'
        transition_incident_state(
            db=db,
            incident=incident,
            to_state="awaiting_approval",
            actor=actor,
            message="Investigation completed. Root cause identified: DB_POOL_SIZE reduction under traffic surge. Action awaiting operator approval."
        )
        steps_log.append("Phase 7: Transitioned to 'awaiting_approval'. Ready for SRE review.")

        findings = {
            "incident_id": incident.id,
            "service_name": incident.service.name if incident.service else f"Service-{incident.service_id}",
            "culprit_deployment": culprit_deploy.version if culprit_deploy else "None",
            "culprit_changes": culprit_deploy.changes if culprit_deploy else "None",
            "max_latency_p95": max_latency,
            "max_error_rate": max_error_rate,
            "max_pool_utilization": max_pool,
            "error_logs_count": len(error_logs),
            "evidence_count": len(evidences_to_add),
            "recommendation": action_text
        }

        return {
            "status": "completed",
            "incident_state": incident.status,
            "progress_pct": 100,
            "current_step": "Awaiting human operator approval",
            "steps_log": steps_log,
            "findings": findings
        }

# Factory / Registry for modular orchestration
def get_orchestrator(orchestrator_type: str = "deterministic") -> BaseInvestigationOrchestrator:
    """Return the configured investigation orchestrator (deterministic or pluggable AI agent)."""
    return DeterministicInvestigationOrchestrator()
