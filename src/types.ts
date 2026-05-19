export type SelectionSummary = {
  frameCount: number;
  frameNames: string[];
};

export type TextBlock = {
  id: string;
  name: string;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  color?: string;
};

export type ImageBlock = {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  dataUrl: string;
};

export type InferredTable = {
  id: string;
  name: string;
  rows: string[][];
};

export type ExportFrame = {
  id: string;
  name: string;
  width: number;
  height: number;
  previewDataUrl: string;
  textBlocks: TextBlock[];
  imageBlocks: ImageBlock[];
  tables: InferredTable[];
};

export type ExportDocument = {
  generatedAt: string;
  frames: ExportFrame[];
};

export type UiToPluginMessage =
  | { type: "selection-summary-request" }
  | { type: "generate-document" }
  | { type: "close-plugin" };

export type PluginToUiMessage =
  | { type: "selection-summary"; payload: SelectionSummary }
  | { type: "generation-started" }
  | { type: "document-ready"; payload: ExportDocument }
  | { type: "generation-error"; payload: { message: string } };
