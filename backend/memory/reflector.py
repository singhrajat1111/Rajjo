from typing import List, Dict, Any, Optional
from langchain_core.messages import BaseMessage

class ReflectorService:
    """
    Analyzes a completed task execution and extracts meaningful lessons,
    facts, or preferences to store in semantic memory for future tasks.
    """
    def reflect(self, user_input: str, history: List[BaseMessage], model_config: Optional[dict] = None) -> Optional[str]:
        """
        Extracts a concise lesson from the user interaction.
        """
        # If there were no tool calls or trivial interaction, don't force unnecessary reflection
        has_tools = any(getattr(m, "tool_calls", None) for m in history)
        if not has_tools and len(user_input.split()) < 3:
            return None

        try:
            from backend.model_router import router
        except ImportError:
            from model_router import router
        system_prompt = (
            "You are the Reflection engine of RAJJO, an autonomous AI desktop agent. "
            "Examine the completed task and extract one concise, factual lesson, user preference, or reusable technical insight. "
            "If nothing permanent or reusable was learned, return 'NULL'. Return ONLY the insight sentence or NULL."
        )

        history_str = "\n".join([f"{getattr(m, 'type', 'message')}: {getattr(m, 'content', '')}" for m in history[-6:]])
        prompt = f"Task: {user_input}\nRecent Steps:\n{history_str}\nReusable Insight:"

        try:
            llm = router.get_llm(model_config)
            if llm:
                response = llm.invoke([
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ])
                text = response.content.strip()
                if "NULL" in text.upper() or len(text) < 5:
                    return None
                return text
        except Exception as e:
            # Fallback heuristic: log task pattern if useful
            pass

        # Heuristic fallback if tools were successfully used
        if has_tools:
            return f"User successfully executed task '{user_input[:80]}' using system tools."
        return None

reflector_service = ReflectorService()
