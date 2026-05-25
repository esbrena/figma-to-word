import type {
  CapturedScreen,
  ExportMode,
  PluginState,
  PluginToUiMessage,
  TranslationPair,
  TranslationBlock,
  TranslationTable,
  UiToPluginMessage,
} from "./types";

const TEMPLATE_COLUMNS = [
  { title: "Neutro", flag: "🇪🇸" },
  { title: "Voseado", flag: "🇦🇷" },
  { title: "Portugués", flag: "🇧🇷" },
  { title: "Inglés", flag: "🇬🇧" },
  { title: "Francés", flag: "🇫🇷" },
];
const TEMPLATE_ROWS = [
  [
    "Hola",
    "Hola",
    "Olá",
    "Hello",
    "Bonjour",
  ],
  [
    "Adiós",
    "Adiós",
    "Adeus",
    "Goodbye",
    "Au revoir",
  ],
];
const REGULAR_FONT: FontName = { family: "Inter", style: "Regular" };
const SEMIBOLD_FONT: FontName = { family: "Inter", style: "Semi Bold" };

/*BUSCAR Y REMPLAZAR*/
const VARIABLE_PATTERNS = [
  {
    id: "curly",
    label: "{variable}",
    regex: "\\{.*?\\}",
  },
  {
    id: "double-curly",
    label: "{{variable}}",
    regex: "\\{\\{.*?\\}\\}",
  },
  {
    id: "template-literal",
    label: "${variable}",
    regex: "\\$\\{.*?\\}",
  },
  {
    id: "colon",
    label: ":variable",
    regex: ":\\w+",
  },
];

const VARIABLE_REPLACEMENTS = [
  {
    id: "percent-s",
    label: "%s",
    value: "%s",
  },
  {
    id: "ios",
    label: "%@",
    value: "%@",
  },
  {
    id: "indexed",
    label: "{0}",
    value: "{0}",
  },
];

type TableTextBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

let nextBlockNumber = 1;
const initialBlockId = createBlockId();
let blocks: TranslationBlock[] = [{ id: initialBlockId, name: "Bloque" }];
let exportMode: ExportMode | undefined;

/*Buscar y reemplazar*/
let variableReplacementEnabled = false;
let selectedVariablePattern = VARIABLE_PATTERNS[0];
let selectedVariableReplacement = VARIABLE_REPLACEMENTS[0];


figma.showUI(__html__, {
  width: 800,
  height: 620,
  themeColors: true,
  title: "UI Translation Exporter",
});

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "layout-ready") {
    applyInitialUiLayout(message.payload.availWidth, message.payload.availHeight);
    return;
  }

  if (message.type === "state-request") {
    postState();
    return;
  }

  if (message.type === "set-export-mode") {
    exportMode = message.payload.mode;
    resetBlocks(false);
    return;
  }

  if (message.type === "add-block") {
    addBlock();
    return;
  }

  if (message.type === "update-block-name") {
    updateBlockName(message.payload.blockId, message.payload.name);
    return;
  }

  if (message.type === "capture-screen") {
    await captureScreen(message.payload.blockId);
    return;
  }

  if (message.type === "capture-table") {
    captureTable(message.payload.blockId);
    return;
  }

  if (message.type === "import-template-table") {
    await importTemplateTable();
    return;
  }

  if (message.type === "remove-block") {
    removeBlock(message.payload.blockId);
    return;
  }

  if (message.type === "reset") {
    resetBlocks();
    return;
  }

  if (message.type === "cancel-flow") {
    exportMode = undefined;
    resetBlocks(false);
    return;
  }

  if (message.type === "set-variable-replacement") {
    variableReplacementEnabled = message.payload.enabled;

    selectedVariablePattern =
      VARIABLE_PATTERNS.find(
        (item) => item.id === message.payload.patternId,
      ) || VARIABLE_PATTERNS[0];

    selectedVariableReplacement =
      VARIABLE_REPLACEMENTS.find(
        (item) => item.id === message.payload.replacementId,
      ) || VARIABLE_REPLACEMENTS[0];

    return;
  }

};

