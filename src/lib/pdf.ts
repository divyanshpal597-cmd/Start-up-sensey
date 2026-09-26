// Client-side PDF export of the report element (html2canvas-pro supports Tailwind v4 oklch colours).

export async function exportElementToPdf(el: HTMLElement, filename: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const scale = 2;
  const canvas = await html2canvas(el, { scale, useCORS: true, backgroundColor: "#ffffff", logging: false });

  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageW = 210;
  const pageH = 297;
  const margin = 10;
  const imgW = pageW - margin * 2;
  const pxPerMm = canvas.width / imgW;
  const pageHeightPx = Math.floor((pageH - margin * 2) * pxPerMm);

  // Candidate break points: tops of blocks, so pages don't cut through a line of text.
  const rootTop = el.getBoundingClientRect().top;
  const candidates = Array.from(el.querySelectorAll("section, h2, h3, p, li, tr, .rounded-lg"))
    .map((n) => Math.round(((n as HTMLElement).getBoundingClientRect().top - rootTop) * scale))
    .filter((y) => y > 0)
    .sort((a, b) => a - b);

  let y = 0;
  let first = true;
  while (y < canvas.height) {
    let end = Math.min(y + pageHeightPx, canvas.height);
    if (end < canvas.height) {
      const within = candidates.filter((c) => c > y + pageHeightPx * 0.5 && c <= end);
      if (within.length) end = within[within.length - 1];
    }
    const slice = document.createElement("canvas");
    slice.width = canvas.width;
    slice.height = end - y;
    const ctx = slice.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, slice.width, slice.height);
    ctx.drawImage(canvas, 0, y, canvas.width, end - y, 0, 0, canvas.width, end - y);
    if (!first) pdf.addPage();
    pdf.addImage(slice.toDataURL("image/jpeg", 0.92), "JPEG", margin, margin, imgW, (end - y) / pxPerMm);
    first = false;
    y = end;
  }
  const pages = pdf.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8);
    pdf.setTextColor(148, 163, 184);
    pdf.text(`Startup Sense · Page ${i} of ${pages}`, pageW / 2, pageH - 4, { align: "center" });
  }
  pdf.save(filename);
}
