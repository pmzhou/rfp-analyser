import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  Upload, Trash, Sparkle, FileText, Calendar, ListChecks, Users,
  Money, ChatCircleText, ArrowRight, Plus, Copy, Envelope,
  CheckCircle, XCircle, Clock, ArrowLeft, Buildings,
  PencilSimple, FloppyDisk, X as XIcon,
  Copy as CopyIcon, FilePdf, FileXls, Trophy, Books, Eye, Warning, Globe, Receipt, PaperPlaneTilt, UploadSimple, Calculator
} from "@phosphor-icons/react";
import FeeBuilder from "@/pages/FeeBuilder";
import { formatDate } from "@/lib/dates";

const TABS = [
  { id: "overview", label: "Overview", icon: Buildings },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "analysis", label: "Analysis", icon: ListChecks },
  { id: "disciplines", label: "Disciplines", icon: Users },
  { id: "fee_builder", label: "Fee Builder", icon: Calculator },
  { id: "fees", label: "Fee Merger", icon: Money },
  { id: "chat", label: "Chat", icon: ChatCircleText },
];

const ProjectDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [project, setProject] = useState(null);
  const [docs, setDocs] = useState([]);
  const [invites, setInvites] = useState([]);
  const [busy, setBusy] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const load = async () => {
    try {
      const [{data: p}, {data: ds}, {data: ivs}] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/documents`),
        api.get(`/projects/${id}/invites`),
      ]);
      setProject(p); setDocs(ds); setInvites(ivs);
    } catch (e) {
      toast.error("Failed to load project");
      navigate("/dashboard");
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  const onAnalyze = async () => {
    if (docs.length === 0) return toast.error("Upload at least one document first");
    setAnalyzing(true);
    try {
      const { data } = await api.post(`/projects/${id}/analyze`);
      setProject(data);
      toast.success("Analysis complete");
      setTab("analysis");
    } catch (e) {
      const detail = e?.response?.data?.detail || e?.message || "Analysis failed";
      const isBudget = String(detail).toLowerCase().includes("budget");
      toast.error(detail, {
        description: isBudget ? "Top up your Emergent Universal LLM key under Profile → Universal Key → Add Balance, then retry." : undefined,
        duration: 10000,
      });
    } finally { setAnalyzing(false); }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this project and all its data?")) return;
    setBusy(true);
    try { await api.delete(`/projects/${id}`); navigate("/dashboard"); toast.success("Project deleted"); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
  };

  const onDuplicate = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${id}/duplicate`);
      toast.success("Project duplicated");
      navigate(`/projects/${data.id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Duplicate failed"); }
    finally { setBusy(false); }
  };

  const onExport = async (format) => {
    try {
      const res = await api.get(`/projects/${id}/export?format=${format}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url; a.download = `${project.title.replace(/\W+/g,'_')}.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e) { toast.error("Export failed"); }
  };

  const setOutcome = async (val) => {
    try {
      const { data } = await api.patch(`/projects/${id}/outcome`, { outcome: val });
      setProject(data);
      toast.success(`Marked as ${val}`);
    } catch (e) { toast.error("Failed"); }
  };

  if (!project) return <Layout><div className="p-10 text-zinc-500 font-mono text-sm">Loading project…</div></Layout>;

  return (
    <Layout>
      <section className="border-b border-zinc-200">
        <div className="px-6 lg:px-10 py-10 max-w-[1600px]">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#0A0A0B] mb-6" data-testid="back-link">
            <ArrowLeft size={12} weight="bold" /> All projects
          </Link>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <div className="flex items-center gap-3 mb-3">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-1 bg-[#0A0A0B] text-white" data-testid="project-status">{project.status}</span>
                <span className="text-xs font-mono text-zinc-500">{project.client_name || "—"}</span>
              </div>
              <h1 className="font-display text-3xl sm:text-4xl tracking-tighter font-black leading-none" data-testid="project-title">{project.title}</h1>
              {project.description && <p className="mt-3 text-sm text-zinc-600 max-w-2xl">{project.description}</p>}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={onAnalyze} disabled={analyzing || docs.length === 0} data-testid="analyze-btn"
                className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
                <Sparkle size={14} weight="bold" /> {analyzing ? "Analysing…" : project.analysis ? "Re-analyse" : "Analyse RFP"}
              </button>
              <select value={project.outcome || "pending"} onChange={(e) => setOutcome(e.target.value)} data-testid="outcome-select"
                className="px-3 py-3 border border-[#0A0A0B] text-xs uppercase tracking-[0.15em] font-semibold bg-white">
                <option value="pending">Pending</option>
                <option value="won">Won</option>
                <option value="lost">Lost</option>
                <option value="abandoned">Abandoned</option>
              </select>
              <button onClick={onDuplicate} disabled={busy} title="Duplicate" data-testid="duplicate-btn"
                className="p-3 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                <CopyIcon size={14} weight="bold" />
              </button>
              <button onClick={() => onExport("pdf")} title="Export PDF" data-testid="export-pdf-btn"
                className="p-3 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                <FilePdf size={14} weight="bold" />
              </button>
              <button onClick={() => onExport("xlsx")} title="Export Excel" data-testid="export-xlsx-btn"
                className="p-3 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                <FileXls size={14} weight="bold" />
              </button>
              <button onClick={onDelete} disabled={busy} data-testid="delete-project-btn"
                className="p-3 border border-[#0A0A0B] hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors">
                <Trash size={14} weight="bold" />
              </button>
            </div>
          </div>
        </div>
        <div className="px-6 lg:px-10 max-w-[1600px] flex border-t border-zinc-200 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={() => setTab(t.id)} data-testid={`tab-${t.id}`}
                className={`flex items-center gap-2 px-5 py-3 text-[11px] uppercase tracking-[0.18em] font-semibold border-b-2 transition-colors whitespace-nowrap ${tab===t.id ? 'border-[#0A0A0B] text-[#0A0A0B]' : 'border-transparent text-zinc-500 hover:text-[#0A0A0B]'}`}>
                <Icon size={14} weight="bold" /> {t.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="px-6 lg:px-10 py-10 max-w-[1600px]">
        {tab === "overview" && <OverviewTab project={project} docs={docs} invites={invites} />}
        {tab === "documents" && <DocumentsTab projectId={id} docs={docs} setDocs={setDocs} />}
        {tab === "analysis" && <AnalysisTab projectId={id} analysis={project.analysis} onUpdate={(a) => setProject({...project, analysis: a})} />}
        {tab === "disciplines" && <DisciplinesTab projectId={id} project={project} invites={invites} setInvites={setInvites} />}
        {tab === "fee_builder" && <FeeBuilder project={project} onUpdate={(p) => setProject(p)} />}
        {tab === "fees" && <FeesTab projectId={id} />}
        {tab === "chat" && <ChatTab projectId={id} hasDocs={docs.length>0} />}
      </section>
    </Layout>
  );
};

// ---- Overview ---- //
const OverviewTab = ({ project, docs, invites }) => {
  const submitted = invites.filter(i => i.status === "submitted").length;
  const stats = [
    ["Documents", docs.length],
    ["Disciplines", project.analysis?.disciplines?.length || 0],
    ["Sub-consultants", invites.length],
    ["Responses", `${submitted}/${invites.length}`],
  ];
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 border border-zinc-200">
      {stats.map(([label, val]) => (
        <div key={label} className="p-6 border-r border-b lg:border-b-0 border-zinc-200 last:border-r-0">
          <div className="overline mb-3">{label}</div>
          <div className="font-display font-black text-4xl tracking-tighter">{val}</div>
        </div>
      ))}
    </div>
  );
};

// ---- Documents ---- //
const DocumentsTab = ({ projectId, docs, setDocs }) => {
  const inputRef = useRef();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({});
  const [viewing, setViewing] = useState(null);   // {id, filename}

  const fileUrl = (docId) => {
    const t = localStorage.getItem("rfp_token");
    return `${process.env.REACT_APP_BACKEND_URL}/api/projects/${projectId}/documents/${docId}/file?_=${t}`;
  };
  // For viewer we need auth header; iframe can't send headers. We use a blob URL fetched via api.
  const openViewer = async (doc) => {
    try {
      const res = await api.get(`/projects/${projectId}/documents/${doc.id}/file`, { responseType: "blob" });
      const url = window.URL.createObjectURL(res.data);
      setViewing({ ...doc, blobUrl: url });
    } catch (e) { toast.error("Could not load document"); }
  };
  const closeViewer = () => {
    if (viewing?.blobUrl) window.URL.revokeObjectURL(viewing.blobUrl);
    setViewing(null);
  };

  const onUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await api.post(`/projects/${projectId}/documents`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
          timeout: 600000,
          maxContentLength: Infinity,
          maxBodyLength: Infinity,
          onUploadProgress: (evt) => {
            if (evt.total) setProgress(p => ({ ...p, [f.name]: Math.round(100 * evt.loaded / evt.total) }));
          },
        });
        setDocs(prev => [...prev, data]);
        setProgress(p => { const n = {...p}; delete n[f.name]; return n; });
        toast.success(`Uploaded ${data.filename}`);
      } catch (e) {
        const detail = e?.response?.data?.detail || e?.message || "Upload failed";
        toast.error(`${f.name}: ${detail}`, { duration: 8000 });
        setProgress(p => { const n = {...p}; delete n[f.name]; return n; });
      }
    }
    setUploading(false);
  };

  const onDelete = async (docId) => {
    try { await api.delete(`/projects/${projectId}/documents/${docId}`); setDocs(docs.filter(d => d.id !== docId)); }
    catch { toast.error("Failed to delete"); }
  };

  return (
    <div>
      <div onClick={() => inputRef.current?.click()}
        onDragOver={(e)=>e.preventDefault()}
        onDrop={(e)=>{ e.preventDefault(); onUpload(e.dataTransfer.files); }}
        data-testid="upload-dropzone"
        className="border-2 border-dashed border-zinc-300 hover:border-[#0055FF] p-12 text-center cursor-pointer transition-colors grid-bg">
        <Upload size={32} weight="thin" className="mx-auto mb-3 text-zinc-500" />
        <div className="overline mb-1">Drop files</div>
        <div className="font-display text-xl tracking-tighter font-bold mb-1">{uploading ? "Uploading…" : "Drag & drop RFP documents"}</div>
        <p className="text-xs text-zinc-500">PDF, DOCX, TXT — multiple files allowed</p>
        <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.txt,.md" onChange={(e)=>onUpload(e.target.files)} className="hidden" data-testid="upload-input" />
      </div>
      {Object.keys(progress).length > 0 && (
        <div className="mt-4 space-y-2">
          {Object.entries(progress).map(([name, pct]) => (
            <div key={name} className="border border-zinc-200 p-3" data-testid={`upload-progress-${name}`}>
              <div className="flex justify-between items-center mb-1">
                <div className="text-xs truncate flex-1 mr-3">{name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.18em]">{pct}%</div>
              </div>
              <div className="h-1 bg-zinc-100 overflow-hidden">
                <div className="h-full bg-[#0055FF] transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-8 border border-zinc-200">
        {docs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-sm font-mono">No documents uploaded.</div>
        ) : docs.map((d, i) => (
          <div key={d.id} className={`flex items-center gap-4 p-4 ${i < docs.length-1 ? 'border-b border-zinc-200' : ''}`} data-testid={`doc-row-${d.id}`}>
            <FileText size={20} weight="bold" className="text-zinc-500" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{d.filename}</div>
              <div className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-mono">{(d.size/1024).toFixed(1)} KB · {d.chunks} chunks · {d.text_length.toLocaleString()} chars</div>
            </div>
            <button onClick={() => openViewer(d)} title="View" data-testid={`view-doc-${d.id}`}
              className="p-2 hover:bg-zinc-100"><Eye size={14} weight="bold" /></button>
            <button onClick={() => onDelete(d.id)} className="p-2 hover:bg-zinc-100" data-testid={`delete-doc-${d.id}`}>
              <Trash size={14} weight="bold" />
            </button>
          </div>
        ))}
      </div>
      {viewing && (
        <div className="fixed inset-0 z-50 flex bg-black/60 backdrop-blur-sm" onClick={closeViewer} data-testid="doc-viewer-modal">
          <div className="ml-auto w-full max-w-5xl bg-white border-l border-[#0A0A0B] flex flex-col" onClick={(e)=>e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b border-zinc-200">
              <div className="min-w-0 flex-1">
                <div className="overline mb-1">Source document</div>
                <div className="font-mono text-sm truncate">{viewing.filename}</div>
              </div>
              <button onClick={closeViewer} data-testid="doc-viewer-close" className="p-2 hover:bg-zinc-100"><XIcon size={18} weight="bold"/></button>
            </div>
            <iframe src={viewing.blobUrl} title={viewing.filename} className="flex-1 w-full" />
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Analysis (Human-in-the-Loop QA: every field editable) ---- //
const AnalysisTab = ({ projectId, analysis, onUpdate }) => {
  const [draft, setDraft] = useState(analysis);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);  // section key currently in edit mode

  useEffect(() => { setDraft(analysis); }, [analysis]);

  if (!analysis) return (
    <div className="border border-dashed border-zinc-300 p-12 text-center">
      <Sparkle size={32} weight="thin" className="mx-auto mb-3 text-zinc-500" />
      <div className="font-display text-xl tracking-tighter font-bold">No analysis yet.</div>
      <p className="text-sm text-zinc-500 mt-1">Upload documents and click <span className="font-semibold">Analyse RFP</span>.</p>
    </div>
  );

  const dirty = JSON.stringify(draft) !== JSON.stringify(analysis);

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.patch(`/projects/${projectId}/analysis`, draft);
      onUpdate(data.analysis);
      setEditing(null);
      toast.success("Corrections saved");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally { setSaving(false); }
  };

  const reset = () => { setDraft(analysis); setEditing(null); };

  // helpers
  const setField = (key, val) => setDraft({ ...draft, [key]: val });
  const updateRow = (key, idx, val) => {
    const arr = [...(draft[key] || [])];
    arr[idx] = val;
    setDraft({ ...draft, [key]: arr });
  };
  const removeRow = (key, idx) => {
    const arr = [...(draft[key] || [])];
    arr.splice(idx, 1);
    setDraft({ ...draft, [key]: arr });
  };
  const addRow = (key, blank) => setDraft({ ...draft, [key]: [...(draft[key] || []), blank] });

  return (
    <div className="space-y-6" data-testid="analysis-tab">
      {/* sticky save bar */}
      <div className="sticky top-16 z-20 -mx-6 lg:-mx-10 px-6 lg:px-10 py-3 bg-white/90 backdrop-blur-xl border-b border-zinc-200 flex items-center justify-between" data-testid="hitl-bar">
        <div className="flex items-center gap-2 text-xs">
          <PencilSimple size={14} weight="bold" className="text-[#0055FF]" />
          <span className="overline">Human-in-the-Loop QA</span>
          {dirty && <span className="text-[10px] font-mono uppercase tracking-[0.15em] px-2 py-0.5 bg-[#FFCC00]/30 text-[#7A5E00]">Unsaved changes</span>}
        </div>
        <div className="flex items-center gap-2">
          {dirty && (
            <button onClick={reset} disabled={saving} data-testid="hitl-reset-btn"
              className="px-3 py-2 text-[11px] uppercase tracking-[0.15em] font-semibold border border-[#0A0A0B] hover:bg-zinc-100 transition-colors">Reset</button>
          )}
          <button onClick={save} disabled={!dirty || saving} data-testid="hitl-save-btn"
            className="flex items-center gap-2 px-4 py-2 bg-[#0055FF] text-white text-[11px] uppercase tracking-[0.15em] font-semibold hover:bg-[#0A0A0B] disabled:opacity-40 transition-colors">
            <FloppyDisk size={12} weight="bold"/> {saving ? "Saving…" : "Save corrections"}
          </button>
        </div>
      </div>

      {/* ===== GROUP A: OVERVIEW ===== */}
      <Group label="A · Overview">
        <Section label="Executive Summary" editing={editing==="summary"} onEdit={() => setEditing("summary")}>
          {editing==="summary" ? (
            <textarea rows={4} value={draft.summary || ""} onChange={e=>setField("summary", e.target.value)}
              data-testid="edit-summary" className="w-full px-3 py-3 border border-[#0055FF] focus:outline-none text-sm resize-y" />
          ) : (
            <p className="text-sm leading-relaxed">{draft.summary || <i className="text-zinc-400">No summary</i>}</p>
          )}
        </Section>
        <Section label="Project Objectives" editing={editing==="project_objectives"} onEdit={() => setEditing("project_objectives")}>
          {editing==="project_objectives" ? (
            <textarea rows={4} value={draft.project_objectives || ""} onChange={e=>setField("project_objectives", e.target.value)}
              data-testid="edit-project-objectives" className="w-full px-3 py-3 border border-[#0055FF] focus:outline-none text-sm resize-y" />
          ) : (
            <p className="text-sm leading-relaxed">{draft.project_objectives || <i className="text-zinc-400">Not extracted</i>}</p>
          )}
        </Section>
      </Group>

      {/* ===== GROUP B: SCOPE OF WORK ===== */}
      <Group label="B · Scope of Work">
        <ListSection label="Scope" items={draft.scope || []} editing={editing==="scope"}
          onEdit={()=>setEditing("scope")} onChange={(arr)=>setField("scope", arr)}
          renderItem={(s,i,onChange)=> editing==="scope"
            ? <input value={s} onChange={e=>onChange(e.target.value)} data-testid={`edit-scope-${i}`} className="w-full px-3 py-2 border border-[#0055FF] text-sm" />
            : <span className="flex-1">{s}</span>
          }
          blank={""} />

        <RowsSection label="Detailed Tasks (WBS)"
          rows={draft.detailed_tasks || []} editing={editing==="detailed_tasks"}
          onEdit={()=>setEditing("detailed_tasks")}
          columns={[
            { key: "id", label: "WBS ID", w: "w-24", mono: true },
            { key: "task", label: "Task" },
            { key: "subtasks", label: "Subtasks", multiline: true },
          ]}
          onUpdate={(arr)=>setField("detailed_tasks", arr)}
          blank={{ id: "", task: "", subtasks: [] }} />

        <RowsSection label="Deliverables"
          rows={draft.deliverables || []} editing={editing==="deliverables"}
          onEdit={()=>setEditing("deliverables")}
          columns={[
            { key: "name", label: "Name", w: "w-44" },
            { key: "description", label: "Description" },
            { key: "acceptance_criteria", label: "Acceptance" },
            { key: "due", label: "Due", w: "w-32", mono: true },
          ]}
          onUpdate={(arr)=>setField("deliverables", arr)}
          blank={{ name: "", description: "", acceptance_criteria: "", due: "" }} />

        <DutiesSection
          duties={draft.agency_contractor_duties || { agency: [], contractor: [] }}
          editing={editing==="agency_contractor_duties"}
          onEdit={()=>setEditing("agency_contractor_duties")}
          onChange={(v)=>setField("agency_contractor_duties", v)} />
      </Group>

      {/* ===== GROUP C: SCHEDULE ===== */}
      <Group label="C · Schedule">
        <RowsSection label="Program / Phases"
          rows={draft.program || []} editing={editing==="program"} onEdit={()=>setEditing("program")}
          columns={[
            { key: "phase", label: "Phase", w: "w-44" },
            { key: "description", label: "Description" },
            { key: "duration", label: "Duration", w: "w-32", mono: true },
          ]}
          onUpdate={(arr)=>setField("program", arr)}
          blank={{ phase: "", description: "", duration: "" }} />

        <RowsSection label="Key Dates" icon={<Calendar size={12} weight="bold"/>}
          rows={draft.key_dates || []} editing={editing==="key_dates"} onEdit={()=>setEditing("key_dates")}
          columns={[
            { key: "date", label: "Date", w: "w-40", mono: true, dateFormat: true },
            { key: "label", label: "Label" },
            { key: "type", label: "Type", w: "w-40", select: ["submission","kickoff","milestone","interview","site_visit","other"] },
          ]}
          onUpdate={(arr)=>setField("key_dates", arr)}
          blank={{ date: "", label: "", type: "milestone" }} />
      </Group>

      {/* ===== GROUP D: REQUIREMENTS ===== */}
      <Group label="D · Requirements">
        <RowsSection label={`Requirements (${(draft.requirements||[]).length})`} icon={<ListChecks size={12} weight="bold"/>}
          rows={draft.requirements || []} editing={editing==="requirements"} onEdit={()=>setEditing("requirements")}
          columns={[
            { key: "id", label: "ID", w: "w-24", mono: true },
            { key: "category", label: "Category", w: "w-44", mono: true },
            { key: "requirement", label: "Requirement" },
            { key: "mandatory", label: "Mandatory", w: "w-28", bool: true },
            { key: "confidence", label: "Conf.", w: "w-20", confidence: true },
          ]}
          onUpdate={(arr)=>setField("requirements", arr)}
          blank={{ id: "", category: "", requirement: "", mandatory: false, source: "", confidence: "high" }} />

        <RowsSection label="Technical Specifications"
          rows={draft.technical_specifications || []} editing={editing==="technical_specifications"}
          onEdit={()=>setEditing("technical_specifications")}
          columns={[
            { key: "category", label: "Category", w: "w-40", mono: true },
            { key: "specification", label: "Specification" },
            { key: "standard", label: "Standard", w: "w-40", mono: true },
            { key: "quantity", label: "Qty", w: "w-20", mono: true, align: "right" },
            { key: "unit", label: "Unit", w: "w-20", mono: true },
            { key: "confidence", label: "Conf.", w: "w-20", confidence: true },
          ]}
          onUpdate={(arr)=>setField("technical_specifications", arr)}
          blank={{ category: "", specification: "", standard: "", quantity: "", unit: "", confidence: "high" }} />

        <RowsSection label="Vendor Qualifications"
          rows={draft.vendor_qualifications || []} editing={editing==="vendor_qualifications"}
          onEdit={()=>setEditing("vendor_qualifications")}
          columns={[
            { key: "requirement", label: "Requirement" },
            { key: "evidence_required", label: "Evidence required" },
          ]}
          onUpdate={(arr)=>setField("vendor_qualifications", arr)}
          blank={{ requirement: "", evidence_required: "" }} />

        <RowsSection label="Compliance & Ethics"
          rows={draft.compliance_and_ethics || []} editing={editing==="compliance_and_ethics"}
          onEdit={()=>setEditing("compliance_and_ethics")}
          columns={[
            { key: "item", label: "Item" },
            { key: "type", label: "Type", w: "w-36", select: ["insurance","certificate","bond","ethics","other"] },
            { key: "details", label: "Details" },
          ]}
          onUpdate={(arr)=>setField("compliance_and_ethics", arr)}
          blank={{ item: "", type: "other", details: "" }} />
      </Group>

      {/* ===== GROUP E: DISCIPLINES ===== */}
      <Group label="E · Disciplines">
        <Section label={`Disciplines (${(draft.disciplines||[]).length})`} icon={<Users size={12} weight="bold"/>}
          editing={editing==="disciplines"} onEdit={()=>setEditing("disciplines")}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-zinc-200">
            {(draft.disciplines||[]).map((d,i) => (
              <div key={i} className="p-5 border-r border-b border-zinc-200" data-testid={`discipline-${i}`}>
                {editing==="disciplines" ? (
                  <div className="space-y-2">
                    <input value={d.name||""} onChange={e=>updateRow("disciplines", i, {...d, name:e.target.value})}
                      placeholder="Name" className="w-full px-2 py-1 border border-[#0055FF] text-sm font-semibold" />
                    <input value={d.description||""} onChange={e=>updateRow("disciplines", i, {...d, description:e.target.value})}
                      placeholder="Description" className="w-full px-2 py-1 border border-[#0055FF] text-xs" />
                    <textarea rows={3} value={d.scope_summary||""} onChange={e=>updateRow("disciplines", i, {...d, scope_summary:e.target.value})}
                      placeholder="Scope summary" className="w-full px-2 py-1 border border-[#0055FF] text-xs resize-y" />
                    <button onClick={()=>removeRow("disciplines", i)} className="text-[10px] uppercase tracking-[0.15em] font-mono text-[#FF3B30]">Remove</button>
                  </div>
                ) : (
                  <>
                    <div className="font-display text-base font-bold tracking-tight mb-1">{d.name}</div>
                    <div className="text-xs text-zinc-500 mb-2">{d.description}</div>
                    <div className="text-xs text-zinc-700">{d.scope_summary}</div>
                  </>
                )}
              </div>
            ))}
            {editing==="disciplines" && (
              <button onClick={()=>addRow("disciplines", { name: "", description: "", scope_summary: "" })}
                data-testid="add-discipline-btn"
                className="p-5 border-r border-b border-dashed border-zinc-300 text-sm text-zinc-500 hover:bg-zinc-50 hover:text-[#0055FF] transition-colors flex items-center justify-center gap-2">
                <Plus size={14} weight="bold"/> Add discipline
              </button>
            )}
          </div>
        </Section>
      </Group>

      {/* ===== GROUP F: PROGRAMMATIC ===== */}
      <Group label="F · Programmatic">
        <RowsSection label="Evaluation Criteria"
          rows={draft.evaluation_criteria || []} editing={editing==="evaluation_criteria"}
          onEdit={()=>setEditing("evaluation_criteria")}
          columns={[
            { key: "criterion", label: "Criterion" },
            { key: "weight", label: "Weight", w: "w-28", mono: true, align: "right" },
            { key: "notes", label: "Notes", w: "w-64" },
          ]}
          onUpdate={(arr)=>setField("evaluation_criteria", arr)}
          blank={{ criterion: "", weight: "", notes: "" }} />

        <KeyValueSection label="Financial Terms" icon={<Money size={12} weight="bold"/>}
          obj={draft.financial_terms || {}}
          editing={editing==="financial_terms"} onEdit={()=>setEditing("financial_terms")}
          fields={[
            { key: "pricing_format", label: "Pricing format", select: ["lump sum","hourly","per-milestone","cost-plus","mixed","other"] },
            { key: "budget_ceiling", label: "Budget ceiling", mono: true },
            { key: "payment_structure", label: "Payment structure", textarea: true },
            { key: "currency", label: "Currency", mono: true },
          ]}
          onChange={(v)=>setField("financial_terms", v)} />

        <RowsSection label="Risk Management"
          rows={draft.risk_management || []} editing={editing==="risk_management"}
          onEdit={()=>setEditing("risk_management")}
          columns={[
            { key: "clause", label: "Clause", w: "w-56" },
            { key: "details", label: "Details" },
          ]}
          onUpdate={(arr)=>setField("risk_management", arr)}
          blank={{ clause: "", details: "" }} />

        <KeyValueSection label="Submission Guidelines"
          obj={draft.submission_guidelines || {}}
          editing={editing==="submission_guidelines"} onEdit={()=>setEditing("submission_guidelines")}
          fields={[
            { key: "format", label: "Format", textarea: true },
            { key: "page_limit", label: "Page limit", mono: true },
            { key: "copies", label: "Copies", mono: true },
            { key: "language", label: "Language" },
            { key: "delivery_method", label: "Delivery method" },
            { key: "mandatory_forms", label: "Mandatory forms", list: true },
          ]}
          onChange={(v)=>setField("submission_guidelines", v)} />
      </Group>

      {/* ===== GROUP G: RISKS ===== */}
      <Group label="G · Risks">
        <ListSection label="Risks" items={draft.risks || []} editing={editing==="risks"}
          onEdit={()=>setEditing("risks")} onChange={(arr)=>setField("risks", arr)}
          prefix={<span className="font-mono text-xs text-[#FFCC00] mt-0.5">!</span>}
          renderItem={(s,i,onChange)=> editing==="risks"
            ? <input value={s} onChange={e=>onChange(e.target.value)} data-testid={`edit-risk-${i}`} className="w-full px-3 py-2 border border-[#0055FF] text-sm" />
            : <span>{s}</span>
          }
          blank="" />
      </Group>
    </div>
  );
};

// ---- Group header (numbered section divider) ---- //
const Group = ({ label, children }) => (
  <div className="space-y-6">
    <div className="pt-2 pb-1 border-b-2 border-[#0A0A0B]">
      <div className="font-display text-2xl tracking-tighter font-black">{label}</div>
    </div>
    <div className="space-y-8">{children}</div>
  </div>
);

// ---- Section primitive ---- //
const Section = ({ label, icon, editing, onEdit, children }) => (
  <div data-testid={`section-${label.toLowerCase().replace(/\W+/g,'-')}`}>
    <div className="flex items-center justify-between mb-3">
      <div className="overline flex items-center gap-2">{icon} {label}</div>
      <button onClick={onEdit} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500 hover:text-[#0055FF] transition-colors">
        <PencilSimple size={11} weight="bold"/> {editing ? "Editing" : "Edit"}
      </button>
    </div>
    {editing ? (
      <div className="border-2 border-[#0055FF] p-4 bg-[#0055FF]/5">{children}</div>
    ) : (
      <div className="border border-zinc-200 p-4">{children}</div>
    )}
  </div>
);

// ---- Editable list of strings ---- //
const ListSection = ({ label, items, editing, onEdit, onChange, renderItem, prefix, blank }) => (
  <div data-testid={`list-${label.toLowerCase()}`}>
    <div className="flex items-center justify-between mb-3">
      <div className="overline">{label}</div>
      <button onClick={onEdit} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500 hover:text-[#0055FF] transition-colors">
        <PencilSimple size={11} weight="bold"/> {editing ? "Editing" : "Edit"}
      </button>
    </div>
    <ul className={`border-t ${editing ? 'border-[#0055FF]' : 'border-zinc-200'}`}>
      {items.map((s,i) => (
        <li key={i} className={`flex gap-3 py-3 border-b text-sm items-center ${editing ? 'border-[#0055FF]/30 bg-[#0055FF]/5 px-3' : 'border-zinc-200'}`}>
          {prefix || <span className="font-mono text-xs text-zinc-500 w-8 mt-0.5">{String(i+1).padStart(2,'0')}</span>}
          {renderItem(s, i, (val) => { const a=[...items]; a[i]=val; onChange(a); })}
          {editing && (
            <button onClick={()=>{ const a=[...items]; a.splice(i,1); onChange(a); }}
              data-testid={`remove-${label.toLowerCase()}-${i}`}
              className="p-1 text-zinc-400 hover:text-[#FF3B30]"><Trash size={12} weight="bold"/></button>
          )}
        </li>
      ))}
      {editing && (
        <li className="py-2 px-3 border-b border-[#0055FF]/30 bg-[#0055FF]/5">
          <button onClick={()=>onChange([...items, blank])}
            data-testid={`add-${label.toLowerCase()}-btn`}
            className="text-[11px] uppercase tracking-[0.15em] font-semibold text-[#0055FF] hover:text-[#0A0A0B] transition-colors flex items-center gap-1">
            <Plus size={12} weight="bold"/> Add item
          </button>
        </li>
      )}
    </ul>
  </div>
);

// ---- Editable rows table ---- //
const RowsSection = ({ label, icon, rows, editing, onEdit, columns, onUpdate, blank }) => {
  const update = (i, key, val) => { const a=[...rows]; a[i] = {...a[i], [key]: val}; onUpdate(a); };
  const remove = (i) => { const a=[...rows]; a.splice(i,1); onUpdate(a); };
  return (
    <div data-testid={`rows-${label.toLowerCase().replace(/\W+/g,'-')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="overline flex items-center gap-2">{icon} {label}</div>
        <button onClick={onEdit} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500 hover:text-[#0055FF] transition-colors">
          <PencilSimple size={11} weight="bold"/> {editing ? "Editing" : "Edit"}
        </button>
      </div>
      <table className={`w-full border ${editing ? 'border-[#0055FF]' : 'border-zinc-200'}`}>
        <thead>
          <tr className={`${editing ? 'bg-[#0055FF]/5' : 'bg-zinc-50'} border-b ${editing ? 'border-[#0055FF]/30' : 'border-zinc-200'} text-[10px] uppercase tracking-[0.18em] text-zinc-500`}>
            {columns.map(c => (
              <th key={c.key} className={`text-${c.align||'left'} px-4 py-3 font-semibold ${c.w||''}`}>{c.label}</th>
            ))}
            {editing && <th className="w-12"></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r,i) => (
            <tr key={i} className="border-b border-zinc-200 last:border-b-0" data-testid={`row-${label.toLowerCase().replace(/\W+/g,'-')}-${i}`}>
              {columns.map(c => (
                <td key={c.key} className={`px-4 py-3 ${c.mono ? 'font-mono text-xs' : 'text-sm'} text-${c.align||'left'}`}>
                  {editing ? (
                    c.bool ? (
                      <select value={r[c.key] ? "yes" : "no"} onChange={e=>update(i, c.key, e.target.value==="yes")}
                        data-testid={`edit-${c.key}-${i}`}
                        className="px-2 py-1 border border-[#0055FF] text-xs bg-white">
                        <option value="yes">Yes</option><option value="no">No</option>
                      </select>
                    ) : c.select ? (
                      <select value={r[c.key]||""} onChange={e=>update(i, c.key, e.target.value)}
                        data-testid={`edit-${c.key}-${i}`}
                        className="px-2 py-1 border border-[#0055FF] text-xs bg-white">
                        {c.select.map(o => <option key={o}>{o}</option>)}
                      </select>
                    ) : c.confidence ? (
                      <select value={r[c.key]||"high"} onChange={e=>update(i, c.key, e.target.value)}
                        data-testid={`edit-${c.key}-${i}`}
                        className="px-2 py-1 border border-[#0055FF] text-xs bg-white">
                        {["high","medium","low"].map(o=><option key={o}>{o}</option>)}
                      </select>
                    ) : c.multiline ? (
                      <textarea
                        rows={Math.max(2, Array.isArray(r[c.key]) ? r[c.key].length : 2)}
                        value={Array.isArray(r[c.key]) ? r[c.key].join("\n") : (r[c.key] || "")}
                        onChange={e=>update(i, c.key, e.target.value.split("\n").filter(x=>x))}
                        data-testid={`edit-${c.key}-${i}`}
                        placeholder="One item per line"
                        className="w-full px-2 py-1 border border-[#0055FF] text-xs resize-y" />
                    ) : (
                      <input value={r[c.key] ?? ""} onChange={e=>update(i, c.key, e.target.value)}
                        data-testid={`edit-${c.key}-${i}`}
                        className={`w-full px-2 py-1 border border-[#0055FF] ${c.mono?'font-mono text-xs':'text-sm'}`} />
                    )
                  ) : (
                    c.bool ? (
                      r[c.key]
                        ? <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#FF3B30] text-white">Yes</span>
                        : <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-zinc-100">Optional</span>
                    ) : c.confidence ? (
                      <ConfidenceBadge level={r[c.key]} />
                    ) : c.multiline && Array.isArray(r[c.key]) ? (
                      r[c.key].length > 0 ? (
                        <ul className="list-disc list-inside text-xs space-y-0.5">
                          {r[c.key].map((s, j) => <li key={j}>{s}</li>)}
                        </ul>
                      ) : <span className="text-zinc-400">—</span>
                    ) : c.dateFormat ? (
                      <span className={c.mono ? 'font-mono text-xs' : ''}>{formatDate(r[c.key])}</span>
                    ) : (
                      <span>{r[c.key] || (c.key==="id" ? `R-${String(i+1).padStart(3,'0')}` : "—")}</span>
                    )
                  )}
                </td>
              ))}
              {editing && (
                <td className="px-2 py-3 text-right">
                  <button onClick={()=>remove(i)} data-testid={`remove-row-${i}`} className="p-1 text-zinc-400 hover:text-[#FF3B30]">
                    <Trash size={12} weight="bold"/>
                  </button>
                </td>
              )}
            </tr>
          ))}
          {editing && (
            <tr><td colSpan={columns.length+1} className="px-4 py-3 bg-[#0055FF]/5 border-b border-[#0055FF]/30">
              <button onClick={()=>onUpdate([...rows, blank])}
                data-testid={`add-row-${label.toLowerCase().replace(/\W+/g,'-')}`}
                className="text-[11px] uppercase tracking-[0.15em] font-semibold text-[#0055FF] hover:text-[#0A0A0B] transition-colors flex items-center gap-1">
                <Plus size={12} weight="bold"/> Add row
              </button>
            </td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

// ---- Object (Key/Value) section: financial_terms, submission_guidelines ---- //
const KeyValueSection = ({ label, icon, obj, fields, editing, onEdit, onChange }) => {
  const set = (key, val) => onChange({ ...obj, [key]: val });
  return (
    <div data-testid={`kv-${label.toLowerCase().replace(/\W+/g,'-')}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="overline flex items-center gap-2">{icon} {label}</div>
        <button onClick={onEdit} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500 hover:text-[#0055FF] transition-colors">
          <PencilSimple size={11} weight="bold"/> {editing ? "Editing" : "Edit"}
        </button>
      </div>
      <div className={`border ${editing ? 'border-[#0055FF]' : 'border-zinc-200'}`}>
        {fields.map((f, idx) => {
          const val = obj?.[f.key];
          const isLast = idx === fields.length - 1;
          return (
            <div key={f.key} className={`grid grid-cols-1 md:grid-cols-4 ${!isLast ? 'border-b' : ''} ${editing ? 'border-[#0055FF]/30' : 'border-zinc-200'}`}>
              <div className="overline px-4 py-3 md:border-r border-zinc-200 bg-zinc-50/50 md:col-span-1">{f.label}</div>
              <div className="px-4 py-3 md:col-span-3">
                {editing ? (
                  f.list ? (
                    <textarea
                      rows={Math.max(2, Array.isArray(val) ? val.length : 2)}
                      value={Array.isArray(val) ? val.join("\n") : (val || "")}
                      onChange={e=>set(f.key, e.target.value.split("\n").filter(x=>x))}
                      data-testid={`edit-kv-${f.key}`}
                      placeholder="One item per line"
                      className="w-full px-2 py-1 border border-[#0055FF] text-sm resize-y" />
                  ) : f.select ? (
                    <select value={val||""} onChange={e=>set(f.key, e.target.value)}
                      data-testid={`edit-kv-${f.key}`}
                      className="px-2 py-1 border border-[#0055FF] text-sm bg-white">
                      <option value="">—</option>
                      {f.select.map(o => <option key={o}>{o}</option>)}
                    </select>
                  ) : f.textarea ? (
                    <textarea rows={3} value={val||""} onChange={e=>set(f.key, e.target.value)}
                      data-testid={`edit-kv-${f.key}`}
                      className={`w-full px-2 py-1 border border-[#0055FF] ${f.mono?'font-mono text-xs':'text-sm'} resize-y`} />
                  ) : (
                    <input value={val||""} onChange={e=>set(f.key, e.target.value)}
                      data-testid={`edit-kv-${f.key}`}
                      className={`w-full px-2 py-1 border border-[#0055FF] ${f.mono?'font-mono text-xs':'text-sm'}`} />
                  )
                ) : (
                  f.list && Array.isArray(val) ? (
                    val.length > 0 ? (
                      <ul className="list-disc list-inside text-sm space-y-0.5">
                        {val.map((s, j) => <li key={j}>{s}</li>)}
                      </ul>
                    ) : <span className="text-zinc-400 text-sm">—</span>
                  ) : (
                    <span className={`${f.mono?'font-mono text-xs':'text-sm'}`}>{val || <span className="text-zinc-400">—</span>}</span>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// ---- Agency / Contractor duties (two parallel string lists) ---- //
const DutiesSection = ({ duties, editing, onEdit, onChange }) => {
  const setSide = (side, arr) => onChange({ ...duties, [side]: arr });
  const renderSide = (label, side, items) => (
    <div className="border border-zinc-200">
      <div className="overline px-4 py-3 border-b border-zinc-200 bg-zinc-50/50">{label}</div>
      <ul>
        {(items || []).map((s, i) => (
          <li key={i} className="flex gap-3 px-4 py-2 border-b border-zinc-100 text-sm items-center">
            <span className="font-mono text-xs text-zinc-500 w-6">{String(i+1).padStart(2,'0')}</span>
            {editing ? (
              <input value={s} onChange={e=>{ const a=[...items]; a[i]=e.target.value; setSide(side, a); }}
                data-testid={`edit-duty-${side}-${i}`}
                className="flex-1 px-2 py-1 border border-[#0055FF] text-sm" />
            ) : <span className="flex-1">{s}</span>}
            {editing && (
              <button onClick={()=>{ const a=[...items]; a.splice(i,1); setSide(side, a); }}
                className="p-1 text-zinc-400 hover:text-[#FF3B30]">
                <Trash size={12} weight="bold"/>
              </button>
            )}
          </li>
        ))}
        {editing && (
          <li className="px-4 py-2">
            <button onClick={()=>setSide(side, [...(items||[]), ""])}
              data-testid={`add-duty-${side}`}
              className="text-[11px] uppercase tracking-[0.15em] font-semibold text-[#0055FF] hover:text-[#0A0A0B] flex items-center gap-1">
              <Plus size={12} weight="bold"/> Add
            </button>
          </li>
        )}
      </ul>
    </div>
  );
  return (
    <div data-testid="section-duties">
      <div className="flex items-center justify-between mb-3">
        <div className="overline">Agency & Contractor Duties</div>
        <button onClick={onEdit} className="flex items-center gap-1 text-[10px] uppercase tracking-[0.15em] font-semibold text-zinc-500 hover:text-[#0055FF] transition-colors">
          <PencilSimple size={11} weight="bold"/> {editing ? "Editing" : "Edit"}
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {renderSide("Agency", "agency", duties?.agency || [])}
        {renderSide("Contractor", "contractor", duties?.contractor || [])}
      </div>
    </div>
  );
};

// ---- Disciplines / Invites ---- //
const DisciplinesTab = ({ projectId, project, invites, setInvites }) => {
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [form, setForm] = useState({ discipline: "", consultant_name: "", consultant_email: "", consultant_company: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [feeTpls, setFeeTpls] = useState([]);
  const disciplines = project.analysis?.disciplines || [];

  useEffect(() => {
    api.get("/library?type=contact").then(r => setContacts(r.data)).catch(() => {});
    api.get("/library?type=fee_template").then(r => setFeeTpls(r.data)).catch(() => {});
  }, []);

  const matchingTemplate = feeTpls.find(t => (t.discipline||"").toLowerCase() === (form.discipline||"").toLowerCase());

  const pickContact = (c) => setForm({
    ...form,
    consultant_name: c.consultant_name,
    consultant_email: c.consultant_email,
    consultant_company: c.consultant_company || "",
  });

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/invites`, form);
      setInvites([data, ...invites]);
      setShowForm(false);
      setForm({ discipline: "", consultant_name: "", consultant_email: "", consultant_company: "", notes: "" });
      toast.success("Invite created");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const onDelete = async (inviteId) => {
    try { await api.delete(`/projects/${projectId}/invites/${inviteId}`); setInvites(invites.filter(i=>i.id!==inviteId)); }
    catch { toast.error("Failed"); }
  };

  const shareLink = (token) => `${window.location.origin}/respond/${token}`;

  const copyLink = (token) => {
    navigator.clipboard.writeText(shareLink(token));
    toast.success("Link copied");
  };

  const mailto = (inv) => {
    const url = shareLink(inv.share_token);
    const subject = encodeURIComponent(`Sub-consultant fee request — ${project.title} — ${inv.discipline}`);
    const body = encodeURIComponent(
      `Hi ${inv.consultant_name},\n\n` +
      `We would like to invite you to provide a fee for the ${inv.discipline} discipline on the following RFP project:\n\n` +
      `Project: ${project.title}\nClient: ${project.client_name || "—"}\n\n` +
      `Please review the scope and submit your fee here:\n${url}\n\nBest regards`
    );
    window.location.href = `mailto:${inv.consultant_email}?subject=${subject}&body=${body}`;
  };

  const sendEmail = async (inv) => {
    try {
      await api.post(`/projects/${projectId}/invites/${inv.id}/send-email`);
      toast.success(`Sent to ${inv.consultant_email}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Send failed"); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Distribute</div>
          <div className="font-display text-2xl tracking-tighter font-black">Sub-consultants</div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowBulk(!showBulk)} data-testid="bulk-invite-btn"
            className="flex items-center gap-2 px-4 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] hover:text-white transition-colors">
            CSV bulk
          </button>
          <button onClick={() => setShowForm(!showForm)} data-testid="add-invite-btn"
            className="flex items-center gap-2 px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] transition-colors">
            <Plus size={14} weight="bold" /> {showForm ? "Cancel" : "Add invite"}
          </button>
        </div>
      </div>

      {showBulk && (
        <BulkInvitePanel projectId={projectId} disciplines={disciplines}
          onCreated={(arr) => setInvites(prev => [...arr, ...prev])} onClose={() => setShowBulk(false)} />
      )}

      {showForm && (
        <form onSubmit={submit} className="border border-[#0A0A0B] p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="invite-form">
          {contacts.length > 0 && (
            <div className="md:col-span-2 flex flex-wrap items-center gap-2 pb-2 border-b border-zinc-200">
              <span className="overline">Address book:</span>
              {contacts.slice(0, 8).map(c => (
                <button key={c.id} type="button" onClick={()=>pickContact(c)} data-testid={`pick-contact-${c.id}`}
                  className="text-[11px] uppercase tracking-[0.15em] font-mono px-2 py-1 border border-zinc-300 hover:border-[#0055FF] hover:text-[#0055FF] transition-colors">
                  {c.consultant_name}
                </button>
              ))}
            </div>
          )}
          <div>
            <label className="overline block mb-2">Discipline*</label>
            {disciplines.length > 0 ? (
              <select required value={form.discipline} onChange={(e)=>setForm({...form,discipline:e.target.value})} data-testid="invite-discipline-select"
                className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm bg-white">
                <option value="">Select…</option>
                {disciplines.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
              </select>
            ) : (
              <input required value={form.discipline} onChange={(e)=>setForm({...form,discipline:e.target.value})} placeholder="e.g. Structural Engineering"
                data-testid="invite-discipline-input"
                className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
            )}
          </div>
          <div>
            <label className="overline block mb-2">Consultant name*</label>
            <input required value={form.consultant_name} onChange={(e)=>setForm({...form,consultant_name:e.target.value})}
              data-testid="invite-name-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          </div>
          <div>
            <label className="overline block mb-2">Email*</label>
            <input type="email" required value={form.consultant_email} onChange={(e)=>setForm({...form,consultant_email:e.target.value})}
              data-testid="invite-email-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          </div>
          <div>
            <label className="overline block mb-2">Company</label>
            <input value={form.consultant_company} onChange={(e)=>setForm({...form,consultant_company:e.target.value})}
              data-testid="invite-company-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="overline block mb-2">Notes</label>
            <textarea rows={2} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}
              data-testid="invite-notes-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm resize-none" />
            {matchingTemplate && (
              <div className="mt-2 p-3 border border-[#0055FF] bg-[#0055FF]/5 text-xs" data-testid="fee-template-hint">
                <div className="flex items-center gap-2 mb-1"><Receipt size={12} weight="bold" className="text-[#0055FF]"/> <span className="overline">Fee template found</span></div>
                <span className="font-mono">{matchingTemplate.fee_format} · {matchingTemplate.currency} {Number(matchingTemplate.base_fee||0).toLocaleString()}</span>
                {matchingTemplate.template_notes && <div className="text-zinc-600 mt-1">{matchingTemplate.template_notes}</div>}
              </div>
            )}
          </div>
          <div className="md:col-span-2 flex justify-end">
            <button type="submit" disabled={busy} data-testid="submit-invite-btn"
              className="px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
              {busy ? "Creating…" : "Create invite"}
            </button>
          </div>
        </form>
      )}

      {invites.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">No invites yet.</div>
      ) : (
        <div className="border border-zinc-200">
          {invites.map((inv) => (
            <div key={inv.id} className="border-b border-zinc-200 last:border-b-0 p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-center" data-testid={`invite-${inv.id}`}>
              <div className="lg:col-span-3">
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">Discipline</div>
                <div className="font-display font-bold text-sm tracking-tight">{inv.discipline}</div>
              </div>
              <div className="lg:col-span-3">
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">Consultant</div>
                <div className="text-sm font-medium">{inv.consultant_name}</div>
                <div className="text-xs text-zinc-500 truncate">{inv.consultant_email}</div>
              </div>
              <div className="lg:col-span-2">
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">Status</div>
                <StatusPill status={inv.status} />
              </div>
              <div className="lg:col-span-2">
                <div className="text-[10px] uppercase tracking-[0.18em] font-mono text-zinc-500">Fee</div>
                <div className="font-mono text-sm">{inv.fee != null ? `${inv.currency} ${Number(inv.fee).toLocaleString()}` : "—"}</div>
              </div>
              <div className="lg:col-span-2 flex items-center gap-1 justify-end">
                <button onClick={() => copyLink(inv.share_token)} title="Copy link" data-testid={`copy-link-${inv.id}`}
                  className="p-2 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                  <Copy size={14} weight="bold" />
                </button>
                <button onClick={() => sendEmail(inv)} title="Send via SMTP" data-testid={`smtp-send-${inv.id}`}
                  className="p-2 border border-[#0A0A0B] hover:bg-[#0055FF] hover:text-white hover:border-[#0055FF] transition-colors">
                  <PaperPlaneTilt size={14} weight="bold" />
                </button>
                <button onClick={() => mailto(inv)} title="Open in mail client" data-testid={`email-${inv.id}`}
                  className="p-2 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                  <Envelope size={14} weight="bold" />
                </button>
                <button onClick={() => onDelete(inv.id)} title="Delete" data-testid={`delete-invite-${inv.id}`}
                  className="p-2 border border-[#0A0A0B] hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors">
                  <Trash size={14} weight="bold" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---- Bulk invite via CSV ---- //
const BulkInvitePanel = ({ projectId, disciplines, onCreated, onClose }) => {
  const [text, setText] = useState("discipline,consultant_name,consultant_email,consultant_company\n");
  const [sendEmail, setSendEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const parse = () => {
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];
    const head = lines[0].split(",").map(h => h.trim().toLowerCase());
    return lines.slice(1).map(line => {
      const cols = line.split(",").map(c => c.trim());
      const o = {};
      head.forEach((h, i) => { o[h] = cols[i] || ""; });
      return {
        discipline: o.discipline,
        consultant_name: o.consultant_name || o.name,
        consultant_email: o.consultant_email || o.email,
        consultant_company: o.consultant_company || o.company || "",
        notes: o.notes || "",
      };
    }).filter(r => r.consultant_email && r.discipline);
  };

  const submit = async () => {
    const invites = parse();
    if (invites.length === 0) return toast.error("No valid rows. Need columns: discipline, consultant_name, consultant_email");
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/invites/bulk`, { invites, send_email: sendEmail });
      onCreated(data.created);
      toast.success(`Created ${data.created.length} invite(s)${sendEmail ? `, ${data.emails_sent} email(s) sent` : ""}`);
      if (data.failed?.length) toast.error(`${data.failed.length} email(s) failed`);
      onClose();
    } catch (e) { toast.error(e?.response?.data?.detail || "Bulk failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="border border-[#0A0A0B] p-6 mb-8" data-testid="bulk-invite-panel">
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="overline mb-1">Bulk · CSV import</div>
          <div className="font-display text-xl tracking-tighter font-bold">Paste CSV rows</div>
          <p className="text-xs text-zinc-500 mt-1">Header: <span className="font-mono">discipline,consultant_name,consultant_email,consultant_company</span></p>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-zinc-100"><XIcon size={18} weight="bold"/></button>
      </div>
      {disciplines.length > 0 && (
        <div className="mb-3 text-[11px] text-zinc-500">Detected disciplines: <span className="font-mono">{disciplines.map(d => d.name).join(" · ")}</span></div>
      )}
      <textarea rows={8} value={text} onChange={e => setText(e.target.value)} data-testid="bulk-csv-textarea"
        className="w-full px-3 py-3 border border-[#0A0A0B] text-xs font-mono resize-y" />
      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sendEmail} onChange={e => setSendEmail(e.target.checked)} data-testid="bulk-send-email" />
          <span>Send invitation emails via SMTP</span>
        </label>
        <button onClick={submit} disabled={busy} data-testid="bulk-submit-btn"
          className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
          <UploadSimple size={14} weight="bold"/> {busy ? "Importing…" : "Import & create"}
        </button>
      </div>
    </div>
  );
};


const StatusPill = ({ status }) => {
  const cfg = {
    sent: { label: "Sent", icon: Clock, cls: "bg-zinc-100 text-zinc-700" },
    viewed: { label: "Viewed", icon: Clock, cls: "bg-[#FFCC00]/20 text-[#9B7800]" },
    submitted: { label: "Submitted", icon: CheckCircle, cls: "bg-[#00C35A]/15 text-[#007A38]" },
    declined: { label: "Declined", icon: XCircle, cls: "bg-[#FF3B30]/15 text-[#B22318]" },
  }[status] || { label: status, icon: Clock, cls: "bg-zinc-100" };
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 text-[10px] uppercase tracking-[0.15em] font-mono ${cfg.cls}`}>
      <Icon size={10} weight="bold" /> {cfg.label}
    </span>
  );
};

// ---- Fee merger ---- //
const FeesTab = ({ projectId }) => {
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/projects/${projectId}/fees`).then(r => setData(r.data)); }, [projectId]);
  if (!data) return <div className="text-zinc-500 font-mono text-sm">Loading…</div>;

  const submitted = data.invites.filter(i => i.status === "submitted");
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 md:grid-cols-4 border border-zinc-200">
        <Stat label="Invites" value={data.total_invites} />
        <Stat label="Submitted" value={data.submitted_count} />
        <Stat label="Pending" value={data.total_invites - data.submitted_count} />
        <Stat label="Disciplines covered" value={new Set(data.invites.map(i=>i.discipline)).size} />
      </div>

      <div>
        <div className="overline mb-3">Totals</div>
        {Object.keys(data.totals_by_currency).length === 0 ? (
          <div className="text-sm text-zinc-500">No submitted fees yet.</div>
        ) : (
          <div className="border border-zinc-200">
            {Object.entries(data.totals_by_currency).map(([cur, total]) => (
              <div key={cur} className="flex items-center justify-between p-5 border-b border-zinc-200 last:border-b-0">
                <div className="overline">Total {cur}</div>
                <div className="font-display font-black text-3xl tracking-tighter font-mono" data-testid={`total-${cur}`}>
                  {Number(total).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <div className="overline mb-3">Submitted fees</div>
        {submitted.length === 0 ? (
          <div className="text-sm text-zinc-500">No responses yet.</div>
        ) : (
          <table className="w-full border border-zinc-200">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <th className="text-left px-4 py-3 font-semibold">Discipline</th>
                <th className="text-left px-4 py-3 font-semibold">Consultant</th>
                <th className="text-right px-4 py-3 font-semibold">Fee</th>
                <th className="text-left px-4 py-3 font-semibold">Timeline</th>
                <th className="text-left px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody>
              {submitted.map(s => (
                <tr key={s.id} className="border-b border-zinc-200 last:border-b-0">
                  <td className="px-4 py-3 text-sm font-medium">{s.discipline}</td>
                  <td className="px-4 py-3 text-sm">{s.consultant_name}<div className="text-xs text-zinc-500">{s.consultant_company || ""}</div></td>
                  <td className="px-4 py-3 text-right font-mono text-sm">{s.currency} {Number(s.fee).toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                  <td className="px-4 py-3 text-xs">{s.response_timeline || "—"}</td>
                  <td className="px-4 py-3 text-xs text-zinc-600">{s.response_notes || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

const Stat = ({ label, value }) => (
  <div className="p-5 border-r border-zinc-200 last:border-r-0">
    <div className="overline mb-2">{label}</div>
    <div className="font-display font-black text-3xl tracking-tighter">{value}</div>
  </div>
);

// ---- Chat ---- //
const ChatTab = ({ projectId, hasDocs }) => {
  const [q, setQ] = useState("");
  const [messages, setMessages] = useState([]);
  const [busy, setBusy] = useState(false);
  const [crossProject, setCrossProject] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const question = q.trim();
    setMessages(m => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const url = crossProject ? `/projects/${projectId}/chat/cross` : `/projects/${projectId}/chat`;
      const { data } = await api.post(url, { question });
      setMessages(m => [...m, { role: "assistant", text: data.answer, sources: data.sources }]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Chat failed");
    } finally { setBusy(false); }
  };
  if (!hasDocs && !crossProject) return (
    <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
      Upload documents to enable chat — or enable <button onClick={()=>setCrossProject(true)} className="text-[#0055FF] underline">cross-RFP knowledge base search</button>.
    </div>
  );
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border border-zinc-200 min-h-[60vh]">
      <div className="lg:col-span-2 flex flex-col border-r border-zinc-200">
        <div className="p-3 border-b border-zinc-200 flex items-center justify-between">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={crossProject} onChange={e=>setCrossProject(e.target.checked)} data-testid="cross-rfp-toggle" />
            <Globe size={12} weight="bold" className={crossProject ? "text-[#0055FF]" : "text-zinc-400"}/>
            <span className="overline">Cross-RFP search (entire history)</span>
          </label>
        </div>
        <div className="flex-1 p-6 overflow-y-auto space-y-4 max-h-[60vh]">
          {messages.length === 0 && (
            <div className="text-center text-zinc-500 text-sm py-12">
              <ChatCircleText size={32} weight="thin" className="mx-auto mb-2" />
              Ask anything about this RFP — scope, deadlines, requirements…
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xl px-4 py-3 text-sm ${m.role==='user' ? 'bg-[#0A0A0B] text-white' : 'bg-zinc-100 text-[#0A0A0B] border-l-2 border-[#0055FF]'}`}>
                <div className="whitespace-pre-wrap">{m.text}</div>
                {m.sources?.length > 0 && (
                  <div className="mt-2 text-[10px] uppercase tracking-[0.15em] font-mono opacity-70">Sources: {[...new Set(m.sources)].join(", ")}</div>
                )}
              </div>
            </div>
          ))}
          {busy && <div className="text-xs text-zinc-500 font-mono">Thinking…</div>}
        </div>
        <form onSubmit={submit} className="p-4 border-t border-zinc-200 flex gap-2">
          <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Ask a question…" data-testid="chat-input"
            className="flex-1 px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          <button type="submit" disabled={busy || !q.trim()} data-testid="chat-send-btn"
            className="px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] disabled:opacity-50 transition-colors">
            <ArrowRight size={14} weight="bold" />
          </button>
        </form>
      </div>
      <div className="p-6 bg-zinc-50">
        <div className="overline mb-2">How it works</div>
        <p className="text-xs text-zinc-600 leading-relaxed">
          Documents are chunked & indexed in ChromaDB. Your question retrieves the most relevant sections, then Claude Sonnet 4.5 answers using only those excerpts.
        </p>
      </div>
    </div>
  );
};

export default ProjectDetail;
