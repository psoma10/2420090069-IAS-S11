// Hand-drawn architecture diagram. Colours come from CSS classes (tokens only).
function Box({ x, y, w = 150, h = 64, title, sub, tone = 'a' }) {
  return (
    <g className={`ab-box ab-box--${tone}`} transform={`translate(${x} ${y})`}>
      <rect width={w} height={h} rx="10" />
      <text x={w / 2} y={h / 2 - 3} textAnchor="middle" className="ab-t">{title}</text>
      <text x={w / 2} y={h / 2 + 14} textAnchor="middle" className="ab-s">{sub}</text>
    </g>
  )
}

function Arrow({ d, label, lx, ly, dashed }) {
  return (
    <g>
      <path d={d} className={`ab-arrow ${dashed ? 'is-dashed' : ''}`} markerEnd="url(#ab-head)" />
      {label && <text x={lx} y={ly} textAnchor="middle" className="ab-lbl">{label}</text>}
    </g>
  )
}

export default function ArchDiagram() {
  return (
    <figure className="ab-arch">
      <svg viewBox="0 0 980 360" role="img" aria-labelledby="arch-t arch-d">
        <title id="arch-t">Sentinel architecture</title>
        <desc id="arch-d">The React user interface calls a FastAPI backend over HTTP and server-sent events. Generated traffic flows through the packet pipeline to the firewall, then to the rule-based IDS and the anomaly IDS in parallel. Packets, alerts and rules are stored in SQLite.</desc>
        <defs>
          <marker id="ab-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0 0L10 5L0 10z" className="ab-head" />
          </marker>
        </defs>

        <Box x={20} y={148} w={160} h={70} title="React UI" sub="Vite, Router, Recharts" tone="ui" />
        <Box x={235} y={148} w={160} h={70} title="FastAPI" sub="/api · REST + SSE" tone="api" />
        <Box x={450} y={148} w={150} h={70} title="Packet pipeline" sub="simulate, normalise" tone="pipe" />
        <Box x={655} y={148} w={140} h={70} title="Firewall" sub="rules, bastion, policy" tone="fw" />
        <Box x={850} y={58} w={120} h={70} title="Rule IDS" sub="IDS-001..009" tone="ids" />
        <Box x={850} y={238} w={120} h={70} title="Anomaly IDS" sub="z-score, sigma" tone="ids" />
        <Box x={450} y={290} w={150} h={58} title="SQLite" sub="packets, alerts, rules" tone="db" />

        <Arrow d="M180 183H233" label="JSON" lx={207} ly={174} />
        <Arrow d="M395 183H448" label="send" lx={421} ly={174} />
        <Arrow d="M600 183H653" label="packet" lx={627} ly={174} />
        <Arrow d="M795 170C820 150 820 110 848 100" />
        <Arrow d="M795 196C820 216 820 256 848 266" />
        <Arrow d="M525 218V288" label="persist" lx={553} ly={256} />
        <Arrow d="M315 218C315 300 400 320 448 320" dashed />
        <Arrow d="M235 200C150 280 120 250 100 220" dashed label="alerts via SSE" lx={150} ly={288} />
      </svg>
      <figcaption>
        Traffic enters the pipeline, is judged by the firewall (allowed or blocked), and every packet is then examined by both detectors. Alerts and statistics are stored in SQLite and streamed back to the UI.
      </figcaption>
    </figure>
  )
}
