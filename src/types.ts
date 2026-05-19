export type SelectionSummary = {
  count: number;
  names: string[];
};

export type CapturedScreen = {
  id: string;
  name: string;
  width: number;
  height: number;
  dataUrl: string;
};

export type TranslationTable = {
  id: string;
  name: string;
  headers: string[];
  rows: string[][];
};

export type TranslationPair = {
  id: string;
  name: string;
  screen: CapturedScreen;
  table: TranslationTable;
};

export type TranslationBlock = {
  id: string;
  name: string;
  screen?: CapturedScreen;
  table?: TranslationTable;
};

export type ExportDocument = {
  generatedAt: string;
  pairs: TranslationPair[];
};

export type PluginState = {
  selection: SelectionSummary;
  activeBlockId: string;
  blocks: TranslationBlock[];
  document: ExportDocument;
};

export type UiToPluginMessage =
  | { type: "state-request" }
  | { type: "add-block" }
  | { type: "update-block-name"; payload: { blockId: string; name: string } }
  | { type: "capture-screen"; payload: { blockId: string } }
  | { type: "capture-table"; payload: { blockId: string } }
  | { type: "import-template-table"; payload: { columns: string[] } }
  | { type: "remove-block"; payload: { blockId: string } }
  | { type: "reset" }
  | { type: "close-plugin" };

export type PluginToUiMessage =
  | { type: "state"; payload: PluginState }
  | { type: "busy"; payload: { message: string } }
  | { type: "notice"; payload: { message: string; level: "info" | "error" } };