postState();

function applyInitialUiLayout(availWidth: number, availHeight: number) {
  const safeWidth = Number.isFinite(availWidth) && availWidth > 0 ? availWidth : 1440;
  const safeHeight = Number.isFinite(availHeight) && availHeight > 0 ? availHeight : 900;
  const width = Math.round(Math.min(800, Math.floor(safeWidth * 0.5)));
  const height = Math.round(Math.max(420, safeHeight));
  const x = Math.max(0, safeWidth - width);
  const y = 0;

  figma.ui.resize(width, height);
  figma.ui.reposition(x, y);
}

function postToUi(message: PluginToUiMessage) {
  figma.ui.postMessage(message);
}

function postState() {
  const completedPairs = getCompletedPairs();
  const state: PluginState = {
    exportMode,
    blocks,
    document: {
      generatedAt: new Date().toISOString(),
      pairs: completedPairs,
    },
  };

  postToUi({ type: "state", payload: state });
}

function postNotice(message: string, level: "info" | "error" = "info") {
  postToUi({ type: "notice", payload: { message, level } });
}

function normalizeTranslationText(text: string): string {
  if (!variableReplacementEnabled) {
    return text;
  }

  try {
    const regex = new RegExp(
      selectedVariablePattern.regex,
      "g",
    );

    return text.replace(
      regex,
      selectedVariableReplacement.value,
    );
  } catch {
    return text;
  }
}

function addBlock() {
  const blockNumber = nextBlockNumber;
  const block = { id: createBlockId(), name: `Bloque (nuevo)` };
  blocks = [...blocks, block];
  postState();
}

function removeBlock(blockId: string) {
  if (blocks.length <= 1) {
    postNotice("Debe existir al menos un bloque de pantalla y tabla.", "error");
    return;
  }

  blocks = blocks.filter((block) => block.id !== blockId);
  postState();
}

function resetBlocks(notify = true) {
  const blockNumber = nextBlockNumber;
  const block = { id: createBlockId(), name: `Bloque` };
  blocks = [block];
  if (notify) {
    postNotice("Documento reiniciado.", "info");
  }
  postState();
}

function createBlockId() {
  const id = `block-${nextBlockNumber}`;
  nextBlockNumber += 1;
  return id;
}

function getBlock(blockId: string): TranslationBlock | undefined {
  return blocks.find((block) => block.id === blockId);
}

function updateBlock(blockId: string, patch: Partial<TranslationBlock>) {
  blocks = blocks.map((block) =>
    block.id === blockId
      ? {
          ...block,
          ...patch,
        }
      : block,
  );
}

function updateBlockName(blockId: string, name: string) {
  const safeName = name.trim().slice(0, 80);
  updateBlock(blockId, {
    name: safeName || "Bloque",
  });
  postState();
}

function getCompletedPairs(): TranslationPair[] {
  return blocks
    .filter(
      (block): block is TranslationPair =>
        Boolean(block.name) &&
        Boolean(block.table) &&
        (exportMode === "table-only" || Boolean(block.screen)),
    )
    .map((block) => ({
      id: block.id,
      name: block.name,
      screen: block.screen,
      table: block.table,
    }));
}

async function captureScreen(blockId: string) {
  if (!getBlock(blockId)) {
    postNotice("No se encontro el bloque de pantalla seleccionado.", "error");
    return;
  }

  const selectedNode = getSingleSelection();

  if (!selectedNode) {
    postNotice("Campo obligatorio: selecciona una pantalla PNG o frame en Figma.", "error");
    return;
  }

  const bounds = getBounds(selectedNode);

  if (!bounds || bounds.width < 24 || bounds.height < 24 || selectedNode.type === "TEXT") {
    postNotice(
      "La seleccion no parece una pantalla valida. Selecciona un frame o una imagen PNG.",
      "error",
    );
    return;
  }

  postToUi({ type: "busy", payload: { message: "Capturando pantalla seleccionada..." } });

  try {
    updateBlock(blockId, {
      screen: {
      id: selectedNode.id,
      name: selectedNode.name,
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      dataUrl: await exportNodeAsJpg(selectedNode, getScaleForNode(selectedNode, 1800)),
      },
    });

    postNotice("Pantalla capturada en el bloque. Ahora captura su tabla.", "info");
    postState();
  } catch {
    postNotice("No se pudo exportar la pantalla seleccionada.", "error");
  }
}

