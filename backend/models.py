import datetime
from sqlalchemy import (
    Column,
    Integer,
    String,
    Text,
    Float,
    DateTime,
    ForeignKey,
    Index
)
from sqlalchemy.orm import relationship
from backend.database import Base

class Service(Base):
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    name = Column(String(128), unique=True, nullable=False, index=True)
    environment = Column(String(64), default="production", nullable=False)
    owner = Column(String(128), default="SRE Team", nullable=False)
    status = Column(String(32), default="HEALTHY", nullable=False)  # HEALTHY, DEGRADED, OUTAGE

    # Relationships
    incidents = relationship("Incident", back_populates="service", cascade="all, delete-orphan")
    log_events = relationship("LogEvent", back_populates="service", cascade="all, delete-orphan")
    deployments = relationship("Deployment", back_populates="service", cascade="all, delete-orphan")
    metrics = relationship("Metric", back_populates="service", cascade="all, delete-orphan")

class Incident(Base):
    __tablename__ = "incidents"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    title = Column(String(255), nullable=False)
    severity = Column(String(32), default="HIGH", nullable=False, index=True)  # CRITICAL, HIGH, MEDIUM, LOW
    # State machine: detected, investigating, awaiting_approval, remediating, validating, resolved, failed
    status = Column(String(32), default="detected", nullable=False, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    resolved_at = Column(DateTime, nullable=True)

    # Relationships
    service = relationship("Service", back_populates="incidents")
    evidences = relationship("Evidence", back_populates="incident", cascade="all, delete-orphan")
    recommendations = relationship("Recommendation", back_populates="incident", cascade="all, delete-orphan")
    actions = relationship("Action", back_populates="incident", cascade="all, delete-orphan")
    postmortem = relationship("Postmortem", back_populates="incident", uselist=False, cascade="all, delete-orphan")
    timeline_events = relationship("IncidentTimeline", back_populates="incident", cascade="all, delete-orphan", order_by="IncidentTimeline.timestamp.asc()")

class IncidentTimeline(Base):
    __tablename__ = "incident_timelines"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    from_state = Column(String(32), nullable=True)
    to_state = Column(String(32), nullable=False, index=True)
    actor = Column(String(128), default="System", nullable=False)
    message = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    incident = relationship("Incident", back_populates="timeline_events")

class LogEvent(Base):
    __tablename__ = "log_events"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    level = Column(String(16), default="INFO", nullable=False, index=True)  # INFO, WARN, ERROR, FATAL
    message = Column(Text, nullable=False)

    # Relationships
    service = relationship("Service", back_populates="log_events")

class Deployment(Base):
    __tablename__ = "deployments"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    version = Column(String(64), nullable=False)
    changes = Column(Text, nullable=False)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)

    # Relationships
    service = relationship("Service", back_populates="deployments")

class Metric(Base):
    __tablename__ = "metrics"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    service_id = Column(Integer, ForeignKey("services.id", ondelete="CASCADE"), nullable=False, index=True)
    timestamp = Column(DateTime, default=datetime.datetime.utcnow, nullable=False, index=True)
    metric_name = Column(String(64), nullable=False, index=True)  # latency_p95, error_rate, pool_utilization, request_volume
    value = Column(Float, nullable=False)

    # Composite index for querying service timeseries efficiently
    __table_args__ = (
        Index("idx_metrics_service_name_time", "service_id", "metric_name", "timestamp"),
    )

    # Relationships
    service = relationship("Service", back_populates="metrics")

class KnowledgeDocument(Base):
    __tablename__ = "knowledge_documents"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    title = Column(String(255), nullable=False)
    type = Column(String(64), default="RUNBOOK", nullable=False, index=True)  # RUNBOOK, ARCHITECTURE, PLAYBOOK, POSTMORTEM
    content = Column(Text, nullable=False)
    source = Column(String(255), nullable=False)

class Evidence(Base):
    __tablename__ = "evidences"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    source_type = Column(String(32), nullable=False, index=True)  # LOG, METRIC, DEPLOYMENT, ALERT
    source_id = Column(Integer, nullable=True)
    relevance = Column(Float, default=0.9, nullable=False)

    # Relationships
    incident = relationship("Incident", back_populates="evidences")

class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(Text, nullable=False)
    risk = Column(String(32), default="MEDIUM", nullable=False)  # LOW, MEDIUM, HIGH
    confidence = Column(Float, default=0.85, nullable=False)

    # Relationships
    incident = relationship("Incident", back_populates="recommendations")

class Action(Base):
    __tablename__ = "actions"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, index=True)
    approved_by = Column(String(128), nullable=True)
    status = Column(String(32), default="PENDING", nullable=False)  # PENDING, APPROVED, REJECTED, SIMULATED
    result = Column(Text, nullable=True)

    # Relationships
    incident = relationship("Incident", back_populates="actions")

class Postmortem(Base):
    __tablename__ = "postmortems"

    id = Column(Integer, primary_key=True, autoincrement=True, index=True)
    incident_id = Column(Integer, ForeignKey("incidents.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    summary = Column(Text, nullable=False)
    root_cause = Column(Text, nullable=False)
    prevention = Column(Text, nullable=False)

    # Relationships
    incident = relationship("Incident", back_populates="postmortem")
