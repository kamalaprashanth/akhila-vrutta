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
  /** The section's own tabs: at the bottom on a phone, under the section in the side menu */
  subs?(): Sub[];
  /** Extra entries for the side menu only */
  more?(): Sub[];
  /** The tab open now */
  sub?(): string;
  /** Not listed in the side menu (reached another way, like Search) */
  hidden?: boolean;
  /** Renders the module's page into the main area */
  render(root: HTMLElement): void;
}

export interface Sub { id: string; label: string; icon: string; href: string }
