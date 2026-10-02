from fastapi import APIRouter, Depends, Query, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional

from backend.database import get_db
from backend.services.simulation_engine import SimulationEngine

router = APIRouter(prefix="", tags=["Simulation Engine"])

class StartSimulationRequest(BaseModel):
    scenario: str = Field("incident", description="'incident' for DB pool starvation drill or 'healthy' for nominal baseline")

@router.post("/simulation/start")
@router.post("/api/simulation/start")
def start_simulation(payload: StartSimulationRequest, db: Session = Depends(get_db)):
    """
    Start or switch deterministic synthetic simulation:
    - 'incident': Faulty deploy changing DB_POOL_SIZE=10 + traffic surge -> connection pool exhaustion.
    - 'healthy': DB_POOL_SIZE=50, nominal latency 45ms, error rate 0.02%, 250 RPS.
    """
    if payload.scenario.lower() not in ["incident", "healthy"]:
        raise HTTPException(status_code=400, detail="Scenario must be either 'incident' or 'healthy'.")
    return SimulationEngine.run_scenario(db, scenario=payload.scenario.lower())

@router.get("/simulation/status")
@router.get("/api/simulation/status")
def get_simulation_status(db: Session = Depends(get_db)):
    """Inspect current simulation state, active pool size, traffic RPS, and error rate."""
    return SimulationEngine.get_simulation_status(db)

@router.get("/simulation/events")
@router.get("/api/simulation/events")
def get_simulation_events(db: Session = Depends(get_db)):
    """Retrieve chronological event timeline (deployments, alerts, error logs)."""
    return SimulationEngine.get_simulation_events(db)

@router.post("/simulation/reset")
@router.post("/api/simulation/reset")
def reset_simulation(db: Session = Depends(get_db)):
    """Reset simulation engine back to clean healthy baseline with DB_POOL_SIZE=50."""
    return SimulationEngine.run_scenario(db, scenario="healthy")
