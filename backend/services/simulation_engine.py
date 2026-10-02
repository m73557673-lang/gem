import datetime
from typing import Dict, List, Any, Optional
from sqlalchemy.orm import Session
from backend.models import (
    Service,
    Incident,
    LogEvent,
    Deployment,
    Metric,
    Evidence,
    Recommendation,
    Action,
    Postmortem,
    KnowledgeDocument
)

class SimulationEngine:
    """
    Deterministic Synthetic E-Commerce Checkout Simulation Engine.
    Generates application logs, deployment records, request latency, error rates,
    request volume (RPS), and database connection-pool utilization.
    Provides two deterministic states: 'HEALTHY' and 'INCIDENT'.
    Guaranteed isolated: strictly synthetic, cannot mutate real cloud infrastructure.
    """

    SERVICES_DEF = [
        {"id": 1, "name": "API Gateway", "environment": "production-synthetic", "owner": "Edge Networking Team", "status": "HEALTHY"},
        {"id": 2, "name": "Checkout Service", "environment": "production-synthetic", "owner": "Checkout Chapter", "status": "HEALTHY"},
        {"id": 3, "name": "Order Service", "environment": "production-synthetic", "owner": "Orders Platform Team", "status": "HEALTHY"},
        {"id": 4, "name": "Database Service", "environment": "production-synthetic", "owner": "Data SRE Infrastructure", "status": "HEALTHY"},
    ]

    @classmethod
    def ensure_services(cls, db: Session):
        """Ensure the 4 required e-commerce checkout services exist in SQLite."""
        for s_data in cls.SERVICES_DEF:
            svc = db.query(Service).filter(Service.id == s_data["id"]).first()
            if not svc:
                svc = Service(**s_data)
                db.add(svc)
            else:
                svc.name = s_data["name"]
                svc.owner = s_data["owner"]
        db.commit()

    @classmethod
    def get_simulation_status(cls, db: Session) -> Dict[str, Any]:
        """Inspect current simulation state, active deployment, pool capacity, and traffic."""
        cls.ensure_services(db)

        checkout_svc = db.query(Service).filter(Service.id == 2).first()
        active_inc = db.query(Incident).filter(Incident.status != "RESOLVED").first()
        latest_deploy = db.query(Deployment).filter(Deployment.service_id == 2).order_by(Deployment.timestamp.desc()).first()

        is_incident = active_inc is not None or (checkout_svc and checkout_svc.status != "HEALTHY")

        return {
            "simulation_mode": "SYNTHETIC_SIMULATOR",
            "state": "INCIDENT" if is_incident else "HEALTHY",
            "active_incident_id": active_inc.id if active_inc else None,
            "active_incident_title": active_inc.title if active_inc else None,
            "db_pool_size": 10 if is_incident else 50,
            "db_pool_utilization_pct": 100.0 if is_incident else 36.0,
            "traffic_rps": 850 if is_incident else 250,
            "latency_p95_ms": 3450.0 if is_incident else 45.0,
            "error_rate_pct": 18.5 if is_incident else 0.02,
            "active_version": latest_deploy.version if latest_deploy else ("v2.4.1-rc1" if is_incident else "v2.4.0"),
            "services_count": 4,
            "is_synthetic": True,
            "description": (
                "Incident scenario active: Faulty deployment changed DB_POOL_SIZE=10 causing connection starvation under 850 RPS."
                if is_incident
                else "Healthy baseline: DB_POOL_SIZE=50, nominal latency 45ms, error rate 0.02% under 250 RPS."
            )
        }

    @classmethod
    def run_scenario(cls, db: Session, scenario: str = "incident") -> Dict[str, Any]:
        """
        Deterministic scenario transition:
        - 'healthy': low error rate (0.02%), stable latency (45ms), DB_POOL_SIZE=50, traffic 250 RPS.
        - 'incident': deploy DB_POOL_SIZE=10, traffic surge to 850 RPS, connection pool 100% saturated, timeout logs, latency spike to 3450ms.
        """
        cls.ensure_services(db)
        now = datetime.datetime.utcnow()

        if scenario.lower() == "healthy":
            # Reset services to healthy
            for s in db.query(Service).all():
                s.status = "HEALTHY"

            # Resolve all incidents
            for inc in db.query(Incident).filter(Incident.status != "RESOLVED").all():
                inc.status = "RESOLVED"
                inc.resolved_at = now

            # Clean prior transient metrics and populate 15 healthy intervals
            db.query(Metric).delete()
            db.query(LogEvent).delete()

            # Healthy deployment
            db.query(Deployment).delete()
            deploy_healthy = Deployment(
                service_id=2,
                version="v2.4.0",
                changes="commit 3b1e94a: chore: standard health checks & nominal config (DB_POOL_SIZE=50)",
                timestamp=now - datetime.timedelta(hours=2)
            )
            db.add(deploy_healthy)

            # Generate 15 deterministic healthy metrics samples (every 2 mins)
            for i in range(15, -1, -1):
                t = now - datetime.timedelta(minutes=i * 2)
                # API Gateway
                db.add(Metric(service_id=1, timestamp=t, metric_name="latency_p95", value=45.0 + (i % 3) * 1.5))
                db.add(Metric(service_id=1, timestamp=t, metric_name="error_rate", value=0.02))
                db.add(Metric(service_id=1, timestamp=t, metric_name="request_volume", value=250.0 + (i % 5) * 4))
                # Checkout Service
                db.add(Metric(service_id=2, timestamp=t, metric_name="latency_p95", value=38.0 + (i % 3) * 1.2))
                db.add(Metric(service_id=2, timestamp=t, metric_name="error_rate", value=0.01))
                db.add(Metric(service_id=2, timestamp=t, metric_name="pool_utilization", value=36.0 + (i % 4) * 2.0))
                db.add(Metric(service_id=2, timestamp=t, metric_name="request_volume", value=250.0 + (i % 5) * 4))
                # Database Service
                db.add(Metric(service_id=4, timestamp=t, metric_name="pool_utilization", value=36.0 + (i % 4) * 2.0))
                db.add(Metric(service_id=4, timestamp=t, metric_name="latency_p95", value=12.0 + (i % 2) * 0.8))

            # Healthy logs
            db.add(LogEvent(
                service_id=1,
                timestamp=now - datetime.timedelta(minutes=5),
                level="INFO",
                message="HTTP 200 GET /v1/checkout/health - OK (45ms)"
            ))
            db.add(LogEvent(
                service_id=2,
                timestamp=now - datetime.timedelta(minutes=4),
                level="INFO",
                message="HikariPool-1 - Pool stats (total=50, active=18, idle=32, waiting=0)"
            ))

            db.commit()
            return cls.get_simulation_status(db)

        # ---------------- INCIDENT SCENARIO ----------------
        # 1. Update Services: Checkout Service OUTAGE, Gateway DEGRADED, DB DEGRADED
        gw = db.query(Service).filter(Service.id == 1).first()
        co = db.query(Service).filter(Service.id == 2).first()
        ord_s = db.query(Service).filter(Service.id == 3).first()
        dbs = db.query(Service).filter(Service.id == 4).first()

        if gw: gw.status = "DEGRADED"
        if co: co.status = "OUTAGE"
        if ord_s: ord_s.status = "DEGRADED"
        if dbs: dbs.status = "DEGRADED"

        # 2. Deploy faulty deployment commit
        db.query(Deployment).delete()
        deploy_prev = Deployment(
            service_id=2,
            version="v2.4.0",
            changes="commit 3b1e94a: feat: stable checkout baseline (DB_POOL_SIZE=50)",
            timestamp=now - datetime.timedelta(hours=2)
        )
        deploy_faulty = Deployment(
            service_id=2,
            version="v2.4.1-rc1",
            changes="commit 8f31c2a: perf(db): tune DB_POOL_SIZE from 50 to 10 to reduce idle memory",
            timestamp=now - datetime.timedelta(minutes=16)
        )
        db.add_all([deploy_prev, deploy_faulty])
        db.flush()

        # 3. Create or update active Incident
        inc = db.query(Incident).filter(Incident.title.like("%Connection Pool Exhaustion%")).first()
        if not inc:
            inc = Incident(
                title="[SYNTHETIC] Database Connection Pool Exhaustion on Checkout Service",
                severity="CRITICAL",
                status="INVESTIGATING",
                service_id=2,
                created_at=now - datetime.timedelta(minutes=14),
                resolved_at=None
            )
            db.add(inc)
            db.flush()
        else:
            inc.status = "INVESTIGATING"
            inc.resolved_at = None

        # 4. Clear and recreate metrics timeseries showing deterministic surge
        db.query(Metric).delete()
        for i in range(15, -1, -1):
            t = now - datetime.timedelta(minutes=i * 2)
            is_incident_phase = (i <= 7)  # last 14 minutes
            transition_phase = (i == 8)

            if is_incident_phase:
                vol = 850.0 + (i % 5) * 12
                lat = 3450.0 + (i % 4) * 85
                err = 18.5 + (i % 3) * 1.2
                pool = 100.0  # 10/10 connections exhausted
            elif transition_phase:
                vol = 620.0
                lat = 950.0
                err = 4.2
                pool = 90.0
            else:
                vol = 250.0 + (i % 4) * 5
                lat = 45.0 + (i % 3) * 1.5
                err = 0.02
                pool = 36.0  # 18/50 nominal

            # Service 1: API Gateway
            db.add(Metric(service_id=1, timestamp=t, metric_name="latency_p95", value=lat + 20))
            db.add(Metric(service_id=1, timestamp=t, metric_name="error_rate", value=err))
            db.add(Metric(service_id=1, timestamp=t, metric_name="request_volume", value=vol))
            # Service 2: Checkout Service
            db.add(Metric(service_id=2, timestamp=t, metric_name="latency_p95", value=lat))
            db.add(Metric(service_id=2, timestamp=t, metric_name="error_rate", value=err))
            db.add(Metric(service_id=2, timestamp=t, metric_name="pool_utilization", value=pool))
            db.add(Metric(service_id=2, timestamp=t, metric_name="request_volume", value=vol))
            # Service 4: Database Service
            db.add(Metric(service_id=4, timestamp=t, metric_name="pool_utilization", value=pool))
            db.add(Metric(service_id=4, timestamp=t, metric_name="latency_p95", value=1800.0 if is_incident_phase else 12.0))

        # 5. Populate timestamped Application Logs
        db.query(LogEvent).delete()
        log_events = [
            LogEvent(
                service_id=2,
                timestamp=now - datetime.timedelta(minutes=16),
                level="INFO",
                message="Deployment v2.4.1-rc1 applied. Setting DB_POOL_SIZE=10. Reinitializing HikariCP DataSource."
            ),
            LogEvent(
                service_id=1,
                timestamp=now - datetime.timedelta(minutes=14),
                level="INFO",
                message="Traffic surge detected on POST /v1/checkout/pay: ingress throughput climbed from 250 RPS to 850 RPS"
            ),
            LogEvent(
                service_id=2,
                timestamp=now - datetime.timedelta(minutes=13),
                level="WARN",
                message="HikariPool-1 - Connection pool acquisition wait time exceeded 1500ms; active connections: 10/10 (100% capacity)"
            ),
            LogEvent(
                service_id=2,
                timestamp=now - datetime.timedelta(minutes=12),
                level="ERROR",
                message="PSQLException: FATAL: remaining connection slots are reserved for non-replication superuser connections (max_connections=10)"
            ),
            LogEvent(
                service_id=2,
                timestamp=now - datetime.timedelta(minutes=10),
                level="ERROR",
                message="HikariPool-1 - Connection is not available, request timed out after 3000ms"
            ),
            LogEvent(
                service_id=1,
                timestamp=now - datetime.timedelta(minutes=8),
                level="ERROR",
                message="HTTP 504 Gateway Timeout: upstream Checkout Service failed to complete within 3000ms deadline (error rate 18.5%)"
            )
        ]
        for le in log_events:
            db.add(le)
        db.flush()

        # 6. Populate Evidence linked to incident
        db.query(Evidence).filter(Evidence.incident_id == inc.id).delete()
        ev1 = Evidence(incident_id=inc.id, source_type="DEPLOYMENT", source_id=deploy_faulty.id, relevance=0.98)
        ev2 = Evidence(incident_id=inc.id, source_type="LOG", source_id=log_events[3].id, relevance=0.96)
        ev3 = Evidence(incident_id=inc.id, source_type="METRIC", source_id=None, relevance=0.94)
        ev4 = Evidence(incident_id=inc.id, source_type="ALERT", source_id=None, relevance=0.99)
        db.add_all([ev1, ev2, ev3, ev4])

        # 7. Recommendation
        db.query(Recommendation).filter(Recommendation.incident_id == inc.id).delete()
        rec = Recommendation(
            incident_id=inc.id,
            action="Rollback deployment v2.4.1-rc1 to v2.4.0. Reconfigure Checkout Service DB_POOL_SIZE from 10 back to 50, and restart pod replicas to drain hung connection queues.",
            risk="LOW",
            confidence=0.97
        )
        db.add(rec)

        # 8. Action for human gating
        db.query(Action).filter(Action.incident_id == inc.id).delete()
        act = Action(
            incident_id=inc.id,
            approved_by=None,
            status="PENDING",
            result="Awaiting SRE operator authorization. Rollback to DB_POOL_SIZE=50 prepared."
        )
        db.add(act)

        # 9. Knowledge runbook for connection pool
        if db.query(KnowledgeDocument).count() == 0:
            db.add(KnowledgeDocument(
                title="PostgreSQL Connection Pool Saturated - Emergency Drain & Pool Expansion",
                type="RUNBOOK",
                content="""# PostgreSQL Connection Pool Recovery Runbook
1. Verify open transactions:
   SELECT pid, now() - xact_start AS duration, query, state FROM pg_stat_activity WHERE state IN ('idle in transaction', 'active');
2. Terminate zombie queries lingering > 30 seconds.
3. Scale DB_POOL_SIZE from 10 back to 50.
4. Execute rolling restart of Checkout Service pods.""",
                source="git://ops-runbooks/checkout/db-pool-triage.md"
            ))

        db.commit()
        return cls.get_simulation_status(db)

    @classmethod
    def get_simulation_events(cls, db: Session) -> List[Dict[str, Any]]:
        """Retrieve chronological event timeline for the simulated scenario."""
        events = []
        # Deployments
        for d in db.query(Deployment).order_by(Deployment.timestamp.asc()).all():
            events.append({
                "type": "DEPLOYMENT",
                "timestamp": d.timestamp.isoformat(),
                "title": f"Deployment {d.version}",
                "detail": d.changes,
                "service_id": d.service_id,
                "is_synthetic": True
            })
        # Logs (WARN / ERROR / FATAL)
        for l in db.query(LogEvent).filter(LogEvent.level.in_(["WARN", "ERROR", "FATAL"])).order_by(LogEvent.timestamp.asc()).all():
            events.append({
                "type": "LOG",
                "timestamp": l.timestamp.isoformat(),
                "title": f"[{l.level}] Error Log in Service #{l.service_id}",
                "detail": l.message,
                "service_id": l.service_id,
                "is_synthetic": True
            })
        # Incidents
        for i in db.query(Incident).order_by(Incident.created_at.asc()).all():
            events.append({
                "type": "INCIDENT",
                "timestamp": i.created_at.isoformat(),
                "title": f"Incident #{i.id}: {i.severity} Severity",
                "detail": i.title,
                "service_id": i.service_id,
                "is_synthetic": True
            })

        # Sort all by timestamp descending
        events.sort(key=lambda x: x["timestamp"], reverse=True)
        return events
