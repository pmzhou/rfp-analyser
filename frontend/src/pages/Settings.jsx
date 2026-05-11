import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import Layout from "@/components/Layout";
import { toast } from "sonner";
import { EnvelopeSimple, Robot, Books, Receipt, Users as UsersIcon, IdentificationCard, FloppyDisk, Plus, Trash, PaperPlaneRight, ArrowLeft, Sliders, ShieldCheck, Calculator } from "@phosphor-icons/react";
import { Link } from "react-router-dom";
import { usePrefs } from "@/contexts/PrefsContext";

const TABS = [
  { id: "prefs", label: "Preferences", icon: Sliders },
  { id: "smtp", label: "SMTP", icon: EnvelopeSimple },
  { id: "llm", label: "LLM Models", icon: Robot },
  { id: "requirements", label: "Requirements Library", icon: Books },
  { id: "fees", label: "Fee Templates", icon: Receipt },
  { id: "fee_methods", label: "Fee Methods", icon: Calculator },
  { id: "staff", label: "Staff Roster", icon: IdentificationCard },
  { id: "contacts", label: "Address Book", icon: UsersIcon },
  { id: "nda", label: "NDA Templates", icon: ShieldCheck },
];

const Settings = () => {
  const [tab, setTab] = useState("prefs");
  return (
    <Layout>
      <section className="border-b border-zinc-200">
        <div className="px-6 lg:px-10 py-10 max-w-[1600px]">
          <Link to="/dashboard" className="inline-flex items-center gap-1 text-[11px] uppercase tracking-[0.2em] text-zinc-500 hover:text-[#0A0A0B] mb-6" data-testid="settings-back">
            <ArrowLeft size={12} weight="bold"/> Back
          </Link>
          <div className="overline mb-3">Workspace / Settings</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black leading-none">Settings.</h1>
        </div>
        <div className="px-6 lg:px-10 max-w-[1600px] flex border-t border-zinc-200 overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button key={t.id} onClick={()=>setTab(t.id)} data-testid={`settings-tab-${t.id}`}
                className={`flex items-center gap-2 px-5 py-3 text-[11px] uppercase tracking-[0.18em] font-semibold border-b-2 transition-colors whitespace-nowrap ${tab===t.id ? 'border-[#0A0A0B] text-[#0A0A0B]' : 'border-transparent text-zinc-500 hover:text-[#0A0A0B]'}`}>
                <Icon size={14} weight="bold" /> {t.label}
              </button>
            );
          })}
        </div>
      </section>
      <section className="px-6 lg:px-10 py-10 max-w-[1600px]">
        {tab === "prefs" && <PrefsTab />}
        {tab === "smtp" && <SMTPTab />}
        {tab === "llm" && <LLMTab />}
        {tab === "requirements" && <LibraryTab type="requirement" />}
        {tab === "fees" && <LibraryTab type="fee_template" />}
        {tab === "fee_methods" && <FeeMethodsDefaultsTab />}
        {tab === "staff" && <LibraryTab type="staff" />}
        {tab === "contacts" && <LibraryTab type="contact" />}
        {tab === "nda" && <NdaTemplatesTab />}
      </section>
    </Layout>
  );
};

// ---------- Preferences ---------- //
const CURRENCIES = ["AED","USD","EUR","GBP","SAR","SGD","AUD","CAD","INR","JPY","CHF","CNY"];

const PrefsTab = () => {
  const { refresh } = usePrefs();
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/settings").then(r => setS(r.data)); }, []);

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings", {
        default_currency: s.default_currency || "AED",
        date_format: s.date_format || "dd/mm/yyyy",
      });
      await refresh();
      toast.success("Preferences saved");
    } catch (e) { toast.error("Failed to save"); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-zinc-500 font-mono text-sm">Loading…</div>;

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="overline mb-2">Workspace · Preferences</div>
        <p className="text-sm text-zinc-600 max-w-xl">Defaults applied across new projects, the Fee Builder, and exports.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="overline block mb-2">Default currency</label>
          <select value={s.default_currency || "AED"} onChange={e=>setS({...s, default_currency: e.target.value})} data-testid="pref-currency"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white font-mono">
            {CURRENCIES.map(c => <option key={c}>{c}</option>)}
          </select>
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">UAE Dirham = AED. Use the new official symbol د.إ in PDF/Excel exports if your font supports it.</p>
        </div>
        <div>
          <label className="overline block mb-2">Date format</label>
          <select value={s.date_format || "dd/mm/yyyy"} onChange={e=>setS({...s, date_format: e.target.value})} data-testid="pref-date-format"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white font-mono">
            <option value="dd/mm/yyyy">dd/mm/yyyy (UK / EU / UAE)</option>
            <option value="mm/dd/yyyy">mm/dd/yyyy (US)</option>
            <option value="yyyy-mm-dd">yyyy-mm-dd (ISO)</option>
          </select>
        </div>
      </div>
      <div className="pt-3 border-t border-zinc-200">
        <button onClick={save} disabled={busy} data-testid="pref-save-btn"
          className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
          <FloppyDisk size={14} weight="bold"/> {busy ? "Saving…" : "Save preferences"}
        </button>
      </div>
    </div>
  );
};

