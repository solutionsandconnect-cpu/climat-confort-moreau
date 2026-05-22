// src/lib/generateDocFhPdf.ts
// Génération PDF pour les documents RH (Fiche d'heures, Autorisation absence, Travaux imprévus)

export interface ChantierFhPdf {
  nomChantier: string;
  numChantier: string;
  taches: Array<{
    nomLigne: string;
    case1: number; case2: number; case3: number; case4: number; case5: number;
  }>;
}

export interface DocFhPdfData {
  categorie: string;
  nom: string; prenom: string; service?: string;
  dateCreate?: string;
  // Fiche d'heures
  typeFH?: string; mois?: string; debut?: string; fin?: string;
  chantiers?: ChantierFhPdf[];
  // Autorisation absence
  typeAbs?: string; debutAbs?: string; finAbs?: string; nbJours?: string | number;
  // Travaux imprévus
  nomCh?: string; numCh?: string; dateTI?: string; naturesTravaux?: string;
  estMat?: string; estH?: string; conducteurNom?: string;
  visa?: boolean; chiffrage?: string; accept?: string; factImprev?: string;
  ts?: string; tma?: string; cptInter?: string; cptProrata?: string;
  // Forfait Jour
  forfaitMois?: string;
  forfaitJours?: Array<{day: number; weekday: string; weekNum: number; isWeekend: boolean; matin: string; apresMidi: string}>;
  // Commun
  observations?: string;
  sigUser?: string; sigChef?: string; sigResp?: string; nomResp?: string;
  etat?: string;
}

function fmt(s?: string): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleDateString("fr-FR"); } catch { return s; }
}

function sigImg(sig?: string): string {
  if (!sig) return '<span style="font-size:11px;color:#aaa;font-style:italic;">Non signé</span>';
  return `<img src="${sig}" style="max-height:55px;max-width:180px;object-fit:contain;" />`;
}

function statusStyle(etat?: string): string {
  if (etat === "Validé") return "background:#dcfce7;color:#166534;border:1px solid #bbf7d0;";
  if (etat === "Refusé") return "background:#fee2e2;color:#991b1b;border:1px solid #fecaca;";
  if (etat === "En cours de traitement") return "background:#dbeafe;color:#1e40af;border:1px solid #bfdbfe;";
  return "background:#fef9c3;color:#854d0e;border:1px solid #fde68a;";
}

