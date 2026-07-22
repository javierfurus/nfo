export const NARROW_COLUMN_THRESHOLD = 90;

export interface SidebarVisibilityParams {
  autoHideMode: boolean;
  columns: number;
  orchestratorFocused: boolean;
  threshold?: number;
}

export function computeSidebarVisible(params: SidebarVisibilityParams): boolean {
  const threshold = params.threshold ?? NARROW_COLUMN_THRESHOLD;
  const autoHide = params.autoHideMode || params.columns < threshold;
  return !autoHide || !params.orchestratorFocused;
}
