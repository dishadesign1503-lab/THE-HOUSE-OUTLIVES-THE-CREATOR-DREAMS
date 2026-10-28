import { REFERENCE_NAME, ZONES, ZONE_ORDER, ROOM_RULES, CENTRE_RULE } from '../vastu/reference.js'
import { BODY_REGIONS } from '../vastu/responses.js'
import { ROOM_ORDER, ROOM_TYPES } from '../engine/rooms.js'

const zoneList = (zs) => (zs.length ? zs.map((z) => `${ZONES[z].dir} (${ZONES[z].name})`).join(', ') : '—')

// The reference guide, generated from reference.js so it always matches the analysis.
export default function VastuReference({ onClose }) {
  return (
    <div className="modal-backdrop" onPointerDown={onClose}>
      <div className="modal wide" role="dialog" aria-labelledby="ref-title" onPointerDown={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 id="ref-title">Vastu reference</h2>
        <p className="note">
          {REFERENCE_NAME}. These are traditional design associations, not universal architectural rules: prescriptions vary between texts,
          traditions and individual plots. The analysis uses three states: <b>aligned</b> (follows this reference), <b>needs review</b>{' '}
          (context-dependent or not fixed by the reference) and <b>conflicting</b> (differs from this reference).
        </p>

        <h3>Zones of the mandala</h3>
        <div className="ref-table-wrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>Zone</th>
                <th>Guardian · element</th>
                <th>Suited to</th>
                <th>Body region (illustrative)</th>
                <th>Traditional reasoning</th>
              </tr>
            </thead>
            <tbody>
              {ZONE_ORDER.map((z) => (
                <tr key={z}>
                  <td>
                    <b>{ZONES[z].name}</b>
                    <br />
                    <span className="dim">{ZONES[z].dir}</span>
                  </td>
                  <td>
                    {ZONES[z].guardian}
                    {ZONES[z].element !== '—' && <span className="dim"> · {ZONES[z].element}</span>}
                  </td>
                  <td>{ZONES[z].suits}</td>
                  <td>{BODY_REGIONS[ZONES[z].region].label}</td>
                  <td>{ZONES[z].why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h3>Rooms</h3>
        <div className="ref-table-wrap">
          <table className="ref-table">
            <thead>
              <tr>
                <th>Room</th>
                <th>Recommended</th>
                <th>Advised against</th>
                <th>Why</th>
              </tr>
            </thead>
            <tbody>
              {ROOM_ORDER.map((type) => (
                <tr key={type}>
                  <td>
                    <b>{ROOM_TYPES[type].label}</b>
                  </td>
                  <td>{zoneList(ROOM_RULES[type].aligned)}</td>
                  <td>{zoneList(ROOM_RULES[type].conflict)}</td>
                  <td>{ROOM_RULES[type].why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">
          Any zone not listed counts as <b>needs review</b>. The centre: a room covering {CENTRE_RULE.minCells} or more of the nine central cells
          obstructs the Brahmasthan (a courtyard keeps it open; light rooms need review; heavy rooms conflict). An entrance away from the outer
          boundary needs review.
        </p>

        <h3>The mandala and the figure</h3>
        <p className="note">
          The house grid is a 6 × 6 square of 36 cells (one of the square grid sizes used for mandala plans), drawn as concentric rings: an
          outer ring of 20 cells, an inner ring of 12, and the 4 central cells of the Brahmasthan, crossed by the diagonals and the north–south
          and east–west axes. Each zone of the reference is a 2 × 2 block of cells. Vastu Purusha is drawn lying face-down
          across it, head in the north-east and feet in the south-west. The assignment of body regions to zones is an illustrative visualisation
          of this traditional image, not an authoritative anatomical mapping of every cell. Nothing here predicts illness, conflict or
          misfortune.
        </p>
        <p className="note">
          To change any of this, edit <code>src/daemon/vastu/reference.js</code> (zones and room rules) and{' '}
          <code>src/daemon/vastu/responses.js</code> (body regions, reactions, sounds).
        </p>
      </div>
    </div>
  )
}
