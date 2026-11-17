import { useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { apiDownload, apiRequest } from "../lib/api";
import { Download, Shield } from "lucide-react";

export function SettingsPage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const [logs, setLogs] = useState<any[]>([]);
  const [downloadingZip, setDownloadingZip] = useState(false);

  useEffect(() => {
    apiRequest<{ logs: any[] }>("/users/audit-logs")
      .then((d) => setLogs(d.logs || []))
      .catch(() => {});
  }, []);

  const handleDownloadZip = async () => {
    setDownloadingZip(true);
    try {
      await apiDownload("/export-project-zip", "EvaluAI-Project-upgraded.zip");
      notify("success", "Complete upgraded project ZIP downloaded.");
    } catch (err: any) {
      notify("error", err.message || "Could not export ZIP archive.");
    } finally {
      setDownloadingZip(false);
    }
  };

  return (
    <AppShell title="Settings, Audit Trail & Project Export" breadcrumb="Workspace / Settings">
      <div className="grid lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-900">Educator Profile</h2>
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Name</span>
                <span className="font-medium text-slate-900">{user?.name}</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100">
                <span className="text-slate-500">Email</span>
                <span className="font-medium text-slate-900">{user?.email}</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Role</span>
                <span className="font-medium text-slate-900 capitalize">{user?.role}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6">
            <h2 className="text-base font-bold text-slate-900">Export Complete Repository</h2>
            <p className="mt-1.5 text-xs text-slate-600 leading-relaxed">
              Download the complete modified EvaluAI repository (Python FastAPI backend, React frontend, Dockerfiles, tests, and documentation) as a portable ZIP archive ready to push to GitHub.
            </p>
            <button
              type="button"
              onClick={handleDownloadZip}
              disabled={downloadingZip}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-700 text-white text-xs font-semibold hover:bg-blue-800 disabled:opacity-60"
            >
              <Download className="w-4 h-4" />
              <span>{downloadingZip ? "Packaging Archive..." : "Download EvaluAI-Project-upgraded.zip"}</span>
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="p-5 border-b border-slate-200 flex items-center gap-2">
            <Shield className="w-4 h-4 text-slate-700" />
            <h2 className="text-base font-bold text-slate-900">Security & Grading Audit Log</h2>
          </div>
          <div className="divide-y divide-slate-100 max-h-[480px] overflow-y-auto text-xs">
            {logs.length === 0 ? (
              <div className="p-6 text-slate-500">No audit events recorded yet.</div>
            ) : (
              logs.map((l) => (
                <div key={l._id} className="p-4 flex items-start justify-between gap-4">
                  <div>
                    <div className="font-semibold text-slate-900 font-mono">{l.action}</div>
                    <div className="text-slate-600 mt-0.5">
                      {l.resource_type}: {l.resource_id}
                    </div>
                  </div>
                  <div className="text-right text-slate-400 font-mono tabular-nums shrink-0">
                    {new Date(l.timestamp).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
