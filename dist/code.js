"use strict";
(() => {
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
  var draftScreen;
  var draftTable;
  var pairs = [];
  figma.showUI(__html__, { width: 1040, height: 780, themeColors: true });
  figma.ui.onmessage = async (message) => {
    if (message.type === "state-request") {
      postState();
      return;
    }
    if (message.type === "capture-screen") {
      await captureScreen();
      return;
    }
    if (message.type === "capture-table") {
      captureTable();
      return;
    }
    if (message.type === "import-template-table") {
      await importTemplateTable(message.payload.columns);
      return;
    }
    if (message.type === "remove-pair") {
      pairs = pairs.filter((pair) => pair.id !== message.payload.id);
      postState();
      return;
    }
    if (message.type === "clear-pairs") {
      draftScreen = void 0;
      draftTable = void 0;
      pairs = [];
      postState();
      return;
    }
    if (message.type === "close-plugin") {
      figma.closePlugin();
    }
  };
  figma.on("selectionchange", postState);
  postState();
  function postToUi(message) {
    figma.ui.postMessage(message);
  }
  function postState() {
    const state = {
      selection: getSelectionSummary(),
      draft: {
        screen: draftScreen,
        table: draftTable
      },
      document: {
        generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
        pairs
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
  async function captureScreen() {
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
      draftScreen = {
        id: selectedNode.id,
        name: selectedNode.name,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        dataUrl: await exportNodeAsJpg(selectedNode, getScaleForNode(selectedNode, 1800))
      };
      completePairIfReady();
      postNotice("Pantalla capturada. Ahora selecciona la tabla de traducciones.", "info");
      postState();
    } catch (e) {
      postNotice("No se pudo exportar la pantalla seleccionada.", "error");
    }
  }
  function captureTable() {
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
    draftTable = table;
    completePairIfReady();
    postNotice("Tabla de traducciones capturada.", "info");
    postState();
  }
  function completePairIfReady() {
    if (!draftScreen || !draftTable) {
      return;
    }
    pairs = [
      ...pairs,
      {
        id: `${Date.now()}-${pairs.length + 1}`,
        screen: draftScreen,
        table: draftTable
      }
    ];
    draftScreen = void 0;
    draftTable = void 0;
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
    const columnWidth = 210;
    const headerHeight = 54;
    const rowHeight = 72;
    const borderColor = { r: 0.72, g: 0.72, b: 0.72 };
    const headerFill = { r: 0.43, g: 0.43, b: 0.43 };
    const width = headers.length * columnWidth;
    const height = headerHeight + rows.length * rowHeight;
    tableFrame.resize(width, height);
    headers.forEach((header, columnIndex) => {
      createTemplateCell({
        parent: tableFrame,
        text: header,
        x: columnIndex * columnWidth,
        y: 0,
        width: columnWidth,
        height: headerHeight,
        fill: headerFill,
        textColor: { r: 1, g: 1, b: 1 },
        fontSize: 18
      });
    });
    rows.forEach((row, rowIndex) => {
      row.forEach((cell, columnIndex) => {
        createTemplateCell({
          parent: tableFrame,
          text: cell,
          x: columnIndex * columnWidth,
          y: headerHeight + rowIndex * rowHeight,
          width: columnWidth,
          height: rowHeight,
          fill: { r: 1, g: 1, b: 1 },
          textColor: { r: 0.12, g: 0.12, b: 0.14 },
          fontSize: 16
        });
      });
    });
    tableFrame.strokes = [{ type: "SOLID", color: borderColor }];
    tableFrame.strokeWeight = 1;
    tableFrame.x = figma.viewport.center.x - width / 2;
    tableFrame.y = figma.viewport.center.y - height / 2;
    figma.currentPage.appendChild(tableFrame);
    figma.currentPage.selection = [tableFrame];
    figma.viewport.scrollAndZoomIntoView([tableFrame]);
    postNotice("Tabla plantilla importada. Edita textos o columnas en Figma y capturala.", "info");
    postState();
  }
  function createTemplateCell(options) {
    const rectangle = figma.createRectangle();
    rectangle.name = "Celda";
    rectangle.x = options.x;
    rectangle.y = options.y;
    rectangle.resize(options.width, options.height);
    rectangle.fills = [{ type: "SOLID", color: options.fill }];
    rectangle.strokes = [{ type: "SOLID", color: { r: 0.72, g: 0.72, b: 0.72 } }];
    rectangle.strokeWeight = 1;
    const text = figma.createText();
    text.name = "Texto traduccion";
    text.fontName = REGULAR_FONT;
    text.fontSize = options.fontSize;
    text.characters = options.text;
    text.fills = [{ type: "SOLID", color: options.textColor }];
    text.x = options.x + 16;
    text.y = options.y + 16;
    text.resize(options.width - 32, options.height - 24);
    options.parent.appendChild(rectangle);
    options.parent.appendChild(text);
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
    const columnCount = Math.max(...rows.map((row) => row.length));
    if (columnCount < 2 || rows[0].length < 2) {
      return null;
    }
    const normalizedRows = rows.map(
      (row) => Array.from({ length: columnCount }, (_, index) => row[index] || "")
    );
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
    const blocks = [];
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
        height: bounds.height
      });
    });
    return blocks.sort((a, b) => a.y - b.y || a.x - b.x);
  }
  function groupTextBlocksIntoRows(blocks) {
    const rows = [];
    for (const block of blocks) {
      const tolerance = Math.max(14, block.height * 0.65);
      const row = rows.find((candidate) => Math.abs(candidate[0].y - block.y) <= tolerance);
      if (row) {
        row.push(block);
      } else {
        rows.push([block]);
      }
    }
    return rows.map((row) => row.sort((a, b) => a.x - b.x).map((block) => block.text)).filter((row) => row.some((cell) => cell.trim().length > 0));
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
