import {
  AlignmentType,
  BorderStyle,
  Document as DocxDocument,
  FileChild,
  HeadingLevel,
  ImageRun,
  PageOrientation,
  PageBreak,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import type {
  ExportDocument,
  ExportMode,
  PluginState,
  PluginToUiMessage,
  TranslationBlock,
  TranslationPair,
  TranslationTable,
  UiToPluginMessage,
} from "./types";

type ExportFormat = "pdf" | "docx" | "xlsx";

const blocksContainer = getElement<HTMLDivElement>("blocksContainer");
const exportButton = getElement<HTMLButtonElement>("exportButton");
const cancelButton = getElement<HTMLButtonElement>("cancelButton");
const filenameInput = getElement<HTMLInputElement>("filenameInput");
const mergeTablesWrapper = getElement<HTMLLabelElement>("mergeTablesWrapper");
const mergeTablesCheckbox = getElement<HTMLInputElement>("mergeTablesCheckbox");
const xlsFormatOption = getElement<HTMLLabelElement>("xlsFormatOption");
const toast = getElement<HTMLDivElement>("toast");
const toastMessage = getElement<HTMLParagraphElement>("toastMessage");
const toastCloseButton = getElement<HTMLButtonElement>("toastCloseButton");

let currentState: PluginState | null = null;

blocksContainer.addEventListener("click", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLElement)) {
    return;
  }

  const actionTarget = target.closest(
    "[data-export-mode], [data-capture-screen], [data-capture-table], [data-remove-block], [data-add-block], [data-import-template]",
  );

  if (!(actionTarget instanceof HTMLElement)) {
    return;
  }

  const selectedMode = actionTarget.dataset.exportMode as ExportMode | undefined;
  const captureScreenBlockId = actionTarget.dataset.captureScreen;
  if (selectedMode) {
    postMessageToPlugin({
      type: "set-export-mode",
      payload: { mode: selectedMode },
    });
    return;
  }

  const captureTableBlockId = actionTarget.dataset.captureTable;
  const importTemplate = actionTarget.dataset.importTemplate;
  const removeBlockId = actionTarget.dataset.removeBlock;

  if (captureScreenBlockId) {
    postMessageToPlugin({
      type: "capture-screen",
      payload: { blockId: captureScreenBlockId },
    });
    return;
  }

  if (captureTableBlockId) {
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

  if (actionTarget.dataset.addBlock) {
    postMessageToPlugin({ type: "add-block" });
    return;
  }

  if (importTemplate) {
    postMessageToPlugin({
      type: "import-template-table",
    });
  }
});

blocksContainer.addEventListener("change", (event) => {
  const target = event.target;

  if (!(target instanceof HTMLInputElement)) {
    return;
  }

  const blockId = target.dataset.blockName;

  if (!blockId) {
    return;
  }

  postMessageToPlugin({
    type: "update-block-name",
    payload: {
      blockId,
      name: target.value,
    },
  });
});

exportButton.addEventListener("click", () => {
  void exportCurrentDocument(getSelectedFormat());
});

cancelButton.addEventListener("click", () => {
  hideToast();
  postMessageToPlugin({ type: "cancel-flow" });
});

toastCloseButton.addEventListener("click", () => {
  hideToast();
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
    return;
  }

  if (message.type === "notice") {
    return;
  }
};

postMessageToPlugin({
  type: "layout-ready",
  payload: {
    availWidth: window.screen.availWidth,
    availHeight: window.screen.availHeight,
  },
});
postMessageToPlugin({ type: "state-request" });

function renderState(state: PluginState) {
  renderBlocks(state);
  document.body.dataset.hasMode = state.exportMode ? "true" : "false";
  updateMergeCheckboxVisibility(state);
  xlsFormatOption.hidden = state.exportMode === "screen-table";

  if (state.exportMode === "screen-table" && getSelectedFormat() === "xlsx") {
    const wordInput = document.querySelector<HTMLInputElement>(
      'input[name="exportFormat"][value="docx"]',
    );

    if (wordInput) {
      wordInput.checked = true;
    }
  }

  const canExport = state.document.pairs.length > 0;
  exportButton.disabled = !canExport;
  exportButton.textContent = `Exportar ${state.document.pairs.length} bloque${
    state.document.pairs.length === 1 ? "" : "s"
  }`;

  if (canExport) {
    setDefaultFilename(state.document);
  }
}

