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
  var TEMPLATE_COLUMNS = [
    { title: "Neutro", flag: "\u{1F1EA}\u{1F1F8}" },
    { title: "Voseado", flag: "\u{1F1E6}\u{1F1F7}" },
    { title: "Portugu\xE9s", flag: "\u{1F1E7}\u{1F1F7}" },
    { title: "Ingl\xE9s", flag: "\u{1F1EC}\u{1F1E7}" },
    { title: "Franc\xE9s", flag: "\u{1F1EB}\u{1F1F7}" }
  ];
  var TEMPLATE_ROWS = [
    [
      "Hola",
      "Hola",
      "Ol\xE1",
      "Hello",
      "Bonjour"
    ],
    [
      "Adi\xF3s",
      "Adi\xF3s",
      "Adeus",
      "Goodbye",
      "Au revoir"
    ]
  ];
  var REGULAR_FONT = { family: "Inter", style: "Regular" };
  var SEMIBOLD_FONT = { family: "Inter", style: "Semi Bold" };
  var nextBlockNumber = 1;
  var initialBlockId = createBlockId();
  var blocks = [{ id: initialBlockId, name: "Bloque" }];
  var exportMode;
  figma.showUI(__html__, {
    width: 800,
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
      exportMode = void 0;
      resetBlocks(false);
      return;
    }
  };
  postState();
  function applyInitialUiLayout(availWidth, availHeight) {
    const safeWidth = Number.isFinite(availWidth) && availWidth > 0 ? availWidth : 1440;
    const safeHeight = Number.isFinite(availHeight) && availHeight > 0 ? availHeight : 900;
    const width = Math.round(Math.min(800, Math.floor(safeWidth * 0.5)));
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
      exportMode,
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
  function addBlock() {
    const blockNumber = nextBlockNumber;
    const block = { id: createBlockId(), name: `Bloque (nuevo)` };
    blocks = [...blocks, block];
    postState();
  }
  function removeBlock(blockId) {
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
  function getBlock(blockId) {
    return blocks.find((block) => block.id === blockId);
  }
  function updateBlock(blockId, patch) {
    blocks = blocks.map(
      (block) => block.id === blockId ? __spreadValues(__spreadValues({}, block), patch) : block
    );
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
      (block) => Boolean(block.name) && Boolean(block.table) && (exportMode === "table-only" || Boolean(block.screen))
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
  async function importTemplateTable() {
    const headers = TEMPLATE_COLUMNS;
    const rows = TEMPLATE_ROWS.map(
      (row) => headers.map((_, index) => row[index] || "")
    );
    await figma.loadFontAsync(REGULAR_FONT);
    await figma.loadFontAsync(SEMIBOLD_FONT);
    const table = figma.createFrame();
    table.name = "Word Translation Table";
    table.layoutMode = "VERTICAL";
    table.primaryAxisSizingMode = "AUTO";
    table.counterAxisSizingMode = "FIXED";
    table.resize(900, 100);
    table.itemSpacing = 0;
    table.clipsContent = true;
    table.strokesIncludedInLayout = true;
    table.fills = [
      {
        type: "SOLID",
        color: { r: 1, g: 1, b: 1 }
      }
    ];
    table.cornerRadius = 12;
    table.strokeWeight = 1;
    table.strokes = [
      {
        type: "SOLID",
        color: { r: 0.85, g: 0.85, b: 0.85 }
      }
    ];
    const headerRow = createTableRow({
      name: "Header Row",
      background: { r: 0.45, g: 0.45, b: 0.45 },
      minHeight: 48
    });
    table.appendChild(headerRow);
    headers.forEach((column) => {
      const cell = createTableCell({
        name: `${column.title} Header`,
        minWidth: 180,
        minHeight: 48,
        padding: 16,
        isHeader: true,
        background: null
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
      cell.layoutMode = "HORIZONTAL";
      cell.primaryAxisAlignItems = "SPACE_BETWEEN";
      cell.counterAxisAlignItems = "CENTER";
      cell.itemSpacing = 12;
      cell.appendChild(title);
      cell.appendChild(flag);
      headerRow.appendChild(cell);
    });
    rows.forEach((rowData, rowIndex) => {
      const bodyRow = createTableRow({
        name: `Row ${rowIndex + 1}`,
        background: rowIndex % 2 === 0 ? { r: 1, g: 1, b: 1 } : { r: 0.976, g: 0.976, b: 0.976 },
        minHeight: 48,
        topBorder: true
      });
      table.appendChild(bodyRow);
      rowData.forEach((value) => {
        const cell = createTableCell({
          name: "Cell",
          minWidth: 180,
          minHeight: 48,
          padding: 16,
          background: null
        });
        const text = createTextNode(
          value,
          REGULAR_FONT,
          14,
          { r: 0.12, g: 0.12, b: 0.14 }
        );
        text.layoutAlign = "STRETCH";
        text.textAutoResize = "HEIGHT";
        cell.appendChild(text);
        bodyRow.appendChild(cell);
      });
    });
    figma.currentPage.appendChild(table);
    table.x = figma.viewport.center.x - table.width / 2;
    table.y = figma.viewport.center.y - table.height / 2;
    figma.currentPage.selection = [table];
    figma.viewport.scrollAndZoomIntoView([table]);
    table.setPluginData("word-template", "translation-table");
    postNotice(
      "Tabla plantilla importada. Edita textos o columnas en Figma y capt\xFArala.",
      "info"
    );
    postState();
  }
  function createTableRow(options) {
    const row = figma.createFrame();
    row.name = options.name;
    row.layoutMode = "HORIZONTAL";
    row.layoutAlign = "STRETCH";
    row.primaryAxisSizingMode = "FIXED";
    row.counterAxisSizingMode = "AUTO";
    row.itemSpacing = 0;
    row.clipsContent = false;
    row.strokesIncludedInLayout = true;
    row.minHeight = options.minHeight;
    row.resizeWithoutConstraints(100, options.minHeight);
    row.fills = [
      {
        type: "SOLID",
        color: options.background
      }
    ];
    if (options.topBorder) {
      row.strokes = [
        {
          type: "SOLID",
          color: { r: 0.9, g: 0.9, b: 0.9 }
        }
      ];
      row.strokeTopWeight = 1;
      row.strokeRightWeight = 0;
      row.strokeBottomWeight = 0;
      row.strokeLeftWeight = 0;
    }
    return row;
  }
  function createTableCell(options) {
    var _a;
    const cell = figma.createFrame();
    cell.name = options.name;
    cell.layoutMode = "VERTICAL";
    cell.layoutGrow = 1;
    cell.layoutAlign = "STRETCH";
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
    cell.fills = options.background === null ? [] : [
      {
        type: "SOLID",
        color: (_a = options.background) != null ? _a : { r: 1, g: 1, b: 1 }
      }
    ];
    cell.resizeWithoutConstraints(options.minWidth, options.minHeight);
    return cell;
  }
  function createTextNode(content, font, fontSize, color) {
    const text = figma.createText();
    text.fontName = font;
    text.characters = content;
    text.fontSize = fontSize;
    text.fills = [
      {
        type: "SOLID",
        color
      }
    ];
    text.textAutoResize = "HEIGHT";
    return text;
  }
  function extractTranslationTable(node) {
    if (!("children" in node)) {
      return null;
    }
    const rowNodes = node.children.filter(
      (child) => child.type === "FRAME" && "children" in child && child.visible !== false
    );
    if (rowNodes.length < 2) {
      return null;
    }
    const parsedRows = rowNodes.map(extractRowTexts);
    const validRows = parsedRows.filter(
      (row) => row.some((cell) => cell.trim().length > 0)
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
      rows: bodyRows
    };
  }
  function extractRowTexts(row) {
    const cellNodes = row.children.filter(
      (child) => child.type === "FRAME" && "children" in child && child.visible !== false
    );
    return cellNodes.map(extractCellText);
  }
  function extractCellText(cell) {
    const textNodes = [];
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
    return textNodes.map((node) => node.characters.trim()).filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
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
