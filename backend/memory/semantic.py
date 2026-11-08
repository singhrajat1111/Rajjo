import os
import json
import uuid
import math
import re
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional

try:
    from backend.config import VECTOR_STORE_DIR
except ImportError:
    from config import VECTOR_STORE_DIR

try:
    from chromadb.api.types import EmbeddingFunction as ChromaEmbeddingFunction
except Exception:
    class ChromaEmbeddingFunction:
        pass


def _score_hybrid(query: str, doc: str, base_sim: float = 0.5) -> float:
    """
    Hybrid scoring combining semantic similarity with BM25-style keyword matching and coverage.
    Ensures query-relevant technical facts rank above semantically nearby but topic-irrelevant matches.
    """
    STOPWORDS = {
        "a", "an", "the", "in", "on", "at", "to", "for", "of", "and", "or",
        "is", "are", "was", "were", "it", "this", "that", "what", "does", "do",
        "did", "how", "why", "which", "who", "whom", "can", "could", "should"
    }
    q_tokens = [w for w in re.findall(r"\w+", query.lower()) if len(w) > 1 and w not in STOPWORDS]
    d_tokens = [w for w in re.findall(r"\w+", doc.lower()) if len(w) > 1 and w not in STOPWORDS]

    if not q_tokens or not d_tokens:
        return base_sim

    d_set = set(d_tokens)
    matched = 0.0
    weight = 0.0

    for qt in q_tokens:
        if qt in d_set:
            matched += 1.0
            weight += (2.5 if len(qt) > 4 else 1.0)
        else:
            for dt in d_set:
                if (qt.startswith(dt) or dt.startswith(qt)) and min(len(qt), len(dt)) >= 3:
                    matched += 0.5
                    weight += 0.5
                    break

    coverage = matched / len(q_tokens) if q_tokens else 0.0
    return (0.35 * base_sim) + (0.65 * coverage * (1.0 + weight))


class DeterministicLocalEmbedder(ChromaEmbeddingFunction):
    """
    Local-first, 100% offline deterministic embedding function compatible with ChromaDB.
    Eliminates Chroma's default remote downloading of HuggingFace models on first use.
    Produces stable 128-dimensional normalized vectors from character n-grams and tokens.
    """
    def __init__(self, dim: int = 128):
        self.dim = dim

    @classmethod
    def name(cls) -> str:
        return "deterministic-local-embedder"

    def is_legacy(self) -> bool:
        return False

    def get_config(self) -> Dict[str, Any]:
        return {"dim": self.dim}

    @classmethod
    def build_from_config(cls, config: Dict[str, Any]) -> "DeterministicLocalEmbedder":
        return cls(dim=config.get("dim", 128))

    def default_space(self) -> str:
        return "cosine"

    def supported_spaces(self) -> List[str]:
        return ["cosine", "l2", "ip"]

    def __call__(self, input: List[str]) -> List[List[float]]:
        return [self.embed_text(t) for t in input]

    def embed_text(self, text: str) -> List[float]:
        vec = [0.0] * self.dim
        tokens = re.findall(r"\w+", text.lower())
        if not tokens:
            return vec
        for tok in tokens:
            # Use hashlib.md5 for a stable (non-randomized) hash across processes
            h = int(hashlib.md5(tok.encode("utf-8")).hexdigest(), 16)
            idx = h % self.dim
            vec[idx] += 1.0
            # Also hash trigrams for sequence awareness
            for i in range(len(tok) - 2):
                tri = tok[i:i+3]
                idx_tri = int(hashlib.md5(tri.encode("utf-8")).hexdigest(), 16) % self.dim
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
            # Re-index existing memories into Chroma with deterministic embeddings
            self._sync_and_reindex_chroma()
        except Exception as e:
            print(f"[SemanticMemory] ChromaDB notice ({e}). Operating with local persistent JSON store.")

    def _sync_and_reindex_chroma(self):
        """Syncs all memories from fallback JSON store into Chroma to ensure consistent embeddings."""
        if not self._use_chroma:
            return
        try:
            stored = self._read_fallback()
            if not stored:
                return
            existing_ids = set(self.collection.get().get("ids", []))
            to_add_docs, to_add_metas, to_add_ids = [], [], []
            for item in stored:
                mid = item.get("id")
                if mid and mid not in existing_ids:
                    to_add_docs.append(item.get("document", ""))
                    to_add_metas.append(item.get("metadata", {}))
                    to_add_ids.append(mid)
            if to_add_ids:
                self.collection.add(
                    documents=to_add_docs,
                    metadatas=to_add_metas,
                    ids=to_add_ids
                )
                print(f"[SemanticMemory] Re-indexed {len(to_add_ids)} memories into ChromaDB.")
        except Exception as e:
            print(f"[SemanticMemory] Chroma re-indexing notice: {e}")

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
        Attempts ChromaDB query first when available, falling back to local cosine ranking.
        """
        if not query.strip():
            return []

        if self._use_chroma:
            try:
                where_filter = {"approved": True} if only_approved else None
                chroma_res = self.collection.query(
                    query_texts=[query],
                    n_results=min(10, max(n_results * 2, 4)),
                    where=where_filter
                )
                docs = chroma_res.get("documents", [[]])[0]
                if docs:
                    # Apply hybrid keyword reranking on retrieved Chroma candidates
                    ranked = sorted(docs, key=lambda d: _score_hybrid(query, d, 0.6), reverse=True)
                    return ranked[:n_results]
            except Exception as e:
                print(f"[SemanticMemory] Chroma query fallback notice: {e}")

        # Local JSON path fallback
        print("[SemanticMemory] Searching memories via local JSON persistent store.")
        all_mems = self.get_all_memories()
        if only_approved:
            candidates = [m for m in all_mems if m.get("metadata", {}).get("approved") is True]
        else:
            candidates = all_mems

        if not candidates:
            return []

        # Deterministic vector similarity match + hybrid keyword boost
        q_vec = self.embedder.embed_text(query)
        scored = []
        for m in candidates:
            doc = m.get("document", "")
            d_vec = self.embedder.embed_text(doc)
            cos_sim = sum(a * b for a, b in zip(q_vec, d_vec))
            hybrid_val = _score_hybrid(query, doc, cos_sim)
            scored.append((hybrid_val, doc))

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
