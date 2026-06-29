export interface SelectionCell {
  col: number;
  row: number;
}

export interface SelectionRange {
  anchor: SelectionCell;
  focus: SelectionCell;
}

export type CopyModeState = 'off' | 'on_idle' | 'on_selecting' | 'on_has_selection';
