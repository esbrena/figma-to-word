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
  screen: CapturedScreen;
  table: TranslationTable;
};

export type DraftState = {
  screen?: CapturedScreen;
  table?: TranslationTable;
};

export type ExportDocument = {
  generatedAt: string;
  pairs: TranslationPair[];
};

export type PluginState = {
  selection: SelectionSummary;
  draft: DraftState;
  document: ExportDocument;
};

export type UiToPluginMessage =
  | { type: "state-request" }
  | { type: "capture-screen" }
  | { type: "capture-table" }
  | { type: "import-template-table"; payload: { columns: string[] } }
  | { type: "remove-pair"; payload: { id: string } }
  | { type: "clear-pairs" }
  | { type: "close-plugin" };

export type PluginToUiMessage =
  | { type: "state"; payload: PluginState }
  | { type: "busy"; payload: { message: string } }
  | { type: "notice"; payload: { message: string; level: "info" | "error" } };
