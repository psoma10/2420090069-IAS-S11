import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import Shell from './components/layout/Shell.jsx'
import { Spinner } from './components/ui/index.js'

const Overview = lazy(() => import('./pages/Overview.jsx'))
const FirewallManager = lazy(() => import('./pages/FirewallManager.jsx'))
const HostsBastion = lazy(() => import('./pages/HostsBastion.jsx'))
const TrafficGenerator = lazy(() => import('./pages/TrafficGenerator.jsx'))
const AlertPanel = lazy(() => import('./pages/AlertPanel.jsx'))
const AnomalyDetector = lazy(() => import('./pages/AnomalyDetector.jsx'))
const IdsRules = lazy(() => import('./pages/IdsRules.jsx'))
const Encyclopedia = lazy(() => import('./pages/Encyclopedia.jsx'))
const ThreatArticle = lazy(() => import('./pages/ThreatArticle.jsx'))
const Labs = lazy(() => import('./pages/Labs.jsx'))
const About = lazy(() => import('./pages/About.jsx'))
const Investigate = lazy(() => import('./pages/Investigate.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))
const NotFound = lazy(() => import('./pages/NotFound.jsx'))

const fallback = (
  <div style={{ display: 'grid', placeItems: 'center', minHeight: '40vh' }}>
    <Spinner size={28} label="Loading page" />
  </div>
)

export default function App() {
  return (
    <Suspense fallback={fallback}>
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<Overview />} />
          <Route path="firewall" element={<FirewallManager />} />
          <Route path="hosts" element={<HostsBastion />} />
          <Route path="traffic" element={<TrafficGenerator />} />
          <Route path="alerts" element={<AlertPanel />} />
          <Route path="anomaly" element={<AnomalyDetector />} />
          <Route path="ids-rules" element={<IdsRules />} />
          <Route path="investigate" element={<Investigate />} />
          <Route path="investigate/:ip" element={<Investigate />} />
          <Route path="encyclopedia" element={<Encyclopedia />} />
          <Route path="encyclopedia/:slug" element={<ThreatArticle />} />
          <Route path="lab" element={<Labs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="about" element={<About />} />
          <Route path="*" element={<NotFound />} />
        </Route>
      </Routes>
    </Suspense>
  )
}
