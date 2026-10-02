import unittest
import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.models import (
    Service,
    Incident,
    IncidentTimeline,
    Metric,
    LogEvent,
    Deployment,
    Evidence,
    Recommendation,
    Action
)
from backend.services.incident_engine import (
    IncidentDetectionEngine,
    transition_incident_state,
    record_timeline_event,
    get_orchestrator,
    VALID_STATES,
    DEFAULT_THRESHOLDS
)

class TestIncidentEngine(unittest.TestCase):
    def setUp(self):
        # In-memory SQLite for pristine test isolation
        self.engine = create_engine("sqlite:///:memory:", echo=False)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine)
        self.db = self.Session()

        # Seed test services
        self.svc_gw = Service(id=1, name="API Gateway", environment="production-synthetic", owner="Networking", status="HEALTHY")
        self.svc_co = Service(id=2, name="Checkout Service", environment="production-synthetic", owner="Checkout Team", status="HEALTHY")
        self.db.add_all([self.svc_gw, self.svc_co])
        self.db.commit()

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)

    def test_threshold_breach_detection(self):
        """Test that telemetry exceeding critical thresholds triggers incident creation with CRITICAL severity."""
        now = datetime.datetime.utcnow()
        # Add normal metric on Gateway
        self.db.add(Metric(service_id=1, timestamp=now, metric_name="latency_p95", value=42.0))
        self.db.add(Metric(service_id=1, timestamp=now, metric_name="error_rate", value=0.01))

        # Add critical breached metrics on Checkout Service
        self.db.add(Metric(service_id=2, timestamp=now, metric_name="latency_p95", value=3450.0))
        self.db.add(Metric(service_id=2, timestamp=now, metric_name="error_rate", value=18.5))
        self.db.add(Metric(service_id=2, timestamp=now, metric_name="pool_utilization", value=100.0))
        self.db.commit()

        result = IncidentDetectionEngine.evaluate_telemetry(self.db)
        self.assertEqual(result["breaches_detected"], 1)
        self.assertEqual(result["incidents_created"], 1)
        self.assertEqual(result["deduplicated"], 0)

        # Verify persisted incident
        inc = self.db.query(Incident).filter(Incident.service_id == 2).first()
        self.assertIsNotNone(inc)
        self.assertEqual(inc.severity, "CRITICAL")
        self.assertEqual(inc.status, "detected")

        # Verify initial timeline entry
        timeline = self.db.query(IncidentTimeline).filter(IncidentTimeline.incident_id == inc.id).all()
        self.assertEqual(len(timeline), 1)
        self.assertEqual(timeline[0].to_state, "detected")

    def test_deduplication_of_active_incidents(self):
        """Test that subsequent detection evaluations do not create duplicate incidents for the same active event."""
        now = datetime.datetime.utcnow()
        self.db.add(Metric(service_id=2, timestamp=now, metric_name="latency_p95", value=2800.0))
        self.db.add(Metric(service_id=2, timestamp=now, metric_name="error_rate", value=12.0))
        self.db.commit()

        # First evaluation creates incident
        res1 = IncidentDetectionEngine.evaluate_telemetry(self.db)
        self.assertEqual(res1["incidents_created"], 1)

        # Second evaluation with continued breach should deduplicate
        res2 = IncidentDetectionEngine.evaluate_telemetry(self.db)
        self.assertEqual(res2["incidents_created"], 0)
        self.assertEqual(res2["deduplicated"], 1)

        # Assert only 1 incident exists in DB
        total_incidents = self.db.query(Incident).count()
        self.assertEqual(total_incidents, 1)

        # Assert audit timeline was appended with deduplication note
        timelines = self.db.query(IncidentTimeline).all()
        self.assertGreaterEqual(len(timelines), 2)
        self.assertTrue(any("Deduplication" in t.message for t in timelines))

    def test_lifecycle_state_transitions(self):
        """Test tracking through all 7 states and chronological audit timeline."""
        inc = Incident(title="Test Incident", severity="HIGH", status="detected", service_id=2)
        self.db.add(inc)
        self.db.commit()
        self.db.refresh(inc)

        states_sequence = [
            ("investigating", "Operator", "Operator opened investigation"),
            ("awaiting_approval", "Orchestrator", "Recommendation formulated"),
            ("remediating", "SRE Lead", "Approved remediation plan"),
            ("validating", "AutomatedRunner", "Checking canary metrics"),
            ("resolved", "Validator", "Telemetry nominal for 10 probes")
        ]

        for to_state, actor, msg in states_sequence:
            transition_incident_state(self.db, inc, to_state, actor=actor, message=msg)
            self.assertEqual(inc.status, to_state)

        # Verify resolved_at is set
        self.assertIsNotNone(inc.resolved_at)

        # Verify chronological timeline entries
        timelines = self.db.query(IncidentTimeline).filter(IncidentTimeline.incident_id == inc.id).order_by(IncidentTimeline.timestamp.asc()).all()
        self.assertEqual(len(timelines), len(states_sequence))
        self.assertEqual(timelines[-1].to_state, "resolved")

    def test_invalid_state_transition_failure(self):
        """Test that invalid states raise ValueError and are rejected."""
        inc = Incident(title="Test Incident", severity="HIGH", status="detected", service_id=2)
        self.db.add(inc)
        self.db.commit()

        with self.assertRaises(ValueError):
            transition_incident_state(self.db, inc, "invalid_state_name", actor="Hacker")

    def test_deterministic_investigation_orchestrator(self):
        """Test that investigation collects metrics, deployments, logs, and creates evidence + recommendations."""
        now = datetime.datetime.utcnow()
        inc = Incident(title="Pool Starvation", severity="CRITICAL", status="detected", service_id=2, created_at=now)
        self.db.add(inc)

        # Add deployments and error logs
        deploy = Deployment(service_id=2, version="v2.4.1-rc1", changes="perf(db): set DB_POOL_SIZE=10", timestamp=now - datetime.timedelta(minutes=5))
        log1 = LogEvent(service_id=2, level="ERROR", message="HikariPool-1 timeout after 3000ms", timestamp=now - datetime.timedelta(minutes=4))
        self.db.add_all([deploy, log1])
        self.db.commit()

        orchestrator = get_orchestrator("deterministic")
        result = orchestrator.run_investigation(self.db, inc, actor="TestOperator")

        self.assertEqual(result["status"], "completed")
        self.assertEqual(inc.status, "awaiting_approval")

        # Verify Evidence records were populated
        evidences = self.db.query(Evidence).filter(Evidence.incident_id == inc.id).all()
        self.assertGreaterEqual(len(evidences), 2)

        # Verify Recommendation was formulated
        rec = self.db.query(Recommendation).filter(Recommendation.incident_id == inc.id).first()
        self.assertIsNotNone(rec)
        self.assertIn("DB_POOL_SIZE", rec.action)

if __name__ == "__main__":
    unittest.main()
