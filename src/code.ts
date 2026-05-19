import type {
  ExportDocument,
  ExportFrame,
  ImageBlock,
  InferredTable,
  PluginToUiMessage,
  SelectionSummary,
  TextBlock,
  UiToPluginMessage,
} from "./types";

figma.showUI(__html__, { width: 980, height: 760, themeColors: true });

figma.ui.onmessage = async (message: UiToPluginMessage) => {
  if (message.type === "selection-summary-request") {
    postSelectionSummary();
    return;
  }

  if (message.type === "close-plugin") {
    figma.closePlugin();
    return;
  }

  if (message.type === "generate-document") {
    await generateDocument();
  }
};

figma.on("selectionchange", postSelectionSummary);
postSelectionSummary();

function postToUi(message: PluginToUiMessage) {
  figma.ui.postMessage(message);
}

function postSelectionSummary() {
  const frames = getSelectedFrames();
  const summary: SelectionSummary = {
    frameCount: frames.length,
    frameNames: frames.map((frame) => frame.name),
  };

  postToUi({ type: "selection-summary", payload: summary });
}

async function generateDocument() {
  const frames = getSelectedFrames();

  if (frames.length === 0) {
    postToUi({
      type: "generation-error",
      payload: {
        message: "Selecciona al menos un frame antes de generar el documento.",
      },
    });
    return;
  }

  postToUi({ type: "generation-started" });

  try {
    const exportedFrames: ExportFrame[] = [];

    for (const frame of frames) {
      exportedFrames.push(await exportFrame(frame));
    }

    const document: ExportDocument = {
      generatedAt: new Date().toISOString(),
      frames: exportedFrames,
    };

    postToUi({ type: "document-ready", payload: document });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo generar el documento exportable.";

    postToUi({ type: "generation-error", payload: { message } });
  }
}

function getSelectedFrames(): FrameNode[] {
  return figma.currentPage.selection.filter(
    (node): node is FrameNode => node.type === "FRAME",
  );
}

async function exportFrame(frame: FrameNode): Promise<ExportFrame> {
  const frameBounds = getBounds(frame) ?? {
    x: frame.x,
    y: frame.y,
    width: frame.width,
    height: frame.height,
  };
  const previewDataUrl = await exportNodeAsPng(frame, getScaleForNode(frame, 1600));
  const textBlocks = collectTextBlocks(frame, frameBounds);
  const tables = collectTables(frame, frameBounds);
  const imageBlocks = await collectImageBlocks(frame, frameBounds);

  return {
    id: frame.id,
    name: frame.name,
    width: Math.round(frame.width),
    height: Math.round(frame.height),
    previewDataUrl,
    textBlocks,
    imageBlocks,
    tables,
  };
}

function collectTextBlocks(node: SceneNode, frameBounds: Rect): TextBlock[] {
  const blocks: TextBlock[] = [];

  walkVisibleNodes(node, (child) => {
    if (child.type !== "TEXT") {
      return;
    }

    const text = child.characters.trim();

    if (!text) {
      return;
    }

    const bounds = getBounds(child);

    if (!bounds) {
      return;
    }

    blocks.push({
      id: child.id,
      name: child.name,
      text,
      x: Math.round(bounds.x - frameBounds.x),
      y: Math.round(bounds.y - frameBounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
      fontSize: typeof child.fontSize === "number" ? child.fontSize : undefined,
      color: getTextColor(child),
    });
  });

  return blocks.sort((a, b) => a.y - b.y || a.x - b.x);
}

async function collectImageBlocks(
  frame: FrameNode,
  frameBounds: Rect,
): Promise<ImageBlock[]> {
  const imageNodes: SceneNode[] = [];

  walkVisibleNodes(frame, (node) => {
    if (node.type === "TEXT" || node.id === frame.id) {
      return;
    }

    if (hasImageFill(node)) {
      imageNodes.push(node);
    }
  });

  const imageBlocks: ImageBlock[] = [];

  for (const node of imageNodes.slice(0, 24)) {
    const bounds = getBounds(node);

    if (!bounds || bounds.width < 4 || bounds.height < 4) {
      continue;
    }

    try {
      imageBlocks.push({
        id: node.id,
        name: node.name,
        x: Math.round(bounds.x - frameBounds.x),
        y: Math.round(bounds.y - frameBounds.y),
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
        dataUrl: await exportNodeAsPng(node, getScaleForNode(node, 900)),
      });
    } catch {
      // Some nodes cannot be exported individually; the full frame preview still preserves them.
    }
  }

  return imageBlocks;
}

function collectTables(frame: FrameNode, frameBounds: Rect): InferredTable[] {
  const tables: InferredTable[] = [];

  walkVisibleNodes(frame, (node) => {
    if (!("children" in node) || !/tabla|table/i.test(node.name)) {
      return;
    }

    const textBlocks = collectTextBlocks(node, frameBounds);
    const rows = groupTextBlocksIntoRows(textBlocks);

    if (rows.length < 2 || Math.max(...rows.map((row) => row.length)) < 2) {
      return;
    }

    tables.push({
      id: node.id,
      name: node.name,
      rows,
    });
  });

  return tables;
}

function groupTextBlocksIntoRows(blocks: TextBlock[]): string[][] {
  const rows: TextBlock[][] = [];
  const sortedBlocks = [...blocks].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const block of sortedBlocks) {
    const row = rows.find((candidate) => Math.abs(candidate[0].y - block.y) <= 12);

    if (row) {
      row.push(block);
    } else {
      rows.push([block]);
    }
  }

  return rows
    .map((row) => row.sort((a, b) => a.x - b.x).map((block) => block.text))
    .filter((row) => row.length > 0);
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

function getBounds(node: SceneNode): Rect | null {
  if ("absoluteBoundingBox" in node && node.absoluteBoundingBox) {
    return node.absoluteBoundingBox;
  }

  return null;
}

function hasImageFill(node: SceneNode): boolean {
  if (!("fills" in node) || !Array.isArray(node.fills)) {
    return false;
  }

  return node.fills.some(
    (paint) => paint.type === "IMAGE" && paint.visible !== false,
  );
}

function getTextColor(node: TextNode): string | undefined {
  if (!Array.isArray(node.fills)) {
    return undefined;
  }

  const solidFill = node.fills.find(
    (paint): paint is SolidPaint => paint.type === "SOLID" && paint.visible !== false,
  );

  if (!solidFill) {
    return undefined;
  }

  return rgbToHex(solidFill.color);
}

function rgbToHex(color: RGB): string {
  const channelToHex = (value: number) =>
    Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");

  return `#${channelToHex(color.r)}${channelToHex(color.g)}${channelToHex(color.b)}`;
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

async function exportNodeAsPng(node: SceneNode, scale: number): Promise<string> {
  const bytes = await node.exportAsync({
    format: "PNG",
    constraint: { type: "SCALE", value: scale },
  });

  return `data:image/png;base64,${figma.base64Encode(bytes)}`;
}
