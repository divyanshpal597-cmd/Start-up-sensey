import { useState } from "react";
import { Check, Download, Printer, Share2 } from "lucide-react";
import { useCurrentIdea } from "../context/CurrentIdea";
import { Api } from "../lib/api";
import { exportElementToPdf } from "../lib/pdf";
import ReportDocument from "../components/ReportDocument";
import { NeedsAnalysis, Notice, PageHeader, SIZE, Spinner, cx } from "../components/ui";

export async function downloadPdf(name: string) {
  const el = document.getElementById("report");
  if (!el) return;
  await exportElementToPdf(el, `${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-startup-sense-report.pdf`);
}

export default function Reports() {
  const ctx = useCurrentIdea();
  return (
    <NeedsAnalysis ctx={ctx}>
      <Body />
    </NeedsAnalysis>
  );
}

function Body() {
  const { idea, analysis, ai } = useCurrentIdea();
  const [pdfBusy, setPdfBusy] = useState(false);
  const [shareMsg, setShareMsg] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
  const name = ai.businessOverview?.businessName || idea.businessName;

  async function onPdf() {
    setPdfBusy(true);
    try {
      await downloadPdf(name);
    } catch (e) {
      alert(`PDF export failed: ${(e as Error).message}. You can use Print → Save as PDF instead.`);
    } finally {
      setPdfBusy(false);
    }
  }

  async function onShare() {
    setShareBusy(true);
    setShareMsg(null);
    try {
      const r = await Api.share(analysis.id);
      const url = `${window.location.origin}${r.path}`;
      if (navigator.share) {
        try {
          await navigator.share({ title: `${name} — Startup Sense report`, url });
          setShareMsg(`Share link: ${url}`);
          return;
        } catch {
          /* user cancelled — fall back to copy */
        }
      }
      try {
        await navigator.clipboard.writeText(url);
        setShareMsg(`Link copied: ${url}`);
      } catch {
        setShareMsg(`Share link: ${url}`);
      }
    } catch (e) {
      setShareMsg((e as Error).message);
    } finally {
      setShareBusy(false);
    }
  }

  return (
    <div>
      <div className="no-print">
        <PageHeader
          eyebrow="Reports"
          title={`Report · ${name}`}
          subtitle="A complete, printable validation report for the currently selected business."
          actions={
            <>
              <button onClick={onPdf} disabled={pdfBusy} className={cx("btn-primary", SIZE.md)}>{pdfBusy ? <Spinner /> : <Download className="h-4 w-4" />} Download PDF</button>
              <button onClick={() => window.print()} className={cx("btn-secondary", SIZE.md)}><Printer className="h-4 w-4" /> Print</button>
              <button onClick={onShare} disabled={shareBusy} className={cx("btn-secondary", SIZE.md)}>{shareBusy ? <Spinner /> : <Share2 className="h-4 w-4" />} Share</button>
            </>
          }
        />
        {shareMsg && (
          <div className="mb-4">
            <Notice><span className="inline-flex items-center gap-2 break-all"><Check className="h-4 w-4 shrink-0" /> {shareMsg}</span> <span className="block text-xs opacity-75">Anyone with this link can view a read-only copy of this report.</span></Notice>
          </div>
        )}
      </div>
      <div className="card print-area mx-auto max-w-4xl overflow-hidden">
        <ReportDocument idea={idea} analysis={analysis} />
      </div>
    </div>
  );
}
