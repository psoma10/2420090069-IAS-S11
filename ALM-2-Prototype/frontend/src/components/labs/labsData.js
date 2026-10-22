import { api } from '../../api/client.js'
import { ATTACKER, PARTNER, WEB, DB, BASTION } from '../alerts/alertInfo.js'

// Step contract:
//   mode: 'check'  -> completes when check() resolves true (polled, in order)
//         'action' -> completes when an action returns { done: true }
//         'manual' -> learner presses "Mark as done"
//   actions: [{ label, variant, run: async () => ({ text, done? }) }]
const hasAlert = async (pred) => (await api.alerts({ limit: 200 })).some(pred)
const verdictLine = (r) => `Verdict: ${r.verdict.toUpperCase()}. ${r.matched_rule_name ? `Matched rule "${r.matched_rule_name}".` : 'No rule matched (default policy).'} ${r.reason || ''}`
const test = (src, dst, port, protocol = 'TCP') => api.testPacket({ src_ip: src, dst_ip: dst, dst_port: port, protocol })
const sendSummary = (res) => `${res.summary.total} packets: ${res.summary.allowed} allowed, ${res.summary.blocked} blocked, ${res.summary.alerts} alert(s) raised.`

async function idsRule(id) {
  return (await api.idsRules()).find((r) => r.id === id)
}
async function setIds(id, patch) {
  const r = await idsRule(id)
  if (!r) throw new Error(`${id} not found`)
  return api.updateIdsRule(id, { enabled: r.enabled, threshold: r.threshold ?? undefined, window_seconds: r.window_seconds, severity: r.severity, ...patch })
}
async function setSigma(sigma) {
  const c = await api.anomalyConfig()
  return api.setAnomalyConfig({ sigma, bucket_seconds: c.bucket_seconds, min_samples: c.min_samples })
}
async function setPolicyPatch(patch) {
  const p = await api.policy()
  return api.setPolicy({ default_action: p.default_action, bastion_mode: p.bastion_mode, ...patch })
}

