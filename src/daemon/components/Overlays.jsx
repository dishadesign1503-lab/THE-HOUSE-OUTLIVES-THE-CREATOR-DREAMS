// The opening card, the help / settings panel and the demo caption.

export function Intro({ onStart, withMic, setWithMic, micSupported }) {
  return (
    <div className="intro" role="dialog" aria-labelledby="intro-title">
      <p className="eyebrow">Pandaemonium · Daemons for Weimar</p>
      <h1 id="intro-title">The Ghost That Hates Silence</h1>
      <p className="tagline">Arrange the house. Hear what it becomes.</p>
      <p className="intro-text">
        An abandoned house kept running after everyone stopped looking after it. Its intelligence cannot see. It only hears: the click of each
        room block, your taps and hums, and the silence when you stop. From those sounds it decides what kind of house it is.
      </p>
      <button className="btn primary" onClick={onStart}>
        Start experience
      </button>
      <label className={`check ${micSupported ? '' : 'disabled'}`}>
        <input type="checkbox" checked={withMic} disabled={!micSupported} onChange={(e) => setWithMic(e.target.checked)} />
        <span>{micSupported ? 'Also listen through my microphone (optional, nothing is recorded)' : 'Microphone not available here; simulated sounds will be used'}</span>
      </label>
      <p className="intro-note">Starting turns on sound. Keep the volume moderate; there is a stop button at any time.</p>
    </div>
  )
}

export function Help({ onClose, silence, setSilence, showInner, setShowInner }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal" role="dialog" aria-labelledby="help-title" onPointerDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="help-title">How it works</h2>
        <ul className="help-list">
          <li>
            <b>Design.</b> Drag room blocks onto the 6 × 6 grid: one room per cell. Click a tray block to drop it into a sensible free cell. The
            hatched outer ring is not built yet; open it wing by wing in the upgrade shop. Each block type is limited, and so is the number of rooms.
          </li>
          <li>
            <b>Change.</b> Drag rooms around. Click to select, then <kbd>R</kbd> to turn it (the entrance's front door faces that way) or{' '}
            <kbd>Del</kbd> to remove it. Drag a room off the table to remove it. Rooms that share a wall have a door between them.
          </li>
          <li>
            <b>Listen.</b> After each change the daemon re-hears the house and answers in sound, light and a line in its log. The same layout can
            sound different depending on what it remembers.
          </li>
          <li>
            <b>Enter.</b> <i>Enter the house</i> checks the plan (an entrance with a free side for the front door, at least three rooms) and takes
            you inside. Walk with <kbd>W A S D</kbd> or the arrow keys, drag to look (or use <i>Mouse look</i>, <kbd>Esc</kbd> to release). Each room
            shows the scene the daemon imagines there, with what it heard and what it believes. Step out of the front door or press{' '}
            <i>Return to floor plan</i>; your layout is kept.
          </li>
          <li>
            <b>Coins and upgrades.</b> Coins are earned for aligned placements, challenges, a house the daemon approves of, coins found inside
            harmonious rooms, and waking the building. Spend them on wings, room slots, new room types, gilding, restoring dormant rooms,
            doorways, screens, lamps, the basin, ventilation, pipes and windows. Each upgrade changes the house and how the daemon hears it.
          </li>
          <li>
            <b>Make sound.</b> Use the microphone or the simulated buttons. Hums and rhythms calm it; claps startle it.
          </li>
          <li>
            <b>Stop.</b> If nothing happens for a while, the house fades and the daemon goes dormant. It may come back, but not always the same.
          </li>
        </ul>

        <h3>Settings for presenting</h3>
        <label className="slider">
          <span>Silence before fading: {silence} s</span>
          <input type="range" min="8" max="120" step="1" value={silence} onChange={(e) => setSilence(+e.target.value)} />
        </label>
        <label className="check">
          <input type="checkbox" checked={showInner} onChange={(e) => setShowInner(e.target.checked)} />
          <span>Show the daemon’s inner state (for explaining the system)</span>
        </label>

        <h3>Two layers</h3>
        <p className="note">
          <b>The Vastu layer</b> (figure and analysis panel) compares each room with common, traditional Vastu Shastra associations. These vary
          between traditions and plans, so placements are “aligned”, “needs review” or “conflicting” with the selected reference, never
          universally right or wrong. The figure of Vastu Purusha and the assignment of body regions to zones are an illustrative
          visualisation of the traditional image. Edit them in <code>src/daemon/vastu/</code>.
        </p>
        <p className="note">
          <b>The daemon</b> is a separate, fictional character, not Vastu Purusha. The consequences it hears in a layout (arguments, loss,
          instability) are invented narrative rules for this installation: not Vastu Shastra teachings, not universal Hindu beliefs, and not
          claims about real houses or the people in them.
        </p>
      </div>
    </div>
  )
}

export function DemoBar({ caption, step, total, onExit }) {
  return (
    <div className="demo-bar" role="status">
      <span className="demo-tag">Demo {step}/{total}</span>
      <span className="demo-caption">{caption}</span>
      <button className="btn small" onClick={onExit}>
        Exit demo
      </button>
    </div>
  )
}
