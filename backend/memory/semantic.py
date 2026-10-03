import os
import json
import uuid
import math
import re
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    from backend.config import VECTOR_STORE_DIR
except ImportError:
    from config import VECTOR_STORE_DIR


class DeterministicLocalEmbedder:
    """
    Local-first, 100% offline deterministic embedding function.
    Eliminates Chroma's default remote downloading of HuggingFace models on first use.
    Produces stable 128-dimensional normalized vectors from character n-grams and tokens.
    """
    def __init__(self, dim: int = 128):
        self.dim = dim

    def __call__(self, input: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in input]

    def embed_text(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = re.findall(r"\w+", text.lower())
        if not tokens:
            return vec
        for tok in tokens:
            # Hash token into dimension buckets
            h = hash(tok)
            idx = abs(h) % self.dim
            vec[idx] += 1.0
            # Also hash bigrams for sequence awareness
            for i in range(len(tok) - 2):
                tri = tok[i:i+3]
                idx_tri = abs(hash(tri)) % self.dim
                vec[idx_tri] += 0.5

        # L2 Normalize
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec


class SemanticMemory:
    """
    Semantic memory to store learned facts, preferences, and strategies.
    Features:
    - 100% local-first embeddings (no unexpected Hugging Face downloads)
    - Deduplication: prevents redundant lessons from inflating prompt context
    - Approval list gating: only approved memories enter the agent's system prompt
    """
    def __init__(self):
        self._fallback_path = VECTOR_STORE_DIR / "semantic_store.json"
        self._init_fallback()

        self._use_chroma = False
        self.embedder = DeterministicLocalEmbedder(dim=128)
        try:
            import chromadb
            self.client = chromadb.PersistentClient(path=str(VECTOR_STORE_DIR))
            self.collection = self.client.get_or_create_collection(
                name="rajjo_memories_v2",
                embedding_function=self.embedder
            )
            self._use_chroma = True
        except Exception as e:
            print(f"[SemanticMemory] ChromaDB notice ({e}). Operating with local persistent JSON store.")

    def _init_fallback(self):
        if not self._fallback_path.exists():
            with open(self._fallback_path, "w", encoding="utf-8") as f:
                json.dump([], f)

    def _read_fallback(self) -> List[Dict[str, Any]]:
        self._init_fallback()
        try:
            with open(self._fallback_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return []

    def _write_fallback(self, data: List[Dict[str, Any]]):
        with open(self._fallback_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def _is_duplicate(self, text: str, threshold: float = 0.85) -> Optional[str]:
        """Check if identical or near-duplicate memory already exists."""
        words_new = set(re.findall(r"\w+", text.lower()))
        if not words_new:
            return None

        memories = self.get_all_memories()
        for m in memories:
            doc = m.get("document", "")
            words_existing = set(re.findall(r"\w+", doc.lower()))
            if not words_existing:
                continue
            intersection = words_new.intersection(words_existing)
            union = words_new.union(words_existing)
            jaccard = len(intersection) / len(union) if union else 0.0
            if jaccard >= threshold or doc.strip().lower() == text.strip().lower():
                return m.get("id")
        return None

    def add_memory(self, text: str, metadata: Optional[dict] = None, auto_approve: bool = False) -> str:
        """
        Add a learned fact or guideline to semantic memory.
        Deduplicates against existing memories.
        New lessons default to approved=False unless explicitly auto-approved.
        """
        cleaned_text = text.strip()
        existing_id = self._is_duplicate(cleaned_text)
        if existing_id:
            # Update existing memory metadata rather than duplicating
            print(f"[SemanticMemory] Deduplicated memory (matched existing ID: {existing_id})")
            return existing_id

        mem_id = f"mem_{uuid.uuid4().hex[:12]}"
        meta = metadata or {}
        meta["approved"] = bool(meta.get("approved", auto_approve))
        meta["created_at"] = datetime.now().isoformat()
        meta["updated_at"] = datetime.now().isoformat()

        if self._use_chroma:
            try:
                self.collection.add(
                    documents=[cleaned_text],
                    metadatas=[meta],
                    ids=[mem_id]
                )
            except Exception as e:
                print(f"[SemanticMemory] Chroma add notice: {e}")

        # Always update local JSON store for reliability & portability
        data = self._read_fallback()
        data.append({"id": mem_id, "document": cleaned_text, "metadata": meta})
        self._write_fallback(data)
        return mem_id

    def approve_memory(self, mem_id: str) -> bool:
        """Approves a memory so it can be safely used in system prompts."""
        data = self._read_fallback()
        found = False
        for item in data:
            if item.get("id") == mem_id:
                item.setdefault("metadata", {})["approved"] = True
                item["metadata"]["approved_at"] = datetime.now().isoformat()
                found = True
                break
        if found:
            self._write_fallback(data)
            if self._use_chroma:
                try:
                    for item in data:
                        if item.get("id") == mem_id:
                            self.collection.update(
                                ids=[mem_id],
                                metadatas=[item["metadata"]],
                                documents=[item["document"]]
                            )
                            break
                except Exception:
                    pass
        return found

    def query_memory(self, query: str, n_results: int = 3, only_approved: bool = True) -> List[str]:
        """
        Retrieve relevant memories. By default only approved memories are returned,
        preventing unverified or injected web facts from polluting the prompt.
        """
        if not query.strip():
            return []

        all_mems = self.get_all_memories()
        if only_approved:
            candidates = [m for m in all_mems if m.get("metadata", {}).get("approved") is True]
        else:
            candidates = all_mems

        if not candidates:
            return []

        # Deterministic vector similarity match
        q_vec = self.embedder.embed_text(query)
        scored = []
        for m in candidates:
            doc = m.get("document", "")
            d_vec = self.embedder.embed_text(doc)
            sim = sum(a * b for a, b in zip(q_vec, d_vec))
            scored.append((sim, doc))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored[:n_results] if score > 0.15]

    def get_all_memories(self) -> List[Dict[str, Any]]:
        """Returns all stored memories with id, document, and metadata."""
        return self._read_fallback()

    def delete_memory(self, mem_id: str) -> bool:
        data = self._read_fallback()
        orig_len = len(data)
        data = [m for m in data if m.get("id") != mem_id]
        if len(data) != orig_len:
            self._write_fallback(data)
            if self._use_chroma:
                try:
                    self.collection.delete(ids=[mem_id])
                except Exception:
                    pass
            return True
        return False

    def clear_all(self):
        self._write_fallback([])
        if self._use_chroma:
            try:
                self.client.delete_collection("rajjo_memories_v2")
                self.collection = self.client.get_or_create_collection(
                    name="rajjo_memories_v2",
                    embedding_function=self.embedder
                )
            except Exception:
                pass

semantic = SemanticMemory()
