import json
import logging
import os
from typing import AsyncIterator

from langchain_core.messages import HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

from config import (
    MAX_SUBTOPICS,
    PLANNER_MODEL,
    RESEARCHER_MAX_ITERATIONS,
    RESEARCHER_MODEL,
    WRITER_MODEL,
)
from models import ResearchPlan
from services.tools import fetch_webpage, search_wikipedia

logger = logging.getLogger(__name__)

_TOOL_MAP = {
    "search_wikipedia": search_wikipedia,
    "fetch_webpage": fetch_webpage,
}


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"


def _llm(model: str, streaming: bool = False) -> ChatOpenAI:
    return ChatOpenAI(
        model=model,
        temperature=0,
        streaming=streaming,
        api_key=os.getenv("OPENAI_API_KEY"),
    )


async def _run_planner(topic: str) -> list[str]:
    """Break ``topic`` into a list of focused subtopics using structured output.

    Uses ``with_structured_output`` to guarantee a valid ``ResearchPlan`` response
    without JSON parsing fragility.  Returns at most ``MAX_SUBTOPICS`` subtopics.
    """
    structured = _llm(PLANNER_MODEL).with_structured_output(ResearchPlan)
    result: ResearchPlan = await structured.ainvoke([
        SystemMessage(content=(
            f"You are a research planner. Break the given topic into exactly {MAX_SUBTOPICS} "
            "focused, distinct subtopics that together give a comprehensive understanding."
        )),
        HumanMessage(content=f"Topic: {topic}"),
    ])
    return result.subtopics[:MAX_SUBTOPICS]


async def _run_researcher(topic: str, subtopic: str) -> str:
    """Research a single ``subtopic`` within ``topic`` using a ReAct tool loop.

    Iterates up to ``RESEARCHER_MAX_ITERATIONS`` rounds of tool use (Wikipedia
    search and webpage fetch).  Returns a 2-3 paragraph findings summary, or a
    fallback string if the iteration limit is reached without a final answer.
    """
    llm_with_tools = _llm(RESEARCHER_MODEL).bind_tools(
        [search_wikipedia, fetch_webpage]
    )
    messages = [
        SystemMessage(content=(
            f"You are a focused researcher. Research the subtopic '{subtopic}' "
            f"in the context of '{topic}'. Use your tools to gather accurate information. "
            "Summarise your findings clearly in 2-3 paragraphs."
        )),
        HumanMessage(content=subtopic),
    ]

    for _ in range(RESEARCHER_MAX_ITERATIONS):
        response = await llm_with_tools.ainvoke(messages)
        messages.append(response)

        if not response.tool_calls:
            return response.content or "No findings generated."

        for tc in response.tool_calls:
            tool = _TOOL_MAP.get(tc["name"])
            if tool:
                result = tool.invoke(tc["args"])
                messages.append(
                    ToolMessage(content=str(result), tool_call_id=tc["id"])
                )

    last = messages[-1]
    return last.content if hasattr(last, "content") else "Research incomplete."


async def stream_research_pipeline(topic: str) -> AsyncIterator[str]:  # type: ignore[override]
    """Orchestrate the three-agent research pipeline and yield SSE events.

    Pipeline: Planner → Researcher (×N subtopics) → Writer.
    Each agent emits typed SSE events so the UI can render progress granularly.
    Per-agent errors are isolated: a failing researcher yields a placeholder
    rather than aborting the entire pipeline.

    Event types emitted: ``agent_start``, ``plan``, ``researching``,
    ``research_done``, ``token``, ``error``, ``done``.
    """
    # ── Agent 1: Planner ────────────────────────────────────────────────────
    yield _sse({"type": "agent_start", "agent": "planner", "label": "Planning research subtopics…"})
    try:
        plan = await _run_planner(topic)
    except Exception as e:
        logger.error(f"Planner error: {e}", exc_info=True)
        yield _sse({"type": "error", "content": "Planner failed to generate a research plan."})
        yield _sse({"type": "done"})
        return

    yield _sse({"type": "plan", "subtopics": plan})

    # ── Agent 2: Researcher ─────────────────────────────────────────────────
    yield _sse({"type": "agent_start", "agent": "researcher", "label": "Researching each subtopic…"})
    findings: list[dict] = []

    for subtopic in plan:
        yield _sse({"type": "researching", "subtopic": subtopic})
        try:
            content = await _run_researcher(topic, subtopic)
        except Exception as e:
            logger.error(f"Researcher error on '{subtopic}': {e}", exc_info=True)
            content = "Research unavailable for this subtopic."
        findings.append({"subtopic": subtopic, "content": content})
        yield _sse({"type": "research_done", "subtopic": subtopic})

    # ── Agent 3: Writer ─────────────────────────────────────────────────────
    yield _sse({"type": "agent_start", "agent": "writer", "label": "Writing research report…"})

    context = "\n\n".join(
        f"### {f['subtopic']}\n{f['content']}" for f in findings
    )

    try:
        async for chunk in _llm(WRITER_MODEL, streaming=True).astream([
            SystemMessage(content=(
                "You are an expert research writer. "
                "Write a comprehensive, well-structured Markdown report with clear headings, "
                "concise paragraphs, and key insights highlighted. "
                "Start directly with the report title as an H1 heading."
            )),
            HumanMessage(content=(
                f"Write a research report on: '{topic}'\n\n"
                f"Use these research findings:\n\n{context}"
            )),
        ]):
            if chunk.content:
                yield _sse({"type": "token", "content": chunk.content})
    except Exception as e:
        logger.error(f"Writer error: {e}", exc_info=True)
        yield _sse({"type": "error", "content": "Writer failed to generate the report."})

    yield _sse({"type": "done"})
