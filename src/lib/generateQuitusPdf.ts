// src/lib/generateQuitusPdf.ts
// Génération PDF du quitus — layout identique à l'original (tables HTML pures)

import { format } from "date-fns";
import { fr } from "date-fns/locale";

export interface QuitusData {
  numDossier?: string;
  numQuitus?: string | number;
  typeIntervention?: string;
  nomChantier?: string;
  adresseChantier?: string;
  dateRdv?: Date;
  heureRdv?: Date;
  batiment?: string;
  logement?: string;
  nomClient?: string;
  telClient?: string;
  tache?: string;
  cr?: string;
  travauxFinis?: string;
  presenceOccupant?: string;
  nomTechnicien?: string;
  heureDebutInter?: Date;
  heureFinInter?: Date;
  signatureTechnicien?: string;
  dateSignatureClient?: Date;
  nomSignataire?: string;
  prenomSignataire?: string;
  signatureClient?: string;
}

async function urlToBase64(url: string): Promise<string> {
  if (!url || url.startsWith("data:")) return url;
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  } catch {
    return url;
  }
}

function checkbox(checked: boolean): string {
  return `<span style="display:inline-block;width:12px;height:12px;border:1px solid #000;text-align:center;line-height:12px;font-size:12px;font-weight:bold;vertical-align:middle;">${checked ? "&#10003;" : ""}</span>`;
}

