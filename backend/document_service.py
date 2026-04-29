"""PDF/DOCX text extraction + ChromaDB indexing for semantic search."""
import os
import io
from pathlib import Path
from typing import List, Tuple

import chromadb
from chromadb.config import Settings
from pypdf import PdfReader
from docx import Document as DocxDocument

CHROMA_DIR = os.environ.get('CHROMA_DIR', '/app/backend/chroma_db')
Path(CHROMA_DIR).mkdir(parents=True, exist_ok=True)

# Persistent ChromaDB client (self-host friendly)
_chroma_client = chromadb.PersistentClient(
    path=CHROMA_DIR,
    settings=Settings(anonymized_telemetry=False),
)


def _collection_for(project_id: str):
    name = f"rfp_{project_id.replace('-', '_')}"
    return _chroma_client.get_or_create_collection(name=name)


def extract_text(filename: str, content: bytes) -> str:
    name = filename.lower()
    if name.endswith('.pdf'):
        reader = PdfReader(io.BytesIO(content))
        parts = []
        for page in reader.pages:
            try:
                parts.append(page.extract_text() or "")
            except Exception:
                parts.append("")
        return "\n".join(parts).strip()
    if name.endswith('.docx'):
        doc = DocxDocument(io.BytesIO(content))
        return "\n".join(p.text for p in doc.paragraphs).strip()
    if name.endswith('.txt') or name.endswith('.md'):
        return content.decode('utf-8', errors='ignore')
    # Fallback: treat as text
    return content.decode('utf-8', errors='ignore')


def chunk_text(text: str, chunk_size: int = 1000, overlap: int = 150) -> List[str]:
    text = text.replace("\r", "")
    if not text.strip():
        return []
    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + chunk_size, n)
        # try break on newline
        if end < n:
            nl = text.rfind("\n", start, end)
            if nl > start + chunk_size // 2:
                end = nl
        chunks.append(text[start:end].strip())
        start = max(end - overlap, end)
    return [c for c in chunks if c]


def index_document(project_id: str, document_id: str, filename: str, text: str) -> int:
    chunks = chunk_text(text)
    if not chunks:
        return 0
    col = _collection_for(project_id)
    ids = [f"{document_id}::{i}" for i in range(len(chunks))]
    metadatas = [
        {"document_id": document_id, "filename": filename, "chunk_index": i}
        for i in range(len(chunks))
    ]
    col.upsert(ids=ids, documents=chunks, metadatas=metadatas)
    return len(chunks)


def query_project(project_id: str, query: str, n_results: int = 5) -> List[Tuple[str, dict]]:
    col = _collection_for(project_id)
    if col.count() == 0:
        return []
    res = col.query(query_texts=[query], n_results=min(n_results, col.count()))
    docs = res.get("documents", [[]])[0]
    metas = res.get("metadatas", [[]])[0]
    return list(zip(docs, metas))


def delete_document(project_id: str, document_id: str) -> None:
    col = _collection_for(project_id)
    try:
        col.delete(where={"document_id": document_id})
    except Exception:
        pass


def delete_project(project_id: str) -> None:
    name = f"rfp_{project_id.replace('-', '_')}"
    try:
        _chroma_client.delete_collection(name=name)
    except Exception:
        pass
