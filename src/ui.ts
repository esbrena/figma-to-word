import {
  AlignmentType,
  Document,
  FileChild,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { jsPDF } from "jspdf";
import type {
  ExportDocument,
  ExportFrame,
  InferredTable,
  PluginToUiMessage,
  TextBlock,
  UiToPluginMessage,
} from "./types";

const generateButton = getElement<HTMLButtonElement>("generateButton");
const exportButton = getElement<HTMLButtonElement>("exportButton");
const closeButton = getElement<HTMLButtonElement>("closeButton");
const filenameInput = getElement<HTMLInputElement>("filenameInput");
const formatSelect = getElement<HTMLSelectElement>("formatSelect");
const selectionSummary = getElement<HTMLDivElement>("selectionSummary");
const previewContainer = getElement<HTMLDivElement>("previewContainer");
const statusMessage = getElement<HTMLDivElement>("statusMessage");

let currentDocument: ExportDocument | null = null;
let selectedFrameCount = 0;

generateButton.addEventListener("click", () => {
  setStatus("Generando documento desde los frames seleccionados...");
  currentDocument = null;
  renderEmptyPreview("La previsualizacion aparecera aqui cuando termine la generacion.");
  exportButton.disabled = true;
  postMessageToPlugin({ type: "generate-document" });
});

exportButton.addEventListener("click", async () => {
  if (!currentDocument) {
    setStatus("Primero genera una previsualizacion.");
    return;
  }

  exportButton.disabled = true;
  setStatus("Preparando descarga...");

  try {
    if (formatSelect.value === "docx") {
      await exportDocx(currentDocument);
    } else {
      exportPdf(currentDocument);
    }

    setStatus("Archivo listo. Si tu navegador lo solicita, confirma la descarga.");
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : "No se pudo exportar el documento.",
      true,
    );
  } finally {
    exportButton.disabled = false;
  }
});

closeButton.addEventListener("click", () => {
  postMessageToPlugin({ type: "close-plugin" });
});

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as PluginToUiMessage | undefined;

  if (!message) {
    return;
  }

  if (message.type === "selection-summary") {
    selectedFrameCount = message.payload.frameCount;
    generateButton.disabled = selectedFrameCount === 0;
    selectionSummary.innerHTML = renderSelectionSummary(
      message.payload.frameCount,
      message.payload.frameNames,
    );
    return;
  }

  if (message.type === "generation-started") {
    generateButton.disabled = true;
    exportButton.disabled = true;
    setStatus("Leyendo capas, textos e imagenes...");
    return;
  }

  if (message.type === "document-ready") {
    currentDocument = message.payload;
    generateButton.disabled = selectedFrameCount === 0;
    exportButton.disabled = false;
    setDefaultFilename(message.payload);
    renderPreview(message.payload);
    setStatus("Previsualizacion generada. Define el nombre y exporta el archivo.");
    return;
  }

  if (message.type === "generation-error") {
    generateButton.disabled = selectedFrameCount === 0;
    exportButton.disabled = true;
    setStatus(message.payload.message, true);
  }
};

postMessageToPlugin({ type: "selection-summary-request" });
renderEmptyPreview("Selecciona frames en Figma y pulsa Generar.");