function renderBlocks(state: PluginState) {
  if (!state.exportMode) {
    blocksContainer.innerHTML = renderModeSelection();
    return;
  }

  const mode = state.exportMode;
  const lastBlock = state.blocks[state.blocks.length - 1];
  const canAddAnother = isBlockComplete(lastBlock, mode);

  blocksContainer.innerHTML = `
    <header class="app-header">
      <h1>UI Translation Exporter</h1>
      <p>Exporta pantallas UI junto a sus tablas de traduccion.</p>
    </header>
    ${state.blocks
      .map((block, index) =>
        renderBlock(block, index, state.blocks.length, mode),
      )
      .join("")}
    ${
      canAddAnother
        ? `<button class="button secondary add-block" type="button" data-add-block="true">
            Añadir bloque
          </button>`
        : ""
    }
    <p class="workflow-help"></p>
  `;
}

function renderModeSelection() {
  return `
    <header class="app-header">
      <h1>UI Translation Exporter</h1>
      <p>Elige que tipo de documento quieres construir.</p>
    </header>
    <section class="mode-grid" aria-label="Tipo de exportacion">
      <button class="mode-card" type="button" data-export-mode="screen-table">
        <span class="mode-illustration" aria-hidden="true">
          <svg viewBox="0 0 180 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="18" y="18" width="70" height="96" rx="16" fill="#F3F8FF" stroke="#B3D1FF" stroke-width="3"/>
            <rect x="34" y="36" width="38" height="8" rx="4" fill="#438EFF" opacity="0.35"/>
            <rect x="34" y="52" width="26" height="8" rx="4" fill="#438EFF" opacity="0.2"/>
            <rect x="108" y="28" width="52" height="76" rx="10" fill="#FFFFFF" stroke="#D8E6FF" stroke-width="3"/>
            <rect x="108" y="28" width="52" height="18" rx="9" fill="#6F6F6F"/>
            <path d="M112 46H160" stroke="#D9D9D9"/>
            <path d="M112 68H160" stroke="#D9D9D9"/>
            <path d="M134 28V104" stroke="#D9D9D9"/>
            <circle cx="88" cy="66" r="12" fill="#438EFF"/>
            <path d="M83 66H93M93 66L89 62M93 66L89 70" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
        <strong>Exportar pantalla + tabla</strong>
        <span>Documenta cada pantalla junto a su tabla de traducciones.</span>
      </button>
      <button class="mode-card" type="button" data-export-mode="table-only">
        <span class="mode-illustration" aria-hidden="true">
          <svg viewBox="0 0 180 132" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="30" y="24" width="120" height="84" rx="14" fill="#FFFFFF" stroke="#B3D1FF" stroke-width="3"/>
            <rect x="30" y="24" width="120" height="24" rx="12" fill="#6F6F6F"/>
            <path d="M30 48H150M30 72H150M30 96H150" stroke="#D9D9D9" stroke-width="2"/>
            <path d="M60 24V108M90 24V108M120 24V108" stroke="#D9D9D9" stroke-width="2"/>
            <rect x="44" y="34" width="20" height="5" rx="2.5" fill="white" opacity="0.9"/>
            <rect x="74" y="34" width="20" height="5" rx="2.5" fill="white" opacity="0.9"/>
            <rect x="104" y="34" width="20" height="5" rx="2.5" fill="white" opacity="0.9"/>
            <circle cx="138" cy="36" r="4" fill="#8BDB77"/>
          </svg>
        </span>
        <strong>Exportar solo tabla</strong>
        <span>Crea un documento o Excel solo con tablas de traducciones.</span>
      </button>
    </section>
    <section class="template-entry">
      <div class="template-divider"><span>¿Necesito una tabla para traducciones?</span></div>
      <button class="link-button" type="button" data-import-template="true">
        Insertar tabla de ejemplo
      </button>
    </section>
  `;
}

