# research-ui

React frontend for the [Multi-Agent Research System](../README.md) project. Renders a live pipeline view showing which agent is active, per-subtopic research progress, and a streaming Markdown report.

## Relationship to Other Services

| Service | Direction | Description |
| --- | --- | --- |
| `research-api` | → calls | Sends `POST /research/stream`, reads SSE event stream |

## Service Structure

```text
src/
├── main.jsx      # React entry point
├── index.css     # Global styles + spin/pulse animations, Markdown report styles
└── App.jsx       # Topic input, pipeline bar, agent cards, streaming report
```

## Starting This Service

```bash
npm install
npm run dev
```

Runs on `http://localhost:5173` — requires `research-api` running on port 8003.

## SSE Events Consumed

| Event type | What the UI does |
| --- | --- |
| `agent_start` | Highlights the active agent node in the pipeline bar |
| `plan` | Renders subtopic chips in the Planner card, initialises research status map |
| `researching` | Sets that subtopic's status to `running` (spinning icon) |
| `research_done` | Sets that subtopic's status to `done` (checkmark) |
| `token` | Appends token to the report string, re-renders Markdown |
| `done` | Sets phase to `done`, stops all animations |
| `error` | Shows an error banner |

## Logic — Pseudocode

```text
ON research submitted (topic):
    SET phase = "running", reset all state

    OPEN fetch stream → POST /research/stream { topic }

    WHILE stream not done:
        READ chunk → decode → parse SSE lines
        SWITCH event.type:
            "agent_start"    → setCurrentAgent(event.agent)
            "plan"           → setSubtopics(event.subtopics)
                               setResearchStatus({ each: "pending" })
            "researching"    → setResearchStatus[subtopic] = "running"
            "research_done"  → setResearchStatus[subtopic] = "done"
            "token"          → setReport(prev + event.content)
            "done"           → setPhase("done"), setCurrentAgent(null)

RENDER:
    PipelineBar:  3 nodes (Planner, Researcher, Writer) — active/done/idle states
    PlannerCard:  subtopics as chips when plan arrives
    ResearcherCard: each subtopic with ○ / ⟳ / ✓ status icon
    WriterCard:   streaming Markdown report (dangerouslySetInnerHTML + simpleMarkdown())
```

## Design Notes

- **Fetch-based SSE** — uses `fetch` + `ReadableStream` to support `POST` requests (native `EventSource` is GET-only)
- **Markdown rendering** — `simpleMarkdown()` is a lightweight regex-based converter; no external dependency needed for `h1/h2/h3`, bold, italic, lists
- **Reset on new research** — the "New Research" button resets all state to `idle`, allowing a fresh run without page reload
- **Scroll-to-report** — a `useRef` on the report container auto-scrolls as new tokens arrive
