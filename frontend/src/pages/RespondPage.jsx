import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { toast } from "sonner";
import { Buildings, ArrowRight, CheckCircle, Calendar } from "@phosphor-icons/react";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const RespondPage = () => {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({ fee: "", currency: "USD", notes: "", timeline: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/public/invites/${token}`)
      .then(r => { setData(r.data); if (r.data.invite.status === "submitted" || r.data.invite.status === "declined") setSubmitted(true); })
      .catch(() => toast.error("Invite not found or expired"))
      .finally(() => setLoading(false));
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
    } catch (e) { toast.error("Submission failed"); }
    finally { setBusy(false); }
  };

  const decline = async () => {
    if (!window.confirm("Decline this invitation?")) return;
    setBusy(true);
    try {
      await axios.post(`${API}/public/invites/${token}/respond`, { fee: 0, currency: form.currency, notes: form.notes, timeline: "", status: "declined" });
      setSubmitted(true);
      toast.success("Invite declined");
    } catch { toast.error("Failed"); } finally { setBusy(false); }
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">Loading…</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center text-zinc-500 font-mono text-sm">Invite not found.</div>;

  const { invite, project } = data;
  const d = project.discipline;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
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

      <main className="px-6 lg:px-10 py-12 max-w-[1400px] mx-auto">
        <div className="overline mb-3">Fee Request / {invite.discipline}</div>
        <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black leading-none mb-2" data-testid="respond-title">{project.title}</h1>
        <p className="text-sm text-zinc-600 mb-2">For: <span className="font-semibold">{invite.consultant_name}</span> {invite.consultant_company && `— ${invite.consultant_company}`}</p>
        <p className="text-sm text-zinc-500 mb-10">Client: {project.client_name || "—"}</p>

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
                <p className="text-sm leading-relaxed mb-3"><span className="font-semibold">Description: </span>{d.description}</p>
                <p className="text-sm leading-relaxed"><span className="font-semibold">Scope: </span>{d.scope_summary}</p>
              </div>
            )}

            {project.scope?.length > 0 && (
              <div>
                <div className="overline mb-3">Project Scope</div>
                <ul className="border-t border-zinc-200">
                  {project.scope.map((s, i) => (
                    <li key={i} className="flex gap-4 py-3 border-b border-zinc-200 text-sm">
                      <span className="font-mono text-xs text-zinc-500 w-8 mt-0.5">{String(i+1).padStart(2,'0')}</span>
                      <span>{s}</span>
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
                        <td className="px-4 py-3 font-mono text-xs w-32">{kd.date}</td>
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
                <p className="text-sm">{invite.notes}</p>
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
                    <label className="overline block mb-2">Notes & assumptions</label>
                    <textarea rows={4} value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})}
                      data-testid="response-notes-input"
                      className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm resize-none" />
                  </div>
                  <button type="submit" disabled={busy} data-testid="submit-response-btn"
                    className="w-full flex items-center justify-between px-4 py-3 bg-[#0055FF] text-white text-xs font-semibold uppercase tracking-[0.15em] hover:bg-[#0A0A0B] disabled:opacity-50 transition-colors">
                    <span>{busy ? "Submitting…" : "Submit fee"}</span>
                    <ArrowRight size={16} weight="bold" />
                  </button>
                  <button type="button" onClick={decline} disabled={busy} data-testid="decline-btn"
                    className="w-full px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.15em] text-zinc-500 hover:text-[#FF3B30] transition-colors">
                    Decline invitation
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default RespondPage;
