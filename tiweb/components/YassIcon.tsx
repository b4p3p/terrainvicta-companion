/** Icona di YASS: un foglio di calcolo a spigoli vivi, linee sottili come le
    icone del gioco, nel colore della fazione. La riga d'intestazione e la
    cella selezionata sono piene, come in Excel. */
export function YassIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
      <rect x="0.5" y="0.5" width="15" height="15" fill="none" stroke="var(--accent)" />
      <rect x="1" y="1" width="14" height="3.5" fill="var(--accent)" opacity=".45" />
      <path d="M5.5 1v14M10.5 1v14M1 4.5h14M1 8.2h14M1 11.8h14" stroke="var(--accent)" strokeWidth=".8" opacity=".75" />
      <rect x="6" y="8.7" width="4" height="2.6" fill="var(--accent)" />
    </svg>
  );
}
