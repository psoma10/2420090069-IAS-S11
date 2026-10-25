import { EmptyState } from './Basic.jsx'
import './ui.css'

export function Table({ children, className = '', ...rest }) {
  return <div className="ui-tablewrap"><table className={`ui-table ${className}`} {...rest}>{children}</table></div>
}
export const THead = ({ children }) => <thead>{children}</thead>
export const TBody = ({ children }) => <tbody>{children}</tbody>
export const TR = ({ children, className = '', ...r }) => <tr className={className} {...r}>{children}</tr>
export const TH = ({ children, className = '', ...r }) => <th scope="col" className={className} {...r}>{children}</th>
export const TD = ({ children, className = '', ...r }) => <td className={className} {...r}>{children}</td>

/** columns: [{key, header, render?(row), mono?, align?, width?}] */
export function DataTable({ columns, rows, rowKey = 'id', empty, onRowClick, rowClass }) {
  if (!rows || rows.length === 0) {
    return empty || <EmptyState title="Nothing here yet" icon="radar" />
  }
  return (
    <Table>
      <THead>
        <TR>{columns.map((c) => <TH key={c.key} style={{ textAlign: c.align, width: c.width }}>{c.header}</TH>)}</TR>
      </THead>
      <TBody>
        {rows.map((r, i) => (
          <TR
            key={typeof rowKey === 'function' ? rowKey(r) : r[rowKey] ?? i}
            className={`${onRowClick ? 'is-click' : ''} ${rowClass ? rowClass(r) : ''}`}
            onClick={onRowClick ? () => onRowClick(r) : undefined}
          >
            {columns.map((c) => (
              <TD key={c.key} className={c.mono ? 'mono' : ''} style={{ textAlign: c.align }}>
                {c.render ? c.render(r) : r[c.key]}
              </TD>
            ))}
          </TR>
        ))}
      </TBody>
    </Table>
  )
}