function buildQuitusHtml(
  data: QuitusData,
  sigTech: string,
  sigClient: string,
  logo: string
): string {
  const fmtDate = (d?: Date) =>
    d ? format(d, "dd/MM/yyyy", { locale: fr }) : "";
  const fmtTime = (d?: Date) => (d ? format(d, "HH:mm") : "");
  const v = (s?: string | number) =>
    s != null && s !== "" ? String(s) : "";

  const OG = "#fe6041"; // orange brand
  const GR = "#d0cece"; // gris labels
  const B = "border:2px solid #000;";
  const WT = "color:#fff;font-weight:bold;"; // white text

  const services = [
    "CHAUFFAGE - CLIMATISATION",
    "ÉNERGIES RENOUVELABLES",
    "VENTILATION",
    "PLOMBERIE - SANITAIRES",
    "ÉLECTRICITÉ",
    "CUISINES ÉQUIPÉES",
  ].join("<br>");

  const logoHtml = logo
    ? `<img src="${logo}" alt="CCM" style="max-width:100px;max-height:55px;object-fit:contain;display:block;margin:0 auto 6px;" />`
    : "";

  const sigTechHtml = sigTech
    ? `<img src="${sigTech}" style="max-width:120px;max-height:65px;object-fit:contain;" />`
    : "";
  const sigClientHtml = sigClient
    ? `<img src="${sigClient}" style="max-width:120px;max-height:65px;object-fit:contain;" />`
    : "";

  // ── TABLE 1 : Infos principales (4 cols × 25%) ───────────────────────────
  const t1 = `
<table style="border-collapse:collapse;width:100%;border:2px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;" cellpadding="0" cellspacing="0">
  <colgroup>
    <col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%">
  </colgroup>
  <tbody>
    <!-- Header : logo + company info -->
    <tr>
      <td colspan="2" rowspan="3" style="${B}padding:10px;text-align:center;vertical-align:middle;">
        ${logoHtml}
        <div style="font-size:8.5px;color:#333;line-height:1.7;text-align:center;">${services}</div>
      </td>
      <td colspan="2" style="${B}background:${OG};text-align:center;padding:8px;">
        <span style="${WT}font-size:13px;letter-spacing:0.3px;">CLIMAT &amp; CONFORT MOREAU</span>
      </td>
    </tr>
    <tr>
      <td style="${B}background:${OG};text-align:center;padding:6px;"><span style="${WT}">N° DOSSIER :</span></td>
      <td style="${B}text-align:center;padding:6px;font-weight:bold;">${v(data.numDossier)}</td>
    </tr>
    <tr>
      <td style="${B}background:${OG};text-align:center;padding:6px;"><span style="${WT}">QUITUS N°</span></td>
      <td style="${B}text-align:center;padding:6px;font-weight:bold;font-size:18px;">${data.numQuitus != null ? String(data.numQuitus) : ""}</td>
    </tr>
    <!-- Type d'intervention -->
    <tr>
      <td colspan="2" style="${B}background:${OG};text-align:center;padding:8px;"><span style="${WT}">TYPE D'INTERVENTION</span></td>
      <td colspan="2" style="${B}background:${GR};text-align:center;padding:8px;">${v(data.typeIntervention)}</td>
    </tr>
    <!-- Chantier -->
    <tr>
      <td colspan="4" style="${B}text-align:center;padding:8px;font-size:15px;font-weight:bold;">${v(data.nomChantier)}</td>
    </tr>
    <!-- Adresse -->
    <tr>
      <td colspan="4" style="${B}text-align:center;padding:7px;font-weight:bold;">${v(data.adresseChantier)}</td>
    </tr>
    <!-- Date / Heure RDV -->
    <tr>
      <td colspan="2" style="${B}text-align:center;padding:7px;font-weight:bold;">DATE ET HEURE RDV :</td>
      <td colspan="2" style="${B}text-align:center;padding:7px;font-weight:bold;">Le ${fmtDate(data.dateRdv)} à ${fmtTime(data.heureRdv)}</td>
    </tr>
    <!-- Batiment / LGT -->
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:6px;">BATIMENT :</td>
      <td style="${B}text-align:center;padding:6px;">${v(data.batiment)}</td>
      <td style="${B}background:${GR};text-align:center;padding:6px;">LGT :</td>
      <td style="${B}text-align:center;padding:6px;">${v(data.logement)}</td>
    </tr>
    <!-- Nom -->
    <tr>
      <td colspan="2" style="${B}background:${GR};text-align:center;padding:6px;">NOM :</td>
      <td colspan="2" style="${B}text-align:center;padding:6px;">${v(data.nomClient)}</td>
    </tr>
    <!-- Téléphone -->
    <tr>
      <td colspan="2" style="${B}background:${GR};text-align:center;padding:6px;">TELEPHONE :</td>
      <td colspan="2" style="${B}text-align:center;padding:6px;">${v(data.telClient)}</td>
    </tr>
    <!-- Commentaires Travaux -->
    <tr>
      <td colspan="4" style="${B}background:${GR};text-align:center;padding:7px;font-weight:bold;">COMMENTAIRES TRAVAUX</td>
    </tr>
    <tr>
      <td colspan="4" style="${B}text-align:center;padding:10px;min-height:35px;white-space:pre-wrap;">${v(data.tache)}</td>
    </tr>
  </tbody>
</table>`;

  // ── TABLE 2 : Rapport C&C (3 cols × 33%) ─────────────────────────────────
  const t2 = `
<table style="border-collapse:collapse;width:100%;border:2px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:5px;" cellpadding="0" cellspacing="0">
  <colgroup>
    <col style="width:33.333%"><col style="width:33.333%"><col style="width:33.333%">
  </colgroup>
  <tbody>
    <tr>
      <td colspan="3" style="${B}background:${GR};text-align:center;padding:8px;font-weight:bold;">RAPPORT CLIMAT &amp; CONFORT</td>
    </tr>
    <tr>
      <td colspan="3" style="${B}text-align:center;padding:10px;min-height:35px;white-space:pre-wrap;">${v(data.cr)}</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:7px;">TRAVAUX TOTALEMENT FINIS</td>
      <td style="${B}text-align:center;padding:7px;">OUI : ${checkbox(data.travauxFinis === "Oui")}</td>
      <td style="${B}text-align:center;padding:7px;">NON : ${checkbox(data.travauxFinis === "Non")}</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:7px;">PRESENCE OCCUPANT</td>
      <td style="${B}text-align:center;padding:7px;">OUI : ${checkbox(data.presenceOccupant === "Oui")}</td>
      <td style="${B}text-align:center;padding:7px;">NON : ${checkbox(data.presenceOccupant === "Non")}</td>
    </tr>
  </tbody>
</table>`;

  // ── TABLE 3 : Émargement (4 cols × 25%) ──────────────────────────────────
  const t3 = `
<table style="border-collapse:collapse;width:100%;border:2px solid #000;font-family:Arial,Helvetica,sans-serif;font-size:12px;margin-top:5px;" cellpadding="0" cellspacing="0">
  <colgroup>
    <col style="width:25%"><col style="width:25%"><col style="width:25%"><col style="width:25%">
  </colgroup>
  <tbody>
    <tr>
      <td colspan="2" style="${B}background:${GR};text-align:center;padding:8px;font-weight:bold;">EMARGEMENT TECHNICIEN</td>
      <td colspan="2" style="${B}background:${GR};text-align:center;padding:8px;font-weight:bold;">EMARGEMENT CLIENT</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:6px;">NOM PRENOM :</td>
      <td style="${B}text-align:center;padding:6px;">${v(data.nomTechnicien)}</td>
      <td style="${B}background:${GR};text-align:center;padding:6px;">DATE :</td>
      <td style="${B}text-align:center;padding:6px;">${fmtDate(data.dateSignatureClient)}</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:6px;">HEURE ARRIVEE :</td>
      <td style="${B}text-align:center;padding:6px;">${fmtTime(data.heureDebutInter)}</td>
      <td style="${B}background:${GR};text-align:center;padding:6px;">NOM :</td>
      <td style="${B}text-align:center;padding:6px;">${v(data.nomSignataire)}</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:6px;">HEURE DEPART :</td>
      <td style="${B}text-align:center;padding:6px;">${fmtTime(data.heureFinInter)}</td>
      <td style="${B}background:${GR};text-align:center;padding:6px;">PRENOM :</td>
      <td style="${B}text-align:center;padding:6px;">${v(data.prenomSignataire)}</td>
    </tr>
    <tr>
      <td style="${B}background:${GR};text-align:center;padding:6px;">SIGNATURE :</td>
      <td style="${B}text-align:center;padding:10px;height:70px;">${sigTechHtml}</td>
      <td style="${B}background:${GR};text-align:center;padding:6px;">SIGNATURE :</td>
      <td style="${B}text-align:center;padding:10px;height:70px;">${sigClientHtml}</td>
    </tr>
  </tbody>
</table>`;

  const footer = `
<div style="font-family:Arial,Helvetica,sans-serif;font-size:7.5px;color:#444;text-align:center;margin-top:10px;line-height:1.6;">
  3, rue des Châtaigniers - Parc Industriel de Tabari - BP 29412 - 44194 CLISSON CEDEX - Tél. 02 40 54 02 24 - Fax 02 40 03 93 74 - Email : contact@climatconfortmoreau.fr<br>
  S.A.S. au capital 110 000 € / R.P.A. / C.I.C. / 872 802 905 RCS Nantes / R.M. Nantes 872 802 905 / N° TVA : FR 39 872 802 905 / S.I.R.E.T. 872 802 905 00028 / APE 4322A<br>
  Agence : ZAC de l'Aubinière - 222, rue Madame Sévigné - BP 80143 - 44154 ANCENIS CEDEX 4 - Tél. 02 40 98 04 48 - Fax 02 40 98 20 93 - SIRET 872 802 905 00036
</div>`;

  return `<div style="width:794px;background:#fff;padding:10px 12px;box-sizing:border-box;">${t1}${t2}${t3}${footer}</div>`;
}

