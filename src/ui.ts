import {
  AlignmentType,
  Document as DocxDocument,
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
  PluginState,
  PluginToUiMessage,
  TranslationPair,
  TranslationTable,
  UiToPluginMessage,
} from "./types";

const captureScreenButton = getElement<HTMLButtonElement>("captureScreenButton");
const captureTableButton = getElement<HTMLButtonElement>("captureTableButton");
const importTableButton = getElement<HTMLButtonElement>("importTableButton");
const clearButton = getElement<HTMLButtonElement>("clearButton");
const exportButton = getElement<HTMLButtonElement>("exportButton");
const closeButton = getElement<HTMLButtonElement>("closeButton");
const filenameInput = getElement<HTMLInputElement>("filenameInput");
const formatSelect = getElement<HTMLSelectElement>("formatSelect");
const columnsInput = getElement<HTMLTextAreaElement>("columnsInput");
const selectionSummary = getElement<HTMLDivElement>("selectionSummary");
const draftSummary = getElement<HTMLDivElement>("draftSummary");
const previewContainer = getElement<HTMLDivElement>("previewContainer");
const statusMessage = getElement<HTMLDivElement>("statusMessage");

let currentState: PluginState | null = null;

captureScreenButton.addEventListener("click", () => {
  setStatus("Validando y capturando pantalla...");
  postMessageToPlugin({ type: "capture-screen" });
});

captureTableButton.addEventListener("click", () => {
  setStatus("Validando tabla de traducciones...");
  postMessageToPlugin({ type: "capture-table" });
});

importTableButton.addEventListener("click", () => {
  postMessageToPlugin({
    type: "import-template-table",
    payload: { columns: getTemplateColumns() },
  });
});

clearButton.addEventListener("click", () => {
  postMessageToPlugin({ type: "clear-pairs" });
});

closeButton.addEventListener("click", () => {
  postMessageToPlugin({ type: "close-plugin" });
});

exportButton.addEventListener("click", async () => {
  if (!currentState || currentState.document.pairs.length === 0) {
    setStatus("Campos obligatorios: captura al menos una pantalla y una tabla.", true);
    return;
  }

  const exportDocument: ExportDocument = {
    ...currentState.document,
    generatedAt: new Date().toISOString(),
  };

  exportButton.disabled = true;
  setStatus("Preparando descarga...");

  try {
    if (formatSelect.value === "docx") {
      await exportDocx(exportDocument);
    } else {
      exportPdf(exportDocument);
    }

    setStatus("Archivo listo. Si tu navegador lo solicita, confirma la descarga.");
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "No se pudo exportar el documento.",
      true,
    );
  } finally {
    exportButton.disabled = false;
  }
});

previewContainer.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const pairId = target.dataset.removePair;

  if (pairId) {
    postMessageToPlugin({ type: "remove-pair", payload: { id: pairId } });
  }
});

window.onmessage = (event: MessageEvent) => {
  const message = event.data.pluginMessage as PluginToUiMessage | undefined;

  if (!message) {
    return;
  }

  if (message.type === "state") {
    currentState = message.payload;
    renderState(message.payload);
    return;
  }

  if (message.type === "busy") {
    setStatus(message.payload.message);
    return;
  }

  if (message.type === "notice") {
    setStatus(message.payload.message, message.payload.level === "error");
  }
};

postMessageToPlugin({ type: "state-request" });
renderEmptyPreview();

function renderState(state: PluginState) {
  selectionSummary.innerHTML = renderSelection(state);
  draftSummary.innerHTML = renderDraft(state);
  exportButton.disabled = state.document.pairs.length === 0;
  clearButton.disabled =
    state.document.pairs.length === 0 && !state.draft.screen && !state.draft.table;

  if (state.document.pairs.length === 0) {
    renderEmptyPreview();
  } else {
    renderPreview(state.document);
    setDefaultFilename(state.document);
  }
}

function renderSelection(state: PluginState) {
  if (state.selection.count === 0) {
    return `
      <strong>Nada seleccionado</strong>
      <span>Selecciona una pantalla o una tabla en Figma y pulsa el boton correspondiente.</span>
    `;
  }

  return `
    <strong>${state.selection.count} elemento${
      state.selection.count === 1 ? "" : "s"
    } seleccionado${state.selection.count === 1 ? "" : "s"}</strong>
    <span>${state.selection.names.map(escapeHtml).join(", ")}</span>
  `;
}