function postMessageToPlugin(message: UiToPluginMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function renderSelectionSummary(frameCount: number, frameNames: string[]) {
  if (frameCount === 0) {
    return `
      <strong>No hay frames seleccionados.</strong>
      <span>Selecciona uno o varios frames en Figma para poder generar el documento.</span>
    `;
  }

  return `
    <strong>${frameCount} frame${frameCount === 1 ? "" : "s"} seleccionado${
      frameCount === 1 ? "" : "s"
    }.</strong>
    <span>${frameNames.map(escapeHtml).join(", ")}</span>
  `;
}

function renderPreview(document: ExportDocument) {
  previewContainer.innerHTML = `
    <section class="document-preview">
      <header class="document-header">
        <p class="eyebrow">Previsualizacion</p>
        <h2>Documento exportable</h2>
        <p>${document.frames.length} frame${
          document.frames.length === 1 ? "" : "s"
        } procesado${document.frames.length === 1 ? "" : "s"}</p>
      </header>
      ${document.frames.map(renderFramePreview).join("")}
    </section>
  `;
}

function renderFramePreview(frame: ExportFrame) {
  return `
    <article class="frame-preview">
      <div class="frame-heading">
        <div>
          <p class="eyebrow">Frame</p>
          <h3>${escapeHtml(frame.name)}</h3>
        </div>
        <span>${frame.width} x ${frame.height}px</span>
      </div>
      <img class="frame-image" src="${frame.previewDataUrl}" alt="${escapeHtml(
        frame.name,
      )}" />
      ${renderTextBlocks(frame.textBlocks)}
      ${renderTables(frame.tables)}
      ${renderImages(frame)}
    </article>
  `;
}

function renderTextBlocks(blocks: TextBlock[]) {
  if (blocks.length === 0) {
    return `<p class="empty-note">No se han encontrado capas de texto en este frame.</p>`;
  }

  return `
    <section class="preview-section">
      <h4>Textos copiables (${blocks.length})</h4>
      <div class="text-block-list">
        ${blocks
          .map(
            (block) => `
              <div class="text-block">
                <span>${escapeHtml(block.name)} | x:${block.x} y:${block.y}</span>
                <p>${escapeHtml(block.text).replace(/\n/g, "<br />")}</p>
              </div>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderTables(tables: InferredTable[]) {
  if (tables.length === 0) {
    return "";
  }

  return `
    <section class="preview-section">
      <h4>Tablas inferidas</h4>
      ${tables
        .map(
          (table) => `
            <div class="table-wrapper">
              <strong>${escapeHtml(table.name)}</strong>
              <table>
                <tbody>
                  ${table.rows
                    .map(
                      (row) => `
                        <tr>${row
                          .map((cell) => `<td>${escapeHtml(cell)}</td>`)
                          .join("")}</tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `,
        )
        .join("")}
    </section>
  `;
}

function renderImages(frame: ExportFrame) {
  if (frame.imageBlocks.length === 0) {
    return "";
  }

  return `
    <section class="preview-section">
      <h4>Imagenes detectadas (${frame.imageBlocks.length})</h4>
      <div class="image-grid">
        ${frame.imageBlocks
          .map(
            (image) => `
              <figure>
                <img src="${image.dataUrl}" alt="${escapeHtml(image.name)}" />
                <figcaption>${escapeHtml(image.name)}</figcaption>
              </figure>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderEmptyPreview(message: string) {
  previewContainer.innerHTML = `
    <div class="empty-preview">
      <h2>Figma to Word/PDF</h2>
      <p>${escapeHtml(message)}</p>
      <ol>
        <li>Selecciona los frames que quieres exportar.</li>
        <li>Pulsa <strong>Generar</strong> para crear la previsualizacion.</li>
        <li>Define el nombre del archivo y pulsa <strong>Exportar</strong>.</li>
      </ol>
    </div>
  `;
}

function exportPdf(document: ExportDocument) {
  const pdf = new jsPDF({ format: "a4", unit: "pt" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 42;
  let y = margin;

  pdf.setProperties({
    title: getFilenameWithoutExtension(),
    subject: "Exportacion de frames de Figma",
  });

  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(20);
  pdf.text("Documento exportado desde Figma", margin, y);
  y += 26;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(10);
  pdf.text(`Generado: ${new Date(document.generatedAt).toLocaleString()}`, margin, y);
  y += 28;

  document.frames.forEach((frame, index) => {
    if (index > 0) {
      pdf.addPage();
      y = margin;
    }

    y = writeFrameToPdf(pdf, frame, margin, y, pageWidth, pageHeight);
  });

  pdf.save(`${getFilenameWithoutExtension()}.pdf`);
}

function writeFrameToPdf(
  pdf: jsPDF,
  frame: ExportFrame,
  margin: number,
  startY: number,
  pageWidth: number,
  pageHeight: number,
) {
  let y = startY;

  y = ensurePdfSpace(pdf, y, 80, margin, pageHeight);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(16);
  pdf.text(frame.name, margin, y);
  y += 18;
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(9);
  pdf.text(`${frame.width} x ${frame.height}px`, margin, y);
  y += 16;

  const imageSize = fitWithin(frame.width, frame.height, pageWidth - margin * 2, 260);
  y = ensurePdfSpace(pdf, y, imageSize.height + 24, margin, pageHeight);
  pdf.addImage(frame.previewDataUrl, "PNG", margin, y, imageSize.width, imageSize.height);
  y += imageSize.height + 24;

  if (frame.textBlocks.length > 0) {
    y = writePdfSectionTitle(pdf, "Textos copiables", margin, y, pageHeight);

    for (const block of frame.textBlocks) {
      y = ensurePdfSpace(pdf, y, 34, margin, pageHeight);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(9);
      pdf.text(`${block.name} (x:${block.x} y:${block.y})`, margin, y);
      y += 11;
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(Math.min(Math.max(block.fontSize ?? 10, 8), 13));

      const lines = pdf.splitTextToSize(block.text, pageWidth - margin * 2);
      for (const line of lines) {
        y = ensurePdfSpace(pdf, y, 14, margin, pageHeight);
        pdf.text(line, margin, y);
        y += 14;
      }
      y += 8;
    }
  }

  if (frame.tables.length > 0) {
    y = writePdfSectionTitle(pdf, "Tablas inferidas", margin, y, pageHeight);
    for (const table of frame.tables) {
      y = drawPdfTable(pdf, table, margin, y, pageWidth - margin * 2, pageHeight);
      y += 16;
    }
  }

  return y;
}

function writePdfSectionTitle(
  pdf: jsPDF,
  title: string,
  margin: number,
  y: number,
  pageHeight: number,
) {
  y = ensurePdfSpace(pdf, y, 28, margin, pageHeight);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(12);
  pdf.text(title, margin, y);
  return y + 16;
}

function drawPdfTable(
  pdf: jsPDF,
  table: InferredTable,
  margin: number,
  startY: number,
  width: number,
  pageHeight: number,
) {
  let y = ensurePdfSpace(pdf, startY, 34, margin, pageHeight);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(10);
  pdf.text(table.name, margin, y);
  y += 10;

  const columnCount = Math.max(...table.rows.map((row) => row.length));
  const columnWidth = width / columnCount;
  const rowHeight = 24;

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8);

  for (const row of table.rows) {
    y = ensurePdfSpace(pdf, y, rowHeight + 4, margin, pageHeight);

    row.forEach((cell, columnIndex) => {
      const x = margin + columnIndex * columnWidth;
      pdf.rect(x, y, columnWidth, rowHeight);
      const lines = pdf.splitTextToSize(cell, columnWidth - 8).slice(0, 2);
      pdf.text(lines, x + 4, y + 10);
    });

    y += rowHeight;
  }

  return y;
}

function ensurePdfSpace(
  pdf: jsPDF,
  y: number,
  needed: number,
  margin: number,
  pageHeight: number,
) {
  if (y + needed <= pageHeight - margin) {
    return y;
  }

  pdf.addPage();
  return margin;
}

async function exportDocx(document: ExportDocument) {
  const children: FileChild[] = [
    new Paragraph({
      text: "Documento exportado desde Figma",
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [
        new TextRun(`Generado: ${new Date(document.generatedAt).toLocaleString()}`),
      ],
    }),
  ];

  for (const frame of document.frames) {
    children.push(...buildDocxFrame(frame));
  }

  const doc = new Document({
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${getFilenameWithoutExtension()}.docx`);
}

function buildDocxFrame(frame: ExportFrame) {
  const children: FileChild[] = [
    new Paragraph({
      text: frame.name,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 360, after: 120 },
    }),
    new Paragraph({
      text: `${frame.width} x ${frame.height}px`,
      spacing: { after: 160 },
    }),
  ];

  const previewSize = fitWithin(frame.width, frame.height, 560, 360);
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new ImageRun({
          type: "png",
          data: dataUrlToUint8Array(frame.previewDataUrl),
          transformation: previewSize,
        }),
      ],
    }),
  );

  children.push(
    new Paragraph({
      text: "Textos copiables",
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 240, after: 80 },
    }),
  );

  if (frame.textBlocks.length === 0) {
    children.push(new Paragraph("No se han encontrado capas de texto."));
  } else {
    for (const block of frame.textBlocks) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: `${block.name} (x:${block.x} y:${block.y})`,
              bold: true,
            }),
          ],
        }),
        new Paragraph({
          children: [new TextRun(block.text)],
          spacing: { after: 120 },
        }),
      );
    }
  }

  if (frame.tables.length > 0) {
    children.push(
      new Paragraph({
        text: "Tablas inferidas",
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 80 },
      }),
    );

    for (const table of frame.tables) {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: table.name, bold: true })],
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: table.rows.map(
            (row) =>
              new TableRow({
                children: row.map(
                  (cell) =>
                    new TableCell({
                      children: [new Paragraph(cell)],
                    }),
                ),
              }),
          ),
        }),
      );
    }
  }

  return children;
}

function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] ?? "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function setDefaultFilename(document: ExportDocument) {
  if (filenameInput.value.trim()) {
    return;
  }

  const firstFrame = document.frames[0]?.name ?? "figma-export";
  filenameInput.value = sanitizeFilename(firstFrame);
}

function getFilenameWithoutExtension() {
  return sanitizeFilename(filenameInput.value.trim() || "figma-export");
}

function sanitizeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_ ]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .toLowerCase()
    .slice(0, 80);
}

function setStatus(message: string, isError = false) {
  statusMessage.textContent = message;
  statusMessage.dataset.state = isError ? "error" : "info";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`No se encontro el elemento #${id}.`);
  }

  return element as T;
}
