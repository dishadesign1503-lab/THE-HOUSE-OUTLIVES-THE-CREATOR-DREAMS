// THE THREE STAGES (game progression): the house of each, his temper, the few lines shown.

export const STAGES = [
  {
    id: 'obey',
    numeral: 'I',
    title: 'OBEY',
    task: 'Reach the door. Do not wake the body beneath the house.',
    layout: 'origin',
    // patient: he changes posture only when badly disturbed
    temper: { tolerance: 0.8, adaptBias: 0, defendBias: 0, restoreBias: 0.2, majorAt: 0.8, environmentalSensitivity: 0.3 },
    done: 'The door opens. The house remembers the route you took.',
  },
  {
    id: 'adapt',
    numeral: 'II',
    title: 'ADAPT',
    task: 'Reach a door. Again. He must turn twice before any of them opens.',
    layout: 'adapt',
    // he uses what he remembers of you
    temper: { tolerance: 1, adaptBias: 0.5, defendBias: 0.55, restoreBias: 0.2, majorAt: 0.62, environmentalSensitivity: 0.45 },
    minShifts: 2,
    done: 'You reached it. The house is exactly as he needs it to be.',
  },
  {
    id: 'question',
    numeral: 'III',
    title: 'QUESTION',
    task: 'The door is sealed by the oldest wall.',
    layout: 'question',
    temper: { tolerance: 1.1, adaptBias: 0.35, defendBias: 0.5, restoreBias: 0.5, majorAt: 0.7, environmentalSensitivity: 0.5 },
  },
]

export const LINES = {
  firstKnock: (region) => `You touched his ${region}.`,
  uneasy: 'He stirs beneath the floor.',
  reform: 'He is changing how he lies. The room carries you. Lean as little as you can.',
  movedInReform: 'He felt you move.',
  reformDone: 'The house has followed his body.',
  firstStir: 'A wall moved with him.',
  firstBlock: 'The passage you used is under him now.',
  spoiled: 'The door shuts while he moves.',
  returned: 'He has settled. The door opens again, wherever it is now.',
  doorShut: 'Shut. He has not turned enough yet. Disturb him.',
  dream: 'Reach the ANCHOR to settle the house.',
  dreamAnchor: 'The anchor holds. The house settles.',
  dreamKept: 'He wakes from it in his sleep. The house keeps something of the dream.',
  dreamReturned: 'The dream lets go. The house returns to how it was.',
  irritated: 'Disturbed three times, he turns away, and takes the way out with him.',
  exitMoving: 'The exit is moving through his body to another wall.',
  doorsChanged: 'Other doors are within reach now.',
  slippery: 'Sunlit floor. Less grip.',
  draught: 'A draught pushes you.',
  sealed: 'No permitted route reaches it.',
  circuit: 'The house still asks for its circuit, 1 to 4.',
  oldestWall: 'Or strike the oldest wall.',
  nicheWrong: 'Not yet. The order matters to the house.',
  niche: (n) => `${n} of 4.`,
  stillness: 'Now stay still while he settles.',
  restored: 'He returns to the shape the house was built on.',
  crack: (n) => (n < 3 ? `The oldest wall cracks. ${3 - n} more.` : 'The oldest wall gives way.'),
  cannotRestore: 'He tries to lie as the oldest wall required. He cannot.',
  interrupted: 'Nothing beneath the house knows what to restore.',
}

export const ENDINGS = {
  preserve: {
    title: 'PRESERVED',
    body: [
      'You walked the circuit. He settled into the shape the house was first built on, and every wall glided back to where it stood.',
      'The old door opened, the way it always has.',
      'Behind you, at the threshold, another blue circle has begun to roll.',
    ],
    last: 'The house no longer remembers why. It only remembers how.',
  },
  interrupt: {
    title: 'INTERRUPTED',
    body: [
      'You broke the oldest wall. He tried to lie as it required, and could not.',
      'He still turns in his sleep, and the walls still follow. There is no shape left to return to.',
      'The house goes on. It is no longer sure what it is for.',
    ],
    last: 'A rule with no one left to keep it is only a wall.',
  },
}