function renderDraft(state: PluginState) {
  const screen = state.draft.screen;
  const table = state.draft.table;

  return `
    <div class="draft-row ${screen ? "complete" : ""}">
      <span>Pantalla</span>
      <strong>${screen ? escapeHtml(screen.name) : "Obligatoria"}</strong>
    </div>
    <div class="draft-row ${table ? "complete" : ""}">
      <span>Tabla</span>
      <strong>${table ? escapeHtml(table.name) : "Obligatoria"}</strong>
    </div>
    <p>Cuando ambos campos estan capturados, se anade una entrada al documento.</p>
  `;
}

function renderPreview(document: ExportDocument) {
  previewContainer.innerHTML = `
    <section class="document-preview">
      <header class="document-header">
        <p class="eyebrow">Previsualizacion</p>
        <h2>Documento de traducciones</h2>
        <p>${document.pairs.length} pantalla${
          document.pairs.length === 1 ? "" : "s"
        } preparada${document.pairs.length === 1 ? "" : "s"} para exportar.</p>
      </header>
      ${document.pairs.map(renderPairPreview).join("")}
    </section>
  `;
}

function renderPairPreview(pair: TranslationPair, index: number) {
  return `
    <article class="pair-preview">
      <div class="pair-heading">
        <div>
          <p class="eyebrow">Pantalla ${index + 1}</p>
          <h3>${escapeHtml(pair.screen.name)}</h3>
        </div>
        <button class="button small" type="button" data-remove-pair="${pair.id}">
          Eliminar
        </button>
      </div>
      <div class="pair-content">
        <img class="screen-image" src="${pair.screen.dataUrl}" alt="${escapeHtml(
          pair.screen.name,
        )}" />
        ${renderTranslationTable(pair.table)}
      </div>
    </article>
  `;
}

