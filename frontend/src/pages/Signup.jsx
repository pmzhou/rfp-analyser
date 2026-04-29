import React, { useState } from "react";
import { Link, useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Buildings, ArrowRight } from "@phosphor-icons/react";

const Signup = () => {
  const { signup, user } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be at least 8 characters");
    setBusy(true);
    try {
      await signup(email, password, name);
      toast.success("Account created");
      navigate("/dashboard");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Signup failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 grid-bg">
      <div className="w-full max-w-md bg-white border border-[#0A0A0B] p-8 lg:p-10 fade-up">
        <Link to="/" className="flex items-center gap-3 mb-10" data-testid="logo-link">
          <div className="w-9 h-9 bg-[#0A0A0B] flex items-center justify-center">
            <Buildings size={20} weight="bold" color="#FFFFFF" />
          </div>
          <div className="leading-none">
            <div className="font-display font-black text-lg tracking-tighter">RFP/ANALYSER</div>
            <div className="text-[10px] tracking-[0.25em] uppercase text-zinc-500 mt-1">AEC · Pre-Bid Intelligence</div>
          </div>
        </Link>

        <div className="overline mb-3">01 / Create account</div>
        <h1 className="font-display text-3xl tracking-tighter font-black mb-1">Get started.</h1>
        <p className="text-sm text-zinc-600 mb-8">
          The first user becomes administrator.
        </p>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="overline block mb-2">Full name</label>
            <input type="text" required value={name} onChange={(e)=>setName(e.target.value)}
              data-testid="signup-name-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          </div>
          <div>
            <label className="overline block mb-2">Email</label>
            <input type="email" required value={email} onChange={(e)=>setEmail(e.target.value)}
              data-testid="signup-email-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
          </div>
          <div>
            <label className="overline block mb-2">Password</label>
            <input type="password" required minLength={8} value={password} onChange={(e)=>setPassword(e.target.value)}
              data-testid="signup-password-input"
              className="w-full px-3 py-3 border border-[#0A0A0B] focus:outline-none focus:ring-2 focus:ring-[#0055FF] text-sm" />
            <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 mt-2">min. 8 chars</p>
          </div>
          <button type="submit" disabled={busy} data-testid="signup-submit-btn"
            className="w-full flex items-center justify-between px-4 py-3 bg-[#0A0A0B] text-white text-sm font-semibold uppercase tracking-[0.15em] hover:bg-[#0055FF] disabled:opacity-50 transition-colors">
            <span>{busy ? "Creating..." : "Create account"}</span>
            <ArrowRight size={16} weight="bold" />
          </button>
        </form>

        <p className="mt-6 text-xs text-zinc-500">
          Already registered?{" "}
          <Link to="/login" className="text-[#0055FF] font-semibold hover:underline" data-testid="link-login">Sign in</Link>
        </p>
      </div>
    </div>
  );
};

export default Signup;
