# research-api

FastAPI backend service for the [Multi-Agent Research System](../README.md) project. Runs a three-agent pipeline (Planner → Researcher → Writer) and streams each stage's progress and output to the UI over Server-Sent Events.

## Relationship to Other Services

| Service | Direction | Description |
| --- | --- | --- |
| `research-ui` | ← receives requests | UI sends `POST /research/stream`, reads SSE event stream |
| OpenAI API | → calls | Planner (structured output), Researcher (tool binding), Writer (streaming) |
| Wikipedia API | → calls | `search_wikipedia` tool inside the Researcher agent |
| External URLs | → fetches | `fetch_webpage` tool inside the Researcher agent |

## Service Structure

```text
app/
├── main.py               # FastAPI app, lifespan, /research/stream SSE route
├── models.py             # ResearchRequest, ResearchPlan (Pydantic)
├── config.py             # Model names, MAX_SUBTOPICS, RESEARCHER_MAX_ITERATIONS
└── services/
    ├── tools.py          # search_wikipedia, fetch_webpage (@tool decorated)
    └── pipeline.py       # _run_planner, _run_researcher, stream_research_pipeline
```

## Configuration

`.env` (copy from `.env.example`):

```text
OPENAI_API_KEY=sk-...
```

`config.py` values:

| Constant | Value | Purpose |
| --- | --- | --- |
| `PLANNER_MODEL` | `gpt-4o` | Model for the Planner agent |
| `RESEARCHER_MODEL` | `gpt-4o` | Model for the Researcher agent |
| `WRITER_MODEL` | `gpt-4o` | Model for the Writer agent |
| `MAX_SUBTOPICS` | `4` | Number of subtopics the Planner produces |
| `RESEARCHER_MAX_ITERATIONS` | `5` | Max ReAct iterations per subtopic |

## Starting This Service

```bash
cp .env.example .env   # add OPENAI_API_KEY
docker compose up --build
```

Runs on `http://localhost:8003` (host) → port 8000 inside container · Swagger docs at `http://localhost:8003/docs`

## Agent Details

| Agent | Implementation | Key technique |
| --- | --- | --- |
| Planner | Single LLM call | `with_structured_output(ResearchPlan)` — guaranteed JSON |
| Researcher | Manual ReAct loop per subtopic | `bind_tools` + explicit `ToolMessage` injection |
| Writer | Streaming LLM call | `astream` — tokens yielded directly to SSE |

## Logic — Pseudocode

```text
FUNCTION stream_research_pipeline(topic):

    // Agent 1: Planner
    YIELD SSE { type: "agent_start", agent: "planner" }
    subtopics = GPT-4o.structured({ topic }, schema=ResearchPlan)
    YIELD SSE { type: "plan", subtopics }

    // Agent 2: Researcher
    YIELD SSE { type: "agent_start", agent: "researcher" }
    FOR each subtopic:
        YIELD SSE { type: "researching", subtopic }
        messages = [SystemMessage, HumanMessage(subtopic)]
        FOR up to MAX_ITERATIONS:
            response = GPT-4o.invoke(messages, tools=[wikipedia, fetch_webpage])
            IF response.tool_calls:
                execute tools → inject ToolMessages
            ELSE:
                findings.append({ subtopic, content: response })
                BREAK
        YIELD SSE { type: "research_done", subtopic }

    // Agent 3: Writer
    YIELD SSE { type: "agent_start", agent: "writer" }
    STREAM GPT-4o.tokens(topic + findings) → YIELD SSE { type: "token" } per chunk
    YIELD SSE { type: "done" }
```

## Design Notes

- **Structured output for Planner** — `with_structured_output(ResearchPlan)` ensures the plan is always a valid `list[str]`, never a hallucinated format
- **Manual ReAct loop** — the Researcher's iteration is written explicitly rather than using `create_react_agent`, making the tool-call/inject cycle visible and debuggable
- **Per-agent error isolation** — each agent step is wrapped in `try/except`; a failing subtopic returns a placeholder and the pipeline continues
