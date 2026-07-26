const ZIPPER_LETTERS = ["Z", "I", "P", "P", "E", "R"];

// Full-screen blocking loader shown while an action/navigation is in
// flight. Adapted from a Uiverse.io (dexter-st) design — "ZIPPER" spelled
// out in individually-pulsing letters inside a circle whose rim glows
// with a slowly rotating band of color, recolored to the site's own
// accent palette (see .crm-loader-* in globals.css). Just the ring on the
// dimmed backdrop — no surrounding card, border, or caption.
export function BusyOverlay() {
  return (
    <div className="crm-busy-overlay" role="status" aria-label="Завантаження">
      <div className="crm-loader-wrapper">
        {ZIPPER_LETTERS.map((letter, i) => (
          <span key={i} className="crm-loader-letter">{letter}</span>
        ))}
        <div className="crm-loader-ring" />
      </div>
    </div>
  );
}