// ---------- SMTP ---------- //
const SMTPTab = () => {
  const [s, setS] = useState(null);
  const [pwd, setPwd] = useState(null);     // null=keep, ""=clear, "x"=set new
  const [busy, setBusy] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => { api.get("/settings").then(r => { setS(r.data); setTestTo(r.data?.smtp_from_email || ""); }); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        smtp_host: s.smtp_host || "",
        smtp_port: Number(s.smtp_port) || 587,
        smtp_username: s.smtp_username || "",
        smtp_password: pwd,                // null=keep
        smtp_use_tls: s.smtp_use_tls !== false,
        smtp_from_name: s.smtp_from_name || "",
        smtp_from_email: s.smtp_from_email || "",
      };
      const { data } = await api.put("/settings", payload);
      setS(data); setPwd(null);
      toast.success("SMTP settings saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save"); }
    finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (!testTo) return toast.error("Enter recipient email");
    setBusy(true);
    try { await api.post("/settings/test-email", { to_email: testTo }); toast.success("Test email sent"); }
    catch (e) { toast.error(e?.response?.data?.detail || "Test failed"); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-zinc-500 font-mono text-sm">Loading…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="overline mb-2">Email · SMTP</div>
        <p className="text-sm text-zinc-600 max-w-xl">Configure any SMTP-compatible provider (Mailjet, SendGrid, AWS SES, custom). Passwords are encrypted at rest.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Host" testid="smtp-host" value={s.smtp_host||""} onChange={v=>setS({...s,smtp_host:v})} placeholder="in-v3.mailjet.com" />
        <Field label="Port" testid="smtp-port" value={s.smtp_port??587} onChange={v=>setS({...s,smtp_port:v})} type="number" />
        <Field label="Username (API key)" testid="smtp-username" value={s.smtp_username||""} onChange={v=>setS({...s,smtp_username:v})} />
        <div>
          <label className="overline block mb-2">Password (API secret)</label>
          <input type="password" placeholder={s.smtp_password_mask || "—"} value={pwd ?? ""} onChange={e=>setPwd(e.target.value)} data-testid="smtp-password"
            className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm font-mono" />
          {pwd === null && s.smtp_password_mask && <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">Saved: {s.smtp_password_mask}</p>}
          {pwd !== null && <button type="button" onClick={()=>setPwd(null)} className="text-[10px] uppercase tracking-[0.18em] text-[#0055FF] mt-1">Cancel change</button>}
        </div>
        <Field label="From name" testid="smtp-from-name" value={s.smtp_from_name||""} onChange={v=>setS({...s,smtp_from_name:v})} placeholder="Acme RFP Team" />
        <Field label="From email" testid="smtp-from-email" value={s.smtp_from_email||""} onChange={v=>setS({...s,smtp_from_email:v})} type="email" placeholder="rfp@firm.com" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.smtp_use_tls !== false} onChange={e=>setS({...s,smtp_use_tls:e.target.checked})} data-testid="smtp-tls" />
          <span>Use STARTTLS (recommended for port 587)</span>
        </label>
      </div>
      <div className="flex gap-2 pt-3 border-t border-zinc-200">
        <button onClick={save} disabled={busy} data-testid="smtp-save-btn"
          className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
          <FloppyDisk size={14} weight="bold"/> {busy ? "Saving…" : "Save SMTP"}
        </button>
        <input value={testTo} onChange={e=>setTestTo(e.target.value)} placeholder="recipient@example.com" data-testid="smtp-test-to"
          className="flex-1 max-w-xs px-3 py-3 border border-[#0A0A0B] text-sm" />
        <button onClick={sendTest} disabled={busy || !s.smtp_host} data-testid="smtp-send-test"
          className="flex items-center gap-2 px-5 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] hover:text-white disabled:opacity-50 transition-colors">
          <PaperPlaneRight size={14} weight="bold"/> Send test
        </button>
      </div>
    </div>
  );
};

