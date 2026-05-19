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
  TranslationBlock,
  TranslationPair,
  TranslationTable,
  UiToPluginMessage,
} from "./types";

const blocksContainer = getElement<HTMLDivElement>("blocksContainer");
const selectionSummary = getElement<HTMLDivElement>("selectionSummary");
const screenCountSummary = getElement<HTMLDivElement>("screenCountSummary");
const columnsSummary = getElement<HTMLDivElement>("columnsSummary");
const exportSummary = getElement<HTMLDivElement>("exportSummary");
const importTableButton = getElement<HTMLButtonElement>("importTableButton");
const resetButton = getElement<HTMLButtonElement>("resetButton");
const exportPdfButton = getElement<HTMLButtonElement>("exportPdfButton");
const exportDocxButton = getElement<HTMLButtonElement>("exportDocxButton");
const closeButton = getElement<HTMLButtonElement>("closeButton");
const filenameInput = getElement<HTMLInputElement>("filenameInput");
const columnsInput = getElement<HTMLTextAreaElement>("columnsInput");
const statusMessage = getElement<HTMLDivElement>("statusMessage");

let currentState: PluginState | null = null;

blocksContainer.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const captureScreenBlockId = target.dataset.captureScreen;
  const captureTableBlockId = target.dataset.captureTable;
  const removeBlockId = target.dataset.removeBlock;

  if (captureScreenBlockId) {
    setStatus("Validando y capturando pantalla...");
    postMessageToPlugin({
      type: "capture-screen",
      payload: { blockId: captureScreenBlockId },
    });
    return;
  }

  if (captureTableBlockId) {
    setStatus("Validando tabla de traducciones...");
    postMessageToPlugin({
      type: "capture-table",
      payload: { blockId: captureTableBlockId },
    });
    return;
  }

  if (removeBlockId) {
    postMessageToPlugin({ type: "remove-block", payload: { blockId: removeBlockId } });
    return;
  }

  if (target.dataset.addBlock) {
    postMessageToPlugin({ type: "add-block" });
  }
});

importTableButton.addEventListener("click", () => {
  postMessageToPlugin({
    type: "import-template-table",
    payload: { columns: getTemplateColumns() },
  });
});

resetButton.addEventListener("click", () => {
  postMessageToPlugin({ type: "reset" });
});

closeButton.addEventListener("click", () => {
  postMessageToPlugin({ type: "close-plugin" });
});

exportPdfButton.addEventListener("click", () => {
  exportCurrentDocument("pdf");
});

