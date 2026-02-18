"use client";

import { useEffect, useMemo, useState } from "react";

type Clip = {
  url: string;
  start: number;
  end: number;
  title: string;
  revisions?: { url: string; createdAt: number; note?: string }[];
};

type Job = {
  id: string;
  youtubeUrl?: string;
  status: string;
  error: string;
  createdAt?: number;
  clips: Clip[];
};

export default function Home() {
  const [tab, setTab] = useState<"create" | "history">("create");

  // Create flow
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);

  // Chat messages (client-only display)
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);

  // History
  const [history, setHistory] = useState<Job[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Edit modal
  const [editTarget, setEditTarget] = useState<{ parentJobId: string; clipIndex: number; clipUrl: string } | null>(null);
  const [editPrompt, setEditPrompt] = useState("");
  const [editStatus, setEditStatus] = useState<string | null>(null);

  async function fetchJob(id: string) {
    const res = await fetch(`/api/jobs/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error ?? "Failed to fetch job");
    return data as Job & { messages?: any[] };
  }

  function poll(id: string) {
    const timer = setInterval(async () => {
      try {
        const data = await fetchJob(id);
        setJob(data);

        if (data.status === "done" || data.status === "error") {
          clearInterval(timer);
        }
      } catch (e: any) {
        clearInterval(timer);
        setJob((prev) =>
          prev ? { ...prev, status: "error", error: e?.message ?? "poll failed", clips: prev.clips ?? [] } : prev
        );
      }
    }, 2000);
  }

  async function createDraftJob() {
    setCreateError(null);
    console.log("Creating draft job with URL:", youtubeUrl);
    const res = await fetch("/api/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ youtubeUrl }),
    });
    console.log("Response status:", res.status);
    const data = await res.json().catch(() => ({}));
    console.log("Response data:", data);
    if (!res.ok) {
      const err = data.error ?? `HTTP ${res.status}: Failed to create job`;
      setCreateError(err);
      throw new Error(err);
    }
    setJobId(data.jobId);
    setMessages([]);
    setJob({ id: data.jobId, status: "draft", error: "", clips: [], youtubeUrl });
  }

  async function sendMessage() {
    if (!jobId) return;
    const content = chatInput.trim();
    if (!content) return;

    setMessages((m) => [...m, { role: "user", content }]);
    setChatInput("");

    await fetch(`/api/jobs/${jobId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: "user", content }),
    });

    // (optional) show a fake assistant ack locally
    setMessages((m) => [...m, { role: "assistant", content: "Got it. Click Generate when ready." }]);
  }

  async function generate() {
    if (!jobId) return;

    // 1) Plan config via MiniMax
    setJob((j) => (j ? { ...j, status: "planning", error: "" } : j));
    const planRes = await fetch(`/api/jobs/${jobId}/plan`, { method: "POST" });
    const planData = await planRes.json().catch(() => ({}));
    if (!planRes.ok) {
      setJob((j) => (j ? { ...j, status: "error", error: planData.error ?? "plan failed" } : j));
      return;
    }

    // 2) Queue job
    const genRes = await fetch(`/api/jobs/${jobId}/generate`, { method: "POST" });
    const genData = await genRes.json().catch(() => ({}));
    if (!genRes.ok) {
      setJob((j) => (j ? { ...j, status: "error", error: genData.error ?? "generate failed" } : j));
      return;
    }

    setJob((j) => (j ? { ...j, status: "queued", error: "" } : j));
    poll(jobId);
  }

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json().catch(() => ({}));
      setHistory(data.jobs ?? []);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "history") loadHistory();
  }, [tab]);

  async function startEdit(clip: Clip, parentJobId: string, clipIndex: number) {
    setEditTarget({ parentJobId, clipIndex, clipUrl: clip.url });
    setEditPrompt("Change captions: font Montserrat, size 72, white text, black outline, keep bottom safe margin.");
    setEditStatus(null);
  }

  async function submitEdit() {
    if (!editTarget) return;
    setEditStatus("creating edit job...");

    const res = await fetch("/api/edit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        parentJobId: editTarget.parentJobId,
        clipIndex: editTarget.clipIndex,
        clipUrl: editTarget.clipUrl,
        userPrompt: editPrompt,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setEditStatus(data.error ?? "edit job failed");
      return;
    }

    const editJobId = data.editJobId as string;
    setEditStatus(`edit queued (${editJobId})...`);

    // Poll the edit job until done, then refresh history
    const timer = setInterval(async () => {
      try {
        const j = await fetchJob(editJobId);
        if (j.status === "done") {
          clearInterval(timer);
          setEditStatus("done! refresh history...");
          await loadHistory();
          setEditTarget(null);
        }
        if (j.status === "error") {
          clearInterval(timer);
          setEditStatus(`error: ${j.error}`);
        }
      } catch (e: any) {
        clearInterval(timer);
        setEditStatus(e?.message ?? "poll edit failed");
      }
    }, 2000);
  }

  const currentClips = job?.clips ?? [];

  return (
    <main style={{ maxWidth: 1000, margin: "30px auto", fontFamily: "system-ui", padding: 16 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Clipper (MiniMax M2.5 + Whisper)</h1>

      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button
          onClick={() => setTab("create")}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer", background: tab === "create" ? "#eee" : "#fff" }}
        >
          Create
        </button>
        <button
          onClick={() => setTab("history")}
          style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer", background: tab === "history" ? "#eee" : "#fff" }}
        >
          History
        </button>
      </div>

      {tab === "create" && (
        <>
          <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
            <input
              style={{ flex: 1, padding: 12, borderRadius: 10, border: "1px solid #ddd" }}
              placeholder="Paste YouTube URL"
              value={youtubeUrl}
              onChange={(e) => setYoutubeUrl(e.target.value)}
            />
            <button
              style={{ padding: "12px 16px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
              onClick={() => createDraftJob().catch((e) => setCreateError(e.message))}
            >
              Clip
            </button>
          </div>

          {createError && (
            <div style={{ marginTop: 10, padding: 10, background: "#fee", color: "crimson", borderRadius: 8 }}>
              Error: {createError}
            </div>
          )}

          {jobId && (
            <div style={{ marginTop: 14, border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
              <div>Job ID: <b>{jobId}</b></div>
              <div>Status: <b>{job?.status}</b></div>
              {job?.error ? <div style={{ color: "crimson" }}>{job.error}</div> : null}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Instructions (MiniMax chat)</div>
                <div style={{ display: "grid", gap: 8, maxHeight: 220, overflow: "auto", border: "1px solid #eee", borderRadius: 10, padding: 10 }}>
                  {messages.map((m, i) => (
                    <div key={i} style={{ whiteSpace: "pre-wrap" }}>
                      <b>{m.role}:</b> {m.content}
                    </div>
                  ))}
                  {messages.length === 0 && <div style={{ opacity: 0.7 }}>Example: “3 clips, focus on suspense. Captions: Montserrat, 72px, white with black outline, keep bottom safe margin.”</div>}
                </div>

                <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                  <input
                    style={{ flex: 1, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    placeholder="Type instructions…"
                  />
                  <button
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                    onClick={() => sendMessage().catch((e) => alert(e.message))}
                  >
                    Send
                  </button>
                  <button
                    style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                    onClick={() => generate().catch((e) => alert(e.message))}
                  >
                    Generate
                  </button>
                </div>
              </div>

              <div style={{ marginTop: 18, display: "grid", gap: 16 }}>
                {currentClips.map((c, i) => (
                  <div key={i} style={{ border: "1px solid #eee", padding: 14, borderRadius: 12 }}>
                    <div style={{ fontWeight: 700 }}>{c.title}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {c.start.toFixed(2)}s → {c.end.toFixed(2)}s
                    </div>
                    <video controls style={{ width: "100%", marginTop: 10 }} src={c.url} />
                    <div style={{ marginTop: 10 }}>
                      <a href={c.url} download>Download MP4</a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === "history" && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2 style={{ margin: 0 }}>History</h2>
            <button
              onClick={loadHistory}
              style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
            >
              Refresh
            </button>
          </div>

          {historyLoading && <div style={{ marginTop: 10 }}>Loading…</div>}

          <div style={{ display: "grid", gap: 14, marginTop: 12 }}>
            {history.map((j) => (
              <div key={j.id} style={{ border: "1px solid #eee", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{j.id}</div>
                    <div style={{ fontSize: 12, opacity: 0.7 }}>{j.youtubeUrl}</div>
                  </div>
                  <div>
                    <div>Status: <b>{j.status}</b></div>
                    {j.error ? <div style={{ color: "crimson" }}>{j.error}</div> : null}
                  </div>
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  {(j.clips ?? []).map((c, idx) => (
                    <div key={idx} style={{ border: "1px solid #f0f0f0", borderRadius: 10, padding: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ fontWeight: 700 }}>{c.title}</div>
                        <button
                          style={{ padding: "8px 10px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
                          onClick={() => startEdit(c, j.id, idx)}
                        >
                          Edit
                        </button>
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        {c.start.toFixed(2)}s → {c.end.toFixed(2)}s
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <a href={c.url} target="_blank">Open</a> &nbsp;|&nbsp; <a href={c.url} download>Download</a>
                      </div>

                      {Array.isArray(c.revisions) && c.revisions.length > 0 && (
                        <div style={{ marginTop: 10, paddingLeft: 10 }}>
                          <div style={{ fontWeight: 700, marginBottom: 6 }}>Revisions</div>
                          <ul style={{ margin: 0, paddingLeft: 18 }}>
                            {c.revisions.map((r, k) => (
                              <li key={k}>
                                <a href={r.url} target="_blank">Revision {k + 1}</a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                  {(j.clips ?? []).length === 0 && <div style={{ opacity: 0.7 }}>No clips on this job.</div>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {editTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <div style={{ background: "#fff", borderRadius: 12, padding: 14, width: 700, maxWidth: "100%" }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>Edit captions</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              This will generate a revised MP4 and attach it as a revision under the original clip.
            </div>

            <textarea
              style={{ width: "100%", minHeight: 120, marginTop: 10, padding: 10, borderRadius: 10, border: "1px solid #ddd" }}
              value={editPrompt}
              onChange={(e) => setEditPrompt(e.target.value)}
            />

            <div style={{ display: "flex", gap: 8, marginTop: 10, justifyContent: "flex-end" }}>
              <button
                onClick={() => setEditTarget(null)}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => submitEdit().catch((e) => setEditStatus(e.message))}
                style={{ padding: "10px 14px", borderRadius: 10, border: "1px solid #ddd", cursor: "pointer" }}
              >
                Generate revision
              </button>
            </div>

            {editStatus && <div style={{ marginTop: 10 }}>{editStatus}</div>}
          </div>
        </div>
      )}
    </main>
  );
}
