import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import {
  Upload, Trash, Sparkle, FileText, Calendar, ListChecks, Users,
  Money, ChatCircleText, ArrowRight, Plus, Copy, Envelope,
  CheckCircle, XCircle, Clock, ArrowLeft, Buildings
} from "@phosphor-icons/react";

const TABS = [
  { id: "overview", label: "Overview", icon: Buildings },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "analysis", label: "Analysis", icon: ListChecks },
  { id: "disciplines", label: "Disciplines", icon: Users },
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
      toast.error(e?.response?.data?.detail || "Analysis failed");
    } finally { setAnalyzing(false); }
  };

  const onDelete = async () => {
    if (!window.confirm("Delete this project and all its data?")) return;
    setBusy(true);
    try { await api.delete(`/projects/${id}`); navigate("/dashboard"); toast.success("Project deleted"); }
    catch { toast.error("Failed"); } finally { setBusy(false); }
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
            <div className="flex items-center gap-2">
              <button onClick={onAnalyze} disabled={analyzing || docs.length === 0} data-testid="analyze-btn"
                className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
                <Sparkle size={14} weight="bold" /> {analyzing ? "Analysing…" : project.analysis ? "Re-analyse" : "Analyse RFP"}
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
        {tab === "analysis" && <AnalysisTab analysis={project.analysis} />}
        {tab === "disciplines" && <DisciplinesTab projectId={id} project={project} invites={invites} setInvites={setInvites} />}
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

  const onUpload = async (files) => {
    if (!files?.length) return;
    setUploading(true);
    for (const f of Array.from(files)) {
      const fd = new FormData();
      fd.append("file", f);
      try {
        const { data } = await api.post(`/projects/${projectId}/documents`, fd, { headers: { "Content-Type": "multipart/form-data" }});
        setDocs(prev => [...prev, data]);
        toast.success(`Uploaded ${data.filename}`);
      } catch (e) {
        toast.error(`Failed: ${f.name}`);
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
            <button onClick={() => onDelete(d.id)} className="p-2 hover:bg-zinc-100" data-testid={`delete-doc-${d.id}`}>
              <Trash size={14} weight="bold" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

// ---- Analysis ---- //
const AnalysisTab = ({ analysis }) => {
  if (!analysis) return (
    <div className="border border-dashed border-zinc-300 p-12 text-center">
      <Sparkle size={32} weight="thin" className="mx-auto mb-3 text-zinc-500" />
      <div className="font-display text-xl tracking-tighter font-bold">No analysis yet.</div>
      <p className="text-sm text-zinc-500 mt-1">Upload documents and click <span className="font-semibold">Analyse RFP</span>.</p>
    </div>
  );
  return (
    <div className="space-y-10">
      {analysis.summary && (
        <div className="border border-zinc-200 p-6">
          <div className="overline mb-3">Executive Summary</div>
          <p className="text-sm leading-relaxed">{analysis.summary}</p>
        </div>
      )}

      {analysis.scope?.length > 0 && (
        <div>
          <div className="overline mb-3">Scope</div>
          <ul className="space-y-2 border-t border-zinc-200">
            {analysis.scope.map((s, i) => (
              <li key={i} className="flex gap-4 py-3 border-b border-zinc-200 text-sm">
                <span className="font-mono text-xs text-zinc-500 w-8 mt-0.5">{String(i+1).padStart(2,'0')}</span>
                <span className="flex-1">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {analysis.key_dates?.length > 0 && (
        <div>
          <div className="overline mb-3 flex items-center gap-2"><Calendar size={12} weight="bold"/> Key Dates</div>
          <table className="w-full border border-zinc-200">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <th className="text-left px-4 py-3 font-semibold">Date</th>
                <th className="text-left px-4 py-3 font-semibold">Label</th>
                <th className="text-left px-4 py-3 font-semibold">Type</th>
              </tr>
            </thead>
            <tbody>
              {analysis.key_dates.map((d,i) => (
                <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                  <td className="px-4 py-3 font-mono text-xs">{d.date}</td>
                  <td className="px-4 py-3 text-sm">{d.label}</td>
                  <td className="px-4 py-3"><span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-zinc-100">{d.type}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analysis.requirements?.length > 0 && (
        <div>
          <div className="overline mb-3 flex items-center gap-2"><ListChecks size={12} weight="bold"/> Requirements ({analysis.requirements.length})</div>
          <table className="w-full border border-zinc-200">
            <thead>
              <tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                <th className="text-left px-4 py-3 font-semibold w-16">ID</th>
                <th className="text-left px-4 py-3 font-semibold w-40">Category</th>
                <th className="text-left px-4 py-3 font-semibold">Requirement</th>
                <th className="text-left px-4 py-3 font-semibold w-24">Mandatory</th>
              </tr>
            </thead>
            <tbody>
              {analysis.requirements.map((r,i) => (
                <tr key={i} className="border-b border-zinc-200 last:border-b-0 hover:bg-zinc-50">
                  <td className="px-4 py-3 font-mono text-xs">{r.id || `R-${String(i+1).padStart(3,'0')}`}</td>
                  <td className="px-4 py-3 text-xs uppercase tracking-[0.15em] font-mono">{r.category}</td>
                  <td className="px-4 py-3 text-sm">{r.requirement}</td>
                  <td className="px-4 py-3">{r.mandatory
                    ? <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#FF3B30] text-white">Yes</span>
                    : <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-zinc-100">Optional</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analysis.disciplines?.length > 0 && (
        <div>
          <div className="overline mb-3 flex items-center gap-2"><Users size={12} weight="bold"/> Disciplines ({analysis.disciplines.length})</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-zinc-200">
            {analysis.disciplines.map((d,i) => (
              <div key={i} className="p-5 border-r border-b border-zinc-200">
                <div className="font-display text-base font-bold tracking-tight mb-1">{d.name}</div>
                <div className="text-xs text-zinc-500 mb-2">{d.description}</div>
                <div className="text-xs text-zinc-700">{d.scope_summary}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {analysis.evaluation_criteria?.length > 0 && (
        <div>
          <div className="overline mb-3">Evaluation Criteria</div>
          <table className="w-full border border-zinc-200">
            <tbody>
              {analysis.evaluation_criteria.map((c,i) => (
                <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                  <td className="px-4 py-3 text-sm flex-1">{c.criterion}</td>
                  <td className="px-4 py-3 font-mono text-xs text-right w-24">{c.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {analysis.risks?.length > 0 && (
        <div>
          <div className="overline mb-3">Risks</div>
          <ul className="border-t border-zinc-200">
            {analysis.risks.map((r,i) => (
              <li key={i} className="py-3 border-b border-zinc-200 text-sm flex gap-4">
                <span className="font-mono text-xs text-[#FFCC00] mt-0.5">!</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

// ---- Disciplines / Invites ---- //
const DisciplinesTab = ({ projectId, project, invites, setInvites }) => {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ discipline: "", consultant_name: "", consultant_email: "", consultant_company: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const disciplines = project.analysis?.disciplines || [];

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="overline mb-1">Distribute</div>
          <div className="font-display text-2xl tracking-tighter font-black">Sub-consultants</div>
        </div>
        <button onClick={() => setShowForm(!showForm)} data-testid="add-invite-btn"
          className="flex items-center gap-2 px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] transition-colors">
          <Plus size={14} weight="bold" /> {showForm ? "Cancel" : "Add invite"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} className="border border-[#0A0A0B] p-6 mb-8 grid grid-cols-1 md:grid-cols-2 gap-4" data-testid="invite-form">
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
                <button onClick={() => mailto(inv)} title="Email" data-testid={`email-${inv.id}`}
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
  const submit = async (e) => {
    e.preventDefault();
    if (!q.trim()) return;
    const question = q.trim();
    setMessages(m => [...m, { role: "user", text: question }]);
    setQ("");
    setBusy(true);
    try {
      const { data } = await api.post(`/projects/${projectId}/chat`, { question });
      setMessages(m => [...m, { role: "assistant", text: data.answer, sources: data.sources }]);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Chat failed");
    } finally { setBusy(false); }
  };
  if (!hasDocs) return <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">Upload documents to enable chat.</div>;
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 border border-zinc-200 min-h-[60vh]">
      <div className="lg:col-span-2 flex flex-col border-r border-zinc-200">
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
