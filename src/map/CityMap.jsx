import { useEffect, useRef, useState } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { HEAT_GRADIENT, LANTERN_FADE_M, LANTERN_FULL_M, distanceMetres } from '../game/heat.js'

const data = (file) => `${import.meta.env.BASE_URL}data/${file}`

// The attribution line from public/data/SOURCES.md, plus OpenStreetMap for the game's landmark positions.
const ATTRIBUTION = [
  'Buildings: 3D building models LoD2 © GDI-Th (dl-de/by-2-0). Land use and pedestrian network: Egor Gaydukov, InfAU, Bauhaus-Universität Weimar. Census grid: Zensus 2022, © Statistische Ämter des Bundes und der Länder (dl-de/by-2-0).',
  'Landmark positions: © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors (ODbL).',
]

const NEUTRAL = '#e4dccb'

// A building's colour: neutral, blended towards its heat by the feature state `g` (0–1, the lantern),
// where its heat comes from `d`, the distance in metres from the building's centre to the hidden target.
const BUILDING_COLOR = [
  'interpolate',
  ['linear'],
  ['coalesce', ['feature-state', 'g'], 0],
  0, NEUTRAL,
  1, ['interpolate-lab', ['linear'], ['coalesce', ['feature-state', 'd'], 100000], ...HEAT_GRADIENT.flat()],
]

// A quiet, paper-like map drawn only from the city kit. No online tiles, so no text labels.
const STYLE = {
  version: 8,
  light: { anchor: 'viewport', color: '#ffffff', intensity: 0.35, position: [1.15, 210, 30] },
  sources: {
    plots: { type: 'geojson', data: data('plots.geojson') },
    streets: { type: 'geojson', data: data('streets.geojson') },
    // Filled in once loaded, with numbered ids so each building's colour can be changed on its own.
    buildings: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#efe9dc' } },
    {
      id: 'plots',
      type: 'fill',
      source: 'plots',
      paint: {
        'fill-color': [
          'match',
          ['get', 'landuse'],
          'recreation', '#d5dfbf',
          'cemetery', '#d5dcc6',
          'flowing water', '#b9cfd6',
          'standing water', '#b9cfd6',
          'square', '#f6f1e6',
          '#e8e1d1',
        ],
      },
    },
    {
      id: 'streets',
      type: 'line',
      source: 'streets',
      paint: {
        'line-color': '#fbf8f1',
        'line-width': ['interpolate', ['linear'], ['zoom'], 14, 1.5, 18, 7],
      },
    },
    {
      id: 'building-outlines',
      type: 'line',
      source: 'buildings',
      paint: { 'line-color': '#8f846f', 'line-width': 0.6 },
    },
    {
      id: 'buildings-3d',
      type: 'fill-extrusion',
      source: 'buildings',
      paint: {
        'fill-extrusion-color': BUILDING_COLOR,
        // Measured heights from the LoD2 models: every building in the kit has one.
        'fill-extrusion-height': ['get', 'height'],
        'fill-extrusion-base': 0,
        'fill-extrusion-opacity': 0.94,
        'fill-extrusion-vertical-gradient': true,
      },
    },
  ],
}

// Keep the kit area clear of the game panel on the right.
function framePadding() {
  return { top: 24, right: Math.min(400, Math.round(window.innerWidth * 0.5)), left: 24, bottom: 24 }
}

function pinElement(className) {
  const el = document.createElement('div')
  el.className = className
  el.innerHTML = '<span class="pin-ring"></span><span class="pin-dot"></span>'
  return el
}

// The average of a footprint's corners: close enough to its centre for buildings this size.
function centreOf(polygon) {
  const ring = polygon.coordinates[0].slice(0, -1)
  let lon = 0
  let lat = 0
  for (const [x, y] of ring) {
    lon += x
    lat += y
  }
  return { lon: lon / ring.length, lat: lat / ring.length }
}

function lantern(distanceToPlayer) {
  if (distanceToPlayer <= LANTERN_FULL_M) return 1
  if (distanceToPlayer >= LANTERN_FADE_M) return 0
  return 1 - (distanceToPlayer - LANTERN_FULL_M) / (LANTERN_FADE_M - LANTERN_FULL_M)
}

