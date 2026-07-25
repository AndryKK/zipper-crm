// Full-screen blocking loader shown while an action/navigation is in
// flight. The dots orbit in real 3D (perspective + rotateX + preserve-3d)
// so they swing toward/away from the viewer as they spin, rather than
// just circling flat — that's what reads as "volume" instead of a plain
// 2D spinner.
export function BusyOverlay({ label = "Зачекайте, виконується дія" }: { label?: string }) {
  return (
    <div className="crm-busy-overlay">
      <div className="crm-busy-card">
        <div className="crm-busy-stage">
          <div className="crm-busy-core" />
          <div className="crm-busy-orbit">
            {Array.from({ length: 8 }, (_, i) => (
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              <span key={i} className="crm-busy-dot" style={{ "--i": i } as any} />
            ))}
          </div>
          <div className="crm-busy-glow" />
        </div>
        <span className="crm-busy-label">
          {label}
          <span className="crm-busy-label-dots">
            <span>.</span><span>.</span><span>.</span>
          </span>
        </span>
      </div>
    </div>
  );
}