function captureTable(blockId: string) {
  if (!getBlock(blockId)) {
    postNotice("No se encontro el bloque de pantalla seleccionado.", "error");
    return;
  }

  const selectedNode = getSingleSelection();

  if (!selectedNode) {
    postNotice("Campo obligatorio: selecciona una tabla de traducciones.", "error");
    return;
  }

  const table = extractTranslationTable(selectedNode);

  if (!table) {
    postNotice(
      "La seleccion no es una tabla de traducciones valida. Usa una tabla con textos en al menos dos columnas y dos filas, o importa la tabla plantilla.",
      "error",
    );
    return;
  }

  updateBlock(blockId, { table });
  postNotice("Tabla de traducciones capturada en el bloque.", "info");
  postState();
}

/**
 * Crea una tabla de traducciones desde cero con Auto Layout robusto.
 *
 * Comportamiento:
 * - Tabla:
 *   - Width fijo inicial: 900px
 *   - Height: Hug contents
 * - Filas (header + body):
 *   - Width: Fill container
 *   - Height: Hug contents
 * - Celdas:
 *   - Width mínimo: 180px
 *   - Width: Fill container
 *   - Height: Hug contents
 * - Texto:
 *   - Se ajusta al ancho de la celda
 *   - Hace wrap
 *   - Solo crece en altura
 *
 * Esta estructura evita que los textos se mezclen aunque el usuario
 * modifique manualmente el Auto Layout en Figma.
 */