function renderBlock(
  block: TranslationBlock,
  index: number,
  totalBlocks: number,
  mode: ExportMode,
) {
  const isComplete = isBlockComplete(block, mode);

  return `
    <article class="translation-block">
      <div class="block-heading">
        <div class="block-title">
          ${isComplete ? '<span class="complete-check" aria-label="Bloque completo"></span>' : ""}
          <input
            class="block-name-input"
            type="text"
            value="${escapeHtml(block.name || `Bloque`)}"
            data-block-name="${block.id}"
            aria-label="Nombre del bloque ${index + 1}"
          />
          <span class="edit-icon" aria-hidden="true"></span>
        </div>
        ${
          totalBlocks > 1
            ? `<button class="button small" type="button" data-remove-block="${block.id}">
                Eliminar bloque
              </button>`
            : ""
        }
      </div>
      <div class="block-grid ${mode === "table-only" ? "table-only-grid" : ""}">
        ${
          mode === "screen-table"
            ? `
              <section class="block-panel">
                <div class="step-title">
                  <strong>Pantalla</strong>
                </div>
                ${
                  block.screen
                    ? `<img class="screen-image" src="${block.screen.dataUrl}" alt="${escapeHtml(
                        block.screen.name,
                      )}" />`
                    : `<p class="empty-note">Selecciona en Figma una imagen PNG o frame.</p>`
                }
                <button class="button primary" type="button" data-capture-screen="${block.id}">
                  ${block.screen ? "Reemplazar pantalla" : "Cargar pantalla seleccionada"}
                </button>
              </section>
            `
            : ""
        }
        <section class="block-panel">
          <div class="step-title">
            <strong>Tabla de traducciones</strong>
          </div>
          ${
            block.table
              ? renderTranslationTable(block.table)
              : `<p class="empty-note">Selecciona directamente el frame que contiene las rows de la tabla.<br>
<small>No funcionará si seleccionas un frame padre que contiene otro frame con la tabla dentro.</small></p>`
          }
          <button class="button primary" type="button" data-capture-table="${block.id}">
            ${block.table ? "Reemplazar tabla" : "Cargar tabla seleccionada"}
          </button>
        </section>
      </div>
    </article>
  `;
}