export async function generateQuitusPdf(data: QuitusData): Promise<Blob> {
  // Charger toutes les images en base64 en parallèle
  const [sigTech, sigClient, logo] = await Promise.all([
    data.signatureTechnicien ? urlToBase64(data.signatureTechnicien) : Promise.resolve(""),
    data.signatureClient ? urlToBase64(data.signatureClient) : Promise.resolve(""),
    urlToBase64("/logo-ccm.jpg"),
  ]);

  const html = buildQuitusHtml(data, sigTech, sigClient, logo);

  // Overlay blanc pour masquer la page pendant la génération.
  // Le container PDF (z-index max) reste visible à l'utilisateur — c'est inévitable
  // avec html2canvas qui exige que l'élément soit dans le viewport.
  const overlay = document.createElement("div");
  overlay.style.cssText =
    "position:fixed;inset:0;background:#fff;z-index:2147483646;pointer-events:none;";
  document.body.appendChild(overlay);

  // position:fixed;top:0;left:0 est obligatoire — html2canvas ne capture que les
  // éléments visibles dans le viewport. opacity:0 ou left:-9999px → PDF blanc.
  const container = document.createElement("div");
  container.style.cssText =
    "position:fixed;top:0;left:0;width:794px;background:#fff;" +
    "z-index:2147483647;pointer-events:none;overflow:visible;";
  container.innerHTML = html;
  document.body.appendChild(container);

  // Attendre que les images (logo, signatures) soient peintes
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const h2cMod = await import("html2canvas");
    const html2canvas: (
      el: HTMLElement,
      opts?: Record<string, unknown>
    ) => Promise<HTMLCanvasElement> = (h2cMod as any).default ?? h2cMod;

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      width: 794,
      windowWidth: 794,
      backgroundColor: "#ffffff",
    });

    const jsPDFMod = await import("jspdf");
    const JsPDF: any =
      (jsPDFMod as any).jsPDF ??
      (jsPDFMod as any).default?.jsPDF ??
      (jsPDFMod as any).default;

    const pdf = new JsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth(); // 210 mm
    const pageH = pdf.internal.pageSize.getHeight(); // 297 mm

    // canvas est rendu à scale:2 → diviser par 2 pour les px réels
    const imgWmm = pageW;
    const imgHmm = (canvas.height / 2) * (pageW / (canvas.width / 2));
    const imgData = canvas.toDataURL("image/jpeg", 0.97);

    if (imgHmm <= pageH) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgWmm, imgHmm);
    } else {
      // Découpage multi-page
      const pxPerPagePx = Math.floor((canvas.height / imgHmm) * pageH);
      let yPx = 0;
      let first = true;
      while (yPx < canvas.height) {
        if (!first) pdf.addPage();
        first = false;
        const sliceH = Math.min(pxPerPagePx, canvas.height - yPx);
        const sliceCanvas = document.createElement("canvas");
        sliceCanvas.width = canvas.width;
        sliceCanvas.height = sliceH;
        sliceCanvas
          .getContext("2d")!
          .drawImage(canvas, 0, yPx, canvas.width, sliceH, 0, 0, canvas.width, sliceH);
        const sliceHmm = (sliceH / 2) * (pageW / (canvas.width / 2));
        pdf.addImage(sliceCanvas.toDataURL("image/jpeg", 0.97), "JPEG", 0, 0, pageW, sliceHmm);
        yPx += pxPerPagePx;
      }
    }

    return pdf.output("blob") as Blob;
  } finally {
    document.body.removeChild(container);
    document.body.removeChild(overlay);
  }
}
