import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Buildings, ArrowRight, CheckCircle, Calendar, ShieldCheck, FileText, XCircle } from "@phosphor-icons/react";
import { formatDate } from "@/lib/dates";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

/* ---------- shared chrome ---------- */
const Header = () => (
  <header className="bg-white border-b border-[#0A0A0B]">
    <div className="px-6 lg:px-10 h-16 flex items-center justify-between max-w-[1400px] mx-auto">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-[#0A0A0B] flex items-center justify-center">
          <Buildings size={18} weight="bold" color="#FFFFFF" />
        </div>
        <div className="leading-none">
          <div className="font-display font-black text-base tracking-tighter">RFP/ANALYSER</div>
          <div className="text-[9px] tracking-[0.25em] uppercase text-zinc-500 mt-0.5">Sub-consultant Portal</div>
        </div>
      </div>
    </div>
  </header>
);

const Steps = ({ step }) => {
  const items = [
    { id: 1, label: "EOI" },
    { id: 2, label: "NDA" },
    { id: 3, label: "Full Details" },
  ];
  return (
    <div className="flex items-center gap-2 mb-8" data-testid="respond-steps">
      {items.map((it, idx) => (
        <React.Fragment key={it.id}>
          <div className={`flex items-center gap-2 px-3 py-1.5 border ${step >= it.id ? "border-[#0A0A0B] bg-[#0A0A0B] text-white" : "border-zinc-300 text-zinc-500"}`}>
            <span className="text-[10px] font-mono">{String(it.id).padStart(2,"0")}</span>
            <span className="text-[10px] uppercase tracking-[0.2em] font-semibold">{it.label}</span>
          </div>
          {idx < items.length - 1 && <span className="text-zinc-300">—</span>}
        </React.Fragment>
      ))}
    </div>
  );
};

const Loading = ({ text = "Loading…" }) => (
  <div className="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">{text}</div>
);

/* ---------- step 1: EOI ---------- */
const EoiView = ({ token, eoi, onInterested, onDeclined }) => {
  const [busy, setBusy] = useState(false);
  const [showDecline, setShowDecline] = useState(false);
  const [reason, setReason] = useState("");

  const interested = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/interest`, { interested: true });
      toast.success("Thanks — proceeding to NDA");
      onInterested();
    } catch { toast.error("Could not record interest"); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/interest`, { interested: false, reason });
      toast.success("Recorded — thank you");
      onDeclined();
    } catch { toast.error("Could not record decline"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-8" data-testid="eoi-view">
      <div>
        <div className="overline mb-3">Step 1 / Expression of Interest</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black leading-none mb-2" data-testid="eoi-title">{eoi.project.title}</h1>
        <p className="text-sm text-zinc-600">For: <span className="font-semibold">{eoi.consultant_name}</span> {eoi.consultant_company && `— ${eoi.consultant_company}`}</p>
        <p className="text-sm text-zinc-500 mt-1">Discipline: <span className="font-mono uppercase tracking-[0.18em] text-xs">{eoi.discipline}</span></p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="border border-zinc-200 p-6 bg-white">
            <div className="overline mb-3">Project Summary</div>
            <p className="text-sm leading-relaxed">{eoi.project.summary || "Summary not yet available."}</p>
          </div>
          <div className="border border-zinc-200 p-6 bg-white">
            <div className="overline mb-3">Client</div>
            <p className="text-sm">{eoi.project.client_name || "—"}</p>
          </div>
          {eoi.project.submission_date && (
            <div className="border border-zinc-200 p-6 bg-white">
              <div className="overline mb-3 flex items-center gap-2"><Calendar size={12} weight="bold"/> Submission Date</div>
              <p className="text-sm font-mono">{formatDate(eoi.project.submission_date)}</p>
            </div>
          )}
          <div className="border border-[#0055FF]/20 bg-[#0055FF]/5 p-6">
            <div className="overline mb-2 text-[#0055FF] flex items-center gap-2"><ShieldCheck size={12} weight="bold"/> Confidentiality</div>
            <p className="text-sm text-zinc-700">Full project details, scope, dates and documents will be unlocked only after you sign a brief Non-Disclosure Agreement on the next step.</p>
          </div>
        </div>

        <div className="lg:col-span-1">
          <div className="border border-[#0A0A0B] bg-white p-6 sticky top-8" data-testid="eoi-actions">
            {!showDecline ? (
              <>
                <div className="overline mb-2">Are you interested?</div>
                <p className="text-sm text-zinc-600 mb-4">Confirm interest to view the NDA and full RFP details, or decline politely.</p>
                <button onClick={interested} disabled={busy} data-testid="eoi-interested-btn"
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors mb-2">
                  <span>{busy ? "Saving…" : "Yes, I'm interested"}</span><ArrowRight size={16} weight="bold"/>
                </button>
                <button onClick={()=>setShowDecline(true)} disabled={busy} data-testid="eoi-decline-btn"
                  className="w-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500 hover:text-[#FF3B30] transition-colors">
                  Decline invitation
                </button>
              </>
            ) : (
              <>
                <div className="overline mb-2">Decline invitation</div>
                <p className="text-sm text-zinc-600 mb-3">Optionally let the issuer know why (helps them invite a replacement quickly).</p>
                <textarea rows={4} value={reason} onChange={e=>setReason(e.target.value)} data-testid="eoi-decline-reason"
                  placeholder="e.g. capacity, conflict of interest, timeline…"
                  className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#FF3B30] text-sm resize-none mb-3"/>
                <button onClick={decline} disabled={busy} data-testid="eoi-confirm-decline-btn"
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#FF3B30] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors mb-2">
                  <span>{busy ? "Saving…" : "Confirm decline"}</span><XCircle size={16} weight="bold"/>
                </button>
                <button onClick={()=>setShowDecline(false)} className="w-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500 hover:text-[#0A0A0B] transition-colors">
                  Back
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- step 2: NDA ---------- */
const NdaView = ({ token, eoi, onSigned }) => {
  const [nda, setNda] = useState(null);
  const [typed, setTyped] = useState(eoi.consultant_name || "");
  const [emailConfirm, setEmailConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/invites/${token}/nda`)
      .then(r => setNda(r.data))
      .catch(e => toast.error(e?.response?.data?.detail || "Failed to load NDA"));
  }, [token]);

  const sign = async (e) => {
    e.preventDefault();
    if (!agree) return toast.error("You must tick the agreement box");
    if (!typed.trim()) return toast.error("Please type your full name");
    if (!emailConfirm.trim()) return toast.error("Please confirm your email");
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/nda/sign`, {
        typed_name: typed.trim(),
        email_confirm: emailConfirm.trim(),
        agree,
      });
      toast.success("NDA signed — unlocking project details");
      onSigned();
    } catch (e) { toast.error(e?.response?.data?.detail || "Signing failed"); }
    finally { setBusy(false); }
  };

  if (!nda) return <Loading text="Loading NDA…" />;

  return (
    <div className="space-y-8" data-testid="nda-view">
      <div>
        <div className="overline mb-3">Step 2 / Non-Disclosure Agreement</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black leading-none mb-2">Sign NDA</h1>
        <p className="text-sm text-zinc-600">Required before full RFP details can be shared.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="border border-zinc-200 bg-white p-6" data-testid="nda-text">
            <div className="overline mb-3 flex items-center gap-2"><FileText size={12} weight="bold"/> Agreement text</div>
            <pre className="whitespace-pre-wrap text-xs leading-relaxed font-mono text-zinc-700 max-h-[60vh] overflow-y-auto">{nda.rendered}</pre>
          </div>
        </div>
        <div className="lg:col-span-1">
          <form onSubmit={sign} className="border border-[#0A0A0B] bg-white p-6 sticky top-8 space-y-4" data-testid="nda-form">
            <div>
              <div className="overline mb-1">Sign electronically</div>
              <p className="text-xs text-zinc-500 mt-1">Your typed name + email serve as a legally binding signature.</p>
            </div>
            <div>
              <label className="overline block mb-2">Full legal name</label>
              <input value={typed} onChange={e=>setTyped(e.target.value)} required data-testid="nda-typed-name"
                className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm font-mono" />
            </div>
            <div>
              <label className="overline block mb-2">Email confirmation</label>
              <input type="email" value={emailConfirm} onChange={e=>setEmailConfirm(e.target.value)} required data-testid="nda-email"
                placeholder="your@email.com"
                className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm font-mono" />
            </div>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={agree} onChange={e=>setAgree(e.target.checked)} data-testid="nda-agree" className="mt-0.5" />
              <span>I have read and agree to the terms above. I am authorised to sign on behalf of my company.</span>
            </label>
            <button type="submit" disabled={busy || !agree} data-testid="nda-sign-btn"
              className="w-full flex items-center justify-between px-4 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
              <span>{busy ? "Signing…" : "Sign NDA & continue"}</span><ShieldCheck size={16} weight="bold"/>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

/* ---------- step 3: Full details + fee form ---------- */
const DetailsView = ({ token }) => {
  const [data, setData] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ fee: "", currency: "USD", notes: "", timeline: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/invites/${token}/details`)
      .then(r => {
        setData(r.data);
        if (["submitted","declined"].includes(r.data.invite.status)) setSubmitted(true);
      })
      .catch(e => toast.error(e?.response?.data?.detail || "Failed to load details"));
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (!form.fee || isNaN(Number(form.fee))) return toast.error("Please enter a valid fee");
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/respond`, {
        fee: Number(form.fee), currency: form.currency, notes: form.notes, timeline: form.timeline, status: "submitted"
      });
      setSubmitted(true);
      toast.success("Response submitted");
    } catch (e) { toast.error(e?.response?.data?.detail || "Submission failed"); }
    finally { setBusy(false); }
  };

  const declineHere = async () => {
    if (!window.confirm("Decline at this stage? The issuer will be notified.")) return;
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/respond`, { fee: 0, currency: form.currency, notes: form.notes, timeline: "", status: "declined" });
      setSubmitted(true);
      toast.success("Invite declined");
    } catch { toast.error("Failed"); } finally { setBusy(false); }
  };

  if (!data) return <Loading text="Loading project details…" />;
  const { invite, project } = data;
  const d = project.discipline;

  return (
    <div className="space-y-8" data-testid="details-view">
      <div>
        <div className="overline mb-3">Step 3 / Full Details &amp; Fee</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black leading-none mb-2">{project.title}</h1>
        <p className="text-sm text-zinc-600">Client: {project.client_name || "—"}</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-8">
          {project.summary && (
            <div className="border border-zinc-200 p-6 bg-white">
              <div className="overline mb-3">Project Summary</div>
              <p className="text-sm leading-relaxed">{project.summary}</p>
            </div>
          )}

          {d && (
            <div className="border border-[#0055FF] p-6 bg-white">
              <div className="overline mb-3 text-[#0055FF]">Your Discipline / {d.name}</div>
              {d.description && <p className="text-sm leading-relaxed mb-3"><span className="font-semibold">Description: </span>{d.description}</p>}
              {d.scope_summary && <p className="text-sm leading-relaxed"><span className="font-semibold">Scope: </span>{d.scope_summary}</p>}
            </div>
          )}

          {project.scope?.length > 0 && (
            <div>
              <div className="overline mb-3">Project Scope</div>
              <ul className="border-t border-zinc-200">
                {project.scope.map((s, i) => (
                  <li key={i} className="flex gap-4 py-3 border-b border-zinc-200 text-sm">
                    <span className="font-mono text-xs text-zinc-500 w-8 mt-0.5">{String(i+1).padStart(2,'0')}</span>
                    <span>{typeof s === "string" ? s : s?.text || JSON.stringify(s)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {project.key_dates?.length > 0 && (
            <div>
              <div className="overline mb-3 flex items-center gap-2"><Calendar size={12} weight="bold"/> Key Dates</div>
              <table className="w-full border border-zinc-200 bg-white">
                <tbody>
                  {project.key_dates.map((kd, i) => (
                    <tr key={i} className="border-b border-zinc-200 last:border-b-0">
                      <td className="px-4 py-3 font-mono text-xs w-32">{formatDate(kd.date)}</td>
                      <td className="px-4 py-3 text-sm">{kd.label}</td>
                      <td className="px-4 py-3 text-[10px] uppercase tracking-[0.15em] font-mono w-32">{kd.type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {invite.notes && (
            <div className="border border-zinc-200 p-6 bg-white">
              <div className="overline mb-2">Note from issuer</div>
              <p className="text-sm whitespace-pre-line">{invite.notes}</p>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <div className="border border-[#0A0A0B] bg-white p-6 sticky top-8" data-testid="respond-form">
            {submitted ? (
              <div className="text-center py-6">
                <CheckCircle size={40} weight="bold" className="mx-auto mb-3 text-[#00C35A]" />
                <div className="font-display text-xl tracking-tighter font-black mb-1">Response Recorded</div>
                <p className="text-sm text-zinc-600">Thank you. The issuer has been notified.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div>
                  <div className="overline mb-1">Submit your fee</div>
                  <div className="font-display text-xl tracking-tighter font-black">{invite.discipline}</div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <label className="overline block mb-2">Fee*</label>
                    <input required type="number" min="0" step="0.01" value={form.fee} onChange={(e)=>setForm({...form,fee:e.target.value})}
                      data-testid="fee-input"
                      className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm font-mono" />
                  </div>
                  <div>
                    <label className="overline block mb-2">Cur.</label>
                    <select value={form.currency} onChange={(e)=>setForm({...form,currency:e.target.value})}
                      data-testid="currency-select"
                      className="w-full px-2 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm bg-white">
                      {["USD","EUR","GBP","CAD","AUD","AED","SAR","SGD","INR"].map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="overline block mb-2">Timeline</label>
                  <input value={form.timeline} onChange={(e)=>setForm({...form,timeline:e.target.value})} placeholder="e.g. 6 weeks"
                    data-testid="timeline-input"
                    className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
                </div>
                <div>
                  <label className="overline block mb-2">Notes &amp; assumptions</label>
                  <textarea rows={4} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}
                    data-testid="response-notes-input"
                    className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm resize-none" />
                </div>
                <button type="submit" disabled={busy} data-testid="submit-response-btn"
                  className="w-full flex items-center justify-between px-4 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
                  <span>{busy ? "Submitting…" : "Submit fee"}</span>
                  <ArrowRight size={16} weight="bold" />
                </button>
                <button type="button" onClick={declineHere} disabled={busy} data-testid="decline-btn"
                  className="w-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500 hover:text-[#FF3B30] transition-colors">
                  Decline invitation
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

/* ---------- declined terminal screen ---------- */
const DeclinedView = () => (
  <div className="border border-zinc-200 bg-white p-12 text-center" data-testid="declined-view">
    <XCircle size={40} weight="bold" className="mx-auto mb-3 text-[#FF3B30]" />
    <div className="font-display text-2xl tracking-tighter font-black mb-1">Invitation declined</div>
    <p className="text-sm text-zinc-600">Thank you for your time — the issuer has been notified.</p>
  </div>
);

/* ---------- root state machine ---------- */
const RespondPage = () => {
  const { token } = useParams();
  const [eoi, setEoi] = useState(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(1);

  const loadEoi = () => {
    setLoading(true);
    axios.get(`${API}/public/invites/${token}/eoi`)
      .then(r => {
        setEoi(r.data);
        const inv = r.data;
        if (inv.declined_at) setStep(0);
        else if (inv.skip_nda) setStep(3);
        else if (inv.nda_signed_at) setStep(3);
        else if (inv.interested_at) setStep(2);
        else setStep(1);
      })
      .catch(() => toast.error("Invite not found or expired"))
      .finally(() => setLoading(false));
  };
  useEffect(loadEoi, [token]); // eslint-disable-line

  if (loading) return <Loading />;
  if (!eoi) return <Loading text="Invite not found." />;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <Header />
      <main className="px-6 lg:px-10 py-12 max-w-[1400px] mx-auto">
        {step !== 0 && <Steps step={step} />}
        {step === 0 && <DeclinedView />}
        {step === 1 && <EoiView token={token} eoi={eoi} onInterested={()=>setStep(eoi.skip_nda ? 3 : 2)} onDeclined={()=>setStep(0)} />}
        {step === 2 && <NdaView token={token} eoi={eoi} onSigned={()=>setStep(3)} />}
        {step === 3 && <DetailsView token={token} />}
      </main>
    </div>
  );
};

export default RespondPage;
