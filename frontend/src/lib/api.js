import axios from "axios";

const BASE = `${process.env.REACT_APP_BACKEND_URL}/api`;

export const api = axios.create({ baseURL: BASE, withCredentials: true });

// Polls an AI background job until done/error. Returns job.result.
export async function pollJob(companyId, jobId, { interval = 3000, timeout = 240000 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const { data } = await api.get(`/companies/${companyId}/jobs/${jobId}`);
    if (data.status === "done") return data.result;
    if (data.status === "error") throw new Error(data.error || "Falha na geração por IA");
    await new Promise((r) => setTimeout(r, interval));
  }
  throw new Error("Tempo limite excedido na geração por IA");
}

export function fmtErr(e) {
  const detail = e?.response?.data?.detail;
  if (detail == null) return e?.message || "Erro inesperado. Tente novamente.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail.map((x) => (x && typeof x.msg === "string" ? x.msg : JSON.stringify(x))).join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}
