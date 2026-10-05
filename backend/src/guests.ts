/**
 * Anonymous guest identities. Within a room every guest gets a distinct animal
 * (and, while the palette lasts, a distinct colour), e.g. "Anonymous Otter".
 */

export interface GuestIdentity {
  name: string;
  color: string;
}

const ANIMALS = [
  'Otter', 'Panda', 'Fox', 'Koala', 'Penguin', 'Falcon', 'Dolphin', 'Tiger',
  'Owl', 'Lynx', 'Badger', 'Heron', 'Moose', 'Gecko', 'Raven', 'Bison',
  'Wolf', 'Hedgehog', 'Beaver', 'Llama', 'Walrus', 'Flamingo', 'Jaguar', 'Squirrel',
  'Turtle', 'Zebra', 'Giraffe', 'Kangaroo', 'Octopus', 'Parrot', 'Rabbit', 'Seal',
  'Swan', 'Toucan', 'Yak', 'Camel', 'Cheetah', 'Elephant', 'Hippo', 'Lemur',
];

const COLORS = [
  '#e11d48', '#2563eb', '#059669', '#ea580c', '#9333ea', '#0891b2',
  '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#dc2626', '#0d9488',
  '#7c3aed', '#c2410c', '#0284c7', '#a21caf',
];

const PREFIX = 'Anonymous ';

function pickRandom<T>(list: T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * Assign a guest identity not used by anyone in `taken`. Honours the guest's
 * previous identity (sent by the browser on reconnect) when it is still free.
 */
export function assignGuest(taken: Iterable<GuestIdentity>, preferred?: Partial<GuestIdentity>): GuestIdentity {
  const usedNames = new Set<string>();
  const usedColors = new Set<string>();
  for (const g of taken) {
    usedNames.add(g.name);
    usedColors.add(g.color);
  }

  let name: string | undefined;
  const preferredAnimal = preferred?.name?.startsWith(PREFIX) ? preferred.name.slice(PREFIX.length) : undefined;
  if (preferredAnimal && ANIMALS.includes(preferredAnimal) && !usedNames.has(preferred!.name!)) {
    name = preferred!.name!;
  } else {
    const free = ANIMALS.filter((a) => !usedNames.has(PREFIX + a));
    if (free.length) {
      name = PREFIX + pickRandom(free);
    } else {
      // More guests than animals: number the repeats ("Anonymous Otter 2").
      const animal = pickRandom(ANIMALS);
      let n = 2;
      while (usedNames.has(`${PREFIX}${animal} ${n}`)) n++;
      name = `${PREFIX}${animal} ${n}`;
    }
  }

  let color: string;
  if (preferred?.color && COLORS.includes(preferred.color) && !usedColors.has(preferred.color)) {
    color = preferred.color;
  } else {
    const free = COLORS.filter((c) => !usedColors.has(c));
    color = pickRandom(free.length ? free : COLORS);
  }

  return { name, color };
}