async function importTemplateTable() {
  const headers = TEMPLATE_COLUMNS;
  const rows = TEMPLATE_ROWS.map((row) =>
    headers.map((_, index) => row[index] || "")
  );

  await figma.loadFontAsync(REGULAR_FONT);
  await figma.loadFontAsync(SEMIBOLD_FONT);

  // ---------------------------------------------------------------------------
  // TABLE FRAME
  // ---------------------------------------------------------------------------
  const table = figma.createFrame();
  table.name = "Word Translation Table";
  table.layoutMode = "VERTICAL";
  table.primaryAxisSizingMode = "AUTO"; // Height = Hug
  table.counterAxisSizingMode = "FIXED"; // Width fijo
  table.resize(900, 100);

  table.itemSpacing = 0;
  table.clipsContent = true;
  table.strokesIncludedInLayout = true;

  table.fills = [
    {
      type: "SOLID",
      color: { r: 1, g: 1, b: 1 },
    },
  ];

  table.cornerRadius = 12;
  table.strokeWeight = 1;
  table.strokes = [
    {
      type: "SOLID",
      color: { r: 0.85, g: 0.85, b: 0.85 },
    },
  ];

  // ---------------------------------------------------------------------------
  // HEADER ROW
  // ---------------------------------------------------------------------------
  const headerRow = createTableRow({
    name: "Header Row",
    background: { r: 0.45, g: 0.45, b: 0.45 },
    minHeight: 48,
  });

  table.appendChild(headerRow);

  headers.forEach((column) => {
    const cell = createTableCell({
      name: `${column.title} Header`,
      minWidth: 180,
      minHeight: 48,
      padding: 16,
      isHeader: true,
      background: null,
    });

    const title = createTextNode(
      column.title,
      SEMIBOLD_FONT,
      18,
      { r: 1, g: 1, b: 1 }
    );

    const flag = createTextNode(
      column.flag,
      REGULAR_FONT,
      18,
      { r: 1, g: 1, b: 1 }
    );

    // Layout horizontal para header
    cell.layoutMode = "HORIZONTAL";
    cell.primaryAxisAlignItems = "SPACE_BETWEEN";
    cell.counterAxisAlignItems = "CENTER";
    cell.itemSpacing = 12;

    cell.appendChild(title);
    cell.appendChild(flag);

    headerRow.appendChild(cell);
  });

  // ---------------------------------------------------------------------------
  // BODY ROWS
  // ---------------------------------------------------------------------------
  rows.forEach((rowData, rowIndex) => {
    const bodyRow = createTableRow({
      name: `Row ${rowIndex + 1}`,
      background:
        rowIndex % 2 === 0
          ? { r: 1, g: 1, b: 1 }
          : { r: 0.976, g: 0.976, b: 0.976 },
      minHeight: 48,
      topBorder: true,
    });

    table.appendChild(bodyRow);

    rowData.forEach((value) => {
      const cell = createTableCell({
        name: "Cell",
        minWidth: 180,
        minHeight: 48,
        padding: 16,
        background: null,
      });

      const text = createTextNode(
        value,
        REGULAR_FONT,
        14,
        { r: 0.12, g: 0.12, b: 0.14 }
      );

      // El texto ocupa todo el ancho disponible y crece solo en altura
      text.layoutAlign = "STRETCH";
      text.textAutoResize = "HEIGHT";

      cell.appendChild(text);
      bodyRow.appendChild(cell);
    });
  });

  // ---------------------------------------------------------------------------
  // INSERTAR EN LA PÁGINA
  // ---------------------------------------------------------------------------
  figma.currentPage.appendChild(table);

  table.x = figma.viewport.center.x - table.width / 2;
  table.y = figma.viewport.center.y - table.height / 2;

  figma.currentPage.selection = [table];
  figma.viewport.scrollAndZoomIntoView([table]);

  table.setPluginData("word-template", "translation-table");

  postNotice(
    "Tabla plantilla importada. Edita textos o columnas en Figma y captúrala.",
    "info"
  );

  postState();
}

// ============================================================================
// HELPERS
// ============================================================================

function createTableRow(options: {
  name: string;
  background: RGB;
  minHeight: number;
  topBorder?: boolean;
}): FrameNode {
  const row = figma.createFrame();

  row.name = options.name;
  row.layoutMode = "HORIZONTAL";

  // Width = Fill container
  row.layoutAlign = "STRETCH";

  // Width controlado por el padre
  row.primaryAxisSizingMode = "FIXED";

  // Height = Hug contents
  row.counterAxisSizingMode = "AUTO";

  row.itemSpacing = 0;
  row.clipsContent = false;
  row.strokesIncludedInLayout = true;
  row.minHeight = options.minHeight;

  // Tamaño temporal para evitar colapsos
  row.resizeWithoutConstraints(100, options.minHeight);

  row.fills = [
    {
      type: "SOLID",
      color: options.background,
    },
  ];

  if (options.topBorder) {
    row.strokes = [
      {
        type: "SOLID",
        color: { r: 0.9, g: 0.9, b: 0.9 },
      },
    ];
    row.strokeTopWeight = 1;
    row.strokeRightWeight = 0;
    row.strokeBottomWeight = 0;
    row.strokeLeftWeight = 0;
  }

  return row;
}

function createTableCell(options: {
  name: string;
  minWidth: number;
  minHeight: number;
  padding: number;
  background?: RGB | null;
  isHeader?: boolean;
}): FrameNode {
  const cell = figma.createFrame();

  cell.name = options.name;
  cell.layoutMode = "VERTICAL";

  // La columna se reparte el ancho disponible
  cell.layoutGrow = 1;

  // La celda se estira en altura si es necesario
  cell.layoutAlign = "STRETCH";

  // Height = Hug contents
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";

  cell.minWidth = options.minWidth;
  cell.minHeight = options.minHeight;

  cell.paddingLeft = options.padding;
  cell.paddingRight = options.padding;
  cell.paddingTop = options.padding;
  cell.paddingBottom = options.padding;

  cell.itemSpacing = 0;
  cell.clipsContent = false;

  cell.fills =
    options.background === null
      ? []
      : [
          {
            type: "SOLID",
            color: options.background ?? { r: 1, g: 1, b: 1 },
          },
        ];

  // Tamaño base
  cell.resizeWithoutConstraints(options.minWidth, options.minHeight);

  return cell;
}

