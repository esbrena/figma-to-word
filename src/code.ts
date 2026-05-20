import type {
  CapturedScreen,
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
];
const TEMPLATE_ROWS = [
  [
    "¿Buscas pedidos anteriores?",
    "¿Buscás pedidos anteriores?",
    "Buscando por pedidos anteriores?",
    "Looking for previous orders?",
  ],
  [
    "Consultar historial completo",
    "Consultar historial completo",
    "Consulte o histórico completo",
    "Check full history",
  ],
];
const REGULAR_FONT: FontName = { family: "Inter", style: "Regular" };
const SEMIBOLD_FONT: FontName = { family: "Inter", style: "Semi Bold" };

type TableTextBlock = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

let nextBlockNumber = 1;
const initialBlockId = createBlockId();
let blocks: TranslationBlock[] = [{ id: initialBlockId, name: "Bloque 1" }];

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

function addBlock() {
  const blockNumber = nextBlockNumber;
  const block = { id: createBlockId(), name: `Bloque ${blockNumber}` };
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

function resetBlocks() {
  const blockNumber = nextBlockNumber;
  const block = { id: createBlockId(), name: `Bloque ${blockNumber}` };
  blocks = [block];
  postNotice("Documento reiniciado.", "info");
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
        Boolean(block.name) && Boolean(block.screen) && Boolean(block.table),
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

async function importTemplateTable() {
  const headers = TEMPLATE_COLUMNS;
  const rows = TEMPLATE_ROWS.map((row) =>
    headers.map((_, index) => row[index] || ""),
  );

  await figma.loadFontAsync(REGULAR_FONT);
  await figma.loadFontAsync(SEMIBOLD_FONT);

  const tableFrame = figma.createFrame();
  tableFrame.name = "Word Translation Table";
  tableFrame.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];
  tableFrame.clipsContent = true;
  tableFrame.layoutMode = "VERTICAL";
  tableFrame.primaryAxisSizingMode = "AUTO";
  tableFrame.counterAxisSizingMode = "AUTO";
  tableFrame.itemSpacing = 0;
  tableFrame.strokesIncludedInLayout = true;

  tableFrame.cornerRadius = 12;
  tableFrame.strokes = [{ type: "SOLID", color: { r: 0.85, g: 0.85, b: 0.85 } }];
  tableFrame.strokeWeight = 1;

  const tableWidth = 1200;
  const minCellWidth = 180;
  const padding = 16;
  const headerRow = createTemplateRow({
    name: "Header Row",
    width: tableWidth,
    minHeight: 72,
    fill: { r: 0.45, g: 0.45, b: 0.45 },
  });
  tableFrame.appendChild(headerRow);
  headers.forEach((column) => {
    createTemplateHeaderCell({
      parent: headerRow,
      title: column.title,
      flag: column.flag,
      minWidth: minCellWidth,
      padding,
    });
  });

  rows.forEach((row, rowIndex) => {
    const bodyRow = createTemplateRow({
      name: `Row ${rowIndex + 1}`,
      width: tableWidth,
      minHeight: 100,
      fill: rowIndex % 2 === 0 ? { r: 1, g: 1, b: 1 } : { r: 0.976, g: 0.976, b: 0.976 },
      topStrokeOnly: true,
    });
    tableFrame.appendChild(bodyRow);
    row.forEach((cell) => {
      createTemplateCell({
        parent: bodyRow,
        text: cell,
        minWidth: minCellWidth,
        padding,
      });
    });
  });

  figma.currentPage.appendChild(tableFrame);
  tableFrame.x = figma.viewport.center.x - tableFrame.width / 2;
  tableFrame.y = figma.viewport.center.y - tableFrame.height / 2;
  figma.currentPage.selection = [tableFrame];
  figma.viewport.scrollAndZoomIntoView([tableFrame]);
  tableFrame.setPluginData("word-template", "translation-table");

  postNotice("Tabla plantilla importada. Edita textos o columnas en Figma y capturala.", "info");
  postState();
}

function createTemplateRow(options: {
  name: string;
  width: number;
  minHeight: number;
  fill: RGB;
  topStrokeOnly?: boolean;
}): FrameNode {
  const row = figma.createFrame();
  row.name = options.name;
  row.fills = [{ type: "SOLID", color: options.fill }];
  row.clipsContent = false;
  row.layoutMode = "HORIZONTAL";
  row.primaryAxisSizingMode = "FIXED";
  row.counterAxisSizingMode = "AUTO";
  row.layoutGrow = 1;
  row.itemSpacing = 0;
  row.strokesIncludedInLayout = true;
  row.minHeight = options.minHeight;
  row.resize(options.width, options.minHeight);

  if (options.topStrokeOnly) {
    row.strokes = [{ type: "SOLID", color: { r: 0.9, g: 0.9, b: 0.9 } }];
    row.strokeTopWeight = 1;
    row.strokeRightWeight = 0;
    row.strokeBottomWeight = 0;
    row.strokeLeftWeight = 0;
  }

  return row;
}

function createTemplateHeaderCell(options: {
  parent: FrameNode;
  title: string;
  flag: string;
  minWidth: number;
  padding: number;
}) {
  const cell = figma.createFrame();
  cell.name = `${options.title} Header`;
  cell.fills = [];
  cell.clipsContent = false;
  cell.layoutMode = "HORIZONTAL";
  cell.layoutGrow = 1;
  cell.primaryAxisSizingMode = "AUTO";
  cell.counterAxisSizingMode = "AUTO";
  cell.minWidth = options.minWidth;
  cell.paddingLeft = options.padding;
  cell.paddingRight = options.padding;
  cell.paddingTop = options.padding;
  cell.paddingBottom = options.padding;
  cell.primaryAxisAlignItems = "SPACE_BETWEEN";
  cell.counterAxisAlignItems = "CENTER";
  cell.itemSpacing = 12;

  const text = figma.createText();
  text.name = "Header title";
  text.fontName = SEMIBOLD_FONT;
  text.characters = options.title;
  text.fontSize = 18;
  text.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  const flag = figma.createText();
  flag.name = "Flag";
  flag.fontName = REGULAR_FONT;
  flag.characters = options.flag;
  flag.fontSize = 18;
  flag.fills = [{ type: "SOLID", color: { r: 1, g: 1, b: 1 } }];

  cell.appendChild(text);
  cell.appendChild(flag);
  options.parent.appendChild(cell);
}

function createTemplateCell(options: {
  parent: FrameNode;
  text: string;
  minWidth: number;
  padding: number;
}) {
  const cell = figma.createFrame();
  cell.name = "Cell";
  cell.fills = [];
  cell.clipsContent = false;
  cell.layoutMode = "VERTICAL";
  cell.layoutGrow = 1;
  cell.counterAxisSizingMode = "AUTO";
  cell.primaryAxisSizingMode = "AUTO";
  cell.minWidth = options.minWidth;
  cell.minHeight = 48;
  cell.paddingLeft = options.padding;
  cell.paddingRight = options.padding;
  cell.paddingTop = options.padding;
  cell.paddingBottom = options.padding;

  const text = figma.createText();
  text.name = "Text";
  text.fontName = REGULAR_FONT;
  text.characters = options.text;
  text.fontSize = 18;
  text.textAutoResize = "HEIGHT";
  text.layoutAlign = "STRETCH";
  text.fills = [{ type: "SOLID", color: { r: 0.12, g: 0.12, b: 0.14 } }];

  cell.appendChild(text);
  options.parent.appendChild(cell);
}

function extractTranslationTable(node: SceneNode): TranslationTable | null {
  if (!("children" in node)) {
    return null;
  }

  const textBlocks = collectTextBlocks(node);

  if (textBlocks.length < 4) {
    return null;
  }

  const rows = groupTextBlocksIntoRows(textBlocks);

  if (rows.length < 2) {
    return null;
  }

  const columnCount = inferColumnCount(rows);

  if (columnCount < 2) {
    return null;
  }

  const anchors = inferColumnAnchors(rows, columnCount);
  const normalizedRows = rows.map((row) => normalizeRowToColumns(row, anchors));
  const headers = normalizedRows[0];
  const bodyRows = normalizedRows.slice(1);

  if (bodyRows.length === 0 || headers.every((header) => !header.trim())) {
    return null;
  }

  return {
    id: node.id,
    name: node.name,
    headers,
    rows: bodyRows,
  };
}

function collectTextBlocks(node: SceneNode) {
  const blocks: TableTextBlock[] = [];

  walkVisibleNodes(node, (child) => {
    if (child.type !== "TEXT") {
      return;
    }

    const text = child.characters.trim();
    const bounds = getBounds(child);

    if (!text || !bounds) {
      return;
    }

    blocks.push({
      text,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
    });
  });

  return blocks.sort((a, b) => a.y - b.y || a.x - b.x);
}

function groupTextBlocksIntoRows(blocks: TableTextBlock[]): TableTextBlock[][] {
  const rows: TableTextBlock[][] = [];

  for (const block of blocks) {
    const tolerance = Math.max(14, block.height * 0.65);
    const row = rows.find((candidate) => Math.abs(candidate[0].y - block.y) <= tolerance);

    if (row) {
      row.push(block);
    } else {
      rows.push([block]);
    }
  }

  return rows
    .map((row) => row.sort((a, b) => a.x - b.x))
    .filter((row) => row.some((cell) => cell.text.trim().length > 0));
}

function inferColumnCount(rows: TableTextBlock[][]): number {
  const bodyLengths = rows
    .slice(1)
    .map((row) => row.length)
    .filter((length) => length >= 2);

  if (bodyLengths.length === 0) {
    return Math.max(...rows.map((row) => row.length));
  }

  const counts = new Map<number, number>();

  bodyLengths.forEach((length) => {
    counts.set(length, (counts.get(length) || 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
}

function inferColumnAnchors(rows: TableTextBlock[][], columnCount: number): number[] {
  const anchorRow =
    rows.slice(1).find((row) => row.length === columnCount) ||
    rows.find((row) => row.length === columnCount);

  if (anchorRow) {
    return anchorRow.map((block) => getBlockCenterX(block));
  }

  const allBlocks = rows.flat();
  const minX = Math.min(...allBlocks.map((block) => block.x));
  const maxX = Math.max(...allBlocks.map((block) => block.x + block.width));
  const columnWidth = (maxX - minX) / columnCount;

  return Array.from(
    { length: columnCount },
    (_, index) => minX + columnWidth * index + columnWidth / 2,
  );
}

function normalizeRowToColumns(row: TableTextBlock[], anchors: number[]): string[] {
  const cells = anchors.map(() => [] as string[]);

  row.forEach((block) => {
    const index = getClosestAnchorIndex(getBlockCenterX(block), anchors);
    cells[index].push(block.text);
  });

  return cells.map((parts) => parts.join(" ").replace(/\s+/g, " ").trim());
}

function getClosestAnchorIndex(x: number, anchors: number[]): number {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;

  anchors.forEach((anchor, index) => {
    const distance = Math.abs(anchor - x);

    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  });

  return closestIndex;
}

function getBlockCenterX(block: TableTextBlock): number {
  return block.x + block.width / 2;
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
