import { Link } from 'react-router-dom'
import { EmptyState, Button, PageHeader } from '../components/ui/index.js'

export default function NotFound() {
  return (
    <>
      <PageHeader kicker="Error 404" title="Signal lost" subtitle="That route does not exist in this console." />
      <EmptyState
        icon="radar" title="Nothing on this frequency"
        hint="The page you were looking for was moved or never existed. Head back to the command center."
        action={<Link to="/"><Button variant="primary" icon="activity">Back to Overview</Button></Link>}
      />
    </>
  )
}