function createTextNode(
  content: string,
  font: FontName,
  fontSize: number,
  color: RGB
): TextNode {
  const text = figma.createText();

  text.fontName = font;
  text.characters = content;
  text.fontSize = fontSize;
  text.fills = [
    {
      type: "SOLID",
      color,
    },
  ];

  // El texto usa el ancho disponible y crece solo en altura
  text.textAutoResize = "HEIGHT";

  return text;
}

function extractTranslationTable(node: SceneNode): TranslationTable | null {
  if (!("children" in node)) {
    return null;
  }

  const rowNodes = node.children.filter(
    (child): child is FrameNode =>
      child.type === "FRAME" &&
      "children" in child &&
      child.visible !== false,
  );

  if (rowNodes.length < 2) {
    return null;
  }

  const parsedRows = rowNodes.map(extractRowTexts);

  const validRows = parsedRows.filter((row) =>
    row.some((cell) => cell.trim().length > 0),
  );

  if (validRows.length < 2) {
    return null;
  }

  const headers = validRows[0];
  const bodyRows = validRows.slice(1);

  if (headers.length < 2 || bodyRows.length === 0) {
    return null;
  }

  return {
    id: node.id,
    name: node.name,
    headers,
    rows: bodyRows,
  };
}

function extractRowTexts(row: FrameNode): string[] {
  const cellNodes = row.children.filter(
    (child): child is FrameNode =>
      child.type === "FRAME" &&
      "children" in child &&
      child.visible !== false,
  );

  return cellNodes.map(extractCellText);
}

function extractCellText(cell: FrameNode): string {
  const textNodes: TextNode[] = [];

  walkVisibleNodes(cell, (node) => {
    if (node.type === "TEXT") {
      textNodes.push(node);
    }
  });

  textNodes.sort((a, b) => {
    const boxA = a.absoluteBoundingBox;
    const boxB = b.absoluteBoundingBox;

    if (!boxA || !boxB) {
      return 0;
    }

    const deltaY = Math.abs(boxA.y - boxB.y);

    if (deltaY > 2) {
      return boxA.y - boxB.y;
    }

    return boxA.x - boxB.x;
  });

  return normalizeTranslationText(
      textNodes
        .map((node) => node.characters.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
      );
}

function walkVisibleNodes(node: SceneNode, visit: (node: SceneNode) => void) {
  if ("visible" in node && node.visible === false) {
    return;
  }

  visit(node);

  if ("children" in node) {
    for (const child of node.children) {
      walkVisibleNodes(child, visit);
    }
  }
}

function getSingleSelection(): SceneNode | null {
  const selection = figma.currentPage.selection;

  if (selection.length !== 1) {
    return null;
  }

  return selection[0];
}

function getBounds(node: SceneNode): Rect | null {
  if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
    return node.absoluteBoundingBox;
  }

  return null;
}

function getScaleForNode(node: SceneNode, maxSize: number): number {
  const bounds = getBounds(node);

  if (!bounds) {
    return 1;
  }

  const largestSide = Math.max(bounds.width, bounds.height);

  if (largestSide <= maxSize) {
    return 1;
  }

  return Math.max(0.05, maxSize / largestSide);
}

async function exportNodeAsJpg(node: SceneNode, scale: number): Promise<string> {
  const bytes = await node.exportAsync({
    format: "JPG",
    constraint: { type: "SCALE", value: scale },
  });

  return `data:image/jpeg;base64,${figma.base64Encode(bytes)}`;
}