export const LABS = [
  {
    id: 'block-ip',
    title: 'Block an attacker IP',
    level: 'Beginner',
    minutes: 5,
    blurb: 'Write a deny rule and prove with the packet tester that it works.',
    objectives: ['Understand first-match rule ordering', 'Create a deny rule for one source', 'Verify with a dry-run test and real traffic'],
    links: [{ to: '/firewall', label: 'Firewall rules' }, { to: '/traffic', label: 'Packet Forge' }],
    steps: [
      {
        id: 's1', mode: 'action', title: 'See the attack get through',
        body: `The external host ${ATTACKER} is hostile, but the web server is public. Run a dry-run test of an HTTP request from it to web-01.`,
        hint: 'The seed rules allow TCP 80/443 from ANY to the web subnet, so the request is allowed.',
        actions: [{ label: 'Test packet', variant: 'primary', run: async () => { const r = await test(ATTACKER, WEB, 80); return { text: verdictLine(r), done: true } } }],
      },
      {
        id: 's2', mode: 'check', title: 'Create a deny rule for the attacker',
        body: `Add a rule at priority 1 that denies everything from ${ATTACKER}. Rules are evaluated lowest priority number first, so it must sit above the allow rules.`,
        hint: 'You can also do this by hand in the Firewall page: action deny, source IP, everything else ANY, priority 1.',
        link: { to: '/firewall', label: 'Open Firewall' },
        actions: [{
          label: 'Create deny rule', variant: 'primary',
          run: async () => {
            const rules = await api.rules()
            if (rules.some((r) => r.action === 'deny' && r.src_ip === ATTACKER && r.enabled)) return { text: 'A matching deny rule already exists.' }
            const r = await api.createRule({ name: `Lab: block ${ATTACKER}`, action: 'deny', protocol: 'ANY', src_ip: ATTACKER, dst_ip: 'ANY', src_port: 'ANY', dst_port: 'ANY', priority: 1, enabled: true, description: 'Created in Guided Lab 1' })
            return { text: `Created rule #${r.id} "${r.name}" at priority ${r.priority}.` }
          },
        }],
        check: async () => (await api.rules()).some((r) => r.action === 'deny' && r.src_ip === ATTACKER && r.enabled),
      },
      {
        id: 's3', mode: 'check', title: 'Verify with the packet tester',
        body: 'Run the same dry-run test again. The deny rule now matches first, so the verdict flips.',
        hint: 'If it is still allowed, check that the rule is enabled and its priority is lower than any allow rule.',
        actions: [{ label: 'Test packet again', variant: 'primary', run: async () => { const r = await test(ATTACKER, WEB, 80); return { text: verdictLine(r) } } }],
        check: async () => (await test(ATTACKER, WEB, 80)).verdict === 'blocked',
      },
      {
        id: 's4', mode: 'action', title: 'Send real traffic',
        body: 'The dry run has no side effects. Send five real HTTP requests and see them blocked and logged.',
        link: { to: '/traffic', label: 'Open Packet Forge' },
        actions: [{ label: 'Send 5 HTTP requests', variant: 'primary', run: async () => { const res = await api.send({ type: 'http', src_ip: ATTACKER, dst_ip: WEB, count: 5 }); return { text: sendSummary(res), done: res.summary.blocked > 0 } } }],
      },
    ],
    recap: [
      'Firewalls evaluate rules in priority order and the first match wins, so a specific deny must come before a broad allow.',
      'A dry-run tester lets you check a rule change before real traffic depends on it.',
      'Blocking one IP is a stopgap: attackers rotate addresses, so pair it with detection.',
    ],
  },
  {
    id: 'ssh-brute',
    title: 'Detect SSH brute force',
    level: 'Beginner',
    minutes: 6,
    blurb: 'Trigger IDS-001, read the alert, and see how the threshold changes detection.',
    objectives: ['Trigger a signature-based detection', 'Read an alert and its metrics', 'Understand threshold tuning trade-offs'],
    links: [{ to: '/ids-rules', label: 'Detection rules' }, { to: '/alerts', label: 'Alerts' }],
    steps: [
      {
        id: 's1', mode: 'check', title: 'Make sure IDS-001 is enabled',
        body: 'IDS-001 raises an alert on 5 or more failed SSH logins from one source within 60 seconds.',
        link: { to: '/ids-rules', label: 'Open rules' },
        actions: [{ label: 'Enable IDS-001', variant: 'primary', run: async () => { await setIds('IDS-001', { enabled: true }); return { text: 'IDS-001 is enabled.' } } }],
        check: async () => !!(await idsRule('IDS-001'))?.enabled,
      },
      {
        id: 's2', mode: 'check', title: 'Launch the brute force',
        body: `Send 6 failed SSH logins from ${ATTACKER} to the bastion. That is one more than the threshold.`,
        hint: 'IDS-001 has a cooldown equal to its window, so if you already triggered it in the last minute, wait or reset the simulation.',
        actions: [{ label: 'Send 6 failed logins', variant: 'danger', run: async () => { const res = await api.send({ type: 'ssh_login', src_ip: ATTACKER, dst_ip: BASTION, count: 6, success: false }); return { text: sendSummary(res) } } }],
        check: () => hasAlert((a) => a.rule_id === 'IDS-001'),
      },
      {
        id: 's3', mode: 'manual', title: 'Read the alert',
        body: 'Open the Alert Panel, expand the IDS-001 alert and find the rule id, the observed value versus threshold, and the recommended response.',
        link: { to: '/alerts', label: 'Open Alert Panel' },
      },
      {
        id: 's4', mode: 'manual', title: 'Experiment with the threshold',
        body: 'Raise the threshold to 10 and send 6 failures again from a different source: no alert. Attackers who know thresholds stay beneath them ("low and slow"). Restore it to 5 when you are done.',
        hint: 'Detection that is too strict misses attacks; too loose floods analysts with noise.',
        actions: [
          { label: 'Set threshold 10', run: async () => { await setIds('IDS-001', { threshold: 10 }); return { text: 'IDS-001 threshold is now 10.' } } },
          { label: 'Send 6 from partner-ext', variant: 'danger', run: async () => { const res = await api.send({ type: 'ssh_login', src_ip: PARTNER, dst_ip: BASTION, count: 6, success: false }); return { text: sendSummary(res) } } },
          { label: 'Restore threshold 5', run: async () => { await setIds('IDS-001', { threshold: 5 }); return { text: 'IDS-001 threshold restored to 5.' } } },
        ],
      },
    ],
    recap: [
      'Signature rules count events in a time window: precise and explainable, but evadable by staying under the threshold.',
      'Cooldowns stop one attacker from flooding you with duplicate alerts.',
      'Real defenses: key-only SSH, lockouts, MFA, and not exposing SSH directly (see the bastion lab).',
    ],
  },
  {
    id: 'port-scan',
    title: 'Port scan: firewall vs IDS',
    level: 'Intermediate',
    minutes: 8,
    blurb: 'The firewall drops probes, the IDS notices the pattern. See why both matter.',
    objectives: ['Distinguish prevention (firewall) from detection (IDS)', 'See allowed versus blocked probes', 'Learn how a slow scan hides below a threshold'],
    links: [{ to: '/traffic', label: 'Packet Forge' }, { to: '/alerts', label: 'Alerts' }],
    steps: [
      {
        id: 's1', mode: 'check', title: 'Scan the web server',
        body: `Probe 15 ports on web-01 from ${ATTACKER}. IDS-003 fires at 10 distinct ports in 30 seconds.`,
        actions: [{ label: 'Scan 15 ports', variant: 'danger', run: async () => { const res = await api.send({ type: 'port_scan', src_ip: ATTACKER, dst_ip: WEB, count: 15 }); return { text: sendSummary(res) } } }],
        check: () => hasAlert((a) => a.rule_id === 'IDS-003'),
      },
      {
        id: 's2', mode: 'action', title: 'Scan the database host',
        body: 'The database has no allow rule at all. Compare how many probes the default-deny policy blocks.',
        hint: 'Most probes to db-01 should be blocked, while web-01 allowed some. An open port is an attack surface.',
        actions: [{ label: 'Scan db-01', variant: 'danger', run: async () => { const res = await api.send({ type: 'port_scan', src_ip: ATTACKER, dst_ip: DB, count: 15 }); return { text: sendSummary(res), done: true } } }],
      },
      {
        id: 's3', mode: 'manual', title: 'Inspect the packets',
        body: 'In Recent packets on the Packet Forge, filter by blocked and look at the matched rule and reason for each probe.',
        link: { to: '/traffic', label: 'Open Packet Forge' },
      },
      {
        id: 's4', mode: 'action', title: 'Scan slowly to evade',
        body: 'Send only 6 ports from another source. It stays under the 10-port threshold, so no IDS-003 alert is raised. Real attackers spread scans over hours.',
        actions: [{ label: 'Quiet scan (6 ports)', run: async () => { const res = await api.send({ type: 'port_scan', src_ip: PARTNER, dst_ip: WEB, count: 6 }); return { text: sendSummary(res), done: true } } }],
      },
    ],
    recap: [
      'A firewall prevents; an IDS detects. A blocked probe is still intelligence that someone is mapping you.',
      'Only expose the ports you need: every open port answers the scanner.',
      'Threshold-based detection can be evaded by slow scans; statistical or long-window analysis helps.',
    ],
  },
  {
    id: 'bastion',
    title: 'Bastion host: close the back door',
    level: 'Intermediate',
    minutes: 8,
    blurb: 'Force all external access through one hardened gateway and prove bypasses fail.',
    objectives: ['Designate a bastion host', 'Enable bastion mode', 'Show direct external access is denied and detected'],
    links: [{ to: '/hosts', label: 'Hosts and Bastion' }, { to: '/firewall', label: 'Firewall' }],
    steps: [
      {
        id: 's1', mode: 'check', title: 'Designate the bastion',
        body: 'A bastion (jump host) is the single hardened entry point to the internal network. Make bastion-gw the bastion.',
        link: { to: '/hosts', label: 'Open Hosts' },
        actions: [{
          label: 'Make bastion-gw the bastion', variant: 'primary',
          run: async () => {
            const hosts = await api.hosts()
            const h = hosts.find((x) => x.ip === BASTION) || hosts.find((x) => x.role === 'bastion')
            if (!h) throw new Error('No bastion candidate host found')
            await api.setBastion(h.id)
            return { text: `${h.name} (${h.ip}) is now the bastion.` }
          },
        }],
        check: async () => (await api.hosts()).some((h) => h.is_bastion),
      },
      {
        id: 's2', mode: 'action', title: 'Without bastion mode, the web server is reachable',
        body: 'Turn bastion mode off and test HTTP from the external attacker to web-01. The public allow rule lets it through.',
        actions: [{ label: 'Disable mode and test', run: async () => { await setPolicyPatch({ bastion_mode: false }); const r = await test(ATTACKER, WEB, 80); return { text: verdictLine(r), done: true } } }],
      },
      {
        id: 's3', mode: 'check', title: 'Enable bastion mode',
        body: 'Bastion mode denies inbound traffic from external sources to any internal host except the bastion, before normal rules are even checked.',
        actions: [{ label: 'Enable bastion mode', variant: 'primary', run: async () => { await setPolicyPatch({ bastion_mode: true }); return { text: 'Bastion mode is on.' } } }],
        check: async () => !!(await api.policy()).bastion_mode,
      },
      {
        id: 's4', mode: 'check', title: 'Prove the bypass is blocked',
        body: 'Repeat the same test. The verdict is now blocked with reason "Bastion policy".',
        hint: 'If it is still allowed, confirm bastion mode is on and that a bastion exists.',
        actions: [{ label: 'Test again', variant: 'primary', run: async () => { const r = await test(ATTACKER, WEB, 80); return { text: verdictLine(r) } } }],
        check: async () => { const r = await test(ATTACKER, WEB, 80); return r.verdict === 'blocked' && /bastion/i.test(r.reason || '') },
      },
      {
        id: 's5', mode: 'check', title: 'Detect the attempt, allow the proper path',
        body: 'Run the bastion bypass scenario to raise IDS-008. Then confirm SSH to the bastion itself is still allowed: the one sanctioned door.',
        actions: [
          { label: 'Run bastion_bypass', variant: 'danger', run: async () => { const res = await api.scenario('bastion_bypass'); return { text: sendSummary(res) } } },
          { label: 'Test SSH to bastion', run: async () => { const r = await test(ATTACKER, BASTION, 22); return { text: verdictLine(r) } } },
        ],
        check: () => hasAlert((a) => a.rule_id === 'IDS-008'),
      },
    ],
    recap: [
      'A bastion shrinks the attack surface to one monitored, hardened host.',
      'The policy is enforced before ordinary rules, so a forgotten allow rule cannot expose internal hosts.',
      'The bastion becomes critical: harden it, log it, require MFA and keys.',
    ],
  },
  {
    id: 'anomaly',
    title: 'Trigger a statistical anomaly',
    level: 'Advanced',
    minutes: 8,
    blurb: 'Train a baseline, inject a spike, and watch a z-score cross the threshold.',
    objectives: ['Train a baseline of normal behavior', 'Cause a threshold crossing with a DDoS spike', 'See how sigma trades sensitivity for noise'],
    links: [{ to: '/anomaly', label: 'Anomaly Detector' }],
    steps: [
      {
        id: 's1', mode: 'action', title: 'Train a baseline',
        body: 'Anomaly detection needs to know what normal looks like. Generate five minutes of back-dated benign traffic.',
        link: { to: '/anomaly', label: 'Open Anomaly Detector' },
        actions: [{ label: 'Train baseline', variant: 'primary', run: async () => { const r = await api.trainBaseline(5); return { text: `Baseline created (${r.buckets ?? '?'} buckets).`, done: true } } }],
      },
      {
        id: 's2', mode: 'check', title: 'Set sigma to 3',
        body: 'Sigma is how many standard deviations above the mean counts as anomalous. 3 is the classic default.',
        actions: [{ label: 'Set sigma = 3', variant: 'primary', run: async () => { await setSigma(3); return { text: 'Sigma set to 3.' } } }],
        check: async () => Number((await api.anomalyConfig()).sigma) === 3,
      },
      {
        id: 's3', mode: 'check', title: 'Inject a DDoS spike',
        body: 'Send a flood. Packets per second leap far beyond the baseline, so the z-score crosses the threshold and the card turns red.',
        hint: 'Keep the Anomaly Detector open in another tab to watch the red dot appear. Detection needs enough baseline buckets.',
        actions: [{ label: 'Inject spike', variant: 'danger', run: async () => { const res = await api.scenario('ddos'); return { text: sendSummary(res) } } }],
        check: async () => {
          const m = await api.anomalyMetrics(60)
          if (m.metrics.some((x) => (x.points || []).slice(-12).some((p) => p.anomaly))) return true
          return hasAlert((a) => a.source === 'anomaly')
        },
      },
      {
        id: 's4', mode: 'manual', title: 'Read the chart',
        body: 'Find the dashed threshold line (mean + sigma x std), the red anomaly dots, and the bell curve showing where the latest value sits.',
        link: { to: '/anomaly', label: 'Open Anomaly Detector' },
      },
      {
        id: 's5', mode: 'manual', title: 'Change sigma and compare',
        body: 'Set sigma to 6, inject another spike, and see if it still triggers. Then drop to 1.5 and send normal traffic: more false positives. Restore sigma to 3 afterwards.',
        actions: [
          { label: 'Sigma = 6', run: async () => { await setSigma(6); return { text: 'Sigma set to 6 (relaxed).' } } },
          { label: 'Sigma = 1.5', run: async () => { await setSigma(1.5); return { text: 'Sigma set to 1.5 (sensitive).' } } },
          { label: 'Restore sigma = 3', run: async () => { await setSigma(3); return { text: 'Sigma restored to 3.' } } },
        ],
      },
    ],
    recap: [
      'z = (value - mean) / std tells you how unusual a value is on a common scale.',
      'Low sigma finds more attacks and more false alarms; high sigma is quiet but misses subtle ones.',
      'If an attacker is present while you train, the baseline learns the attack as normal: baseline poisoning.',
    ],
  },
]
