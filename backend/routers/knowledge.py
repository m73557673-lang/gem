from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List, Optional
from backend.database import get_db
from backend.models import KnowledgeDocument
from backend.schemas import KnowledgeDocumentResponse

router = APIRouter(tags=["Knowledge"])

@router.get("/knowledge", response_model=List[KnowledgeDocumentResponse])
@router.get("/api/knowledge-base", response_model=List[KnowledgeDocumentResponse])
def list_knowledge_documents(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    type: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    query = db.query(KnowledgeDocument)
    if type and type.upper() != "ALL":
        query = query.filter(KnowledgeDocument.type == type.upper())
    return query.offset(skip).limit(limit).all()
