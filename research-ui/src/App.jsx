import { useState, useRef, useEffect, useCallback } from "react"

const API_URL = "http://localhost:8003"

const AGENT_META = {
  planner:    { label: "Planner",    icon: "🗂", color: "#7c3aed" },
  researcher: { label: "Researcher", icon: "🔍", color: "#0070f3" },
  writer:     { label: "Writer",     icon: "✍️",  color: "#059669" },
}

const SAMPLES = [
  "The history and future of artificial intelligence",
  "How mRNA vaccines work",
  "The rise of renewable energy",
]

function PipelineBar({ currentAgent, phase }) {
  const agents = ["planner", "researcher", "writer"]
  const order = { planner: 0, researcher: 1, writer: 2 }
  const currentIdx = currentAgent ? order[currentAgent] : -1

  return (
    <div style={s.pipeline}>
      {agents.map((agent, i) => {
        const meta = AGENT_META[agent]
        const isDone = phase === "done" || (currentIdx > i)
        const isActive = currentAgent === agent && phase === "running"
        return (
          <div key={agent} style={s.pipelineItem}>
            <div style={{
              ...s.pipelineNode,
              background: isDone ? meta.color : isActive ? meta.color : "#e5e7eb",
              color: (isDone || isActive) ? "#fff" : "#9ca3af",
              boxShadow: isActive ? `0 0 0 3px ${meta.color}33` : "none",
            }}>
              {isActive ? <span className="spin" style={{ fontSize: 14 }}>⟳</span> : meta.icon}
            </div>
            <span style={{
              ...s.pipelineLabel,
              color: (isDone || isActive) ? "#111" : "#9ca3af",
              fontWeight: isActive ? 600 : 400,
            }}>
              {meta.label}
            </span>
            {i < agents.length - 1 && (
              <div style={{
                ...s.pipelineArrow,
                background: isDone ? "#d1d5db" : "#e5e7eb",
              }} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function PlannerCard({ subtopics, isActive }) {
  if (!subtopics.length && !isActive) return null
  return (
    <div style={s.agentCard}>
      <div style={{ ...s.cardHeader, borderLeftColor: AGENT_META.planner.color }}>
        <span style={{ color: AGENT_META.planner.color, fontWeight: 600, fontSize: 13 }}>
          {AGENT_META.planner.icon} Planner
        </span>
        {isActive && <span className="pulse" style={s.activeLabel}>Running…</span>}
        {subtopics.length > 0 && <span style={s.doneLabel}>✓ Done</span>}
      </div>
      {subtopics.length > 0 && (
        <div style={s.cardBody}>
          <p style={s.cardNote}>Research plan: {subtopics.length} subtopics</p>
          <div style={s.chips}>
            {subtopics.map((t, i) => (
              <span key={i} style={s.chip}>{t}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ResearcherCard({ subtopics, researchStatus, isActive }) {
  if (!subtopics.length) return null
  return (
    <div style={s.agentCard}>
      <div style={{ ...s.cardHeader, borderLeftColor: AGENT_META.researcher.color }}>
        <span style={{ color: AGENT_META.researcher.color, fontWeight: 600, fontSize: 13 }}>
          {AGENT_META.researcher.icon} Researcher
        </span>
        {isActive && <span className="pulse" style={s.activeLabel}>Running…</span>}
        {!isActive && subtopics.every(t => researchStatus[t] === "done") && (
          <span style={s.doneLabel}>✓ Done</span>
        )}
      </div>
      <div style={s.cardBody}>
        {subtopics.map((subtopic, i) => {
          const status = researchStatus[subtopic] || "pending"
          return (
            <div key={i} style={s.researchRow}>
              <span style={{
                ...s.statusIcon,
                color: status === "done" ? "#059669" : status === "running" ? "#0070f3" : "#d1d5db"
              }}>
                {status === "done" ? "✓" : status === "running"
                  ? <span className="spin">⟳</span> : "○"}
              </span>
              <span style={{
                ...s.subtopicLabel,
                color: status === "done" ? "#111" : status === "running" ? "#0070f3" : "#9ca3af",
                fontWeight: status === "running" ? 500 : 400,
              }}>
                {subtopic}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function WriterCard({ report, isActive }) {
  if (!report && !isActive) return null
  return (
    <div style={s.agentCard}>
      <div style={{ ...s.cardHeader, borderLeftColor: AGENT_META.writer.color }}>
        <span style={{ color: AGENT_META.writer.color, fontWeight: 600, fontSize: 13 }}>
          {AGENT_META.writer.icon} Writer
        </span>
        {isActive && !report && <span className="pulse" style={s.activeLabel}>Starting…</span>}
        {isActive && report && <span className="pulse" style={s.activeLabel}>Writing…</span>}
        {!isActive && report && <span style={s.doneLabel}>✓ Done</span>}
      </div>
      {report && (
        <div style={s.cardBody}>
          <div
            className="report"
            style={s.reportText}
            dangerouslySetInnerHTML={{ __html: simpleMarkdown(report) }}
          />
        </div>
      )}
    </div>
  )
}

function simpleMarkdown(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`(.+?)`/g, "<code>$1</code>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hul])/gm, "")
    .replace(/^(.+)$/gm, (line) =>
      line.startsWith("<") ? line : `<p>${line}</p>`
    )
}

export default function App() {
  const [input, setInput] = useState("")
  const [topic, setTopic] = useState("")
  const [phase, setPhase] = useState("idle")
  const [currentAgent, setCurrentAgent] = useState(null)
  const [subtopics, setSubtopics] = useState([])
  const [researchStatus, setResearchStatus] = useState({})
  const [report, setReport] = useState("")
  const [error, setError] = useState("")
  const reportRef = useRef(null)

  useEffect(() => {
    if (report) reportRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [report])

  const startResearch = useCallback(async (topicOverride) => {
    const q = (topicOverride ?? input).trim()
    if (!q || phase === "running") return

    setInput("")
    setTopic(q)
    setPhase("running")
    setCurrentAgent(null)
    setSubtopics([])
    setResearchStatus({})
    setReport("")
    setError("")

    try {
      const res = await fetch(`${API_URL}/research/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: q }),
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n")
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const ev = JSON.parse(line.slice(6))

            if (ev.type === "agent_start") {
              setCurrentAgent(ev.agent)
            } else if (ev.type === "plan") {
              setSubtopics(ev.subtopics)
              setResearchStatus(
                Object.fromEntries(ev.subtopics.map((s) => [s, "pending"]))
              )
            } else if (ev.type === "researching") {
              setResearchStatus((prev) => ({ ...prev, [ev.subtopic]: "running" }))
            } else if (ev.type === "research_done") {
              setResearchStatus((prev) => ({ ...prev, [ev.subtopic]: "done" }))
            } else if (ev.type === "token") {
              setReport((prev) => prev + ev.content)
            } else if (ev.type === "error") {
              setError(ev.content || "An error occurred.")
            } else if (ev.type === "done") {
              setPhase("done")
              setCurrentAgent(null)
            }
          } catch {
            // malformed SSE line
          }
        }
      }
    } catch {
      setError("Connection error. Is the API running on port 8003?")
      setPhase("idle")
    }
  }, [input, phase])

  const reset = () => {
    setPhase("idle")
    setTopic("")
    setInput("")
    setCurrentAgent(null)
    setSubtopics([])
    setResearchStatus({})
    setReport("")
    setError("")
  }

  const isRunning = phase === "running"
  const showPipeline = phase !== "idle"

  return (
    <div style={s.layout}>
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.titleRow}>
            <h1 style={s.title}>Research Agent</h1>
            {phase !== "idle" && (
              <button onClick={reset} style={s.newBtn}>+ New Research</button>
            )}
          </div>
          <p style={s.subtitle}>
            Multi-agent pipeline · GPT-4o · Planner → Researcher → Writer
          </p>
        </div>
      </header>

      <main style={s.main}>
        {phase === "idle" && (
          <div style={s.heroSection}>
            <div style={s.inputCard}>
              <label style={s.inputLabel}>Research Topic</label>
              <div style={s.inputRow}>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startResearch()}
                  placeholder="Enter any topic to research…"
                  style={s.input}
                  autoFocus
                />
                <button
                  onClick={() => startResearch()}
                  disabled={!input.trim()}
                  style={{
                    ...s.researchBtn,
                    background: input.trim() ? "#0070f3" : "#d1d5db",
                    cursor: input.trim() ? "pointer" : "not-allowed",
                  }}
                >
                  Research
                </button>
              </div>
              <div style={s.samples}>
                <span style={s.samplesLabel}>Try:</span>
                {SAMPLES.map((s, i) => (
                  <button key={i} onClick={() => startResearch(s)} style={s2.sampleBtn}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {showPipeline && (
          <div style={s.pipelineSection}>
            <div style={s.topicBadge}>
              <span style={s.topicLabel}>Topic:</span> {topic}
            </div>

            <PipelineBar currentAgent={currentAgent} phase={phase} />

            <div style={s.cards}>
              <PlannerCard
                subtopics={subtopics}
                isActive={currentAgent === "planner"}
              />
              <ResearcherCard
                subtopics={subtopics}
                researchStatus={researchStatus}
                isActive={currentAgent === "researcher"}
              />
              <WriterCard
                report={report}
                isActive={currentAgent === "writer"}
              />
            </div>

            {error && <div style={s.errorBox}>{error}</div>}
            <div ref={reportRef} />
          </div>
        )}
      </main>
    </div>
  )
}

const s = {
  layout: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    background: "#fff",
    borderBottom: "1px solid #e5e7eb",
    flexShrink: 0,
  },
  headerInner: {
    maxWidth: 860,
    margin: "0 auto",
    padding: "18px 24px 14px",
  },
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
    margin: 0,
    color: "#111",
  },
  subtitle: {
    fontSize: 12,
    color: "#9ca3af",
    margin: "4px 0 0",
  },
  newBtn: {
    padding: "6px 14px",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 6,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    color: "#374151",
  },
  main: {
    flex: 1,
    maxWidth: 860,
    width: "100%",
    margin: "0 auto",
    padding: "32px 24px 48px",
  },
  heroSection: {
    display: "flex",
    justifyContent: "center",
    paddingTop: 40,
  },
  inputCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 12,
    padding: "28px 28px 22px",
    width: "100%",
    maxWidth: 640,
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
  },
  inputLabel: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "#374151",
    marginBottom: 10,
  },
  inputRow: {
    display: "flex",
    gap: 8,
  },
  input: {
    flex: 1,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid #d1d5db",
    fontSize: 14,
    outline: "none",
    color: "#111",
  },
  researchBtn: {
    padding: "10px 20px",
    color: "#fff",
    border: "none",
    borderRadius: 8,
    fontSize: 14,
    fontWeight: 600,
    whiteSpace: "nowrap",
    transition: "background 0.15s",
  },
  samples: {
    marginTop: 14,
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
  },
  samplesLabel: {
    fontSize: 12,
    color: "#9ca3af",
    marginRight: 2,
  },
  pipelineSection: {
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  topicBadge: {
    fontSize: 14,
    color: "#374151",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    padding: "10px 16px",
  },
  topicLabel: {
    fontWeight: 600,
    marginRight: 6,
    color: "#9ca3af",
  },
  pipeline: {
    display: "flex",
    alignItems: "center",
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    padding: "16px 24px",
    gap: 0,
  },
  pipelineItem: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  pipelineNode: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 16,
    flexShrink: 0,
    transition: "all 0.3s",
  },
  pipelineLabel: {
    fontSize: 13,
    transition: "color 0.3s",
  },
  pipelineArrow: {
    flex: 1,
    height: 2,
    margin: "0 8px",
    borderRadius: 1,
    transition: "background 0.3s",
  },
  cards: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  agentCard: {
    background: "#fff",
    border: "1px solid #e5e7eb",
    borderRadius: 10,
    overflow: "hidden",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    borderLeft: "3px solid transparent",
    background: "#fafafa",
    borderBottom: "1px solid #f3f4f6",
  },
  activeLabel: {
    fontSize: 12,
    color: "#6b7280",
    marginLeft: "auto",
  },
  doneLabel: {
    fontSize: 12,
    color: "#059669",
    marginLeft: "auto",
    fontWeight: 500,
  },
  cardBody: {
    padding: "14px 16px",
  },
  cardNote: {
    fontSize: 12,
    color: "#9ca3af",
    margin: "0 0 10px",
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
  },
  chip: {
    padding: "4px 10px",
    background: "#ede9fe",
    color: "#6d28d9",
    borderRadius: 20,
    fontSize: 12,
    fontWeight: 500,
  },
  researchRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "5px 0",
  },
  statusIcon: {
    width: 18,
    textAlign: "center",
    fontWeight: 700,
    fontSize: 14,
    flexShrink: 0,
  },
  subtopicLabel: {
    fontSize: 13,
    transition: "color 0.2s",
  },
  reportText: {
    lineHeight: 1.75,
    fontSize: 14,
  },
  errorBox: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    borderRadius: 8,
    padding: "12px 16px",
    color: "#dc2626",
    fontSize: 13,
  },
}

const s2 = {
  sampleBtn: {
    padding: "4px 10px",
    background: "#f3f4f6",
    border: "1px solid #e5e7eb",
    borderRadius: 20,
    cursor: "pointer",
    fontSize: 12,
    color: "#374151",
  },
}
