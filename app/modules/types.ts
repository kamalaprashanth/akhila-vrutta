/** What every module gives the shell. */
export interface Module {
  /** Route id, used in the address: #/money */
  id: string;
  /** Tab label (also the page title) */
  label: string;
  /** A shorter tab label when the full one doesn't fit the phone's tab bar */
  tab?: string;
  /** Inline SVG path data for the tab icon (24×24, stroked) */
  icon: string;
  /** Renders the module's page into the main area */
  render(root: HTMLElement): void;
}