function isBlockComplete(block: TranslationBlock | undefined, mode: ExportMode) {
  if (!block) {
    return false;
  }

  return Boolean(block.table) && (mode === "table-only" || Boolean(block.screen));
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

function exportCurrentDocument(format: ExportFormat) {
  if (!currentState) {
    showExportError("Campos obligatorios: anade al menos una pantalla y una tabla.");
    return;
  }

  if (!currentState.exportMode) {
    showExportError("Selecciona primero un tipo de exportacion.");
    return;
  }

  if (hasPartiallyLoadedBlock(currentState.blocks, currentState.exportMode)) {
    showExportError("Faltan recursos por cargar. Corrige el problema antes de exportar.");
    return;
  }

  if (currentState.document.pairs.length === 0) {
    showExportError("Campos obligatorios: anade al menos una pantalla y una tabla.");
    return;
  }

  const exportDocument: ExportDocument = {
    ...currentState.document,
    generatedAt: new Date().toISOString(),
  };

  setExportButtonsDisabled(true);
  hideToast();

  try {
    if (format === "xlsx") {
      exportXlsx(exportDocument, mergeTablesCheckbox.checked)
        .then(() => undefined)
        .catch((error) => {
          showExportError(
            error instanceof Error ? error.message : "No se pudo exportar el documento.",
          );
        })
        .finally(() => setExportButtonsDisabled(false));
      return;
    } else if (format === "pdf") {
      exportPdf(exportDocument);
    } else {
      exportDocx(exportDocument)
        .then(() => undefined)
        .catch((error) => {
          showExportError(
            error instanceof Error ? error.message : "No se pudo exportar el documento.",
          );
        })
        .finally(() => setExportButtonsDisabled(false));
      return;
    }
  } catch (error) {
    showExportError(
      error instanceof Error ? error.message : "No se pudo exportar el documento.",
    );
  }

  setExportButtonsDisabled(false);
}

function hasPartiallyLoadedBlock(blocks: TranslationBlock[], mode: ExportMode) {
  return blocks.some((block) => {
    if (mode === "table-only") {
      return Boolean(block.screen) && !block.table;
    }

    return Boolean(block.screen) !== Boolean(block.table);
  });
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
    pdf.text(documentSafeText(pair.name), margin, y);
    y += 14;

    const gap = 24;
    const leftWidth = (pageWidth - margin * 2 - gap) * 0.45;
    const rightWidth = pageWidth - margin * 2 - gap - leftWidth;
    const maxContentHeight = pageHeight - y - margin;
    if (pair.screen) {
      const imageSize = fitWithin(
        pair.screen.width,
        pair.screen.height,
        leftWidth,
        maxContentHeight,
      );

      pdf.addImage(pair.screen.dataUrl, "JPEG", margin, y, imageSize.width, imageSize.height);
      drawPdfTable(pdf, pair.table, margin + leftWidth + gap, y, rightWidth, maxContentHeight);
    } else {
      drawPdfTable(pdf, pair.table, margin, y, pageWidth - margin * 2, maxContentHeight);
    }
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
  const allRows = [table.headers, ...table.rows].map((row) =>
    row.map((cell) => documentSafeText(cell)),
  );
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
      children: [
        new TextRun({
          text: `Fecha de generacion: ${formatDate(document.generatedAt)}`,
          font: "Verdana",
        }),
      ],
      spacing: { after: 240 },
    }),
  ];

  document.pairs.forEach((pair, index) => {
    children.push(...buildDocxPair(pair, index));

    if (index < document.pairs.length - 1) {
      children.push(new Paragraph({ children: [new PageBreak()] }));
    }
  });

  const doc = new DocxDocument({
    styles: {
      default: {
        document: {
          run: {
            font: "Verdana",
            size: 20,
          },
        },
        title: {
          run: {
            font: "Verdana",
            size: 36,
            bold: true,
          },
        },
        heading1: {
          run: {
            font: "Verdana",
            size: 26,
            bold: true,
          },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: {
              orientation: PageOrientation.LANDSCAPE,
            },
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });
  const blob = await Packer.toBlob(doc);
  downloadBlob(blob, `${getFilenameWithoutExtension()}.docx`);
}

function buildDocxPair(pair: TranslationPair, index: number): FileChild[] {
  const translationTable = buildDocxTranslationTable(pair.table);
  const outerBorder = {
    style: BorderStyle.SINGLE,
    color: "D3D3D3",
    size: 2,
  };

  return [
    new Paragraph({
      text: `${index + 1}. ${documentSafeText(pair.name)}`,
      heading: HeadingLevel.HEADING_1,
      spacing: { before: index === 0 ? 0 : 360, after: 120 },
    }),
    pair.screen
      ? buildDocxScreenTable(pair, translationTable, outerBorder)
      : translationTable,
  ];
}

function buildDocxScreenTable(
  pair: TranslationPair,
  translationTable: Table,
  outerBorder: { style: (typeof BorderStyle)[keyof typeof BorderStyle]; color: string; size: number },
) {
  const screen = pair.screen;

  if (!screen) {
    return translationTable;
  }

  const imageSize = fitWithin(screen.width, screen.height, 300, 360);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: outerBorder,
      bottom: outerBorder,
      left: outerBorder,
      right: outerBorder,
      insideHorizontal: outerBorder,
      insideVertical: outerBorder,
    },
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
                    data: dataUrlToUint8Array(screen.dataUrl),
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
  });
}

