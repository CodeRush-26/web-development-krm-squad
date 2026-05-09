import { useMemo, useState } from 'react';
import { Gauge, Navigation, Radar, Ship as ShipIcon, Waves } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  displayStatus,
  fuelPercent,
  isCriticalStatus,
  isWeatherDelayed,
  statusDotClass,
  TYPE_LABELS,
  inferShipType,
} from '../../utils/shipVisuals';

function operationalChannelLabel(channel) {
  if (channel === 'fleet_advisor') return 'Advisor';
  if (channel === 'distress') return 'Distress';
  return 'Security';
}

function formatUtcHm(ts) {
  try {
    return `${new Date(ts).toISOString().slice(11, 19)}Z`;
  } catch {
    return '—';
  }
}

export function CommandSidebar({
  ships,
  threats = [],
  radarContactMemory = {},
  operationalLog = [],
  onClearOperationalLog,
  onDismissRecommendation,
  selectedShipId,
  selectedDarkThreatId = '',
  onFocusThreat,
  onSelectShip,
  setHoveredShipId,
  telemetryPulse,
  socketStatus,
  userRole,
  captainShipId,
  onCaptainShipChange,
  distressMessage,
  onDistressChange,
  onSendDistress,
  allShips = ships,
  typeFilter,
  onTypeFilterChange,
  latestRecommendation,
  onApplyRecommendation,
  isMobile,
  onCloseMobile,
}) {
  const [sidebarTab, setSidebarTab] = useState('fleet');

  const securityContacts = useMemo(() => {
    return (threats || [])
      .filter((t) => t.tier >= 1)
      .slice()
      .sort((a, b) => (Number(a.distanceKm) || 999) - (Number(b.distanceKm) || 999));
  }, [threats]);

  const droppedRadarContacts = useMemo(() => {
    return Object.values(radarContactMemory || {})
      .filter((e) => (e.tier ?? 0) < 1 && (e.maxTier ?? 0) >= 1)
      .sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0));
  }, [radarContactMemory]);

  const showFleetTabBody = userRole !== 'command' || sidebarTab === 'fleet';
  const showTypeFilters = showFleetTabBody;

  return (
    <aside className="sidebar rounded-xl">
      <div className="sidebar-header">
        <span className="sidebar-title">
          <Waves size={16} />
          Command Sidebar
        </span>
        <span className="sidebar-right">
          <ShipIcon size={16} /> {ships.length}
        </span>
        {isMobile ? (
          <button type="button" className="tool-btn mobile-only" onClick={onCloseMobile}>
            Close
          </button>
        ) : null}
      </div>
      {userRole === 'captain' ? (
        <div className="captain-controls">
          <label htmlFor="captainShipSelect">Select Your Ship</label>
          <select
            id="captainShipSelect"
            value={captainShipId}
            onChange={(e) => onCaptainShipChange(e.target.value)}
          >
            <option value="">-- choose ship --</option>
            {allShips.map((s) => (
              <option key={s.shipId} value={s.shipId}>
                {s.name} ({s.shipId})
              </option>
            ))}
          </select>
          <label htmlFor="distressSignal">Distress Signal</label>
          <textarea
            id="distressSignal"
            rows={2}
            placeholder="Type distress message..."
            value={distressMessage}
            onChange={(e) => onDistressChange(e.target.value)}
          />
          <button
            type="button"
            className="tool-btn"
            onClick={onSendDistress}
            disabled={!captainShipId || !distressMessage.trim()}
          >
            Analyze Distress
          </button>
        </div>
      ) : null}

      {userRole === 'command' ? (
        <div className="sidebar-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'fleet'}
            className={`sidebar-tab ${sidebarTab === 'fleet' ? 'active' : ''}`}
            onClick={() => setSidebarTab('fleet')}
          >
            Fleet
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={sidebarTab === 'security'}
            className={`sidebar-tab ${sidebarTab === 'security' ? 'active' : ''}`}
            onClick={() => setSidebarTab('security')}
          >
            Security
          </button>
        </div>
      ) : null}

      {showTypeFilters ? (
        <div className="type-filter-row">
          {[
            { id: 'all', label: 'All' },
            { id: 'cargo', label: 'Cargo' },
            { id: 'tanker', label: 'Tanker' },
            { id: 'passenger', label: 'Passenger' },
          ].map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={`type-chip ${typeFilter === chip.id ? 'active' : ''}`}
              onClick={() => onTypeFilterChange(chip.id)}
            >
              {chip.label}
            </button>
          ))}
        </div>
      ) : null}

      {latestRecommendation ? (
        <div className="ai-recommendation-panel">
          <div className="ai-reco-title">AI Recommendation</div>
          <div className="ai-reco-main">
            Severity: {(latestRecommendation.severity || 'medium').toUpperCase()} | Type:{' '}
            {latestRecommendation.type || 'general'}
          </div>
          <div className="ai-reco-summary">
            {latestRecommendation.summary || 'Distress advisory generated by AI.'}
          </div>
          <div className="ai-reco-action">
            {latestRecommendation.suggestedAction || 'Monitor situation and coordinate support.'}
          </div>
          <div className="ai-reco-actions">
            {latestRecommendation.shipId ? (
              <button
                type="button"
                className="tool-btn"
                onClick={() => onApplyRecommendation(latestRecommendation)}
              >
                Apply AI Recommendation
              </button>
            ) : null}
            <button
              type="button"
              className="tool-btn ai-reco-dismiss"
              onClick={() => onDismissRecommendation?.()}
            >
              Dismiss banner
            </button>
          </div>
        </div>
      ) : null}

      {operationalLog.length > 0 ? (
        <div className="operational-log-panel">
          <div className="operational-log-header">
            <span className="operational-log-title">Operational message log</span>
            <button
              type="button"
              className="operational-log-clear"
              onClick={() => onClearOperationalLog?.()}
            >
              Clear log
            </button>
          </div>
          <p className="operational-log-hint">
            Persistent record of advisor, distress, and security traffic (most recent at top).
          </p>
          <ul className="operational-log-list">
            {[...operationalLog].reverse().map((entry) => (
              <li key={entry.id} className="operational-log-row">
                <span className="operational-log-time">{formatUtcHm(entry.receivedAt)}</span>
                <span
                  className={`operational-log-chip operational-log-chip-${String(entry.channel).replace(/_/g, '-')}`}
                >
                  {operationalChannelLabel(entry.channel)}
                </span>
                <span className="operational-log-summary">{entry.summaryLine}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {userRole === 'command' && sidebarTab === 'security' ? (
        <div className="security-panel">
          <div className="security-panel-heading">Nearby unidentified contacts</div>
          <p className="security-panel-hint">
            Contacts appear when inside any friendly vessel&apos;s ~10 km radar envelope.
          </p>
          <div className="security-panel-subheading">Active (inside radar envelope)</div>
          <ul className="security-contact-list">
            {securityContacts.length === 0 ? (
              <li className="security-contact-empty">No active radar contacts.</li>
            ) : (
              securityContacts.map((t) => (
                <li key={t.threatId}>
                  <button
                    type="button"
                    className={`security-contact-btn rounded-xl ${selectedDarkThreatId === t.threatId ? 'active' : ''}`}
                    onClick={() => onFocusThreat?.(t.threatId)}
                  >
                    <span className="security-contact-title">
                      {t.identified ? t.aiLabel || 'Identified threat' : 'UNIDENTIFIED'}
                    </span>
                    <span className="security-contact-meta">
                      {t.threatId} · {Number(t.distanceKm ?? 0).toFixed(2)} km · Tier {t.tier}
                      {t.closestFriendlyShipId ? ` · nearest ${t.closestFriendlyShipId}` : ''}
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
          {droppedRadarContacts.length > 0 ? (
            <>
              <div className="security-panel-subheading dropped">Recent — outside envelope</div>
              <p className="security-panel-hint security-panel-hint-tight">
                Contacts remain listed for 45 minutes after Tier drops below 1 (lost radar closure).
              </p>
              <ul className="security-contact-list">
                {droppedRadarContacts.map((mem) => (
                  <li key={`dropped-${mem.threatId}`}>
                    <button
                      type="button"
                      className={`security-contact-btn security-contact-dropped rounded-xl ${selectedDarkThreatId === mem.threatId ? 'active' : ''}`}
                      onClick={() => onFocusThreat?.(mem.threatId)}
                    >
                      <span className="security-contact-title">
                        {mem.identified ? mem.aiLabel || 'Identified threat' : 'UNIDENTIFIED'}{' '}
                        <span className="security-dropped-badge">track retained</span>
                      </span>
                      <span className="security-contact-meta">
                        {mem.threatId} · last {Number(mem.distanceKm ?? 0).toFixed(2)} km · was Tier{' '}
                        {mem.maxTier}
                        {mem.closestFriendlyShipId ? ` · nearest ${mem.closestFriendlyShipId}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      ) : (
        <ul className="ship-list">
          {ships.map((ship) => {
            const resolvedType = inferShipType(ship);
            return (
              <motion.li
                key={ship.shipId}
                initial={{ opacity: 0.7 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <button
                  type="button"
                  className={`ship-btn rounded-xl ${selectedShipId === ship.shipId ? 'active' : ''}`}
                  onClick={() => onSelectShip(ship.shipId)}
                  onMouseEnter={() => setHoveredShipId(ship.shipId)}
                  onMouseLeave={() => {
                    if (selectedShipId === ship.shipId) return;
                    setHoveredShipId('');
                  }}
                >
                  <div className="ship-top">
                    <span className="ship-name">
                      {ship.name}{' '}
                      <span className="ship-type-tag">
                        [{TYPE_LABELS[resolvedType] || TYPE_LABELS.cargo}]
                      </span>
                    </span>
                    <span
                      className={`status-chip ${isCriticalStatus(ship.status) ? 'critical' : ''} ${isWeatherDelayed(ship) ? 'weather-delayed' : ''}`}
                    >
                      <span className={statusDotClass(isWeatherDelayed(ship) ? 'rerouting' : ship.status)} />
                      {displayStatus(ship)}
                    </span>
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">
                      <Navigation size={12} /> Fuel
                    </span>
                    <span
                      className={`telemetry-value ${telemetryPulse[ship.shipId]?.fuelChanged ? 'telemetry-flash' : ''}`}
                    >
                      {ship.fuel.toFixed(1)} t
                    </span>
                  </div>
                  <div className="fuel-track">
                    <div
                      className="fuel-fill"
                      style={{ transform: `scaleX(${fuelPercent(ship) / 100})` }}
                    />
                  </div>

                  <div className="telemetry-row">
                    <span className="telemetry-label">
                      <Gauge size={12} /> Speed
                    </span>
                    <span
                      className={`telemetry-value ${telemetryPulse[ship.shipId]?.speedChanged ? 'telemetry-flash' : ''}`}
                    >
                      {ship.speed.toFixed(1)} kn
                    </span>
                  </div>
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      <div className="sidebar-footer hud-mono">
        <Radar size={13} /> Tactical sync {socketStatus}
      </div>
    </aside>
  );
}