exportDocxButton.addEventListener("click", () => {
  void exportCurrentDocument("docx");
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

function renderState(state: PluginState) {
  renderSelection(state);
  renderSidebarSummary(state);
  renderBlocks(state);

  const canExport = state.document.pairs.length > 0;
  exportPdfButton.disabled = !canExport;
  exportDocxButton.disabled = !canExport;
  resetButton.disabled =
    state.blocks.length === 1 && !state.blocks[0].screen && !state.blocks[0].table;

  if (canExport) {
    setDefaultFilename(state.document);
  }
}

function renderSelection(state: PluginState) {
  if (state.selection.count === 0) {
    selectionSummary.innerHTML = `
      <strong>Nada seleccionado</strong>
      <span>Selecciona una pantalla o tabla en Figma y usa el bloque correspondiente.</span>
    `;
    return;
  }

  selectionSummary.innerHTML = `
    <strong>${state.selection.count} elemento${
      state.selection.count === 1 ? "" : "s"
    } seleccionado${state.selection.count === 1 ? "" : "s"}</strong>
    <span>${state.selection.names.map(escapeHtml).join(", ")}</span>
  `;
}

function renderSidebarSummary(state: PluginState) {
  const completedPairs = state.document.pairs;
  const pendingBlocks = state.blocks.filter((block) => !block.screen || !block.table);
  const columns = getExportColumns(completedPairs);

  screenCountSummary.innerHTML = `
    <strong>${completedPairs.length}</strong>
    <span>pantalla${completedPairs.length === 1 ? "" : "s"} en previsualizacion</span>
  `;

  columnsSummary.innerHTML =
    columns.length > 0
      ? columns.map((column) => `<span class="chip">${escapeHtml(column)}</span>`).join("")
      : `<span class="muted">Captura una tabla para ver columnas.</span>`;

  exportSummary.innerHTML = `
    <div class="summary-row">
      <span>Bloques totales</span>
      <strong>${state.blocks.length}</strong>
    </div>
    <div class="summary-row">
      <span>Listos para exportar</span>
      <strong>${completedPairs.length}</strong>
    </div>
    <div class="summary-row">
      <span>Pendientes</span>
      <strong>${pendingBlocks.length}</strong>
    </div>
  `;
}

function renderBlocks(state: PluginState) {
  const lastBlock = state.blocks[state.blocks.length - 1];
  const canAddAnother = Boolean(lastBlock && lastBlock.screen && lastBlock.table);

  blocksContainer.innerHTML = `
    <section class="blocks-header">
      <div>
        <p class="eyebrow">Pantalla principal</p>
        <h2>Bloques de pantalla + tabla</h2>
        <p>Captura cada pantalla con su tabla de traducciones. El documento se monta con los bloques completos.</p>
      </div>
    </section>
    ${state.blocks
      .map((block, index) => renderBlock(block, index, state.blocks.length))
      .join("")}
    ${
      canAddAnother
        ? `<button class="button secondary add-block" type="button" data-add-block="true">
            Anadir otra pantalla
          </button>`
        : ""
    }
  `;
}

function renderBlock(block: TranslationBlock, index: number, totalBlocks: number) {
  const isComplete = Boolean(block.screen && block.table);

  return `
    <article class="translation-block ${isComplete ? "complete" : ""}">
      <div class="block-heading">
        <div>
          <p class="eyebrow">Bloque ${index + 1}</p>
          <h3>${block.screen ? escapeHtml(block.screen.name) : "Nueva pantalla"}</h3>
        </div>
        ${
          totalBlocks > 1
            ? `<button class="button small" type="button" data-remove-block="${block.id}">
                Eliminar bloque
              </button>`
            : ""
        }
      </div>
      <div class="block-grid">
        <section class="block-panel">
          <div class="step-title">
            <span class="${block.screen ? "dot ok" : "dot"}"></span>
            <strong>Pantalla</strong>
          </div>
          ${
            block.screen
              ? `<img class="screen-image" src="${block.screen.dataUrl}" alt="${escapeHtml(
                  block.screen.name,
                )}" />`
              : `<p class="empty-note">Selecciona en Figma una imagen PNG o frame y capturala aqui.</p>`
          }
          <button class="button primary" type="button" data-capture-screen="${block.id}">
            ${block.screen ? "Reemplazar pantalla" : "Capturar pantalla seleccionada"}
          </button>
        </section>
        <section class="block-panel">
          <div class="step-title">
            <span class="${block.table ? "dot ok" : "dot"}"></span>
            <strong>Tabla de traducciones</strong>
          </div>
          ${
            block.table
              ? renderTranslationTable(block.table)
              : `<p class="empty-note">Selecciona la tabla editable en Figma y capturala aqui.</p>`
          }
          <button class="button primary" type="button" data-capture-table="${block.id}">
            ${block.table ? "Reemplazar tabla" : "Capturar tabla seleccionada"}
          </button>
        </section>
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

function exportCurrentDocument(format: "pdf" | "docx") {
  if (!currentState || currentState.document.pairs.length === 0) {
    setStatus("Campos obligatorios: anade al menos una pantalla y una tabla.", true);
    return;
  }

  const exportDocument: ExportDocument = {
    ...currentState.document,
    generatedAt: new Date().toISOString(),
  };

  setExportButtonsDisabled(true);
  setStatus("Preparando descarga...");

  try {
    if (format === "pdf") {
      exportPdf(exportDocument);
      setStatus("PDF listo. Si tu navegador lo solicita, confirma la descarga.");
    } else {
      exportDocx(exportDocument)
        .then(() => {
          setStatus("Word listo. Si tu navegador lo solicita, confirma la descarga.");
        })
        .catch((error) => {
          setStatus(
            error instanceof Error ? error.message : "No se pudo exportar el documento.",
            true,
          );
        })
        .finally(() => setExportButtonsDisabled(false));
      return;
    }
  } catch (error) {
    setStatus(
      error instanceof Error ? error.message : "No se pudo exportar el documento.",
      true,
    );
  }

  setExportButtonsDisabled(false);
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

function getExportColumns(pairs: TranslationPair[]) {
  const columns = new Set<string>();

  pairs.forEach((pair) => {
    pair.table.headers.forEach((header) => {
      if (header.trim()) {
        columns.add(header.trim());
      }
    });
  });

  return [...columns];
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

function setExportButtonsDisabled(disabled: boolean) {
  exportPdfButton.disabled = disabled;
  exportDocxButton.disabled = disabled;
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
