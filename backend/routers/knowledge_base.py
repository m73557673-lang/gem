from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.schemas import RunbookResponse, RunbookQueryRequest
from backend.services.rag_service import RunbookRAGService

router = APIRouter(prefix="/api/knowledge-base", tags=["Knowledge Base & RAG"])

@router.get("", response_model=List[RunbookResponse])
def get_all_runbooks(db: Session = Depends(get_db)):
    """Retrieve all operational runbooks in the knowledge base."""
    return RunbookRAGService.get_all(db=db)

@router.get("/{runbook_id}", response_model=RunbookResponse)
def get_runbook(runbook_id: str, db: Session = Depends(get_db)):
    """Retrieve details and markdown steps for a specific runbook."""
    rb = RunbookRAGService.get_by_id(db=db, runbook_id=runbook_id)
    if not rb:
        raise HTTPException(status_code=404, detail=f"Runbook {runbook_id} not found.")
    return rb

@router.post("/search", response_model=List[RunbookResponse])
def search_runbooks(request: RunbookQueryRequest, db: Session = Depends(get_db)):
    """RAG document retrieval endpoint: retrieves top matching runbooks for an incident or error signature."""
    return RunbookRAGService.retrieve_relevant_runbooks(
        db=db,
        query=request.query,
        service=request.service,
        top_k=request.top_k
    )
