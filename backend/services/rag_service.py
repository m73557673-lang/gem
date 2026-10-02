from typing import List, Optional
from sqlalchemy.orm import Session
from backend.models import Runbook

class RunbookRAGService:
    """
    Modular RAG retrieval layer.
    In the initial phase, provides token-based keyword and semantic relevance scoring.
    Ready for vector embeddings (e.g., Chroma, FAISS, or PGVector) in future extensions.
    """
    @staticmethod
    def get_all(db: Session) -> List[Runbook]:
        return db.query(Runbook).all()

    @staticmethod
    def get_by_id(db: Session, runbook_id: str) -> Optional[Runbook]:
        return db.query(Runbook).filter(Runbook.id == runbook_id).first()

    @staticmethod
    def retrieve_relevant_runbooks(
        db: Session,
        query: str,
        service: Optional[str] = None,
        top_k: int = 3
    ) -> List[Runbook]:
        all_runbooks = db.query(Runbook).all()
        query_terms = query.lower().split()

        scored_runbooks = []
        for rb in all_runbooks:
            score = 0
            text_corpus = f"{rb.title} {rb.service} {rb.category} {rb.content} {' '.join(rb.tags)} {' '.join(rb.triggers)}".lower()

            # Exact match score
            if query.lower() in text_corpus:
                score += 10

            # Term overlap score
            for term in query_terms:
                if len(term) > 2 and term in text_corpus:
                    score += 2

            if service and rb.service.lower() == service.lower():
                score += 5

            scored_runbooks.append((score, rb))

        # Sort by score descending
        scored_runbooks.sort(key=lambda x: x[0], reverse=True)
        return [rb for _, rb in scored_runbooks[:top_k]]
