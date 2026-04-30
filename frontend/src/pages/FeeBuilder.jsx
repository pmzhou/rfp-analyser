import React, { useEffect, useMemo, useState, useRef } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import {
  Buildings, ListChecks, IdentificationCard, Users, Toolbox, ChartBar,
  FileText as FileTextIcon, Plus, Trash, Calendar, FloppyDisk, Power
} from "@phosphor-icons/react";

/* ------------ defaults ------------ */
const DEFAULT_PRE = [
  { id: "p1", name: "Mobilization", weeks: 2 },
  { id: "p2", name: "Data Collection & Pre-Concept", weeks: 4 },
  { id: "p3", name: "Concept Design", weeks: 6 },
  { id: "p4", name: "Schematic Design", weeks: 8 },
  { id: "p5", name: "Detailed Design", weeks: 12 },
  { id: "p6", name: "Authority Approvals", weeks: 6 },
  { id: "p7", name: "Tender Stage", weeks: 6 },
  { id: "p8", name: "Issued for Construction", weeks: 4 },
];
const DEFAULT_POST = [
  { id: "po1", name: "Construction Supervision", weeks: 52 },
  { id: "po2", name: "Handover & Closeout", weeks: 6 },
  { id: "po3", name: "Defect Liability Period", weeks: 52 },
];

const DEFAULT_MATRIX = [
  { q: "Strategic alignment with firm focus", weight: 3, score: 3 },
  { q: "Client relationship strength", weight: 3, score: 3 },
  { q: "Project profitability potential", weight: 4, score: 3 },
  { q: "Resource availability", weight: 3, score: 3 },
  { q: "Reputation / portfolio impact", weight: 2, score: 3 },
  { q: "Geographic / logistical fit", weight: 1, score: 3 },
  { q: "Schedule feasibility", weight: 3, score: 3 },
  { q: "Risk exposure (legal / financial)", weight: 3, score: 3 },
];

const DEFAULT_FB = {
  details: { typology: "", gfa: 0, cost_per_m2: 0, currency: "USD", start_date: "", post_contract_date: "", assessed_by: "", reviewed_by: "" },
  matrix: DEFAULT_MATRIX,
  stages_pre: DEFAULT_PRE.map(s => ({ ...s, on: true })),
  stages_post: DEFAULT_POST.map(s => ({ ...s, on: true })),
  members: [],         // { id, ref_id, name, title, dept, group, cost_rate, on, hours: { stage_id: hours } }
  subs: [],            // { id, name, type, company, on, mgmt_on, mgmt_pct, fees: { stage_id: fee } }
  multipliers: { mgmt_pct: 10, contingency_pct: 5, vat_pct: 5 },
};

const PAGES = [
  { id: "details",  label: "01 · Project Details", icon: Buildings },
  { id: "matrix",   label: "02 · Prioritization Matrix", icon: ListChecks },
  { id: "roster",   label: "03 · Staff Roster", icon: IdentificationCard },
  { id: "team",     label: "04 · Team Resourcing", icon: Users },
  { id: "subs",     label: "05 · Sub-Consultants", icon: Toolbox },
  { id: "combined", label: "06 · Combined Fee", icon: ChartBar },
  { id: "summary",  label: "07 · Summary", icon: FileTextIcon },
];

