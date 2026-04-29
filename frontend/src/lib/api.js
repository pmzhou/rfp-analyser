import axios from "axios";

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

api.interceptors.request.use((cfg) => {
  const t = localStorage.getItem("rfp_token");
  if (t) cfg.headers.Authorization = `Bearer ${t}`;
  return cfg;
});

export { API };
