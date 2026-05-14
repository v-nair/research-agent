# Multi-Agent Research System

Three specialist AI agents collaborate in a pipeline to produce a structured research report on any topic — built with FastAPI, LangGraph patterns, and React with real-time SSE streaming.

## Pipeline

```text
User Input
    │
    ▼
┌─────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Planner   │────▶│   Researcher     │────▶│    Writer    │
│             │     │                  │     │              │
│ Breaks topic│     │ Per subtopic:    │     │ Synthesises  │
│ into 4      │     │ - bind_tools LLM │     │ findings →   │
│ subtopics   │     │ - Wikipedia tool │     │ Markdown     │
│ (structured │     │ - Web fetch tool │     │ report       │
│  output)    │     │ - ReAct loop     │     │ (streaming)  │
└─────────────┘     └──────────────────┘     └──────────────┘
```

Each agent is a distinct LLM call with its own system prompt, temperature, and tools. The Researcher runs a manual ReAct loop per subtopic. The Writer streams tokens directly to the UI.

## Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | FastAPI, Python 3.11, Uvicorn |
| LLM | OpenAI GPT-4o (structured output, tool binding, streaming) |
| Agent pattern | Multi-agent pipeline: Planner → Researcher (ReAct) → Writer |
| Streaming | Server-Sent Events via `StreamingResponse` + `AsyncIterator` |
| Frontend | React 19, Vite |
| Infrastructure | Docker, Docker Compose |

## Project Structure

```text
research-agent/
├── research-api/
│   ├── app/
│   │   ├── main.py               # FastAPI app, lifespan, /research/stream route
│   │   ├── models.py             # ResearchRequest, ResearchPlan (Pydantic)
│   │   ├── config.py             # Model names, iteration limits
│   │   └── services/
│   │       ├── tools.py          # search_wikipedia, fetch_webpage
│   │       └── pipeline.py       # Planner, Researcher, Writer agents + SSE generator
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── requirements.txt
└── research-ui/
    └── src/
        └── App.jsx               # Pipeline UI with live agent status + streaming report
```

## Running Locally

**Prerequisites:** Docker, Node.js, OpenAI API key

**Backend:**

```bash
cd research-api
cp .env.example .env   # paste your OPENAI_API_KEY
docker compose up --build
```

**Frontend:**

```bash
cd research-ui
npm install
npm run dev
```

| Service | URL |
| --- | --- |
| API | <http://localhost:8003> |
| API docs | <http://localhost:8003/docs> |
| UI | <http://localhost:5173> |

## API Reference

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/` | Health check |
| `POST` | `/research/stream` | Stream a multi-agent research pipeline |

**POST /research/stream — request:**

```json
{ "topic": "The history and future of artificial intelligence" }
```

**SSE event stream — response:**

```text
data: {"type": "agent_start",    "agent": "planner",    "label": "Planning..."}
data: {"type": "plan",           "subtopics": ["Origins", "Key Milestones", "Current State", "Future"]}
data: {"type": "agent_start",    "agent": "researcher", "label": "Researching..."}
data: {"type": "researching",    "subtopic": "Origins"}
data: {"type": "research_done",  "subtopic": "Origins"}
data: {"type": "researching",    "subtopic": "Key Milestones"}
data: {"type": "research_done",  "subtopic": "Key Milestones"}
...
data: {"type": "agent_start",    "agent": "writer",     "label": "Writing..."}
data: {"type": "token",          "content": "# "}
data: {"type": "token",          "content": "Research Report"}
...
data: {"type": "done"}
```

## Logic — Pseudocode

```text
FUNCTION stream_research_pipeline(topic):

    // ── Agent 1: Planner ──────────────────────────────────────
    YIELD SSE → { type: "agent_start", agent: "planner" }

    subtopics = GPT-4o.invoke_structured(
        prompt  = "Break '{topic}' into 4 research subtopics",
        schema  = ResearchPlan { subtopics: list[str] }
    )

    YIELD SSE → { type: "plan", subtopics: subtopics }


    // ── Agent 2: Researcher (ReAct loop per subtopic) ─────────
    YIELD SSE → { type: "agent_start", agent: "researcher" }

    findings = []
    FOR each subtopic in subtopics:
        YIELD SSE → { type: "researching", subtopic }

        messages = [SystemMessage, HumanMessage(subtopic)]

        FOR up to MAX_ITERATIONS:
            response = GPT-4o.invoke(messages, tools=[wikipedia, fetch_webpage])

            IF response.tool_calls:
                FOR each tool_call:
                    result = execute tool_call
                    APPEND ToolMessage(result) to messages
            ELSE:
                findings.APPEND({ subtopic, content: response })
                BREAK

        YIELD SSE → { type: "research_done", subtopic }


    // ── Agent 3: Writer (streaming) ───────────────────────────
    YIELD SSE → { type: "agent_start", agent: "writer" }

    context = FORMAT all findings as markdown sections

    STREAM GPT-4o.tokens(
        prompt = "Write a research report on '{topic}' using:\n{context}"
    ) → YIELD SSE { type: "token", content: chunk } per token

    YIELD SSE → { type: "done" }
```

## What This Demonstrates

- **Multi-agent orchestration** — three specialist agents, each with a distinct role, model config, and capabilities
- **Structured output** — Planner uses `with_structured_output(ResearchPlan)` for reliable JSON
- **Manual ReAct loop** — Researcher implements tool-call iteration explicitly, showing understanding beyond framework wrappers
- **SSE pipeline streaming** — each agent transition and token streams in real time to the UI
- **Live pipeline UI** — React renders agent status, research progress per subtopic, and the report as it is written