function buildHtml(data: DocFhPdfData): string {
  const jours = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];
  const isAbsence = data.categorie === "Demande autorisation absence";
  const dateTelechargement = new Date().toLocaleDateString("fr-FR");

  const header = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;padding-bottom:14px;border-bottom:3px solid #1a1a2e;">
      <div>
        <div style="font-size:18px;font-weight:800;color:#1a1a2e;letter-spacing:-0.5px;">Climat & Confort Moreau</div>
        <div style="font-size:14px;font-weight:600;color:#555;margin-top:3px;">${data.categorie}</div>
        <div style="font-size:10px;color:#888;margin-top:5px;">Créé le ${data.dateCreate || "—"} · Téléchargé le ${dateTelechargement}</div>
      </div>
      ${data.etat ? `<span style="padding:4px 14px;border-radius:99px;font-size:12px;font-weight:700;${statusStyle(data.etat)}">${data.etat}</span>` : ""}
    </div>`;

  const infoTable = `
    <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
      <tr style="background:#f1f5f9;">
        <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Salarié</th>
        <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Service</th>
        ${!isAbsence ? `<th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Type</th>` : ""}
      </tr>
      <tr>
        <td style="padding:8px 10px;font-size:13px;font-weight:600;border:1px solid #cbd5e1;">${data.prenom} ${data.nom}</td>
        <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.service || "—"}</td>
        ${!isAbsence ? `<td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.typeFH || "—"}</td>` : ""}
      </tr>
    </table>`;

  let content = "";

  if (data.categorie === "Fiche d'heures") {
    content += `
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Mois</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Semaine du</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Au</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.mois || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${fmt(data.debut)}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${fmt(data.fin)}</td>
        </tr>
      </table>`;

    for (const ch of data.chantiers ?? []) {
      const rows = ch.taches.map(t => {
        const vals = [t.case1, t.case2, t.case3, t.case4, t.case5];
        const total = vals.reduce((a, b) => a + b, 0);
        return `<tr>
          <td style="padding:5px 8px;font-size:11px;border:1px solid #cbd5e1;">${t.nomLigne}</td>
          ${vals.map(v => `<td style="padding:5px 8px;font-size:11px;text-align:center;border:1px solid #cbd5e1;">${v || ""}</td>`).join("")}
          <td style="padding:5px 8px;font-size:11px;text-align:center;font-weight:700;border:1px solid #cbd5e1;background:#f8fafc;">${total || ""}</td>
        </tr>`;
      }).join("");

      content += `
        <div style="margin-bottom:14px;">
          <div style="font-size:12px;font-weight:700;color:#1a1a2e;margin-bottom:6px;">
            ${ch.nomChantier}${ch.numChantier ? ` <span style="font-weight:400;color:#666;">(${ch.numChantier})</span>` : ""}
          </div>
          <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="background:#eef2ff;">
                <th style="padding:5px 8px;font-size:11px;text-align:left;border:1px solid #cbd5e1;font-weight:600;color:#475569;">Tâche</th>
                ${jours.map(j => `<th style="padding:5px 8px;font-size:10px;text-align:center;border:1px solid #cbd5e1;font-weight:600;color:#475569;width:9%;">${j.slice(0, 3)}.</th>`).join("")}
                <th style="padding:5px 8px;font-size:10px;text-align:center;border:1px solid #cbd5e1;font-weight:700;color:#1a1a2e;width:9%;">Total</th>
              </tr>
            </thead>
            <tbody>${rows || '<tr><td colspan="7" style="padding:8px;font-size:11px;color:#999;text-align:center;border:1px solid #cbd5e1;">Aucune tâche</td></tr>'}</tbody>
          </table>
        </div>`;
    }

    if (data.observations) {
      content += `<div style="margin-bottom:14px;"><p style="font-size:11px;color:#475569;font-weight:700;margin:0 0 4px 0;">Observations</p><p style="font-size:12px;color:#333;background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #cbd5e1;margin:0;">${data.observations}</p></div>`;
    }

  } else if (data.categorie === "Demande autorisation absence") {
    content = `
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Type d'absence</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Du</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Au</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Nb jours</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.typeAbs || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${fmt(data.debutAbs)}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${fmt(data.finAbs)}</td>
          <td style="padding:8px 10px;font-size:13px;font-weight:700;border:1px solid #cbd5e1;">${data.nbJours ?? "—"} j</td>
        </tr>
      </table>
      ${data.observations ? `<p style="font-size:12px;color:#333;background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #cbd5e1;">${data.observations}</p>` : ""}`;

  } else if (data.categorie === "Fiche de retour Travaux imprévus") {
    content = `
      <div style="font-size:11px;font-weight:700;color:#1a1a2e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Identification chantier</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:45%;">Chantier</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:20%;">N° Chantier</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:20%;">Date</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:15%;">Resp. fact.</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;font-weight:600;border:1px solid #cbd5e1;">${data.nomCh || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;font-family:monospace;border:1px solid #cbd5e1;">${data.numCh || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${fmt(data.dateTI)}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.conducteurNom || "—"}</td>
        </tr>
      </table>
      ${data.naturesTravaux ? `<div style="margin-bottom:10px;"><p style="font-size:11px;color:#475569;font-weight:700;margin:0 0 4px 0;">Nature des travaux</p><p style="font-size:12px;color:#333;background:#f8fafc;padding:8px 12px;border-radius:6px;border:1px solid #cbd5e1;margin:0;">${data.naturesTravaux}</p></div>` : ""}
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Estim. matériaux</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Estim. heures</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.estMat || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.estH || "—"}</td>
        </tr>
      </table>
      <div style="font-size:11px;font-weight:700;color:#1a1a2e;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">Chiffrage &amp; Comptabilité</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Visa chiffrage</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Chiffrage transmis</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Acceptation</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Facturation</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;font-weight:700;border:1px solid #cbd5e1;${data.visa ? "color:#166534;background:#dcfce7;" : ""}">${data.visa ? "OUI" : "NON"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.chiffrage || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.accept || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.factImprev || "—"}</td>
        </tr>
      </table>
      <p style="font-size:9px;color:#888;font-style:italic;margin-bottom:12px;">* Mr KEVIN DOURNEAU est la seule personne habilitée à légitimer un chiffrage via le CDTX</p>
      <table style="width:100%;border-collapse:collapse;margin-bottom:14px;">
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">TS</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">TMA</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Compte inter</th>
          <th style="text-align:left;padding:7px 10px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;">Compte prorata</th>
        </tr>
        <tr>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.ts || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.tma || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.cptInter || "—"}</td>
          <td style="padding:8px 10px;font-size:12px;border:1px solid #cbd5e1;">${data.cptProrata || "—"}</td>
        </tr>
      </table>`;

  } else if (data.categorie === "Forfait Jour") {
    const jours = data.forfaitJours ?? [];
    const weeks = [...new Set(jours.map(j => j.weekNum))];
    const totalM = jours.filter(j => j.matin === "X").length;
    const totalA = jours.filter(j => j.apresMidi === "X").length;
    const legende = `<div style="margin-bottom:12px;font-size:10px;color:#555;line-height:1.8;">
      <span style="font-weight:700;">Légende :</span>
      <b>X</b> demi-journée travaillée &nbsp;·&nbsp; <b>JR</b> demi-journée de repos &nbsp;·&nbsp; <b>CP</b> journée de congé payé &nbsp;·&nbsp; <b>JF</b> jour férié &nbsp;·&nbsp; <b>RH</b> repos hebdomadaire &nbsp;·&nbsp; <b>ABS</b> autre absence
      <span style="float:right;font-weight:700;font-style:italic;">Signature :</span>
    </div>`;
    const rows = weeks.map(wk => {
      const wkLabel = `<tr><td colspan="4" style="background:#eef2ff;padding:4px 8px;font-size:10px;font-weight:700;color:#3730a3;border:1px solid #cbd5e1;">Semaine ${wk}</td></tr>`;
      const dayRows = jours.filter(j => j.weekNum === wk).map(j => {
        const bg = j.isWeekend ? "background:#f1f5f9;" : "";
        const val = (v: string) => v ? `<b>${v}</b>` : "—";
        return `<tr style="${bg}">
          <td style="padding:4px 8px;font-size:11px;border:1px solid #cbd5e1;">${j.weekday}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;">${j.day}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;">${val(j.matin)}</td>
          <td style="padding:4px 8px;font-size:11px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;">${val(j.apresMidi)}</td>
        </tr>`;
      }).join("");
      return wkLabel + dayRows;
    }).join("");
    content = `${legende}
    <table style="width:100%;border-collapse:collapse;margin-bottom:10px;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="text-align:left;padding:5px 8px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:25%;">Jour</th>
          <th style="text-align:center;padding:5px 8px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:8%;">N°</th>
          <th style="text-align:center;padding:5px 8px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:33%;">Matin</th>
          <th style="text-align:center;padding:5px 8px;font-size:11px;color:#475569;font-weight:700;border:1px solid #cbd5e1;width:33%;">Après midi</th>
        </tr>
      </thead>
      <tbody>${rows}
        <tr style="background:#f8fafc;font-weight:700;">
          <td colspan="2" style="padding:6px 8px;font-size:11px;border:1px solid #cbd5e1;">TOTAL MOIS (X)</td>
          <td style="padding:6px 8px;font-size:13px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;">${totalM}</td>
          <td style="padding:6px 8px;font-size:13px;text-align:center;border:1px solid #cbd5e1;font-family:monospace;">${totalA}</td>
        </tr>
      </tbody>
    </table>`;
  }

  const sigSection = `
    <div style="margin-top:20px;padding-top:14px;border-top:2px solid #e2e8f0;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;width:${isAbsence ? "50%" : "33%"};">
            <div style="font-size:10px;color:#475569;font-weight:700;margin-bottom:8px;">SALARIÉ</div>
            ${sigImg(data.sigUser)}
          </td>
          ${!isAbsence ? `<td style="padding:10px;text-align:center;border:1px solid #cbd5e1;width:33%;">
            <div style="font-size:10px;color:#475569;font-weight:700;margin-bottom:8px;">CHEF D'ÉQUIPE</div>
            ${sigImg(data.sigChef)}
          </td>` : ""}
          <td style="padding:10px;text-align:center;border:1px solid #cbd5e1;width:${isAbsence ? "50%" : "34%"};">
            <div style="font-size:10px;color:#475569;font-weight:700;margin-bottom:8px;">${(data.nomResp || "RESPONSABLE").toUpperCase()}</div>
            ${sigImg(data.sigResp)}
          </td>
        </tr>
      </table>
    </div>`;

  return `<div style="font-family:Arial,Helvetica,sans-serif;padding:24px;color:#1a1a1a;line-height:1.4;">${header}${infoTable}${content}${sigSection}</div>`;
}

export async function generateDocFhPdf(data: DocFhPdfData): Promise<Blob> {
  const html = buildHtml(data);
  const container = document.createElement("div");
  // position:fixed;top:0;left:0 is required — html2canvas only captures elements
  // that are inside the viewport. left:-9999px or opacity:0 produce blank output.
  container.style.cssText =
    "position:fixed;top:0;left:0;width:794px;background:#fff;" +
    "z-index:2147483647;pointer-events:none;overflow:visible;";
  container.innerHTML = html;
  document.body.appendChild(container);
  await new Promise(resolve => setTimeout(resolve, 300));
  try {
    const h2cMod = await import("html2canvas");
    const html2canvas: (el: HTMLElement, opts?: Record<string, unknown>) => Promise<HTMLCanvasElement> =
      (h2cMod as any).default ?? h2cMod;
    const canvas = await html2canvas(container, {
      scale: 2, useCORS: true, logging: false,
      width: 794, windowWidth: 794, backgroundColor: "#ffffff",
    });
    const jsPDFMod = await import("jspdf");
    const JsPDF: any =
      (jsPDFMod as any).jsPDF ??
      (jsPDFMod as any).default?.jsPDF ??
      (jsPDFMod as any).default;
    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const imgWmm = pageW;
    const imgHmm = (canvas.height / 2) * (pageW / (canvas.width / 2));
    const imgData = canvas.toDataURL("image/jpeg", 0.95);
    if (imgHmm <= pageH) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgWmm, imgHmm);
    } else {
      const pxPerPagePx = Math.floor((canvas.height / imgHmm) * pageH);
      let yPx = 0; let first = true;
      while (yPx < canvas.height) {
        if (!first) pdf.addPage();
        first = false;
        const sliceH = Math.min(pxPerPagePx, canvas.height - yPx);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width; sliceCanvas.height = sliceH;
        sliceCanvas.getContext("2d")!.drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
        const sliceHmm = (sliceH / 2) * (pageW / (canvas.width / 2));
        pdf.addImage(sliceData, "JPEG", 0, 0, pageW, sliceHmm);
        yPx += pxPerPagePx;
      }
    }
    return pdf.output("blob") as Blob;
  } finally {
    document.body.removeChild(container);
  }
}
