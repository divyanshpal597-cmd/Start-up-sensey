import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Download, Printer } from "lucide-react";
import { Api } from "../lib/api";
import ReportDocument from "../components/ReportDocument";
import { ErrorBox, LoadingBlock, SIZE, Spinner, cx } from "../components/ui";
import { downloadPdf } from "./Reports";
import { t } from "../lib/i18n";

export default function SharedReport() {
  const { token } = useParams();
  const [rec, setRec] = useState<{ idea: any; analysis: any } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (token) Api.shared(token).then(setRec).catch((e) => setError(e.message));
  }, [token]);

  return (
    <div className="min-h-screen bg-canvas px-4 py-8">
      <div className="no-print mx-auto mb-4 flex max-w-4xl items-center justify-between">
        <Link to="/" className="font-display text-sm font-extrabold tracking-wide text-slate-900">STARTUP SENSE <span className="font-normal text-slate-500">· {t("Validate Before You Invest.")}</span></Link>
        {rec && (
          <div className="flex gap-2">
            <button onClick={async () => { setBusy(true); try { await downloadPdf(rec.analysis.aiAnalysis?.businessOverview?.businessName || rec.idea.businessName); } finally { setBusy(false); } }} className={cx("btn-primary", SIZE.sm)}>
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Download className="h-3.5 w-3.5" />} {t("Download PDF")}
            </button>
            <button onClick={() => window.print()} className={cx("btn-secondary", SIZE.sm)}><Printer className="h-3.5 w-3.5" /> {t("Print")}</button>
          </div>
        )}
      </div>
      <div className="mx-auto max-w-4xl">
        {error ? (
          <ErrorBox title="This shared report could not be loaded.">{error}</ErrorBox>
        ) : !rec ? (
          <LoadingBlock />
        ) : (
          <div className="card print-area overflow-hidden">
            <ReportDocument idea={rec.idea} analysis={rec.analysis} />
          </div>
        )}
      </div>
    </div>
  );
}
