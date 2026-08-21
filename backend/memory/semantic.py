import os
import json
import uuid
from typing import List, Dict, Any, Optional
try:
    from backend.config import VECTOR_STORE_DIR
except ImportError:
    from config import VECTOR_STORE_DIR

class SemanticMemory:
    """
    Semantic memory to store learned facts, preferences, and strategies.
    Uses ChromaDB when available with a persistent fallback store.
    """
    def __init__(self):
        self._use_chroma = False
        self._fallback_path = VECTOR_STORE_DIR / "semantic_store.json"
        try:
            import chromadb
            from chromadb.utils import embedding_functions
            self.client = chromadb.PersistentClient(path=str(VECTOR_STORE_DIR))
            self.embedding_fn = embedding_functions.DefaultEmbeddingFunction()
            self.collection = self.client.get_or_create_collection(
                name="rajjo_memories",
                embedding_function=self.embedding_fn
            )
            self._use_chroma = True
        except Exception as e:
            print(f"[SemanticMemory] ChromaDB initialization warning: {e}. Using JSON fallback store.")
            self._init_fallback()

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

    def add_memory(self, text: str, metadata: Optional[dict] = None) -> str:
        """Add a learned fact or guideline to semantic memory."""
        mem_id = str(uuid.uuid4())
        meta = metadata or {}
        if self._use_chroma:
            try:
                self.collection.add(
                    documents=[text],
                    metadatas=[meta],
                    ids=[mem_id]
                )
                return mem_id
            except Exception as e:
                print(f"[SemanticMemory] Chroma add error: {e}")

        # Fallback store
        data = self._read_fallback()
        data.append({"id": mem_id, "document": text, "metadata": meta})
        self._write_fallback(data)
        return mem_id

    def query_memory(self, query: str, n_results: int = 3) -> List[str]:
        """Retrieve top-k relevant memories based on similarity or keyword match."""
        if not query.strip():
            return []

        if self._use_chroma:
            try:
                count = self.collection.count()
                if count == 0:
                    return []
                results = self.collection.query(
                    query_texts=[query],
                    n_results=min(n_results, count)
                )
                docs = results['documents'][0] if results['documents'] else []
                return docs
            except Exception as e:
                print(f"[SemanticMemory] Chroma query error: {e}")

        # Fallback keyword match
        data = self._read_fallback()
        query_words = set(query.lower().split())
        scored = []
        for item in data:
            doc_text = item.get("document", "")
            doc_words = set(doc_text.lower().split())
            overlap = len(query_words.intersection(doc_words))
            if overlap > 0:
                scored.append((overlap, doc_text))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [doc for score, doc in scored[:n_results]]

    def get_all_memories(self) -> List[Dict[str, Any]]:
        """List all stored semantic memories."""
        if self._use_chroma:
            try:
                items = self.collection.get()
                results = []
                if items and items.get("ids"):
                    for idx, mem_id in enumerate(items["ids"]):
                        doc = items["documents"][idx] if items["documents"] else ""
                        meta = items["metadatas"][idx] if items["metadatas"] else {}
                        results.append({"id": mem_id, "document": doc, "metadata": meta})
                    return results
            except Exception:
                pass

        return self._read_fallback()

    def delete_memory(self, mem_id: str) -> bool:
        deleted = False
        if self._use_chroma:
            try:
                self.collection.delete(ids=[mem_id])
                deleted = True
            except Exception:
                pass

        data = self._read_fallback()
        new_data = [item for item in data if item.get("id") != mem_id]
        if len(new_data) < len(data):
            self._write_fallback(new_data)
            deleted = True
        return deleted

    def clear_all(self) -> bool:
        if self._use_chroma:
            try:
                # Delete existing collection and recreate
                self.client.delete_collection(name="rajjo_memories")
                self.collection = self.client.get_or_create_collection(
                    name="rajjo_memories",
                    embedding_function=self.embedding_fn
                )
            except Exception:
                pass

        self._write_fallback([])
        return True

semantic = SemanticMemory()
