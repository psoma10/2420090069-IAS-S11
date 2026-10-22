export default function CompareTable({ head, rows, caption }) {
  return (
    <div className="enc-tablewrap" tabIndex={0} role="region" aria-label={caption}>
      <table className="enc-table">
        <caption className="enc-sr">{caption}</caption>
        <thead>
          <tr>{head.map((h, i) => <th key={h} scope="col" className={i === 1 ? 'is-a' : i === 2 ? 'is-b' : ''}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