// The 3D map. `player` is { lat, lon } or null; `found` is the discovered landmark or null.
// `distanceFromTarget` measures how far a point is from the hidden target, without saying where it is.
export default function CityMap({ bbox, player, heatColor, movable, onMove, found, distanceFromTarget }) {
  const containerRef = useRef(null)
  const mapRef = useRef(null)
  const playerRef = useRef(null)
  const foundRef = useRef(null)
  const shownRef = useRef(false)
  const buildingsRef = useRef(null) // { centres, toTarget, glow }
  const [buildingsReady, setBuildingsReady] = useState(false)
  const movableRef = useRef(movable)
  const onMoveRef = useRef(onMove)
  movableRef.current = movable
  onMoveRef.current = onMove

  // Create the map once.
  useEffect(() => {
    const [w, s, e, n] = bbox
    const pad = 0.012
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE,
      bounds: [[w, s], [e, n]],
      fitBoundsOptions: { padding: framePadding() },
      maxBounds: [[w - pad, s - pad], [e + pad, n + pad]],
      pitch: 50,
      maxPitch: 70,
      attributionControl: false,
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-left')
    map.addControl(new maplibregl.AttributionControl({ customAttribution: ATTRIBUTION }), 'bottom-left')
    map.on('click', (ev) => {
      if (movableRef.current) onMoveRef.current({ lat: ev.lngLat.lat, lon: ev.lngLat.lng })
    })

    const marker = new maplibregl.Marker({ element: pinElement('player-pin'), draggable: true })
    marker.on('drag', () => {
      const p = marker.getLngLat()
      onMoveRef.current({ lat: p.lat, lon: p.lng })
    })
    playerRef.current = marker
    mapRef.current = map

    let cancelled = false
    const loaded = new Promise((resolve) => map.once('load', resolve))
    const buildings = fetch(data('buildings.geojson')).then((r) => {
      if (!r.ok) throw new Error(`data/buildings.geojson: ${r.status}`)
      return r.json()
    })
    Promise.all([buildings, loaded])
      .then(([geojson]) => {
        if (cancelled) return
        geojson.features.forEach((f, i) => {
          f.id = i
        })
        buildingsRef.current = {
          centres: geojson.features.map((f) => centreOf(f.geometry)),
          toTarget: null,
          glow: new Float32Array(geojson.features.length),
        }
        map.getSource('buildings').setData(geojson)
        setBuildingsReady(true)
      })
      .catch((err) => console.error(err))

    return () => {
      cancelled = true
      shownRef.current = false
      buildingsRef.current = null
      setBuildingsReady(false)
      marker.remove()
      map.remove()
    }
  }, [bbox])

  // New round: each building's distance to the target, worked out once per round.
  useEffect(() => {
    const map = mapRef.current
    const b = buildingsRef.current
    if (!map || !b) return
    map.removeFeatureState({ source: 'buildings' })
    b.glow.fill(0)
    b.toTarget = distanceFromTarget ? b.centres.map(distanceFromTarget) : null
    b.toTarget?.forEach((d, id) => map.setFeatureState({ source: 'buildings', id }, { d }))
  }, [distanceFromTarget, buildingsReady])

  // Light up the buildings around the player (or all of them once the target is found).
  // Only buildings whose glow changes are touched, so dragging the pin stays smooth.
  useEffect(() => {
    const map = mapRef.current
    const b = buildingsRef.current
    if (!map || !b) return
    for (let id = 0; id < b.centres.length; id++) {
      let g = 0
      if (b.toTarget && found) g = 1
      else if (b.toTarget && player) g = lantern(distanceMetres(b.centres[id], player))
      const old = b.glow[id]
      if (g === old || (Math.abs(g - old) < 0.02 && g !== 0 && g !== 1)) continue
      b.glow[id] = g
      map.setFeatureState({ source: 'buildings', id }, { g })
    }
  }, [player, found, distanceFromTarget, buildingsReady])

  // Show, move and colour the player's pin.
  useEffect(() => {
    const marker = playerRef.current
    const map = mapRef.current
    if (!marker || !map) return
    if (!player) {
      marker.remove()
      shownRef.current = false
      return
    }
    // While dragging, the pin is already where the player is; resetting it would end the drag.
    const at = marker.getLngLat()
    if (!at || at.lng !== player.lon || at.lat !== player.lat) marker.setLngLat([player.lon, player.lat])
    if (!shownRef.current) {
      marker.addTo(map)
      shownRef.current = true
    }
    if (marker.isDraggable() !== movable) marker.setDraggable(movable)
    const el = marker.getElement()
    el.classList.toggle('is-movable', movable)
    el.style.setProperty('--heat', heatColor || '#4a4036')
  }, [player, heatColor, movable])

  // Reveal the landmark once it has been found.
  useEffect(() => {
    const map = mapRef.current
    foundRef.current?.remove()
    foundRef.current = null
    if (!map || !found) return
    const popup = new maplibregl.Popup({ offset: 18, closeButton: false }).setText(found.name)
    foundRef.current = new maplibregl.Marker({ element: pinElement('found-pin') })
      .setLngLat([found.lon, found.lat])
      .setPopup(popup)
      .addTo(map)
    foundRef.current.togglePopup()
    map.easeTo({ center: [found.lon, found.lat], zoom: Math.max(map.getZoom(), 17), duration: 900 })
  }, [found])

  return <div ref={containerRef} className="city-map" />
}
