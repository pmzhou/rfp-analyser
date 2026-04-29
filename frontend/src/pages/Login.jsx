import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Buildings, ArrowRight } from "@phosphor-icons/react";

const Login = () => {
  const { login, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-5">
      <div className="lg:col-span-2 flex flex-col p-8 lg:p-12 bg-white border-r border-zinc-200">
        <Link to="/" className="flex items-center gap-3 mb-16" data-testid="logo-link">
          <div className="w-9 h-9 bg-[#0A0A0B] flex items-center justify-center">
            <Buildings size={20} weight="bold" color="#FFFFFF" />
          </div>
          <div className="leading-none">
            <div className="font-display font-black text-lg tracking-tighter">RFP/ANALYSER</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-500 mt-1">AEC · Pre-Bid Intelligence</div>
          </div>
        </Link>

        <div className="flex-1 flex flex-col justify-center max-w-sm">
          <div className="overline mb-3">01 / Authentication</div>
          <h1 className="font-display text-4xl sm:text-5xl tracking-tighter font-black mb-2">Sign in.</h1>
          <p className="text-sm text-zinc-600 mb-10">
            Access your RFP analyses, sub-consultant invites and merged fee proposals.
          </p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="overline block mb-2">Email</label>
              <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)}
                data-testid="login-email-input"
                className="w-full px-3 py-3 bg-white border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] focus:ring-offset-1 text-sm" />
            </div>
            <div>
              <label className="overline block mb-2">Password</label>
              <input type="password" required value={password} onChange={(e)=>setPassword(e.target.value)}
                data-testid="login-password-input"
                className="w-full px-3 py-3 bg-white border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] focus:ring-offset-1 text-sm" />
            </div>
            <button type="submit" disabled={busy} data-testid="login-submit-btn"
              className="w-full flex items-center justify-between px-4 py-3 bg-[#0A0A0B] text-white text-sm font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] disabled:opacity-50 transition-colors">
              <span>{busy ? "Authenticating..." : "Sign in"}</span>
              <ArrowRight size={16} weight="bold" />
            </button>
          </form>

          <p className="mt-8 text-xs text-zinc-500">
            New to RFP/Analyser?{" "}
            <Link to="/signup" className="text-[#0055FF] font-semibold hover:underline" data-testid="link-signup">Create an account</Link>
          </p>
        </div>
      </div>
      <div className="hidden lg:flex lg:col-span-3 grid-bg relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-transparent to-white/40" />
        <div className="relative w-full p-16 flex flex-col justify-end">
          <div className="overline mb-4">Workflow</div>
          <div className="font-display text-4xl tracking-tighter font-black max-w-xl leading-[1.05] mb-6">
            Upload. Extract. Distribute. Merge.
          </div>
          <ol className="space-y-3 max-w-md">
            {[
              ["01", "Upload RFP & accompanying documents (PDF / DOCX)"],
              ["02", "AI extracts requirements, dates, scope, disciplines"],
              ["03", "Distribute to sub-consultants by discipline"],
              ["04", "Merge fees into a single, exportable proposal"],
            ].map(([n, t]) => (
              <li key={n} className="flex items-start gap-4 fade-up">
                <span className="font-mono text-xs text-zinc-500 mt-1">{n}</span>
                <span className="text-sm text-zinc-800">{t}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
};

export default Login;