/* ------------ component ------------ */
const FeeBuilder = ({ project, onUpdate }) => {
  const [page, setPage] = useState("details");
  const [fb, setFb] = useState(() => ({ ...DEFAULT_FB, ...(project.fee_builder || {}) }));
  const [saving, setSaving] = useState(false);
  const [globalStaff, setGlobalStaff] = useState([]);
  const [globalSubs, setGlobalSubs] = useState([]);
  const debounceRef = useRef();

  // load global staff & contacts
  useEffect(() => {
    api.get("/library?type=staff").then(r => setGlobalStaff(r.data)).catch(() => {});
    api.get("/library?type=contact").then(r => setGlobalSubs(r.data)).catch(() => {});
  }, []);

  // pre-fill from project + analysis
  useEffect(() => {
    if (!project.fee_builder) {
      const a = project.analysis || {};
      setFb(prev => ({
        ...prev,
        details: {
          ...prev.details,
          currency: a.financial_terms?.currency || prev.details.currency,
          assessed_by: prev.details.assessed_by,
        },
        // auto-add subs from analysis disciplines
        subs: (a.disciplines || []).map((d, i) => ({
          id: `auto-${i}`, name: d.name, type: d.description || "", company: "",
          on: true, mgmt_on: true, mgmt_pct: 10, fees: {},
        })),
      }));
    }
    // eslint-disable-next-line
  }, [project.id]);

  // debounced auto-save
  useEffect(() => {
    if (!project.id) return;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setSaving(true);
      try {
        const { data } = await api.patch(`/projects/${project.id}/fee-builder`, fb);
        onUpdate?.(data);
      } catch { /* ignore */ }
      finally { setSaving(false); }
    }, 1000);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line
  }, [fb]);

  /* ------------ calculations ------------ */
  const allStages = useMemo(() => [...fb.stages_pre, ...fb.stages_post], [fb.stages_pre, fb.stages_post]);
  const activeStages = useMemo(() => allStages.filter(s => s.on), [allStages]);

  const totals = useMemo(() => {
    let edgeTotal = 0;
    fb.members.forEach(m => {
      if (!m.on) return;
      activeStages.forEach(s => {
        const h = Number(m.hours?.[s.id] || 0);
        edgeTotal += h * Number(m.cost_rate || 0);
      });
    });

    let subRaw = 0, mgmtOnSubs = 0;
    fb.subs.forEach(s => {
      if (!s.on) return;
      let subTotal = 0;
      activeStages.forEach(st => { subTotal += Number(s.fees?.[st.id] || 0); });
      subRaw += subTotal;
      if (s.mgmt_on) mgmtOnSubs += subTotal * (Number(s.mgmt_pct || 0) / 100);
    });

    const preCont = edgeTotal + subRaw + mgmtOnSubs;
    const cont = preCont * (Number(fb.multipliers.contingency_pct || 0) / 100);
    const feeExVat = preCont + cont;
    const vat = feeExVat * (Number(fb.multipliers.vat_pct || 0) / 100);
    const grand = feeExVat + vat;

    const constructionCost = (Number(fb.details.gfa || 0) * Number(fb.details.cost_per_m2 || 0));
    const feeOfCC = constructionCost > 0 ? (feeExVat / constructionCost * 100) : 0;
    const margin = feeExVat > 0 ? ((feeExVat - edgeTotal) / feeExVat * 100) : 0;

    return { edgeTotal, subRaw, mgmtOnSubs, preCont, cont, feeExVat, vat, grand, constructionCost, feeOfCC, margin };
  }, [fb, activeStages]);

  const matrixScore = useMemo(() => {
    const total = (fb.matrix || []).reduce((sum, m) => sum + (Number(m.weight||0) * Number(m.score||0)), 0);
    const max = (fb.matrix || []).reduce((sum, m) => sum + (Number(m.weight||0) * 5), 0);
    return { total, max, pct: max > 0 ? (total / max * 100) : 0 };
  }, [fb.matrix]);

  /* ------------ helpers ------------ */
  const cur = fb.details.currency || "USD";
  const fmt = (n) => `${cur} ${Number(n||0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  const setDetail = (k, v) => setFb({ ...fb, details: { ...fb.details, [k]: v } });
  const setMul = (k, v) => setFb({ ...fb, multipliers: { ...fb.multipliers, [k]: parseFloat(v)||0 } });

  return (
    <div data-testid="fee-builder">
      {/* mini-stats bar */}
      <div className="grid grid-cols-2 md:grid-cols-5 border border-zinc-200 mb-6">
        <Stat label="Fee ex VAT" value={fmt(totals.feeExVat)} mono />
        <Stat label="Fee + VAT" value={fmt(totals.grand)} mono />
        <Stat label="Margin" value={`${totals.margin.toFixed(1)}%`} mono />
        <Stat label="Fee % of CC" value={`${totals.feeOfCC.toFixed(2)}%`} mono />
        <Stat label="Save status" value={saving ? "Saving…" : "Auto-saved"} muted />
      </div>

      {/* page nav */}
      <div className="flex border-b border-zinc-200 overflow-x-auto mb-6">
        {PAGES.map(p => {
          const Icon = p.icon;
          return (
            <button key={p.id} onClick={() => setPage(p.id)} data-testid={`fb-page-${p.id}`}
              className={`flex items-center gap-2 px-4 py-3 text-[11px] uppercase tracking-[0.15em] font-semibold border-b-2 transition-colors whitespace-nowrap ${page===p.id ? 'border-[#0A0A0B] text-[#0A0A0B]' : 'border-transparent text-zinc-500 hover:text-[#0A0A0B]'}`}>
              <Icon size={14} weight="bold" /> {p.label}
            </button>
          );
        })}
      </div>

      {page === "details"  && <DetailsPage fb={fb} setDetail={setDetail} totals={totals} />}
      {page === "matrix"   && <MatrixPage fb={fb} setFb={setFb} score={matrixScore} />}
      {page === "roster"   && <RosterPage fb={fb} setFb={setFb} globalStaff={globalStaff} />}
      {page === "team"     && <TeamPage fb={fb} setFb={setFb} stages={allStages} fmt={fmt} />}
      {page === "subs"     && <SubsPage fb={fb} setFb={setFb} stages={allStages} globalSubs={globalSubs} fmt={fmt} />}
      {page === "combined" && <CombinedPage fb={fb} setMul={setMul} totals={totals} stages={allStages} fmt={fmt} />}
      {page === "summary"  && <SummaryPage fb={fb} project={project} totals={totals} score={matrixScore} fmt={fmt} />}
    </div>
  );
};

const Stat = ({ label, value, mono, muted }) => (
  <div className="p-4 border-r border-b last:border-r-0 border-zinc-200">
    <div className="overline mb-1">{label}</div>
    <div className={`${mono ? 'font-mono' : ''} ${muted ? 'text-zinc-500 text-sm' : 'font-display font-bold text-xl tracking-tighter'}`}>{value}</div>
  </div>
);

/* ------------ Page 01 ------------ */
const DetailsPage = ({ fb, setDetail, totals }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
    <FInput label="Typology" v={fb.details.typology} on={v=>setDetail("typology", v)} placeholder="e.g. Healthcare, Mixed-use" />
    <FInput label="Currency" v={fb.details.currency} on={v=>setDetail("currency", v.toUpperCase())} mono />
    <FInput label="GFA (m²)" v={fb.details.gfa} on={v=>setDetail("gfa", parseFloat(v)||0)} type="number" mono />
    <FInput label="Cost per m²" v={fb.details.cost_per_m2} on={v=>setDetail("cost_per_m2", parseFloat(v)||0)} type="number" mono />
    <div className="md:col-span-2 p-4 border border-[#0055FF] bg-[#0055FF]/5">
      <div className="overline mb-1">Construction cost (computed)</div>
      <div className="font-display font-black text-3xl tracking-tighter font-mono">{fb.details.currency} {totals.constructionCost.toLocaleString()}</div>
    </div>
    <FInput label="Project start date" v={fb.details.start_date} on={v=>setDetail("start_date", v)} type="date" />
    <FInput label="Post-contract start" v={fb.details.post_contract_date} on={v=>setDetail("post_contract_date", v)} type="date" />
    <FInput label="Assessed by" v={fb.details.assessed_by} on={v=>setDetail("assessed_by", v)} />
    <FInput label="Reviewed by" v={fb.details.reviewed_by} on={v=>setDetail("reviewed_by", v)} />
  </div>
);

const FInput = ({ label, v, on, type="text", mono, placeholder }) => (
  <div>
    <label className="overline block mb-2">{label}</label>
    <input type={type} value={v ?? ""} onChange={e=>on(e.target.value)} placeholder={placeholder} data-testid={`fb-${label.toLowerCase().replace(/\W+/g,'-')}`}
      className={`w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm ${mono?'font-mono':''}`} />
  </div>
);

/* ------------ Page 02 Matrix ------------ */
const MatrixPage = ({ fb, setFb, score }) => {
  const setRow = (i, k, v) => {
    const arr = [...fb.matrix]; arr[i] = { ...arr[i], [k]: v }; setFb({ ...fb, matrix: arr });
  };
  return (
    <div className="space-y-6 max-w-4xl">
      <div className="border border-zinc-200 p-6">
        <div className="overline mb-2">Prioritization score</div>
        <div className="flex items-end gap-4">
          <div className="font-display text-5xl tracking-tighter font-black font-mono">{score.total}</div>
          <div className="text-sm text-zinc-500 mb-2">/ {score.max}</div>
          <div className="ml-auto">
            <span className={`text-[10px] uppercase tracking-[0.18em] font-mono px-2 py-1 ${score.pct>=70?'bg-[#00C35A]/15 text-[#007A38]':score.pct>=50?'bg-[#FFCC00]/30 text-[#7A5E00]':'bg-[#FF3B30]/15 text-[#B22318]'}`}>
              {score.pct >= 70 ? "GO" : score.pct >= 50 ? "REVIEW" : "DECLINE"}
            </span>
          </div>
        </div>
        <div className="mt-3 h-1 bg-zinc-100">
          <div className="h-full bg-[#0055FF] transition-all" style={{ width: `${score.pct}%` }}/>
        </div>
      </div>
      <table className="w-full border border-zinc-200">
        <thead><tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
          <th className="text-left px-4 py-3 font-semibold">Criterion</th>
          <th className="text-left px-4 py-3 font-semibold w-28">Weight</th>
          <th className="text-left px-4 py-3 font-semibold w-32">Score (0-5)</th>
          <th className="text-right px-4 py-3 font-semibold w-24">Result</th>
        </tr></thead>
        <tbody>
          {fb.matrix.map((m,i) => (
            <tr key={i} className="border-b border-zinc-200 last:border-b-0">
              <td className="px-4 py-3"><input value={m.q} onChange={e=>setRow(i,"q",e.target.value)} className="w-full text-sm bg-transparent" /></td>
              <td className="px-4 py-3"><input type="number" min="1" max="5" value={m.weight} onChange={e=>setRow(i,"weight",parseInt(e.target.value)||0)} className="w-16 px-2 py-1 border border-zinc-300 text-sm font-mono" /></td>
              <td className="px-4 py-3"><input type="number" min="0" max="5" value={m.score} onChange={e=>setRow(i,"score",parseInt(e.target.value)||0)} className="w-16 px-2 py-1 border border-zinc-300 text-sm font-mono" /></td>
              <td className="px-4 py-3 text-right font-mono text-sm">{(m.weight||0) * (m.score||0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

/* ------------ Page 03 Roster ------------ */
const RosterPage = ({ fb, setFb, globalStaff }) => {
  const refMap = useMemo(() => Object.fromEntries(fb.members.map(m => [m.ref_id, m])), [fb.members]);

  const toggleMember = (staff) => {
    const exists = refMap[staff.id];
    if (exists) {
      setFb({ ...fb, members: fb.members.map(m => m.ref_id === staff.id ? { ...m, on: !m.on } : m) });
    } else {
      const newM = {
        id: `m-${staff.id}`, ref_id: staff.id,
        name: staff.staff_name, title: staff.staff_title, dept: staff.staff_dept, group: staff.staff_group,
        cost_rate: staff.cost_rate, on: true, hours: {},
      };
      setFb({ ...fb, members: [...fb.members, newM] });
    }
  };

  const setRate = (refId, val) => {
    setFb({ ...fb, members: fb.members.map(m => m.ref_id === refId ? { ...m, cost_rate: parseFloat(val)||0 } : m) });
  };

  const grouped = useMemo(() => {
    const g = {};
    globalStaff.forEach(s => {
      const k = s.staff_dept || "other";
      if (!g[k]) g[k] = [];
      g[k].push(s);
    });
    return g;
  }, [globalStaff]);

  if (globalStaff.length === 0) return (
    <div className="border border-dashed border-zinc-300 p-12 text-center">
      <IdentificationCard size={32} weight="thin" className="mx-auto mb-3 text-zinc-500"/>
      <div className="font-display text-xl tracking-tighter font-bold mb-1">No staff in your roster yet</div>
      <p className="text-sm text-zinc-500 mb-4">Add employees once globally, then toggle them on/off per project.</p>
      <a href="/settings" className="inline-flex items-center gap-2 px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] transition-colors">
        Go to Settings → Staff Roster
      </a>
    </div>
  );

  const DEPT_LABELS = { arch: "Architecture", int: "Interiors", ca: "Construction Admin", site: "Site / Supervision", struct: "Structural", mep: "MEP", other: "Other" };

  return (
    <div className="space-y-6">
      <div className="text-sm text-zinc-600">Toggle which employees are on this project. Cost rates can be overridden per project.</div>
      {Object.entries(grouped).map(([dept, staffArr]) => (
        <div key={dept}>
          <div className="overline mb-2">{DEPT_LABELS[dept] || dept}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border border-zinc-200">
            {staffArr.map(s => {
              const m = refMap[s.id];
              const active = m?.on;
              return (
                <div key={s.id} className={`p-4 border-r border-b border-zinc-200 ${active?'':'opacity-50'}`} data-testid={`roster-${s.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{s.staff_name}</div>
                      <div className="text-[10px] uppercase tracking-[0.15em] font-mono text-zinc-500">{s.staff_title}</div>
                    </div>
                    <button onClick={()=>toggleMember(s)} data-testid={`toggle-${s.id}`}
                      className={`p-1.5 border ${active?'bg-[#0055FF] text-white border-[#0055FF]':'border-[#0A0A0B]'}`}>
                      <Power size={12} weight="bold"/>
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-mono">Rate</span>
                    {active ? (
                      <input type="number" value={m.cost_rate} onChange={e=>setRate(s.id, e.target.value)}
                        className="w-24 px-2 py-1 border border-zinc-300 text-sm font-mono" />
                    ) : (
                      <span className="font-mono text-sm">{Number(s.cost_rate||0).toLocaleString()}</span>
                    )}
                    <span className="font-mono text-xs text-zinc-500">{s.rate_currency||"USD"}/hr</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

/* ------------ Page 04 Team Resourcing ------------ */
const TeamPage = ({ fb, setFb, stages, fmt }) => {
  const activeMembers = fb.members.filter(m => m.on);
  const setStageOn = (stageList, idx, on) => {
    const arr = [...fb[stageList]]; arr[idx] = { ...arr[idx], on }; setFb({ ...fb, [stageList]: arr });
  };
  const setStageWeeks = (stageList, idx, w) => {
    const arr = [...fb[stageList]]; arr[idx] = { ...arr[idx], weeks: parseFloat(w)||0 }; setFb({ ...fb, [stageList]: arr });
  };
  const setHours = (memberId, stageId, h) => {
    setFb({
      ...fb,
      members: fb.members.map(m => m.id === memberId ? { ...m, hours: { ...m.hours, [stageId]: parseFloat(h)||0 } } : m)
    });
  };

  if (activeMembers.length === 0) return (
    <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
      Activate staff in the <strong>Roster</strong> tab first.
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Stage controls */}
      <div>
        <div className="overline mb-2">Pre-contract stages</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-0 border border-zinc-200">
          {fb.stages_pre.map((s,i) => <StageCard key={s.id} s={s} onToggle={(on)=>setStageOn("stages_pre",i,on)} onWeeks={(w)=>setStageWeeks("stages_pre",i,w)} />)}
        </div>
      </div>
      <div>
        <div className="overline mb-2">Post-contract stages</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-0 border border-zinc-200">
          {fb.stages_post.map((s,i) => <StageCard key={s.id} s={s} onToggle={(on)=>setStageOn("stages_post",i,on)} onWeeks={(w)=>setStageWeeks("stages_post",i,w)} />)}
        </div>
      </div>

      {/* Hours grid */}
      <div className="overflow-x-auto border border-zinc-200">
        <table className="min-w-full text-xs">
          <thead><tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <th className="text-left px-3 py-3 font-semibold sticky left-0 bg-zinc-50 min-w-[200px]">Team member</th>
            <th className="text-right px-3 py-3 font-semibold">Rate</th>
            {stages.filter(s=>s.on).map(s => <th key={s.id} className="text-right px-2 py-3 font-semibold whitespace-nowrap">{s.name}</th>)}
            <th className="text-right px-3 py-3 font-semibold">Total hrs</th>
            <th className="text-right px-3 py-3 font-semibold">Cost</th>
          </tr></thead>
          <tbody>
            {activeMembers.map(m => {
              const totalH = stages.filter(s=>s.on).reduce((sum,s)=>sum+Number(m.hours?.[s.id]||0),0);
              const cost = totalH * Number(m.cost_rate||0);
              return (
                <tr key={m.id} className="border-b border-zinc-200" data-testid={`team-row-${m.id}`}>
                  <td className="px-3 py-2 sticky left-0 bg-white border-r border-zinc-100">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="text-[9px] uppercase tracking-[0.15em] text-zinc-500 font-mono">{m.title}</div>
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{m.cost_rate}</td>
                  {stages.filter(s=>s.on).map(s => (
                    <td key={s.id} className="px-1 py-1">
                      <input type="number" value={m.hours?.[s.id]||0} onChange={e=>setHours(m.id, s.id, e.target.value)}
                        className="w-14 px-1 py-1 border border-zinc-200 text-xs text-right font-mono" />
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono font-semibold">{totalH}</td>
                  <td className="px-3 py-2 text-right font-mono font-semibold">{fmt(cost)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const StageCard = ({ s, onToggle, onWeeks }) => (
  <div className={`p-3 border-r border-b border-zinc-200 ${s.on?'':'opacity-50'}`}>
    <div className="flex items-center justify-between gap-2 mb-2">
      <div className="text-xs font-semibold leading-tight">{s.name}</div>
      <button onClick={()=>onToggle(!s.on)} className={`p-1 border ${s.on?'bg-[#0055FF] text-white border-[#0055FF]':'border-[#0A0A0B]'}`}>
        <Power size={10} weight="bold"/>
      </button>
    </div>
    <div className="flex items-center gap-1 text-xs">
      <input type="number" value={s.weeks} onChange={e=>onWeeks(e.target.value)}
        className="w-14 px-1 py-1 border border-zinc-200 text-xs font-mono" />
      <span className="text-[9px] uppercase tracking-[0.15em] text-zinc-500 font-mono">weeks</span>
    </div>
  </div>
);

/* ------------ Page 05 Subs ------------ */
const SubsPage = ({ fb, setFb, stages, globalSubs, fmt }) => {
  const addSub = (preset) => {
    const newS = preset
      ? { id: `s-${preset.id}`, name: preset.consultant_name, type: (preset.contact_disciplines||[]).join(", "), company: preset.consultant_company, on: true, mgmt_on: true, mgmt_pct: 10, fees: {} }
      : { id: `s-${Date.now()}`, name: "New consultant", type: "", company: "", on: true, mgmt_on: true, mgmt_pct: 10, fees: {} };
    setFb({ ...fb, subs: [...fb.subs, newS] });
  };
  const updateSub = (i, k, v) => { const arr=[...fb.subs]; arr[i]={...arr[i], [k]:v}; setFb({...fb, subs: arr}); };
  const setSubFee = (i, stageId, val) => {
    const arr=[...fb.subs]; arr[i]={...arr[i], fees:{...arr[i].fees, [stageId]: parseFloat(val)||0}}; setFb({...fb, subs: arr});
  };
  const removeSub = (i) => { const arr=[...fb.subs]; arr.splice(i,1); setFb({...fb, subs: arr}); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2 items-center">
        <button onClick={()=>addSub(null)} data-testid="add-sub-btn" className="flex items-center gap-2 px-4 py-2 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF]"><Plus size={12} weight="bold"/> Add consultant</button>
        {globalSubs.length > 0 && <span className="overline">From address book:</span>}
        {globalSubs.slice(0,8).map(c => (
          <button key={c.id} onClick={()=>addSub(c)} className="text-[11px] uppercase tracking-[0.15em] font-mono px-2 py-1 border border-zinc-300 hover:border-[#0055FF] hover:text-[#0055FF]">{c.consultant_name}</button>
        ))}
      </div>
      {fb.subs.length === 0 && <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">No sub-consultants yet. Add one to set per-stage fees.</div>}
      {fb.subs.map((s, i) => {
        const subTotal = stages.filter(st=>st.on).reduce((sum,st)=>sum+Number(s.fees?.[st.id]||0),0);
        const mgmt = s.mgmt_on ? subTotal * (Number(s.mgmt_pct||0)/100) : 0;
        return (
          <div key={s.id} className={`border border-zinc-200 p-4 ${s.on?'':'opacity-50'}`} data-testid={`sub-${s.id}`}>
            <div className="flex flex-wrap items-end gap-3 mb-3">
              <div className="flex-1 min-w-[200px]">
                <label className="overline block mb-1">Name</label>
                <input value={s.name} onChange={e=>updateSub(i,"name",e.target.value)} className="w-full px-2 py-1 border border-zinc-300 text-sm" />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className="overline block mb-1">Discipline / type</label>
                <input value={s.type} onChange={e=>updateSub(i,"type",e.target.value)} className="w-full px-2 py-1 border border-zinc-300 text-sm" />
              </div>
              <div className="flex-1 min-w-[160px]">
                <label className="overline block mb-1">Company</label>
                <input value={s.company} onChange={e=>updateSub(i,"company",e.target.value)} className="w-full px-2 py-1 border border-zinc-300 text-sm" />
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={s.on} onChange={e=>updateSub(i,"on",e.target.checked)} /> Active
              </label>
              <button onClick={()=>removeSub(i)} className="p-2 border border-[#0A0A0B] hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30]"><Trash size={12} weight="bold"/></button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-xs">
                <thead><tr className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
                  {stages.filter(st=>st.on).map(st => <th key={st.id} className="text-right px-2 py-2 font-semibold whitespace-nowrap">{st.name}</th>)}
                  <th className="text-right px-2 py-2 font-semibold">Sub total</th>
                </tr></thead>
                <tbody>
                  <tr>
                    {stages.filter(st=>st.on).map(st => (
                      <td key={st.id} className="px-1 py-1">
                        <input type="number" value={s.fees?.[st.id]||0} onChange={e=>setSubFee(i, st.id, e.target.value)}
                          className="w-24 px-1 py-1 border border-zinc-200 text-xs text-right font-mono" />
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right font-mono font-semibold">{fmt(subTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-200">
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={s.mgmt_on} onChange={e=>updateSub(i,"mgmt_on",e.target.checked)} /> Add management fee
              </label>
              <input type="number" value={s.mgmt_pct} onChange={e=>updateSub(i,"mgmt_pct",parseFloat(e.target.value)||0)} disabled={!s.mgmt_on}
                className="w-16 px-2 py-1 border border-zinc-300 text-xs font-mono" />
              <span className="text-xs text-zinc-500">% → {fmt(mgmt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ------------ Page 06 Combined ------------ */
const CombinedPage = ({ fb, setMul, totals, stages, fmt }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div>
        <label className="overline block mb-2">Mgmt fee on subs %</label>
        <input type="number" value={fb.multipliers.mgmt_pct} onChange={e=>setMul("mgmt_pct", e.target.value)} data-testid="mgmt-pct"
          className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
      </div>
      <div>
        <label className="overline block mb-2">Contingency %</label>
        <input type="number" value={fb.multipliers.contingency_pct} onChange={e=>setMul("contingency_pct", e.target.value)} data-testid="cont-pct"
          className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
      </div>
      <div>
        <label className="overline block mb-2">VAT %</label>
        <input type="number" value={fb.multipliers.vat_pct} onChange={e=>setMul("vat_pct", e.target.value)} data-testid="vat-pct"
          className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
      </div>
    </div>

    <div className="border border-zinc-200">
      <Row label="Edge total (internal staff)" value={fmt(totals.edgeTotal)} />
      <Row label="Sub-consultant fees (raw)" value={fmt(totals.subRaw)} />
      <Row label={`Mgmt on subs`} value={fmt(totals.mgmtOnSubs)} />
      <Row label="Pre-contingency total" value={fmt(totals.preCont)} bold />
      <Row label={`Contingency (${fb.multipliers.contingency_pct}%)`} value={fmt(totals.cont)} />
      <Row label="Fee ex VAT" value={fmt(totals.feeExVat)} bold big />
      <Row label={`VAT (${fb.multipliers.vat_pct}%)`} value={fmt(totals.vat)} />
      <Row label="GRAND TOTAL" value={fmt(totals.grand)} bold big highlight />
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="border border-zinc-200 p-6">
        <div className="overline mb-2">Profit margin</div>
        <div className="font-display font-black text-4xl tracking-tighter font-mono mb-2">{totals.margin.toFixed(1)}%</div>
        <div className="h-2 bg-zinc-100">
          <div className={`h-full transition-all ${totals.margin>=30?'bg-[#00C35A]':totals.margin>=15?'bg-[#FFCC00]':'bg-[#FF3B30]'}`} style={{ width: `${Math.min(Math.max(totals.margin,0), 100)}%` }}/>
        </div>
      </div>
      <div className="border border-zinc-200 p-6">
        <div className="overline mb-2">Fee % of construction cost</div>
        <div className="font-display font-black text-4xl tracking-tighter font-mono mb-2">{totals.feeOfCC.toFixed(2)}%</div>
        <p className="text-xs text-zinc-500">Industry benchmark for AEC: 6-12% on full design + supervision.</p>
      </div>
    </div>
  </div>
);

const Row = ({ label, value, bold, big, highlight }) => (
  <div className={`flex items-center justify-between p-4 border-b border-zinc-200 last:border-b-0 ${highlight?'bg-[#0055FF] text-white':''}`}>
    <div className={`${bold?'font-semibold':''} ${big?'text-base':'text-sm'}`}>{label}</div>
    <div className={`font-mono ${bold?'font-bold':''} ${big?'text-2xl':'text-sm'}`}>{value}</div>
  </div>
);

/* ------------ Page 07 Summary ------------ */
const SummaryPage = ({ fb, project, totals, score, fmt }) => (
  <div className="space-y-6">
    <div className="border border-[#0A0A0B] p-8">
      <div className="overline mb-2">Proposal summary</div>
      <h2 className="font-display text-3xl tracking-tighter font-black mb-4">{project.title}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <Field2 label="Client" value={project.client_name||"—"} />
        <Field2 label="Typology" value={fb.details.typology||"—"} />
        <Field2 label="GFA" value={`${Number(fb.details.gfa||0).toLocaleString()} m²`} />
        <Field2 label="Construction cost" value={fmt(totals.constructionCost)} />
        <Field2 label="Score" value={`${score.total}/${score.max} · ${score.pct.toFixed(0)}%`} />
        <Field2 label="Assessed by" value={fb.details.assessed_by||"—"} />
        <Field2 label="Reviewed by" value={fb.details.reviewed_by||"—"} />
        <Field2 label="Currency" value={fb.details.currency} mono />
      </div>
    </div>
    <div className="grid grid-cols-2 md:grid-cols-4 border border-zinc-200">
      <Stat label="Edge fee" value={fmt(totals.edgeTotal)} mono />
      <Stat label="Sub fees" value={fmt(totals.subRaw + totals.mgmtOnSubs)} mono />
      <Stat label="Total ex VAT" value={fmt(totals.feeExVat)} mono />
      <Stat label="Margin" value={`${totals.margin.toFixed(1)}%`} mono />
    </div>
    <p className="text-xs text-zinc-500">Use the project header buttons (Export PDF / Export Excel) to download a print-ready proposal.</p>
  </div>
);

const Field2 = ({ label, value, mono }) => (
  <div>
    <div className="overline mb-1">{label}</div>
    <div className={`text-sm font-medium ${mono?'font-mono':''}`}>{value}</div>
  </div>
);

export default FeeBuilder;