async function exportXlsx(document: ExportDocument, mergeTables: boolean) {
  if (mergeTables) {
    assertSameColumns(document.pairs);
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "UI Translation Exporter";
  workbook.created = new Date(document.generatedAt);

  if (mergeTables) {
    const mergedRows: string[][] = [];
    document.pairs.forEach((pair) => {
      mergedRows.push(...pair.table.rows);
    });
    addTableWorksheet(workbook, "Traducciones", mergedRows, document.pairs[0].table.headers);
  } else {
    document.pairs.forEach((pair, index) => {
      addTableWorksheet(
        workbook,
        sanitizeWorksheetName(pair.name || `Bloque ${index + 1}`),
        pair.table.rows,
        pair.table.headers,
      );
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    `${getFilenameWithoutExtension()}.xlsx`,
  );
}

function addTableWorksheet(
  workbook: ExcelJS.Workbook,
  name: string,
  rows: string[][],
  headers: string[],
) {
  const worksheet = workbook.addWorksheet(name);
  worksheet.addRow(headers.map(documentSafeText));
  rows.forEach((row) => worksheet.addRow(headers.map((_, index) => documentSafeText(row[index] || ""))));

  worksheet.columns = headers.map(() => ({ width: 28 }));
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF6F6F6F" },
  };
  worksheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.alignment = { vertical: "top", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: "FFD9D9D9" } },
        left: { style: "thin", color: { argb: "FFD9D9D9" } },
        bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
        right: { style: "thin", color: { argb: "FFD9D9D9" } },
      };
    });
  });
}

function assertSameColumns(pairs: TranslationPair[]) {
  const expectedColumnCount = pairs[0]?.table.headers.length;

  if (!expectedColumnCount) {
    return;
  }

  const hasDifferentColumnCount = pairs.some(
    (pair) => pair.table.headers.length !== expectedColumnCount,
  );

  if (hasDifferentColumnCount) {
    throw new Error(
      `Todas las tablas deben tener ${expectedColumnCount} columnas para poder exportarse en una sola hoja.`
    );
  }
}

/*function assertSameColumns(pairs: TranslationPair[]) {
  const firstHeaders = pairs[0]?.table.headers;

  if (!firstHeaders) {
    return;
  }

  const reference = normalizeHeaders(firstHeaders);
  const hasDifferentColumns = pairs.some(
    (pair) => normalizeHeaders(pair.table.headers) !== reference,
  );

  if (hasDifferentColumns) {
    throw new Error("Las tablas son distintas, no se pueden exportar en una misma tabla.");
  }
}*/

function normalizeHeaders(headers: string[]) {
  return headers.map((header) => documentSafeText(header).toLowerCase()).join("|");
}

