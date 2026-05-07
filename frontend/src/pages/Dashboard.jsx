import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { Plus, FolderOpen, ArrowRight, X, FileText, Trophy, ChartLineUp, CurrencyDollar, ClockCounterClockwise } from "@phosphor-icons/react";
import { formatDate } from "@/lib/dates";

const STATUS_LABELS = {
  draft: "Draft",
  analysing: "Analysing",
  analysed: "Analysed",
  distributed: "Distributed",
  merged: "Merged",
};

const Dashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ title: "", client_name: "", description: "" });
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/projects");
      setProjects(data);
    } catch (e) {
      toast.error("Failed to load projects");
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    setCreating(true);
    try {
      const { data } = await api.post("/projects", form);
      setProjects([data, ...projects]);
      setShowNew(false);
      setForm({ title: "", client_name: "", description: "" });
      toast.success("Project created");
      navigate(`/projects/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed to create");
    } finally { setCreating(false); }
  };

  return (
    <Layout>
      <section className="border-b border-zinc-200">
        <div className="px-6 lg:px-10 py-12 lg:py-16 max-w-[1600px]">
          <div className="overline mb-3">Workspace / Projects</div>
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl tracking-tighter font-black leading-none">
              All projects.
            </h1>
            <button onClick={() => setShowNew(true)} data-testid="new-project-btn"
              className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.18em] hover:bg-[#0A0A0B] transition-colors">
              <Plus size={14} weight="bold" /> New Project
            </button>
          </div>
          <div className="mt-6 flex gap-8 text-xs">
            <div><span className="font-mono text-zinc-500">TOTAL</span> <span className="font-mono font-semibold ml-2" data-testid="stat-total">{projects.length}</span></div>
            <div><span className="font-mono text-zinc-500">ANALYSED</span> <span className="font-mono font-semibold ml-2">{projects.filter(p=>p.analysis).length}</span></div>
            <div><span className="font-mono text-zinc-500">DISTRIBUTED</span> <span className="font-mono font-semibold ml-2">{projects.filter(p=>p.status==='distributed' || p.status==='merged').length}</span></div>
          </div>
        </div>
      </section>

      <Analytics projects={projects} />

      <section className="px-6 lg:px-10 py-10 max-w-[1600px]">
        {loading ? (
          <div className="text-zinc-500 font-mono text-sm">Loading…</div>
        ) : projects.length === 0 ? (
          <div className="border border-dashed border-zinc-300 p-16 text-center grid-bg">
            <FolderOpen size={40} weight="thin" className="mx-auto mb-4 text-zinc-400" />
            <div className="overline mb-2">Empty workspace</div>
            <div className="font-display text-2xl tracking-tighter font-bold mb-2">No projects yet.</div>
            <p className="text-sm text-zinc-600 mb-6 max-w-md mx-auto">Start by creating a project, then upload the client RFP and accompanying documents.</p>
            <button onClick={() => setShowNew(true)} data-testid="empty-new-project-btn"
              className="inline-flex items-center gap-2 px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.18em] hover:bg-[#0055FF] transition-colors">
              <Plus size={14} weight="bold" /> Create first project
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-zinc-200" data-testid="project-grid">
            {projects.map((p, i) => (
              <Link key={p.id} to={`/projects/${p.id}`} data-testid={`project-card-${p.id}`}
                className="group fade-up p-6 border-r border-b border-zinc-200 hover:bg-white transition-colors flex flex-col gap-4 min-h-[180px]"
                style={{animationDelay: `${i * 40}ms`}}>
                <div className="flex items-start justify-between gap-3">
                  <div className="text-[10px] font-mono uppercase tracking-[0.18em] px-2 py-1 bg-[#0A0A0B] text-white">
                    {STATUS_LABELS[p.status] || p.status}
                  </div>
                  <FileText size={18} weight="bold" className="text-zinc-400 group-hover:text-[#0055FF]" />
                </div>
                <div className="flex-1">
                  <div className="font-display text-xl tracking-tight font-bold leading-tight mb-1 line-clamp-2">{p.title}</div>
                  <div className="text-xs text-zinc-500 font-mono">{p.client_name || "—"}</div>
                </div>
                <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-[0.15em] text-zinc-500">
                  <span>{formatDate(p.created_at)}</span>
                  <span className="flex items-center gap-1 text-[#0055FF] opacity-0 group-hover:opacity-100 transition-opacity">
                    Open <ArrowRight size={12} weight="bold" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {showNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => setShowNew(false)}>
          <div className="w-full max-w-lg bg-white border border-[#0A0A0B] p-8" onClick={(e)=>e.stopPropagation()} data-testid="new-project-modal">
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="overline mb-1">New / Project</div>
                <h2 className="font-display text-2xl tracking-tighter font-black">Create project</h2>
              </div>
              <button onClick={() => setShowNew(false)} className="p-1 hover:bg-zinc-100" data-testid="close-modal-btn">
                <X size={20} weight="bold"/>
              </button>
            </div>
            <form onSubmit={create} className="space-y-4">
              <div>
                <label className="overline block mb-2">Project title*</label>
                <input required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})}
                  data-testid="project-title-input"
                  className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
              </div>
              <div>
                <label className="overline block mb-2">Client name</label>
                <input value={form.client_name} onChange={(e)=>setForm({...form,client_name:e.target.value})}
                  data-testid="project-client-input"
                  className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
              </div>
              <div>
                <label className="overline block mb-2">Description</label>
                <textarea rows={3} value={form.description} onChange={(e)=>setForm({...form,description:e.target.value})}
                  data-testid="project-desc-input"
                  className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowNew(false)} data-testid="cancel-create-btn"
                  className="flex-1 px-4 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-zinc-100 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={creating} data-testid="submit-create-btn"
                  className="flex-1 px-4 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] disabled:opacity-50 transition-colors">
                  {creating ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
};

// ----- Analytics ----- //
const Analytics = ({ projects }) => {
  const stats = useMemo(() => {
    const total = projects.length;
    const analysed = projects.filter(p => p.analysis).length;
    const won = projects.filter(p => p.outcome === "won").length;
    const lost = projects.filter(p => p.outcome === "lost").length;
    const pending = projects.filter(p => !p.outcome || p.outcome === "pending").length;
    const abandoned = projects.filter(p => p.outcome === "abandoned").length;
    const decided = won + lost;
    const winRate = decided > 0 ? (won / decided * 100) : 0;
    // Total awarded value, by currency
    const awardedByCur = {};
    projects.forEach(p => {
      if (p.outcome === "won" && p.awarded_amount) {
        const cur = (p.fee_builder?.details?.currency) || (p.analysis?.financial_terms?.currency) || "AED";
        awardedByCur[cur] = (awardedByCur[cur] || 0) + Number(p.awarded_amount || 0);
      }
    });
    // Status distribution
    const statusBreakdown = ["draft","analysing","analysed","distributed","merged"]
      .map(s => ({ s, n: projects.filter(p => p.status === s).length }))
      .filter(r => r.n > 0);
    return { total, analysed, won, lost, pending, abandoned, winRate, awardedByCur, statusBreakdown };
  }, [projects]);

  if (stats.total === 0) return null;

  return (
    <section className="border-b border-zinc-200" data-testid="analytics-section">
      <div className="px-6 lg:px-10 py-8 max-w-[1600px]">
        <div className="overline mb-4">Analytics</div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-0 border border-zinc-200">
          <KPI label="Total RFPs" value={stats.total} icon={FileText} />
          <KPI label="Analysed" value={stats.analysed} icon={ChartLineUp} sub={`${stats.total ? Math.round(stats.analysed/stats.total*100) : 0}%`} />
          <KPI label="Won" value={stats.won} icon={Trophy} cls="text-[#007A38]" />
          <KPI label="Lost" value={stats.lost} icon={X} cls="text-[#B22318]" />
          <KPI label="Pending" value={stats.pending} icon={ClockCounterClockwise} />
          <KPI label="Win rate" value={`${stats.winRate.toFixed(0)}%`} icon={ChartLineUp} sub={stats.won + stats.lost > 0 ? `${stats.won}/${stats.won+stats.lost} decided` : "—"} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border border-zinc-200 border-t-0">
          {/* Awarded value */}
          <div className="p-6 border-r border-zinc-200">
            <div className="overline mb-3 flex items-center gap-2"><CurrencyDollar size={12} weight="bold"/> Total awarded value</div>
            {Object.keys(stats.awardedByCur).length === 0 ? (
              <div className="text-sm text-zinc-500">No won projects with awarded amount yet.</div>
            ) : (
              <div className="space-y-2">
                {Object.entries(stats.awardedByCur).map(([cur, total]) => (
                  <div key={cur} className="flex items-baseline justify-between">
                    <span className="overline">{cur}</span>
                    <span className="font-display font-black text-2xl tracking-tighter font-mono" data-testid={`awarded-${cur}`}>
                      {Number(total).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          {/* Pipeline distribution */}
          <div className="p-6">
            <div className="overline mb-3">Pipeline status</div>
            {stats.statusBreakdown.length === 0 ? (
              <div className="text-sm text-zinc-500">No pipeline data.</div>
            ) : (
              <div className="space-y-3">
                {stats.statusBreakdown.map(({s, n}) => {
                  const pct = stats.total > 0 ? (n / stats.total * 100) : 0;
                  return (
                    <div key={s}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="overline">{s}</span>
                        <span className="font-mono font-semibold">{n} · {pct.toFixed(0)}%</span>
                      </div>
                      <div className="h-1.5 bg-zinc-100">
                        <div className="h-full bg-[#0055FF] transition-all" style={{ width: `${pct}%` }}/>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const KPI = ({ label, value, sub, icon: Icon, cls }) => (
  <div className="p-5 border-r border-b last:border-r-0 border-zinc-200">
    <div className="flex items-center justify-between mb-2">
      <div className="overline">{label}</div>
      {Icon && <Icon size={14} weight="bold" className="text-zinc-400"/>}
    </div>
    <div className={`font-display font-black text-3xl tracking-tighter ${cls||''}`}>{value}</div>
    {sub && <div className="text-[10px] uppercase tracking-[0.15em] font-mono text-zinc-500 mt-1">{sub}</div>}
  </div>
);

export default Dashboard;
