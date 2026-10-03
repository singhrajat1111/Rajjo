import re
from typing import List, Dict, Any, Optional
from langchain_core.messages import BaseMessage

class ReflectorService:
    """
    Analyzes completed task executions and extracts concise, validated,
    high-signal technical lessons, user preferences, or system facts.
    Guards against:
    - False rejection of words containing 'null' (e.g., 'nullable')
    - Storing junk fallback strings on reflection failures
    - Injected prompt jailbreaks in web-derived lessons
    """

    SUSPICIOUS_PATTERNS = [
        r"ignore\s+(all\s+)?(previous|prior)\s+instructions",
        r"system\s+prompt",
        r"<script",
        r"javascript:",
        r"\bdrop\s+table\b",
        r"base64",
    ]

    def _sanitize_lesson(self, text: str) -> Optional[str]:
        cleaned = text.strip().strip('"\'`')
        # Check if text is just NULL or None (exact match, not substring)
        if re.match(r"^(null|none|n/a|nothing)[\.\!]?$", cleaned, re.IGNORECASE):
            return None

        if len(cleaned) < 8 or len(cleaned) > 300:
            return None

        # Check for prompt injection attempts
        for pat in self.SUSPICIOUS_PATTERNS:
            if re.search(pat, cleaned, re.IGNORECASE):
                print(f"[ReflectorService] Blocked suspicious pattern in lesson: {pat}")
                return None

        return cleaned

    def reflect(self, user_input: str, history: List[BaseMessage], model_config: Optional[dict] = None) -> Optional[str]:
        """
        Extracts a concise, reusable lesson from the interaction.
        Returns None if nothing genuinely reusable was learned.
        """
        has_tools = any(getattr(m, "tool_calls", None) for m in history)
        if not has_tools and len(user_input.split()) < 3:
            return None

        try:
            from backend.model_router import router
        except ImportError:
            from model_router import router

        system_prompt = (
            "You are the Reflection engine of RAJJO, an autonomous AI desktop agent. "
            "Examine the completed task and conversation. Extract exactly ONE concise, factual, reusable lesson "
            "or technical insight (such as a coding pattern, dependency requirement, or user preference). "
            "If nothing permanent or reusable was learned, reply strictly with 'NULL'. "
            "Do NOT include conversational filler, explanations, or quotes."
        )

        history_str = "\n".join([f"{getattr(m, 'type', 'message')}: {getattr(m, 'content', '')}" for m in history[-6:]])
        prompt = f"Task: {user_input}\nRecent Activity:\n{history_str}\nReusable Insight:"

        try:
            llm = router.get_llm(model_config)
            if llm:
                response = llm.invoke([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ])
                raw_text = response.content if hasattr(response, "content") else str(response)
                return self._sanitize_lesson(raw_text)
        except Exception as e:
            print(f"[ReflectorService] Reflection model notice: {e}")

        # Note: We deliberately do NOT store junk fallback strings like "User executed task..."
        return None

reflector_service = ReflectorService()