// ---------- LLM ---------- //
const LLMTab = () => {
  const [s, setS] = useState(null);
  const [key, setKey] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/settings").then(r => setS(r.data)); }, []);

  const PROVIDERS = {
    anthropic: ["claude-sonnet-4-5-20250929","claude-haiku-4-5-20251001","claude-opus-4-5-20251101","claude-sonnet-4-6","claude-opus-4-6"],
    openai:    ["gpt-5.2","gpt-5.1","gpt-5","gpt-5-mini","gpt-4.1","gpt-4o","o3"],
    gemini:    ["gemini-3.1-pro-preview","gemini-3-flash-preview","gemini-2.5-pro","gemini-2.5-flash"],
    ollama:    ["llama3.1","llama3.2","mistral","mixtral","qwen2.5","qwen2.5-coder","gemma3","phi4","deepseek-r1"],
    custom:    [],
  };

  const PROVIDER_HINTS = {
    ollama: "Default: http://localhost:11434/v1 — make sure Ollama is running and the model is pulled (`ollama pull llama3.1`).",
    custom: "Any OpenAI-compatible endpoint: vLLM, LM Studio, Together, Groq, OpenRouter, etc. Provide Base URL + (if required) API key.",
  };

  const isLocal = !!s && (s.llm_provider === "ollama" || s.llm_provider === "custom");

  const save = async () => {
    setBusy(true);
    try {
      const { data } = await api.put("/settings", {
        llm_provider: s.llm_provider || "anthropic",
        llm_model: s.llm_model || "",
        llm_api_key: key,
        llm_base_url: s.llm_base_url || "",
      });
      setS(data); setKey(null);
      toast.success("LLM settings saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  if (!s) return <div className="text-zinc-500 font-mono text-sm">Loading…</div>;
  const provider = s.llm_provider || "anthropic";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <div className="overline mb-2">LLM · Model selection</div>
        <p className="text-sm text-zinc-600 max-w-xl">Default uses your Emergent Universal LLM key. Provide your own API key (Anthropic / OpenAI / Gemini), or point at a custom OpenAI-compatible endpoint (Ollama, vLLM, LM Studio) for a local model.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="overline block mb-2">Provider</label>
          <select value={provider} onChange={e=>{
              const p = e.target.value;
              const baseUrl = p === "ollama" ? "http://localhost:11434/v1" : (p === "custom" ? "" : "");
              setS({...s, llm_provider: p, llm_model: (PROVIDERS[p] && PROVIDERS[p][0]) || "", llm_base_url: baseUrl});
            }} data-testid="llm-provider"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white">
            <option value="anthropic">Anthropic (Claude)</option>
            <option value="openai">OpenAI (GPT)</option>
            <option value="gemini">Google (Gemini)</option>
            <option value="ollama">Ollama (local)</option>
            <option value="custom">Custom (OpenAI-compatible)</option>
          </select>
        </div>
        <div>
          <label className="overline block mb-2">Model</label>
          {isLocal && provider === "custom" ? (
            <input value={s.llm_model || ""} onChange={e=>setS({...s, llm_model: e.target.value})} data-testid="llm-model"
              placeholder="e.g. mistral-small or your-model-id"
              className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
          ) : (
            <input list={`models-${provider}`} value={s.llm_model || ""} onChange={e=>setS({...s, llm_model: e.target.value})} data-testid="llm-model"
              className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
          )}
          <datalist id={`models-${provider}`}>
            {(PROVIDERS[provider] || []).map(m => <option key={m} value={m} />)}
          </datalist>
          {isLocal && <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">Free-text — type any model you have locally.</p>}
        </div>
        <div className={isLocal ? "" : "md:col-span-1"}>
          <label className="overline block mb-2">API Key</label>
          <input type="password" placeholder={s.llm_api_key_mask || (isLocal ? "Optional for local LLMs" : "(using Emergent Universal key)")}
            value={key ?? ""} onChange={e=>setKey(e.target.value)} data-testid="llm-api-key"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">
            {key === null ? (s.llm_api_key_mask ? `Saved: ${s.llm_api_key_mask}` : (isLocal ? "Most local LLMs don't require a key" : "Leave blank to use Emergent Universal key")) : <span className="text-[#0055FF]">New key will be saved</span>}
          </p>
        </div>
        {isLocal && (
          <Field label="Base URL (OpenAI-compatible)" testid="llm-base-url" value={s.llm_base_url||""} onChange={v=>setS({...s, llm_base_url:v})} placeholder={provider==="ollama"?"http://localhost:11434/v1":"https://api.your-host.com/v1"} />
        )}
        {isLocal && PROVIDER_HINTS[provider] && (
          <div className="md:col-span-2 p-3 border-l-2 border-[#0055FF] bg-[#0055FF]/5 text-xs leading-relaxed">
            <span className="overline mr-2">Tip</span>{PROVIDER_HINTS[provider]}
          </div>
        )}
      </div>
      <div className="flex gap-2 pt-3 border-t border-zinc-200">
        <button onClick={save} disabled={busy} data-testid="llm-save-btn"
          className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
          <FloppyDisk size={14} weight="bold"/> {busy ? "Saving…" : "Save LLM"}
        </button>
      </div>
    </div>
  );
};

// ---------- Library (requirements / fee_template / contact) ---------- //
const LibraryTab = ({ type }) => {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/library?type=${type}`); setItems(data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [type]);

  const blank = type === "requirement"
    ? { type, category: "", requirement: "", mandatory: false, auto_inject: false }
    : type === "fee_template"
    ? { type, discipline: "", fee_format: "lump sum", base_fee: 0, currency: "USD", template_notes: "" }
    : { type, consultant_name: "", consultant_email: "", consultant_company: "", contact_disciplines: [] };

  const save = async () => {
    try {
      if (draft.id) await api.put(`/library/${draft.id}`, draft);
      else await api.post("/library", draft);
      setDraft(null);
      await load();
      toast.success("Saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this item?")) return;
    try { await api.delete(`/library/${id}`); setItems(items.filter(i=>i.id!==id)); }
    catch { toast.error("Failed"); }
  };

  const titleMap = { requirement: "Custom Requirements", fee_template: "Fee Templates", staff: "Staff Roster", contact: "Sub-consultant Address Book" };
  const descMap = {
    requirement: "Boilerplate or firm-specific requirements. Toggle 'Auto-inject' to make Claude check every new RFP for these.",
    fee_template: "Save fee structures per discipline. Pre-fills sub-consultant invites.",
    staff: "Global employee roster used by the Fee Builder. Add employees once, toggle on/off per project.",
    contact: "Reusable contacts. Pick from this list when creating invites.",
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="overline mb-2">Library</div>
          <h2 className="font-display text-3xl tracking-tighter font-black">{titleMap[type]}</h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">{descMap[type]}</p>
        </div>
        <button onClick={()=>setDraft(blank)} data-testid={`add-${type}-btn`}
          className="flex items-center gap-2 px-5 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] transition-colors">
          <Plus size={14} weight="bold"/> Add
        </button>
      </div>

      {draft && (
        <div className="border border-[#0A0A0B] p-6 space-y-4" data-testid={`${type}-form`}>
          {type === "requirement" && (
            <>
              <Field label="Category" testid="req-category" value={draft.category} onChange={v=>setDraft({...draft, category: v})} placeholder="e.g. Insurance" />
              <div>
                <label className="overline block mb-2">Requirement</label>
                <textarea rows={3} value={draft.requirement} onChange={e=>setDraft({...draft, requirement: e.target.value})} data-testid="req-text"
                  className="w-full px-3 py-3 border border-[#0A0A0B] text-sm" />
              </div>
              <div className="flex flex-wrap gap-6">
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.mandatory} onChange={e=>setDraft({...draft, mandatory: e.target.checked})} data-testid="req-mandatory" /> Mandatory</label>
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!draft.auto_inject} onChange={e=>setDraft({...draft, auto_inject: e.target.checked})} data-testid="req-autoinject" /> Auto-inject into every new analysis</label>
              </div>
            </>
          )}
          {type === "fee_template" && (
            <>
              <Field label="Discipline" testid="fee-discipline" value={draft.discipline} onChange={v=>setDraft({...draft, discipline: v})} />
              <div>
                <label className="overline block mb-2">Fee format</label>
                <select value={draft.fee_format} onChange={e=>setDraft({...draft, fee_format: e.target.value})} data-testid="fee-format"
                  className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white">
                  {["lump sum","hourly","per-deliverable","mixed"].map(o=><option key={o}>{o}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Base fee" testid="fee-base" type="number" value={draft.base_fee} onChange={v=>setDraft({...draft, base_fee: parseFloat(v)||0})} />
                <Field label="Currency" testid="fee-currency" value={draft.currency} onChange={v=>setDraft({...draft, currency: v.toUpperCase()})} />
              </div>
              <div>
                <label className="overline block mb-2">Notes / breakdown</label>
                <textarea rows={3} value={draft.template_notes} onChange={e=>setDraft({...draft, template_notes: e.target.value})} data-testid="fee-notes"
                  className="w-full px-3 py-3 border border-[#0A0A0B] text-sm" />
              </div>
            </>
          )}
          {type === "contact" && (
            <>
              <Field label="Name" testid="contact-name" value={draft.consultant_name} onChange={v=>setDraft({...draft, consultant_name: v})} />
              <Field label="Email" testid="contact-email" type="email" value={draft.consultant_email} onChange={v=>setDraft({...draft, consultant_email: v})} />
              <Field label="Company" testid="contact-company" value={draft.consultant_company} onChange={v=>setDraft({...draft, consultant_company: v})} />
              <Field label="Disciplines (comma-separated)" testid="contact-disciplines"
                value={(draft.contact_disciplines||[]).join(", ")}
                onChange={v=>setDraft({...draft, contact_disciplines: v.split(",").map(s=>s.trim()).filter(Boolean)})}
                placeholder="Structural, MEP" />
            </>
          )}
          {type === "staff" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Name" testid="staff-name" value={draft.staff_name} onChange={v=>setDraft({...draft, staff_name: v})} />
              <Field label="Title" testid="staff-title" value={draft.staff_title} onChange={v=>setDraft({...draft, staff_title: v})} placeholder="e.g. Senior Architect" />
              <div>
                <label className="overline block mb-2">Department</label>
                <select value={draft.staff_dept} onChange={e=>setDraft({...draft, staff_dept: e.target.value})} data-testid="staff-dept"
                  className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white">
                  <option value="arch">Architecture</option>
                  <option value="int">Interiors</option>
                  <option value="ca">Construction Administration</option>
                  <option value="site">Site / Supervision</option>
                  <option value="struct">Structural</option>
                  <option value="mep">MEP</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <Field label="Group" testid="staff-group" value={draft.staff_group} onChange={v=>setDraft({...draft, staff_group: v})} placeholder="Directors / Senior / Mid / Junior" />
              <Field label="Cost rate per hour" testid="staff-rate" type="number" value={draft.cost_rate} onChange={v=>setDraft({...draft, cost_rate: parseFloat(v)||0})} />
              <Field label="Currency" testid="staff-currency" value={draft.rate_currency} onChange={v=>setDraft({...draft, rate_currency: v.toUpperCase()})} />
              <label className="md:col-span-2 flex items-center gap-2 text-sm">
                <input type="checkbox" checked={draft.active!==false} onChange={e=>setDraft({...draft, active: e.target.checked})} data-testid="staff-active" /> Active in roster
              </label>
            </div>
          )}
          <div className="flex gap-2 pt-2 border-t border-zinc-200">
            <button onClick={save} data-testid="library-save-btn" className="px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] transition-colors">Save</button>
            <button onClick={()=>setDraft(null)} className="px-5 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-zinc-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">No items yet.</div>
      ) : (
        <div className="border border-zinc-200">
          {items.map((i,idx) => (
            <div key={i.id} className={`p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start ${idx<items.length-1?'border-b border-zinc-200':''}`} data-testid={`library-item-${i.id}`}>
              {type === "requirement" && (
                <>
                  <div className="lg:col-span-2"><div className="overline mb-1">Category</div><div className="text-sm font-medium">{i.category||"—"}</div></div>
                  <div className="lg:col-span-7"><div className="overline mb-1">Requirement</div><div className="text-sm">{i.requirement}</div></div>
                  <div className="lg:col-span-2 flex flex-wrap gap-2">
                    {i.mandatory && <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#FF3B30] text-white">Mandatory</span>}
                    {i.auto_inject && <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#0055FF] text-white">Auto-inject</span>}
                  </div>
                </>
              )}
              {type === "fee_template" && (
                <>
                  <div className="lg:col-span-3"><div className="overline mb-1">Discipline</div><div className="text-sm font-medium">{i.discipline}</div></div>
                  <div className="lg:col-span-2"><div className="overline mb-1">Format</div><div className="text-sm">{i.fee_format}</div></div>
                  <div className="lg:col-span-2"><div className="overline mb-1">Base fee</div><div className="font-mono text-sm">{i.currency} {Number(i.base_fee||0).toLocaleString()}</div></div>
                  <div className="lg:col-span-4"><div className="overline mb-1">Notes</div><div className="text-xs text-zinc-600">{i.template_notes||"—"}</div></div>
                </>
              )}
              {type === "contact" && (
                <>
                  <div className="lg:col-span-3"><div className="overline mb-1">Name</div><div className="text-sm font-medium">{i.consultant_name}</div></div>
                  <div className="lg:col-span-3"><div className="overline mb-1">Email</div><div className="text-sm">{i.consultant_email}</div></div>
                  <div className="lg:col-span-3"><div className="overline mb-1">Company</div><div className="text-sm">{i.consultant_company||"—"}</div></div>
                  <div className="lg:col-span-2"><div className="overline mb-1">Disciplines</div><div className="text-xs">{(i.contact_disciplines||[]).join(", ")||"—"}</div></div>
                </>
              )}
              {type === "staff" && (
                <>
                  <div className="lg:col-span-3"><div className="overline mb-1">Name</div><div className="text-sm font-medium">{i.staff_name}</div><div className="text-xs text-zinc-500">{i.staff_title||"—"}</div></div>
                  <div className="lg:col-span-2"><div className="overline mb-1">Dept</div><div className="text-xs uppercase tracking-[0.15em] font-mono">{i.staff_dept}</div></div>
                  <div className="lg:col-span-2"><div className="overline mb-1">Group</div><div className="text-sm">{i.staff_group||"—"}</div></div>
                  <div className="lg:col-span-3"><div className="overline mb-1">Rate</div><div className="font-mono text-sm">{i.rate_currency} {Number(i.cost_rate||0).toLocaleString()} /hr</div></div>
                  <div className="lg:col-span-1">{i.active!==false ? <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#00C35A]/15 text-[#007A38]">Active</span> : <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-zinc-100">Off</span>}</div>
                </>
              )}
              <div className="lg:col-span-1 flex justify-end gap-1">
                <button onClick={()=>setDraft(i)} data-testid={`edit-library-${i.id}`} className="px-2 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">Edit</button>
                <button onClick={()=>remove(i.id)} data-testid={`delete-library-${i.id}`} className="p-1.5 border border-[#0A0A0B] hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors">
                  <Trash size={12} weight="bold"/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Field = ({ label, value, onChange, type="text", placeholder, testid }) => (
  <div>
    <label className="overline block mb-2">{label}</label>
    <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} data-testid={testid}
      className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
  </div>
);

// ---------- Fee Methods Defaults ---------- //
const DEFAULT_BENCHMARK_TYPOLOGY = {
  "Residential": 10.0,
  "Healthcare / Lab": 12.0,
  "Commercial / Office": 8.0,
  "Hospitality / F&B": 9.0,
  "Retail": 8.0,
  "Education": 10.0,
  "Industrial": 7.0,
  "Civil / Infra": 6.0,
  "Heritage / Refurb": 13.0,
  "High-rise": 10.0,
  "Mixed-use": 9.0,
  "Other": 9.0,
};
const DEFAULT_SLIDING_SCALE = [
  { limit: 10000000, pct: 8.0 },
  { limit: 30000000, pct: 6.5 },
  { limit: 80000000, pct: 5.0 },
  { limit: 999999999, pct: 3.5 },
];
const DEFAULT_COMPLEXITY_FACTORS = [
  { name: "Healthcare / Laboratory", pct: 40, on: false },
  { name: "Heritage / Refurbishment", pct: 30, on: false },
  { name: "BIM LOD 400+", pct: 15, on: false },
  { name: "Phased / Live-site", pct: 20, on: false },
  { name: "LEED Gold", pct: 3, on: false },
  { name: "LEED Platinum", pct: 5, on: false },
  { name: "Commissioning included", pct: 5, on: false },
];
const PHASE_PRESETS_PREVIEW = {
  traditional: "Traditional · SD 17 / DD 18 / CD 40 / Tender 5 / CA 20",
  bim_led:     "BIM-led · SD 22 / DD 22 / CD 30 / Tender 4 / CA 22",
  aia:         "AIA B101 · SD 15 / DD 20 / CD 40 / Tender 5 / CA 20",
  riba:        "RIBA Plan of Work 2020 · stages 0–7",
};

const FeeMethodsDefaultsTab = () => {
  const [s, setS] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { api.get("/settings").then(r => setS(r.data)); }, []);

  const benchmarks = s?.fee_benchmark_by_typology ?? DEFAULT_BENCHMARK_TYPOLOGY;
  const slabs = (s?.fee_sliding_scale && s.fee_sliding_scale.length) ? s.fee_sliding_scale : DEFAULT_SLIDING_SCALE;
  const factors = (s?.fee_complexity_factors && s.fee_complexity_factors.length) ? s.fee_complexity_factors : DEFAULT_COMPLEXITY_FACTORS;

  const setField = (k, v) => setS({ ...s, [k]: v });
  const setBenchmark = (typology, val) => setField("fee_benchmark_by_typology", { ...benchmarks, [typology]: parseFloat(val) || 0 });
  const addSlab = () => setField("fee_sliding_scale", [...slabs, { limit: 0, pct: 0 }]);
  const setSlab = (idx, k, v) => setField("fee_sliding_scale", slabs.map((sl, i) => i === idx ? { ...sl, [k]: parseFloat(v) || 0 } : sl));
  const removeSlab = (idx) => setField("fee_sliding_scale", slabs.filter((_, i) => i !== idx));
  const addFactor = () => setField("fee_complexity_factors", [...factors, { name: "", pct: 0, on: false }]);
  const setFactor = (idx, k, v) => setField("fee_complexity_factors", factors.map((f, i) => i === idx ? { ...f, [k]: k === "pct" ? (parseFloat(v) || 0) : v } : f));
  const removeFactor = (idx) => setField("fee_complexity_factors", factors.filter((_, i) => i !== idx));

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/settings", {
        fee_benchmark_by_typology: benchmarks,
        fee_phase_preset: s.fee_phase_preset || "traditional",
        fee_overhead_multiplier: Number(s.fee_overhead_multiplier) || 2.85,
        fee_target_margin_pct: Number(s.fee_target_margin_pct) || 20.0,
        fee_lock_to_signing_budget: !!s.fee_lock_to_signing_budget,
        fee_sliding_scale: slabs,
        fee_complexity_factors: factors,
      });
      toast.success("Fee methods saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to save"); }
    finally { setBusy(false); }
  };

  const resetDefaults = () => {
    if (!window.confirm("Reset all fee-method defaults to industry-standard values?")) return;
    setS({
      ...s,
      fee_benchmark_by_typology: DEFAULT_BENCHMARK_TYPOLOGY,
      fee_phase_preset: "traditional",
      fee_overhead_multiplier: 2.85,
      fee_target_margin_pct: 20.0,
      fee_lock_to_signing_budget: false,
      fee_sliding_scale: DEFAULT_SLIDING_SCALE,
      fee_complexity_factors: DEFAULT_COMPLEXITY_FACTORS,
    });
    toast.info("Defaults restored — click Save to persist");
  };

  if (!s) return <div className="text-zinc-500 font-mono text-sm">Loading…</div>;

  return (
    <div className="space-y-8" data-testid="fee-methods-tab">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="overline mb-2">Fee Builder · Methods defaults</div>
          <h2 className="font-display text-3xl tracking-tighter font-black">Fee Methods</h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">Per-typology benchmark percentages, sliding-scale slabs, complexity factors and global multipliers used by Fee Builder → Fee Methods page. AIA B101-2017 lock-to-signing-budget option included.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={resetDefaults} className="px-4 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] hover:text-white transition-colors" data-testid="fee-methods-reset">Reset to defaults</button>
          <button onClick={save} disabled={busy} className="flex items-center gap-2 px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors" data-testid="fee-methods-save">
            <FloppyDisk size={14} weight="bold"/> {busy ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Global multipliers */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div>
          <label className="overline block mb-2">Overhead multiplier</label>
          <input type="number" step="0.05" value={s.fee_overhead_multiplier ?? 2.85} onChange={e=>setField("fee_overhead_multiplier", parseFloat(e.target.value)||0)} data-testid="fee-overhead"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
          <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">ZweigWhite benchmark 2.85–3.10×</p>
        </div>
        <div>
          <label className="overline block mb-2">Target margin %</label>
          <input type="number" step="1" value={s.fee_target_margin_pct ?? 20} onChange={e=>setField("fee_target_margin_pct", parseFloat(e.target.value)||0)} data-testid="fee-target-margin"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm font-mono" />
        </div>
        <div>
          <label className="overline block mb-2">Default phase preset</label>
          <select value={s.fee_phase_preset || "traditional"} onChange={e=>setField("fee_phase_preset", e.target.value)} data-testid="fee-phase-preset"
            className="w-full px-3 py-3 border border-[#0A0A0B] text-sm bg-white">
            {Object.entries(PHASE_PRESETS_PREVIEW).map(([k, label]) => <option key={k} value={k}>{label.split(" · ")[0]}</option>)}
          </select>
          <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate">{PHASE_PRESETS_PREVIEW[s.fee_phase_preset || "traditional"]}</p>
        </div>
        <label className="flex items-start gap-2 text-sm pt-7">
          <input type="checkbox" checked={!!s.fee_lock_to_signing_budget} onChange={e=>setField("fee_lock_to_signing_budget", e.target.checked)} data-testid="fee-lock-budget" className="mt-0.5" />
          <span>Lock fee to budget at contract signing (AIA B101-2017)</span>
        </label>
      </div>

      {/* Benchmark by typology */}
      <div>
        <div className="overline mb-3">Benchmark % by typology</div>
        <div className="border border-zinc-200 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {Object.entries(benchmarks).map(([typ, pct]) => (
            <div key={typ} className="p-3 border-r border-b border-zinc-200">
              <div className="text-xs font-semibold mb-1">{typ}</div>
              <div className="flex items-center gap-1">
                <input type="number" step="0.1" value={pct} onChange={e=>setBenchmark(typ, e.target.value)} data-testid={`bench-${typ.replace(/\W+/g,'-')}`}
                  className="w-full px-2 py-1.5 border border-zinc-300 text-sm font-mono" />
                <span className="text-xs text-zinc-500">%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sliding scale */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="overline mb-1">Sliding-scale slabs</div>
            <p className="text-sm text-zinc-600">Tax-bracket style: each slab applies its % up to its limit, then the next slab handles the rest.</p>
          </div>
          <button onClick={addSlab} className="flex items-center gap-1 px-3 py-2 border border-[#0A0A0B] text-[10px] uppercase tracking-[0.15em] font-semibold hover:bg-[#0A0A0B] hover:text-white transition-colors" data-testid="add-slab-btn">
            <Plus size={12} weight="bold"/> Add slab
          </button>
        </div>
        <table className="w-full border border-zinc-200">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <tr><th className="text-left px-3 py-2">#</th><th className="text-left px-3 py-2">Up to (construction cost)</th><th className="text-left px-3 py-2">Fee %</th><th></th></tr>
          </thead>
          <tbody>
            {slabs.map((sl, i) => (
              <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                <td className="px-3 py-2 font-mono text-xs">{i + 1}</td>
                <td className="px-3 py-2"><input type="number" step="1000" value={sl.limit} onChange={e=>setSlab(i, "limit", e.target.value)} data-testid={`slab-limit-${i}`} className="w-48 px-2 py-1.5 border border-zinc-300 text-sm font-mono" /></td>
                <td className="px-3 py-2"><input type="number" step="0.1" value={sl.pct} onChange={e=>setSlab(i, "pct", e.target.value)} data-testid={`slab-pct-${i}`} className="w-24 px-2 py-1.5 border border-zinc-300 text-sm font-mono" /></td>
                <td className="px-3 py-2 text-right"><button onClick={()=>removeSlab(i)} data-testid={`remove-slab-${i}`} className="p-1.5 border border-zinc-300 hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors"><Trash size={12} weight="bold"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Complexity factors */}
      <div>
        <div className="flex items-end justify-between mb-3">
          <div>
            <div className="overline mb-1">Complexity factors</div>
            <p className="text-sm text-zinc-600">Uplifts applied to the benchmark fee. Toggled per project on the Fee Methods page.</p>
          </div>
          <button onClick={addFactor} className="flex items-center gap-1 px-3 py-2 border border-[#0A0A0B] text-[10px] uppercase tracking-[0.15em] font-semibold hover:bg-[#0A0A0B] hover:text-white transition-colors" data-testid="add-factor-btn">
            <Plus size={12} weight="bold"/> Add factor
          </button>
        </div>
        <table className="w-full border border-zinc-200">
          <thead className="bg-zinc-50 border-b border-zinc-200 text-[10px] uppercase tracking-[0.18em] text-zinc-500">
            <tr><th className="text-left px-3 py-2">Name</th><th className="text-left px-3 py-2 w-32">Uplift %</th><th></th></tr>
          </thead>
          <tbody>
            {factors.map((f, i) => (
              <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                <td className="px-3 py-2"><input value={f.name} onChange={e=>setFactor(i, "name", e.target.value)} data-testid={`factor-name-${i}`} className="w-full px-2 py-1.5 border border-zinc-300 text-sm" /></td>
                <td className="px-3 py-2"><input type="number" step="1" value={f.pct} onChange={e=>setFactor(i, "pct", e.target.value)} data-testid={`factor-pct-${i}`} className="w-24 px-2 py-1.5 border border-zinc-300 text-sm font-mono" /></td>
                <td className="px-3 py-2 text-right"><button onClick={()=>removeFactor(i)} data-testid={`remove-factor-${i}`} className="p-1.5 border border-zinc-300 hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors"><Trash size={12} weight="bold"/></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ---------- NDA Templates ---------- //
const NdaTemplatesTab = () => {
  const [items, setItems] = useState([]);
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get("/library?type=nda_template"); setItems(data); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const newDraft = async (prefill = false) => {
    let nda_text = "";
    if (prefill) {
      try { const { data } = await api.get("/library/nda/builtin"); nda_text = data.nda_text; }
      catch { /* ignore */ }
    }
    setDraft({ type: "nda_template", nda_name: "", nda_text, is_default: items.length === 0 });
  };

  const save = async () => {
    if (!draft.nda_name?.trim()) return toast.error("Please name the template");
    if (!draft.nda_text?.trim()) return toast.error("Template text is empty");
    try {
      if (draft.id) await api.put(`/library/${draft.id}`, draft);
      else await api.post("/library", draft);
      setDraft(null);
      await load();
      toast.success("Saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this NDA template?")) return;
    try { await api.delete(`/library/${id}`); setItems(items.filter(i=>i.id!==id)); toast.success("Deleted"); }
    catch { toast.error("Failed"); }
  };

  const setDefault = async (item) => {
    try {
      await api.put(`/library/${item.id}`, { ...item, is_default: true });
      await load();
      toast.success("Default template set");
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6" data-testid="nda-templates-tab">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="overline mb-2">Library</div>
          <h2 className="font-display text-3xl tracking-tighter font-black">NDA Templates</h2>
          <p className="text-sm text-zinc-600 mt-1 max-w-2xl">Per-user NDA templates used in the EOI → NDA → Full Details flow. The default template is sent automatically when sub-consultants are invited. Placeholders like <code className="font-mono text-xs">{"{{consultant_name}}"}</code>, <code className="font-mono text-xs">{"{{project_title}}"}</code>, <code className="font-mono text-xs">{"{{signing_date}}"}</code> will be replaced at sign time.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>newDraft(false)} data-testid="add-nda-blank-btn"
            className="flex items-center gap-2 px-4 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] hover:text-white transition-colors">
            <Plus size={14} weight="bold"/> Blank
          </button>
          <button onClick={()=>newDraft(true)} data-testid="add-nda-prefill-btn"
            className="flex items-center gap-2 px-4 py-3 bg-[#0A0A0B] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] transition-colors">
            <Plus size={14} weight="bold"/> Use built-in
          </button>
        </div>
      </div>

      {draft && (
        <div className="border border-[#0A0A0B] p-6 space-y-4" data-testid="nda-template-form">
          <Field label="Template name" testid="nda-name" value={draft.nda_name||""} onChange={v=>setDraft({...draft, nda_name: v})} placeholder="e.g. Standard mutual NDA — 2 years" />
          <div>
            <label className="overline block mb-2">Template text</label>
            <textarea rows={18} value={draft.nda_text||""} onChange={e=>setDraft({...draft, nda_text: e.target.value})} data-testid="nda-text"
              className="w-full px-3 py-3 border border-[#0A0A0B] text-xs font-mono leading-relaxed resize-y" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-1">Available placeholders: {"{{owner_name}}"}, {"{{owner_email}}"}, {"{{consultant_name}}"}, {"{{consultant_company}}"}, {"{{consultant_email}}"}, {"{{project_title}}"}, {"{{client_name}}"}, {"{{discipline}}"}, {"{{signing_date}}"}, {"{{signing_ip}}"}.</p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!draft.is_default} onChange={e=>setDraft({...draft, is_default: e.target.checked})} data-testid="nda-is-default" />
            <span>Use as my default NDA template</span>
          </label>
          <div className="flex gap-2 pt-2 border-t border-zinc-200">
            <button onClick={save} data-testid="nda-save-btn" className="px-5 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] transition-colors">Save</button>
            <button onClick={()=>setDraft(null)} className="px-5 py-3 border border-[#0A0A0B] text-xs font-semibold uppercase tracking-[0.15em] hover:bg-zinc-100 transition-colors">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">Loading…</div>
      ) : items.length === 0 ? (
        <div className="border border-dashed border-zinc-300 p-12 text-center text-sm text-zinc-500">
          No custom NDA templates yet — the built-in mutual NDA will be used by default.
        </div>
      ) : (
        <div className="border border-zinc-200">
          {items.map((i, idx) => (
            <div key={i.id} className={`p-5 grid grid-cols-1 lg:grid-cols-12 gap-4 items-start ${idx<items.length-1?'border-b border-zinc-200':''}`} data-testid={`nda-item-${i.id}`}>
              <div className="lg:col-span-3">
                <div className="overline mb-1">Name</div>
                <div className="text-sm font-medium">{i.nda_name||"Untitled"}</div>
              </div>
              <div className="lg:col-span-7">
                <div className="overline mb-1">Preview</div>
                <div className="text-xs text-zinc-600 line-clamp-3 font-mono whitespace-pre-line">{(i.nda_text||"").slice(0, 320)}{(i.nda_text||"").length>320?"…":""}</div>
              </div>
              <div className="lg:col-span-1 flex flex-col gap-1">
                {i.is_default
                  ? <span className="text-[10px] uppercase tracking-[0.15em] font-mono px-2 py-0.5 bg-[#0055FF] text-white text-center" data-testid={`nda-default-${i.id}`}>Default</span>
                  : <button onClick={()=>setDefault(i)} data-testid={`nda-set-default-${i.id}`} className="text-[10px] uppercase tracking-[0.15em] font-semibold px-2 py-0.5 border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">Make default</button>
                }
              </div>
              <div className="lg:col-span-1 flex justify-end gap-1">
                <button onClick={()=>setDraft(i)} data-testid={`edit-nda-${i.id}`} className="px-2 py-1 text-[10px] uppercase tracking-[0.15em] font-semibold border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">Edit</button>
                <button onClick={()=>remove(i.id)} data-testid={`delete-nda-${i.id}`} className="p-1.5 border border-[#0A0A0B] hover:bg-[#FF3B30] hover:text-white hover:border-[#FF3B30] transition-colors">
                  <Trash size={12} weight="bold"/>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Settings;
