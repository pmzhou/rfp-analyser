import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Buildings, SignOut, Stack, Gear } from "@phosphor-icons/react";

const Layout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const onLogout = () => { logout(); navigate("/login"); };

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-[#0A0A0B]">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-xl border-b border-[#0A0A0B]">
        <div className="px-6 lg:px-10 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-3" data-testid="header-logo">
            <div className="w-8 h-8 bg-[#0A0A0B] flex items-center justify-center">
              <Buildings size={18} weight="bold" color="#FFFFFF" />
            </div>
            <div className="leading-none">
              <div className="font-display font-black text-base tracking-tighter">RFP/ANALYSER</div>
              <div className="text-[9px] tracking-[0.25em] uppercase text-zinc-500 mt-0.5">AEC · Pre-Bid Intelligence</div>
            </div>
          </Link>
          <nav className="flex items-center gap-1">
            <NavLink to="/dashboard" data-testid="nav-projects"
              className={({isActive}) => `px-3 py-2 text-xs uppercase tracking-[0.18em] font-semibold transition-colors ${isActive ? 'text-[#0A0A0B]' : 'text-zinc-500 hover:text-[#0A0A0B]'}`}>
              Projects
            </NavLink>
            <NavLink to="/settings" data-testid="nav-settings"
              className={({isActive}) => `px-3 py-2 text-xs uppercase tracking-[0.18em] font-semibold transition-colors flex items-center gap-1 ${isActive ? 'text-[#0A0A0B]' : 'text-zinc-500 hover:text-[#0A0A0B]'}`}>
              <Gear size={12} weight="bold"/> Settings
            </NavLink>
            <div className="ml-4 flex items-center gap-3 pl-4 border-l border-zinc-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold leading-tight" data-testid="user-name">{user?.name}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500" data-testid="user-role">{user?.role}</div>
              </div>
              <button onClick={onLogout} data-testid="logout-btn"
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-[0.15em] border border-[#0A0A0B] hover:bg-[#0A0A0B] hover:text-white transition-colors">
                <SignOut size={14} weight="bold" /> Logout
              </button>
            </div>
          </nav>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-zinc-200 mt-24">
        <div className="px-6 lg:px-10 py-8 flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-zinc-500">
          <div className="flex items-center gap-2"><Stack size={14} weight="bold"/> RFP Analyser</div>
          <div>v1.0 · Self-hostable</div>
        </div>
      </footer>
    </div>
  );
};

export default Layout;