function renderTranslationTable(table: TranslationTable) {
  return `
    <div class="table-wrapper">
      <strong>${escapeHtml(table.name)}</strong>
      <table>
        <thead>
          <tr>${table.headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${table.rows
            .map(
              (row) => `
                <tr>${table.headers
                  .map((_, index) => `<td>${escapeHtml(row[index] || "")}</td>`)
                  .join("")}</tr>
              `,
            )
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderEmptyPreview() {
  previewContainer.innerHTML = `
    <div class="empty-preview">
      <h2>Plugin de traducciones UI</h2>
      <p>Captura una pantalla y una tabla de traducciones para crear el documento.</p>
      <ol>
        <li>Selecciona la pantalla PNG o frame y pulsa <strong>Capturar pantalla</strong>.</li>
        <li>Selecciona la tabla editable de traducciones y pulsa <strong>Capturar tabla</strong>.</li>
        <li>Si no tienes tabla, pulsa <strong>Importar tabla plantilla</strong>, editala en Figma y capturala.</li>
        <li>Repite el proceso para tantas pantallas como necesites.</li>
      </ol>
    </div>
  `;
}

function exportPdf(document: ExportDocument) {
  const pdf = new jsPDF({ format: "a4", orientation: "landscape", unit: "pt" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 36;
  const title = getFilenameWithoutExtension();

  pdf.setProperties({
    title,
    subject: "Documento de traducciones UI",
  });

  document.pairs.forEach((pair, index) => {
    if (index > 0) {
      pdf.addPage();
    }

    let y = margin;
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(18);
    pdf.text(title, margin, y);
    y += 18;
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(`Fecha de generacion: ${formatDate(document.generatedAt)}`, margin, y);
    y += 26;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(13);
    pdf.text(pair.screen.name, margin, y);
    y += 14;

    const gap = 24;
    const leftWidth = (pageWidth - margin * 2 - gap) * 0.45;
    const rightWidth = pageWidth - margin * 2 - gap - leftWidth;
    const maxContentHeight = pageHeight - y - margin;
    const imageSize = fitWithin(pair.screen.width, pair.screen.height, leftWidth, maxContentHeight);

    pdf.addImage(pair.screen.dataUrl, "JPEG", margin, y, imageSize.width, imageSize.height);
    drawPdfTable(pdf, pair.table, margin + leftWidth + gap, y, rightWidth, maxContentHeight);
  });

  pdf.save(`${title}.pdf`);
}

function drawPdfTable(
  pdf: jsPDF,
  table: TranslationTable,
  x: number,
  y: number,
  width: number,
  maxHeight: number,
) {
  const columnCount = Math.max(table.headers.length, 1);
  const columnWidth = width / columnCount;
  const rowHeight = 30;
  const allRows = [table.headers, ...table.rows];
  const maxRows = Math.max(1, Math.floor(maxHeight / rowHeight));
  const rows = allRows.slice(0, maxRows);

  pdf.setFontSize(7);

  rows.forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const cellX = x + columnIndex * columnWidth;
      const cellY = y + rowIndex * rowHeight;

      if (rowIndex === 0) {
        pdf.setFillColor(110, 110, 110);
        pdf.rect(cellX, cellY, columnWidth, rowHeight, "FD");
        pdf.setTextColor(255, 255, 255);
        pdf.setFont("helvetica", "bold");
      } else {
        pdf.setFillColor(255, 255, 255);
        pdf.rect(cellX, cellY, columnWidth, rowHeight, "FD");
        pdf.setTextColor(35, 35, 35);
        pdf.setFont("helvetica", "normal");
      }

      const lines = pdf.splitTextToSize(cell || "", columnWidth - 8).slice(0, 3);
      pdf.text(lines, cellX + 4, cellY + 10);
    });
  });

  pdf.setTextColor(35, 35, 35);

  if (allRows.length > rows.length) {
    pdf.text("Tabla truncada en PDF por espacio disponible.", x, y + rows.length * rowHeight + 12);
  }
}

async function exportDocx(document: ExportDocument) {
  const children: FileChild[] = [
    new Paragraph({
      text: getFilenameWithoutExtension(),
      heading: HeadingLevel.TITLE,
    }),
    new Paragraph({
      children: [new TextRun(`Fecha de generacion: ${formatDate(document.generatedAt)}`)],
      spacing: { after: 240 },
    }),
  ];

  document.pairs.forEach((pair, index) => {
    children.push(...buildDocxPair(pair, index));
  });

  const doc = new DocxDocument({
    sections: [{ children }],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${getFilenameWithoutExtension()}.docx`);
}

function buildDocxPair(pair: TranslationPair, index: number): FileChild[] {
  const imageSize = fitWithin(pair.screen.width, pair.screen.height, 300, 360);
  const translationTable = buildDocxTranslationTable(pair.table);

  return [
    new Paragraph({
      text: `${index + 1}. ${pair.screen.name}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: index === 0 ? 0 : 360, after: 120 },
    }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [
                    new ImageRun({
                      type: "jpg",
                      data: dataUrlToUint8Array(pair.screen.dataUrl),
                      transformation: imageSize,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 55, type: WidthType.PERCENTAGE },
              children: [translationTable],
            }),
          ],
        }),
      ],
    }),
  ];
}

function buildDocxTranslationTable(table: TranslationTable) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [table.headers, ...table.rows].map(
      (row, rowIndex) =>
        new TableRow({
          children: table.headers.map(
            (_, columnIndex) =>
              new TableCell({
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: row[columnIndex] || "",
                        bold: rowIndex === 0,
                      }),
                    ],
                  }),
                ],
              }),
          ),
        }),
    ),
  });
}

function fitWithin(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(maxWidth / width, maxHeight / height, 1);

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function dataUrlToUint8Array(dataUrl: string) {
  const base64 = dataUrl.split(",")[1] || "";
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

  const firstScreen = document.pairs[0]?.screen.name || "traducciones-ui";
  filenameInput.value = sanitizeFilename(firstScreen);
}

function getFilenameWithoutExtension() {
  return sanitizeFilename(filenameInput.value.trim() || "traducciones-ui") || "traducciones-ui";
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

function getTemplateColumns() {
  return columnsInput.value
    .split(/[\n,]/)
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleString();
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

function postMessageToPlugin(message: UiToPluginMessage) {
  parent.postMessage({ pluginMessage: message }, "*");
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);

  if (!element) {
    throw new Error(`No se encontro el elemento #${id}.`);
  }

  return element as T;
}
