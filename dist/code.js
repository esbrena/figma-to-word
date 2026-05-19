"use strict";
(() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropSymbols = Object.getOwnPropertySymbols;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __propIsEnum = Object.prototype.propertyIsEnumerable;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __spreadValues = (a, b) => {
    for (var prop in b || (b = {}))
      if (__hasOwnProp.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    if (__getOwnPropSymbols)
      for (var prop of __getOwnPropSymbols(b)) {
        if (__propIsEnum.call(b, prop))
          __defNormalProp(a, prop, b[prop]);
      }
    return a;
  };

  // src/code.ts
  var TEMPLATE_COLUMNS = ["Neutro", "Voseado", "Portugues", "Ingles", "Frances"];
  var TEMPLATE_ROWS = [
    [
      "\xBFBuscas pedidos anteriores?",
      "\xBFBuscas pedidos anteriores?",
      "Buscando por pedidos anteriores?",
      "Looking for previous orders?",
      "Vous cherchez des commandes precedentes?"
    ],
    [
      "Consultar historial completo",
      "Consultar historial completo",
      "Consulte o historico completo",
      "Check full history",
      "Consulter l'historique complet"
    ]
  ];
  var REGULAR_FONT = { family: "Inter", style: "Regular" };
  var nextBlockNumber = 1;
  var initialBlockId = createBlockId();
  var activeBlockId = initialBlockId;
  var blocks = [{ id: initialBlockId, name: "Bloque 1" }];
  figma.showUI(__html__, {
    width: 960,
    height: 620,
    themeColors: true,
    title: "UI Translation Exporter"
  });
  figma.ui.onmessage = async (message) => {
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
      await importTemplateTable(message.payload.columns);
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
    if (message.type === "close-plugin") {
      figma.closePlugin();
    }
  };
  figma.on("selectionchange", postState);
  postState();
  function applyInitialUiLayout(availWidth, availHeight) {
    const safeWidth = Number.isFinite(availWidth) && availWidth > 0 ? availWidth : 1440;
    const safeHeight = Number.isFinite(availHeight) && availHeight > 0 ? availHeight : 900;
    const width = Math.round(Math.min(960, safeWidth));
    const height = Math.round(Math.max(420, safeHeight));
    const x = Math.max(0, safeWidth - width);
    const y = 0;
    figma.ui.resize(width, height);
    figma.ui.reposition(x, y);
  }
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function postState() {
    const completedPairs = getCompletedPairs();
    const state = {
      selection: getSelectionSummary(),
      activeBlockId,
      blocks,
      document: {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        pairs: completedPairs
      }
    };
    postToUi({ type: "state", payload: state });
  }
  function postNotice(message, level = "info") {
    postToUi({ type: "notice", payload: { message, level } });
  }
  function getSelectionSummary() {
    const selection = figma.currentPage.selection;
    return {
      count: selection.length,
      names: selection.map((node) => node.name)
    };
  }
  function addBlock() {
    const blockNumber = nextBlockNumber;
    const block = { id: createBlockId(), name: `Bloque ${blockNumber}` };
    blocks = [...blocks, block];
    activeBlockId = block.id;
    postState();
  }
  function removeBlock(blockId) {
    if (blocks.length <= 1) {
      postNotice("Debe existir al menos un bloque de pantalla y tabla.", "error");
      return;
    }
    blocks = blocks.filter((block) => block.id !== blockId);
    activeBlockId = blocks[blocks.length - 1].id;
    postState();
  }
  function resetBlocks() {
    const blockNumber = nextBlockNumber;
    const block = { id: createBlockId(), name: `Bloque ${blockNumber}` };
    blocks = [block];
    activeBlockId = block.id;
    postNotice("Documento reiniciado.", "info");
    postState();
  }
  function createBlockId() {
    const id = `block-${nextBlockNumber}`;
    nextBlockNumber += 1;
    return id;
  }
  function getBlock(blockId) {
    return blocks.find((block) => block.id === blockId);
  }
  function updateBlock(blockId, patch) {
    blocks = blocks.map(
      (block) => block.id === blockId ? __spreadValues(__spreadValues({}, block), patch) : block
    );
    activeBlockId = blockId;
  }
  function updateBlockName(blockId, name) {
    const safeName = name.trim().slice(0, 80);
    updateBlock(blockId, {
      name: safeName || "Bloque"
    });
    postState();
  }
  function getCompletedPairs() {
    return blocks.filter(
      (block) => Boolean(block.name) && Boolean(block.screen) && Boolean(block.table)
    ).map((block) => ({
      id: block.id,
      name: block.name,
      screen: block.screen,
      table: block.table
    }));
  }
  async function captureScreen(blockId) {
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
        "error"
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
          dataUrl: await exportNodeAsJpg(selectedNode, getScaleForNode(selectedNode, 1800))
        }
      });
      postNotice("Pantalla capturada en el bloque. Ahora captura su tabla.", "info");
      postState();
    } catch (e) {
      postNotice("No se pudo exportar la pantalla seleccionada.", "error");
    }
  }
  function captureTable(blockId) {
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
        "error"
      );
      return;
    }
    updateBlock(blockId, { table });
    postNotice("Tabla de traducciones capturada en el bloque.", "info");
    postState();
  }
  async function importTemplateTable(columns) {
    const cleanColumns = columns.map((column) => column.trim()).filter((column) => column.length > 0);
    const headers = cleanColumns.length > 0 ? cleanColumns : TEMPLATE_COLUMNS;
    const rows = TEMPLATE_ROWS.map(
      (row) => headers.map((_, index) => row[index] || "Texto traducido")
    );
    await figma.loadFontAsync(REGULAR_FONT);
    const tableFrame = figma.createFrame();
    tableFrame.name = "Tabla de traducciones";
    tableFrame.fills = [];
    tableFrame.clipsContent = false;
    tableFrame.layoutMode = "VERTICAL";
    tableFrame.primaryAxisSizingMode = "AUTO";
    tableFrame.counterAxisSizingMode = "FIXED";
    tableFrame.itemSpacing = 0;
    tableFrame.strokesIncludedInLayout = true;
    const minCellHeight = 48;
    const borderColor = { r: 0.72, g: 0.72, b: 0.72 };
    const headerFill = { r: 0.43, g: 0.43, b: 0.43 };
    const width = 900;
    const columnWidth = width / headers.length;
    const templateHeight = minCellHeight * (rows.length + 1);
    tableFrame.resize(width, templateHeight);
    tableFrame.cornerRadius = 12;
    const headerRow = createTemplateRow("Header", width);
    tableFrame.appendChild(headerRow);
    headers.forEach((header) => {
      createTemplateCell({
        parent: headerRow,
        text: header,
        width: columnWidth,
        height: minCellHeight,
        fill: headerFill,
        textColor: { r: 1, g: 1, b: 1 },
        fontSize: 18
      });
    });
    rows.forEach((row, rowIndex) => {
      const bodyRow = createTemplateRow(`Fila ${rowIndex + 1}`, width);
      tableFrame.appendChild(bodyRow);
      row.forEach((cell) => {
        createTemplateCell({
          parent: bodyRow,
          text: cell,
          width: columnWidth,
          height: minCellHeight,
          fill: { r: 1, g: 1, b: 1 },
          textColor: { r: 0.12, g: 0.12, b: 0.14 },
          fontSize: 16
        });
      });
    });
    tableFrame.strokes = [{ type: "SOLID", color: borderColor }];
    tableFrame.strokeWeight = 1;
    tableFrame.x = figma.viewport.center.x - width / 2;
    tableFrame.y = figma.viewport.center.y - templateHeight / 2;
    figma.currentPage.appendChild(tableFrame);
    figma.currentPage.selection = [tableFrame];
    figma.viewport.scrollAndZoomIntoView([tableFrame]);
    postNotice("Tabla plantilla importada. Edita textos o columnas en Figma y capturala.", "info");
    postState();
  }
  function createTemplateRow(name, width) {
    const row = figma.createFrame();
    row.name = name;
    row.fills = [];
    row.clipsContent = false;
    row.layoutMode = "HORIZONTAL";
    row.primaryAxisSizingMode = "FIXED";
    row.counterAxisSizingMode = "AUTO";
    row.layoutSizingHorizontal = "FILL";
    row.layoutSizingVertical = "HUG";
    row.itemSpacing = 0;
    row.strokesIncludedInLayout = true;
    row.minHeight = 48;
    row.resize(width, 48);
    return row;
  }
  function createTemplateCell(options) {
    const cell = figma.createFrame();
    cell.name = "Celda";
    cell.fills = [{ type: "SOLID", color: options.fill }];
    cell.strokes = [{ type: "SOLID", color: { r: 0.72, g: 0.72, b: 0.72 } }];
    cell.strokeWeight = 1;
    cell.clipsContent = false;
    cell.layoutMode = "VERTICAL";
    cell.primaryAxisSizingMode = "AUTO";
    cell.counterAxisSizingMode = "FIXED";
    cell.layoutSizingHorizontal = "FILL";
    cell.layoutSizingVertical = "HUG";
    cell.layoutGrow = 1;
    cell.minHeight = 48;
    cell.minWidth = 180;
    cell.paddingTop = 14;
    cell.paddingRight = 16;
    cell.paddingBottom = 14;
    cell.paddingLeft = 16;
    cell.itemSpacing = 0;
    cell.resize(Math.max(180, options.width), options.height);
    const text = figma.createText();
    text.name = "Texto traduccion";
    text.fontName = REGULAR_FONT;
    text.fontSize = options.fontSize;
    text.fills = [{ type: "SOLID", color: options.textColor }];
    text.textAutoResize = "HEIGHT";
    text.layoutSizingHorizontal = "FILL";
    text.resize(Math.max(148, options.width - 32), 20);
    text.characters = options.text;
    cell.appendChild(text);
    options.parent.appendChild(cell);
  }
  function extractTranslationTable(node) {
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
      rows: bodyRows
    };
  }
  function collectTextBlocks(node) {
    const blocks2 = [];
    walkVisibleNodes(node, (child) => {
      if (child.type !== "TEXT") {
        return;
      }
      const text = child.characters.trim();
      const bounds = getBounds(child);
      if (!text || !bounds) {
        return;
      }
      blocks2.push({
        text,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height
      });
    });
    return blocks2.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  function groupTextBlocksIntoRows(blocks2) {
    const rows = [];
    for (const block of blocks2) {
      const tolerance = Math.max(14, block.height * 0.65);
      const row = rows.find((candidate) => Math.abs(candidate[0].y - block.y) <= tolerance);
      if (row) {
        row.push(block);
      } else {
        rows.push([block]);
      }
    }
    return rows.map((row) => row.sort((a, b) => a.x - b.x)).filter((row) => row.some((cell) => cell.text.trim().length > 0));
  }
  function inferColumnCount(rows) {
    const bodyLengths = rows.slice(1).map((row) => row.length).filter((length) => length >= 2);
    if (bodyLengths.length === 0) {
      return Math.max(...rows.map((row) => row.length));
    }
    const counts = /* @__PURE__ */ new Map();
    bodyLengths.forEach((length) => {
      counts.set(length, (counts.get(length) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  }
  function inferColumnAnchors(rows, columnCount) {
    const anchorRow = rows.slice(1).find((row) => row.length === columnCount) || rows.find((row) => row.length === columnCount);
    if (anchorRow) {
      return anchorRow.map((block) => getBlockCenterX(block));
    }
    const allBlocks = rows.flat();
    const minX = Math.min(...allBlocks.map((block) => block.x));
    const maxX = Math.max(...allBlocks.map((block) => block.x + block.width));
    const columnWidth = (maxX - minX) / columnCount;
    return Array.from(
      { length: columnCount },
      (_, index) => minX + columnWidth * index + columnWidth / 2
    );
  }
  function normalizeRowToColumns(row, anchors) {
    const cells = anchors.map(() => []);
    row.forEach((block) => {
      const index = getClosestAnchorIndex(getBlockCenterX(block), anchors);
      cells[index].push(block.text);
    });
    return cells.map((parts) => parts.join(" ").replace(/\s+/g, " ").trim());
  }
  function getClosestAnchorIndex(x, anchors) {
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
  function getBlockCenterX(block) {
    return block.x + block.width / 2;
  }
  function walkVisibleNodes(node, visit) {
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
  function getSingleSelection() {
    const selection = figma.currentPage.selection;
    if (selection.length !== 1) {
      return null;
    }
    return selection[0];
  }
  function getBounds(node) {
    if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
      return node.absoluteBoundingBox;
    }
    return null;
  }
  function getScaleForNode(node, maxSize) {
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
  async function exportNodeAsJpg(node, scale) {
    const bytes = await node.exportAsync({
      format: "JPG",
      constraint: { type: "SCALE", value: scale }
    });
    return `data:image/jpeg;base64,${figma.base64Encode(bytes)}`;
  }
})();
