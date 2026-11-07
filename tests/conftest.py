"""
conftest.py — shared fixtures for the Rajjo test suite.

Provides a fake / scripted LLM that can be injected into the graph so tests
run offline without a real API key.
"""
import os
import sys
from pathlib import Path

# Ensure imports resolve from the repo root
root_dir = Path(__file__).resolve().parent.parent
backend_dir = root_dir / "backend"
for p in [str(root_dir), str(backend_dir)]:
    if p not in sys.path:
        sys.path.insert(0, p)


from langchain_core.messages import AIMessage
import pytest


class FakeListChatModel:
    """
    Minimal scripted chat model that cycles through a list of text responses.
    Compatible with LangChain's bind_tools interface.
    """
    def __init__(self, responses):
        self._responses = responses
        self._idx = 0

    def invoke(self, messages, **kwargs):
        resp = self._responses[min(self._idx, len(self._responses) - 1)]
        self._idx += 1
        return AIMessage(content=resp)

    def bind_tools(self, tools):
        return self

    def stream(self, messages, **kwargs):
        resp = self.invoke(messages)
        yield resp


@pytest.fixture
def fake_llm_no_tools():
    """
    A scripted LLM that always produces a plain-text final answer
    (no tool calls). Useful for testing the happy-path graph flow.
    """
    return FakeListChatModel(responses=["Task completed successfully."])


@pytest.fixture
def fake_llm_with_tool_call():
    """
    A scripted LLM that first requests a tool call, then produces a final
    answer. Exercises the planner → tool_executor → planner → reflect path.
    """
    tool_response = AIMessage(
        content="",
        tool_calls=[{
            "name": "read_file",
            "args": {"path": "test.txt"},
            "id": "call_test_001",
        }],
    )
    final_response = AIMessage(content="Here is the file content summary.")

    class _Seq:
        """Minimal chat model that returns responses in sequence."""
        _idx = 0

        def invoke(self, messages, **kwargs):
            resp = [tool_response, final_response][min(self._idx, 1)]
            self._idx += 1
            return resp

        def bind_tools(self, tools):
            return self

    return _Seq()
