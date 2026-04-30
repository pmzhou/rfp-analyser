import React, { createContext, useContext, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const PrefsContext = createContext({ default_currency: "AED", date_format: "dd/mm/yyyy", refresh: () => {} });

export const PrefsProvider = ({ children }) => {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState({ default_currency: "AED", date_format: "dd/mm/yyyy" });

  const load = async () => {
    try {
      const { data } = await api.get("/settings");
      setPrefs({
        default_currency: data.default_currency || "AED",
        date_format: data.date_format || "dd/mm/yyyy",
      });
    } catch { /* ignore */ }
  };

  useEffect(() => { if (user) load(); }, [user]);

  return <PrefsContext.Provider value={{ ...prefs, refresh: load }}>{children}</PrefsContext.Provider>;
};

export const usePrefs = () => useContext(PrefsContext);