function sanitizeWorksheetName(value: string) {
  const sanitized = documentSafeText(value).replace(/[\\/*?:[\]]/g, "").slice(0, 31);
  return sanitized || "Traducciones";
}

function buildDocxTranslationTable(table: TranslationTable) {
  const border = {
    style: BorderStyle.SINGLE,
    color: "D9DEE7",
    size: 1,
  };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: border,
      bottom: border,
      left: border,
      right: border,
      insideHorizontal: border,
      insideVertical: border,
    },
    rows: [table.headers, ...table.rows].map(
      (row, rowIndex) =>
        new TableRow({
          children: table.headers.map(
            (_, columnIndex) =>
              new TableCell({
                margins: {
                  top: 120,
                  right: 120,
                  bottom: 120,
                  left: 120,
                },
                shading:
                  rowIndex === 0
                    ? {
                        fill: "6B7280",
                        color: "auto",
                        type: ShadingType.CLEAR,
                      }
                    : undefined,
                children: [
                  new Paragraph({
                    alignment: rowIndex === 0 ? AlignmentType.CENTER : AlignmentType.LEFT,
                    children: [
                      new TextRun({
                        text: documentSafeText(row[columnIndex] || ""),
                        bold: rowIndex === 0,
                        color: rowIndex === 0 ? "FFFFFF" : "1F2937",
                        font: "Verdana",
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

function documentSafeText(value: string) {
  return stripUnsupportedEmoji(replaceFlagEmojiWithCountryCodes(value))
    .replace(/\s+/g, " ")
    .trim();
}

function replaceFlagEmojiWithCountryCodes(value: string) {
  const codePoints = Array.from(value);
  let output = "";

  for (let index = 0; index < codePoints.length; index += 1) {
    const first = regionalIndicatorLetter(codePoints[index]);
    const second = regionalIndicatorLetter(codePoints[index + 1] || "");

    if (first && second) {
      output += ` (${first}${second})`;
      index += 1;
    } else {
      output += codePoints[index];
    }
  }

  return output;
}

function regionalIndicatorLetter(value: string) {
  const codePoint = value.codePointAt(0);

  if (!codePoint || codePoint < 0x1f1e6 || codePoint > 0x1f1ff) {
    return "";
  }

  return String.fromCharCode(65 + codePoint - 0x1f1e6);
}

function stripUnsupportedEmoji(value: string) {
  return Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) || 0;

      if (codePoint === 0xfe0e || codePoint === 0xfe0f || codePoint === 0x200d) {
        return false;
      }

      if (codePoint >= 0x1f000 && codePoint <= 0x1faff) {
        return false;
      }

      if (codePoint >= 0x2600 && codePoint <= 0x27bf) {
        return false;
      }

      return true;
    })
    .join("");
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

  //const firstScreen = document.pairs[0]?.name || "traducciones-ui";
  //filenameInput.value = sanitizeFilename(firstScreen);
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

function formatDate(isoDate: string) {
  return new Date(isoDate).toLocaleString();
}

function setExportButtonsDisabled(disabled: boolean) {
  exportButton.disabled = disabled;
}

function getSelectedFormat(): ExportFormat {
  const selectedInput = document.querySelector<HTMLInputElement>(
    'input[name="exportFormat"]:checked',
  );

  if (selectedInput?.value === "pdf") {
    return "pdf";
  }

  if (selectedInput?.value === "xlsx") {
    return "xlsx";
  }

  return "docx";
}

function showExportError(message: string) {
  toastMessage.textContent = message;
  toast.hidden = false;
}

function hideToast() {
  toast.hidden = true;
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

function updateMergeCheckboxVisibility(state: PluginState) {
  const selectedFormat = getSelectedFormat();

  const shouldShow =
    state.exportMode === "table-only" &&
    selectedFormat === "xlsx";

  mergeTablesWrapper.hidden = !shouldShow;
}

document
  .querySelectorAll<HTMLInputElement>('input[name="exportFormat"]')
  .forEach((input) => {
    input.addEventListener("change", () => {
      if (currentState) {
        updateMergeCheckboxVisibility(currentState);
      }
    });
  });

const replaceVariablesEnabled =
  document.getElementById(
    "replaceVariablesEnabled",
  ) as HTMLInputElement;

const variableReplacementFields =
  document.getElementById(
    "variableReplacementFields",
  ) as HTMLDivElement;

const variablePattern =
  document.getElementById(
    "variablePattern",
  ) as HTMLSelectElement;

const variableReplacement =
  document.getElementById(
    "variableReplacement",
  ) as HTMLSelectElement;

function updateVariableReplacementVisibility() {
  if (replaceVariablesEnabled.checked) {
    variableReplacementFields.classList.remove("hidden");
  } else {
    variableReplacementFields.classList.add("hidden");
  }
}
function sendVariableConfig() {
  parent.postMessage(
    {
      pluginMessage: {
        type: "set-variable-replacement",
        payload: {
          enabled: replaceVariablesEnabled.checked,
          patternId: variablePattern.value,
          replacementId: variableReplacement.value,
        },
      },
    },
    "*",
  );
}
replaceVariablesEnabled.addEventListener(
  "change",
  () => {
    updateVariableReplacementVisibility();
    sendVariableConfig();
  },
);
variablePattern.addEventListener(
  "change",
  sendVariableConfig,
);

variableReplacement.addEventListener(
  "change",
  sendVariableConfig,
);
