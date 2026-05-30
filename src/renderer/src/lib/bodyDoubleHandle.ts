// Pseudonymous handle generator for peer body double sessions.
// "FocusedFalcon", "QuietCedar", "SteadyHeron" — adjectives lean calm /
// focused / supportive so the matching pool reads as a deliberate community
// rather than a random-noise dating sim. No real identity, no auth — handles
// are throwaway per session unless the user later opts into a persistent
// one via Settings.

const ADJECTIVES = [
  'Focused', 'Quiet', 'Steady', 'Calm', 'Patient', 'Mindful', 'Gentle',
  'Curious', 'Thoughtful', 'Bright', 'Settled', 'Centered', 'Easygoing',
  'Warm', 'Open', 'Kind', 'Driven', 'Grounded', 'Earnest', 'Sincere',
  'Resolute', 'Tranquil', 'Composed', 'Considered', 'Diligent', 'Lucid',
  'Present', 'Hopeful', 'Witty', 'Curious'
]

const ANIMALS = [
  'Falcon', 'Heron', 'Cedar', 'Otter', 'Sparrow', 'Wren', 'Lynx', 'Fox',
  'Hare', 'Owl', 'Crane', 'Robin', 'Finch', 'Marten', 'Badger', 'Stoat',
  'Lemur', 'Capybara', 'Bison', 'Stag', 'Ibex', 'Quail', 'Lark', 'Magpie',
  'Tanager', 'Kingfisher', 'Salamander', 'Pika', 'Hedgehog', 'Mole'
]

// Note: trees + small mammals + birds → tonally consistent. We deliberately
// skip apex predators and "edgy" animals (wolf, eagle, raven, etc.) — they
// read as performative. Calmer fauna matches the headspace someone showing
// up for body doubling probably wants.

export function generateHandle(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)]
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)]
  // Suffix with a 2-digit number so collisions in a small pool stay rare.
  const suffix = Math.floor(Math.random() * 90 + 10)
  return `${adj}${animal}${suffix}`
}
