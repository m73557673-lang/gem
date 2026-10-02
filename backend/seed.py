import datetime
from sqlalchemy.orm import Session
from backend.models import (
    Service,
    Incident,
    LogEvent,
    Deployment,
    Metric,
    KnowledgeDocument,
    Evidence,
    Recommendation,
    Action,
    Postmortem
)
from backend.services.simulation_engine import SimulationEngine

def seed_database(db: Session):
    """Seed SQLite database with synthetic e-commerce checkout services and initial scenario."""
    # Ensure the 4 requested services
    SimulationEngine.ensure_services(db)

    # If runbooks don't exist, seed knowledge doc
    if db.query(KnowledgeDocument).count() == 0:
        db.add(KnowledgeDocument(
            id=1,
            title="PostgreSQL Connection Pool Recovery & Emergency Drain Runbook",
            type="RUNBOOK",
            content="""# PostgreSQL Connection Pool Saturated Runbook

### Purpose
Triage and mitigate critical connection starvation in PgBouncer and PostgreSQL instances.

### Diagnostic Steps
1. Execute query to inspect open transactions:
   SELECT pid, now() - xact_start AS duration, query, state FROM pg_stat_activity WHERE state IN ('idle in transaction', 'active') ORDER BY duration DESC;
2. Verify connection count per application username:
   SELECT usename, count(*) FROM pg_stat_activity GROUP BY usename;

### Remediation Steps (Requires Human SRE Approval)
1. Terminate hung backend queries lingering > 45 seconds:
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'idle in transaction' AND now() - xact_start > interval '45 seconds';
2. Scale DB_POOL_SIZE from 10 back to 50 in deployment config.
3. Perform a rolling restart of Checkout Service pods to re-initialize connection pools.""",
            source="git://ops-runbooks/checkout/db-pool-triage.md"
        ))
        db.commit()

    # Trigger initial incident demo scenario so the dashboard has the reproducible drill ready
    SimulationEngine.run_scenario(db, scenario="incident")
