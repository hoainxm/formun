import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import type { Choreography } from "../types/choreography";
import { formatTimestamp, getPreviousFormation, getSortedDancers, getSortedFormations } from "./geometry";

export interface ExportPdfOptions {
  includePaths: boolean;
  includeComments: boolean;
  labelMode: "label" | "name" | "both";
}

const waitForFrame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const safeFilename = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "choreography";

const colorClassToCss = (className: string) => {
  const map: Record<string, string> = {
    "bg-primary": "hsl(var(--primary))",
    "bg-accent": "hsl(var(--accent))",
    "bg-success": "hsl(var(--success))",
    "bg-warning": "hsl(var(--warning))",
    "bg-danger": "hsl(var(--danger))",
    "bg-muted": "hsl(var(--muted))",
    "bg-muted-foreground": "hsl(var(--muted-foreground))",
  };
  return map[className] || "hsl(var(--primary))";
};

const escapeHtml = (value: unknown) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const buildStageSvg = (choreography: Choreography, formationId: string, options: ExportPdfOptions) => {
  const sortedFormations = getSortedFormations(choreography);
  const sortedDancers = getSortedDancers(choreography);
  const formation = sortedFormations.find((item) => item.id === formationId);
  if (!formation) return "";

  const previous = getPreviousFormation(sortedFormations, formation.id);
  const props = choreography.props.filter((prop) => !prop.formationId || prop.formationId === formation.id);
  const gridSize = choreography.stage.gridSize || 5;
  const gridLines: string[] = [];

  for (let x = gridSize; x < choreography.stage.width; x += gridSize) {
    gridLines.push(`<line x1="${x}" y1="0" x2="${x}" y2="${choreography.stage.height}" class="pdf-grid-line" />`);
  }
  for (let y = gridSize; y < choreography.stage.height; y += gridSize) {
    gridLines.push(`<line x1="0" y1="${y}" x2="${choreography.stage.width}" y2="${y}" class="pdf-grid-line" />`);
  }

  const paths =
    options.includePaths && previous
      ? sortedDancers
          .map((dancer) => {
            const from = previous.positions[dancer.id];
            const to = formation.positions[dancer.id];
            if (!from || !to) return "";
            return `<line x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke="${colorClassToCss(dancer.color)}" stroke-width="0.55" stroke-dasharray="1.3 1" marker-end="url(#arrow)" />`;
          })
          .join("")
      : "";

  const propMarkup = props
    .map((prop) => {
      const fill = colorClassToCss(prop.color);
      const centerX = prop.x + prop.width / 2;
      const centerY = prop.y + prop.height / 2;
      if (prop.shape === "circle") {
        return `<ellipse cx="${centerX}" cy="${centerY}" rx="${prop.width / 2}" ry="${prop.height / 2}" fill="${fill}" opacity="${prop.opacity}" stroke="hsl(var(--foreground))" stroke-opacity="0.25" stroke-width="0.35" transform="rotate(${prop.rotation} ${centerX} ${centerY})" />`;
      }
      return `<rect x="${prop.x}" y="${prop.y}" width="${prop.width}" height="${prop.height}" rx="1" fill="${fill}" opacity="${prop.opacity}" stroke="hsl(var(--foreground))" stroke-opacity="0.25" stroke-width="0.35" transform="rotate(${prop.rotation} ${centerX} ${centerY})" />`;
    })
    .join("");

  const dancerMarkup = sortedDancers
    .map((dancer) => {
      const position = formation.positions[dancer.id];
      if (!position) return "";
      const fill = colorClassToCss(dancer.color);
      const label = options.labelMode === "name" ? dancer.name : options.labelMode === "both" ? `${dancer.label} ${dancer.name}` : dancer.label;
      const shape =
        dancer.shape === "square"
          ? `<rect x="${position.x - 2.1}" y="${position.y - 2.1}" width="4.2" height="4.2" rx="0.65" fill="${fill}" />`
          : dancer.shape === "triangle"
            ? `<path d="M ${position.x} ${position.y - 2.7} L ${position.x + 2.6} ${position.y + 2.1} L ${position.x - 2.6} ${position.y + 2.1} Z" fill="${fill}" />`
            : `<circle cx="${position.x}" cy="${position.y}" r="2.45" fill="${fill}" />`;
      return `<g class="pdf-dancer">${shape}<text x="${position.x}" y="${position.y + 0.45}" text-anchor="middle" dominant-baseline="middle">${escapeHtml(label)}</text></g>`;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${choreography.stage.width} ${choreography.stage.height}" class="pdf-stage-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <marker id="arrow" markerWidth="3" markerHeight="3" refX="2" refY="1.5" orient="auto">
          <path d="M0,0 L3,1.5 L0,3 Z" fill="hsl(var(--muted-foreground))" />
        </marker>
      </defs>
      <rect x="0" y="0" width="${choreography.stage.width}" height="${choreography.stage.height}" rx="1.2" fill="hsl(var(--stage))" />
      <text x="${choreography.stage.width / 2}" y="3.6" text-anchor="middle" class="pdf-stage-label">BACKSTAGE</text>
      <text x="${choreography.stage.width / 2}" y="${choreography.stage.height - 2.2}" text-anchor="middle" class="pdf-stage-label">AUDIENCE</text>
      ${gridLines.join("")}
      ${paths}
      ${propMarkup}
      ${dancerMarkup}
    </svg>
  `;
};

export const exportChoreographyPdf = async (choreography: Choreography, options: ExportPdfOptions) => {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "1122px";
  container.style.background = "hsl(var(--card))";
  document.body.appendChild(container);

  const sortedFormations = getSortedFormations(choreography);
  const sortedDancers = getSortedDancers(choreography);

  container.innerHTML = `
    <section class="print-page p-10">
      <div class="flex h-full flex-col justify-between">
        <div>
          <p class="text-sm font-semibold text-primary">Formun choreography packet</p>
          <h1 class="mt-4 text-4xl font-semibold">${escapeHtml(choreography.name)}</h1>
          <p class="mt-3 text-base text-muted-foreground">${escapeHtml(choreography.description || "")}</p>
        </div>
        <div class="grid grid-cols-3 gap-4 text-sm">
          <div class="rounded-lg border border-border p-4">
            <div class="text-muted-foreground">Dancers</div>
            <div class="mt-2 text-2xl font-semibold">${sortedDancers.length}</div>
          </div>
          <div class="rounded-lg border border-border p-4">
            <div class="text-muted-foreground">Formations</div>
            <div class="mt-2 text-2xl font-semibold">${sortedFormations.length}</div>
          </div>
          <div class="rounded-lg border border-border p-4">
            <div class="text-muted-foreground">Stage</div>
            <div class="mt-2 text-2xl font-semibold">${choreography.stage.width} x ${choreography.stage.height}</div>
          </div>
        </div>
      </div>
    </section>
    ${sortedFormations
      .map((formation) => `
        <section class="print-page p-8">
          <div class="mb-4 flex items-start justify-between border-b border-border pb-3">
            <div>
              <h2 class="text-2xl font-semibold">${escapeHtml(formation.name)}</h2>
              <p class="text-sm text-muted-foreground">${formatTimestamp(formation.timestampSeconds)}${formation.durationSeconds ? ` - ${formation.durationSeconds}s` : ""}</p>
            </div>
            <div class="text-right text-sm font-semibold text-primary">${escapeHtml(choreography.name)}</div>
          </div>
          <div class="grid grid-cols-[minmax(0,1fr)_210px] gap-4">
            <div class="pdf-stage-frame">${buildStageSvg(choreography, formation.id, options)}</div>
            <div class="grid content-start gap-3">
              <div class="rounded-lg border border-border p-3">
                <div class="mb-2 text-xs font-semibold uppercase text-muted-foreground">Dancers</div>
                <div class="grid grid-cols-2 gap-1 text-xs">
                  ${sortedDancers.map((dancer) => `<div class="flex items-center gap-1"><span class="inline-block h-2 w-2 rounded-full ${dancer.color}"></span><span>${escapeHtml(dancer.label)} ${escapeHtml(dancer.name)}</span></div>`).join("")}
                </div>
              </div>
              ${options.includeComments ? `<div class="rounded-lg border border-border p-3 text-sm"><div class="mb-1 text-xs font-semibold uppercase text-muted-foreground">Notes</div><div>${escapeHtml(formation.comments || "")}</div></div>` : ""}
            </div>
          </div>
        </section>
      `)
      .join("")}
  `;

  await waitForFrame();

  try {
    const pages = Array.from(container.querySelectorAll(".print-page")) as HTMLElement[];
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4", compress: true });
    for (let index = 0; index < pages.length; index += 1) {
      if (index > 0) pdf.addPage();
      const canvas = await html2canvas(pages[index], {
        scale: 3,
        backgroundColor: "hsl(0 0% 100%)",
        useCORS: true,
        logging: false,
      });
      const imgData = canvas.toDataURL("image/png", 1);
      pdf.addImage(imgData, "PNG", 0, 0, 297, 210);
    }
    pdf.save(`${safeFilename(choreography.name)}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
};
