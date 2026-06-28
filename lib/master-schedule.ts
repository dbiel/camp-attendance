// Master room×period schedule for the TTU Music Camp. Ported from the standalone
// ttu-music-schedule app — this is LAST YEAR'S data; swap in the new master
// schedule when it lands (same shape). Each cell is a free-text session
// description whose prefix (REH/SEC/MASTER/ELEC/CHAMBER) drives its type+color.

export interface TimeSlot { id: string; label: string; period: string; }
export interface ScheduleRoom { room: string; slots: Record<string, string>; }

export const TIME_SLOTS: TimeSlot[] = [
  { id: "1", label: "8:00 – 8:50", period: "1" },
  { id: "2", label: "9:00 – 9:50", period: "2" },
  { id: "3", label: "10:00 – 10:50", period: "3" },
  { id: "4A", label: "11:00 – 11:50", period: "4A" },
  { id: "4B", label: "12:00 – 12:50", period: "4B" },
  { id: "5", label: "1:00 – 1:50", period: "5" },
  { id: "6", label: "2:00 – 2:50", period: "6" },
  { id: "ASM", label: "3:00 – 3:50", period: "Assembly" },
  { id: "7", label: "4:00 – 4:50", period: "7" },
  { id: "8", label: "5:00 – 5:50", period: "8" }
];

export const SCHEDULE: ScheduleRoom[] = [
  {
    room: "SOM Choir Room",
    slots: {
      "1": "REH O2",
      "2": "REH O1",
      "3": "REH O1",
      "4A": "SEC O1 Violin 1",
      "4B": "Occupied by Orchestra — DO NOT MOVE",
      "5": "Master STRING",
      "6": "MUSIC IN FILM",
      "7": "REH O2"
    }
  },
  {
    room: "SOM Band Hall",
    slots: {
      "1": "REH B6",
      "2": "SEC B1 Perc",
      "3": "REH B6",
      "4A": "REH B2",
      "4B": "REH B6",
      "5": "REH B3",
      "6": "REH B3",
      "ASM": "Fac Orch (Strings M,W; Full Tu,Th)",
      "7": "ELEC Tuba/Euph Choir B1/B2/B3",
      "8": "ELEC JAZZ 2"
    }
  },
  {
    room: "Hemmle",
    slots: {
      "1": "ELEC Brass Choir B1/B2/B3",
      "2": "REH B2",
      "3": "REH B1",
      "4A": "REH B1",
      "4B": "REH O2",
      "5": "REH B2",
      "6": "REH B1",
      "ASM": "Fac Band (Full M,W; Split Tu,Th)",
      "7": "REH O1 (Full)"
    }
  },
  {
    room: "SUB Ballroom",
    slots: {
      "1": "ELEC Brass Choir 4/5",
      "2": "REH B4",
      "3": "REH B5",
      "4A": "MASTER B4/B5 Clarinet",
      "5": "SEC B6 Perc",
      "6": "REH B5",
      "ASM": "ASSEMBLY",
      "7": "REH B5"
    }
  },
  {
    room: "SUB Lounge",
    slots: {
      "1": "REH B7",
      "2": "REH B3",
      "3": "REH B7",
      "4A": "SEC B7 Perc",
      "4B": "REH B7",
      "5": "REH B4",
      "6": "REH B4"
    }
  },
  {
    room: "SUB Matador",
    slots: {
      "1": "SEC B5 Perc",
      "2": "SEC B4 Perc",
      "3": "SEC B3 Perc",
      "4A": "MASTER B4/B5 Perc",
      "4B": "ELEC Perc Ens B4/B5",
      "5": "SEC B2 Perc",
      "6": "ELEC O1 Winds/Brass"
    }
  },
  {
    room: "SUB Lonestar",
    slots: {
      "1": "Composition",
      "2": "SEC B4 Oboe",
      "4A": "ELEC Dbl Reed Ens B4/B5",
      "6": "ELEC Composition"
    }
  },
  {
    room: "SUB Lubbock",
    slots: {
      "1": "Theory",
      "2": "Theory",
      "3": "MASTER B2/B3 Clarinet",
      "4A": "MASTER B1 Clarinet",
      "4B": "ELEC Perc Ens B6/B7",
      "5": "Music History",
      "6": "ELEC JAZZ 1"
    }
  },
  {
    room: "SOM 018 Percussion",
    slots: {}
  },
  {
    room: "SOM 123",
    slots: {
      "1": "Drum Major Weather",
      "2": "SEC B5 Trumpet",
      "3": "SEC O2 Violin 1",
      "4A": "SEC B3 Flute",
      "4B": "SEC B7 Clarinet",
      "5": "SEC B6 Flute",
      "6": "ELEC Trombone Choir B6/B7",
      "7": "ELEC Horn Choir B1/B2/B3"
    }
  },
  {
    room: "SOM 124",
    slots: {
      "2": "SEC B1 Trumpet",
      "3": "MASTER B2/B3 Trumpet",
      "4A": "SEC B3 Trumpet",
      "5": "SEC B6 Clarinet",
      "6": "ELEC Trumpet Choir B6/B7"
    }
  },
  {
    room: "SOM 125",
    slots: {
      "1": "TTU Class",
      "2": "TTU Class",
      "3": "TTU Class",
      "4A": "TTU Class",
      "4B": "TTU Class",
      "5": "TTU Class",
      "6": "TTU Class",
      "7": "ELEC High School Improv"
    }
  },
  {
    room: "SOM 202",
    slots: {
      "1": "Opera Lab / Composition",
      "2": "SEC B1 Clarinet",
      "3": "SEC O2 Cello",
      "4A": "SEC B3 Clarinet",
      "4B": "SEC B7 Horn",
      "5": "SEC B6 Trombone",
      "6": "SEC B2 Flute",
      "7": "ELEC Composition"
    }
  },
  {
    room: "SOM 205",
    slots: {
      "1": "Cello All-State Prep",
      "2": "SEC B1 Trombone",
      "3": "TTU Class",
      "4A": "TTU Class",
      "5": "SEC B7 Flute",
      "6": "CHAMBER GROUP, Saldana",
      "7": "ELEC Trumpet Choir B1/B2/B3"
    }
  },
  {
    room: "SOM 207",
    slots: {
      "1": "Violin All-State Prep",
      "2": "SEC B5 Tuba/Euph",
      "3": "SEC B4 Horn",
      "4A": "SEC O1 Cello",
      "4B": "MASTER B4/B5 Horn",
      "5": "ELEC Clarinet Choir B4/B5",
      "6": "Chamber Group, Anaya",
      "7": "ELEC Trumpet Choir B1/B2/B3"
    }
  },
  {
    room: "SOM 209",
    slots: {
      "1": "Music History",
      "2": "Music of the Beatles",
      "3": "MASTER B2/B3 Flute",
      "4A": "MASTER B4/B5 Tuba/Euph",
      "4B": "ELEC Tuba/Euph Choir B4/B5",
      "5": "ELEC Clarinet Choir B6/B7",
      "6": "ELEC Clarinet Choir B1/B2/B3"
    }
  },
  {
    room: "Piano Lab 214",
    slots: {
      "1": "ELEC Piano Advanced",
      "2": "ELEC Piano Beginner",
      "4A": "ELEC Piano Inter/Advanced",
      "5": "ELEC Piano Beginner"
    }
  },
  {
    room: "Llano Estacado",
    slots: {
      "1": "Bass All-State Prep",
      "2": "SEC B1 Flute",
      "3": "SEC O2 Bass",
      "4A": "SEC O1 Bass",
      "5": "SEC B6 Horn",
      "6": "ELEC String Bass Ens.",
      "7": "STORAGE",
      "8": "STORAGE"
    }
  },
  {
    room: "SOM 245",
    slots: {
      "2": "TTU Class"
    }
  },
  {
    room: "SOM 251",
    slots: {
      "1": "Music in Tech",
      "2": "Music in Tech",
      "4A": "SEC O2 Violin 2",
      "4B": "SEC B3 Trombone",
      "5": "SEC B7 Trombone",
      "6": "CHAMBER"
    }
  },
  {
    room: "SUB Bell Tower",
    slots: {
      "1": "Bassoon Reedmaking",
      "2": "SEC B5 Clarinet",
      "3": "SEC B4 Flute",
      "4A": "MASTER B4/B5 Trombone",
      "4B": "SEC B6 Tuba/Euph",
      "5": "ELEC Flute Choir B6/B7",
      "6": "CHAMBER"
    }
  },
  {
    room: "SUB Masked Rider",
    slots: {
      "1": "ELEC Orch Conducting",
      "2": "ELEC Brass Choir B6/B7",
      "3": "SEC B4 Trumpet",
      "4A": "SEC O1 Viola",
      "4B": "SEC B7 Trumpet",
      "5": "ELEC Flute Choir B4/B5",
      "6": "SEC B2 Sax"
    }
  },
  {
    room: "SUB Canyon",
    slots: {
      "2": "SEC B5 Trombone",
      "3": "MASTER B2/B3 Sax",
      "4B": "SEC B7 Sax",
      "5": "SEC B6 Sax",
      "6": "ELEC Tuba/Euph Ens B6/B7",
      "7": "ELEC Sax Choir B1/B2/B3"
    }
  },
  {
    room: "SUB Double T",
    slots: {
      "2": "SEC B5 Sax",
      "3": "SEC B4 Sax",
      "4A": "SEC B3 Sax",
      "5": "SEC B6 Trumpet",
      "6": "SEC B2 Clarinet",
      "7": "CHAMBER"
    }
  },
  {
    room: "SUB Escondido",
    slots: {
      "1": "Music in Film",
      "2": "Music in Film",
      "3": "MASTER B2/B3 Trombone",
      "4A": "MASTER B4/B5 Trumpet",
      "4B": "MASTER B1 Flute",
      "5": "Chamber Group Viola, Ahedo",
      "6": "ELEC Trombone Choir B1/B2/B3"
    }
  },
  {
    room: "SUB Caprock",
    slots: {
      "2": "SEC B5 Bassoon",
      "3": "SEC B4 Bassoon",
      "4B": "SEC B7 Bassoon",
      "5": "SEC B6 Bassoon",
      "6": "SEC B2 Tuba/Euph",
      "7": "ELEC Dbl Reed Ens B1/B2/B3"
    }
  },
  {
    room: "SUB Brazos",
    slots: {
      "1": "Music History",
      "3": "SEC B4 Clarinet",
      "5": "ELEC Trumpet Choir B4/B5",
      "6": "ELEC Dbl Reed Ens B6/B7",
      "7": "ELEC Percussion Ensemble B1/B2/B3"
    }
  },
  {
    room: "SUB Mesa",
    slots: {
      "2": "SEC B5 Horn",
      "3": "SEC B4 Trombone",
      "4A": "SEC B3 Horn",
      "4B": "MASTER B4/B5 Sax",
      "5": "ELEC Horn Choir B4/B5",
      "6": "VIOLIN CHAMBER, Anna Kim",
      "7": "ELEC Percussion Ensemble B1/B2/B3"
    }
  },
  {
    room: "SUB Playa",
    slots: {
      "2": "SEC B5 Flute",
      "3": "MASTER B2/B3 Tuba/Euph",
      "4A": "SEC B3 Tuba/Euph",
      "4B": "SEC B7 Tuba/Euph",
      "5": "ELEC Sax Choir B4/B5",
      "6": "ELEC Sax Choir B6/B7"
    }
  },
  {
    room: "SUB Arroyo",
    slots: {
      "1": "ELEC Oboe Reedmaking",
      "2": "SEC B5 Oboe",
      "3": "SEC O2 Viola",
      "4A": "SEC B3 Oboe",
      "4B": "MASTER B4/B5 Oboe",
      "5": "SEC B6 Oboe",
      "6": "SEC B2 Trumpet",
      "7": "ELEC Oboe Reedmaking"
    }
  },
  {
    room: "SUB Senate",
    slots: {
      "1": "ELEC Leadership / All Day Drum Major",
      "2": "ELEC Leadership / All Day Drum Major",
      "3": "ALL DAY DRUM MAJOR",
      "4A": "ALL DAY DRUM MAJOR",
      "4B": "ALL DAY DRUM MAJOR",
      "5": "MASTER B1 Trumpet",
      "6": "ALL DAY DRUM MAJOR",
      "7": "ALL DAY DRUM MAJOR",
      "8": "ALL DAY DRUM MAJOR"
    }
  },
  {
    room: "SUB Traditions",
    slots: {
      "1": "ELEC Conducting",
      "2": "ELEC Conducting",
      "3": "SEC B4 Tuba/Euph",
      "4A": "SEC O1 Violin 2",
      "4B": "MASTER B4/B5 Flute",
      "5": "ELEC Trombone Choir B4/B5",
      "6": "ELEC Horn Choir B6/B7",
      "7": "ELEC Flute Choir B1/B2/B3"
    }
  },
  {
    room: "SOM 001 Bassoon (Meek)",
    slots: {
      "1": "Meek Lessons",
      "2": "SEC B1 Bassoon",
      "3": "MASTER B2/B3 Bassoon",
      "4A": "SEC B3 Bassoon",
      "4B": "MASTER B4/B5 Bassoon",
      "5": "MASTER B1 Bassoon",
      "6": "SEC B2 Bassoon",
      "7": "ELEC Bassoon Reedmaking",
      "8": "ELEC Bassoon Reedmaking"
    }
  },
  {
    room: "SOM 006 Percussion (Mixtacki)",
    slots: {
      "3": "MASTER B2/B3 Perc",
      "5": "MASTER B1 Perc",
      "7": "ELEC Percussion Ensemble B1/B2/B3"
    }
  },
  {
    room: "SOM 007 Horn (Smith)",
    slots: {
      "1": "Smith Lessons",
      "2": "SEC B1 Horn",
      "3": "MASTER B2/B3 Horn",
      "5": "MASTER B1 Horn",
      "6": "SEC B2 Horn"
    }
  },
  {
    room: "SOM 008 Tuba/Euph (Wass)",
    slots: {
      "1": "Wass Lessons",
      "2": "SEC B1 Tuba/Euph",
      "5": "MASTER B1 Tuba/Euph"
    }
  },
  {
    room: "SOM 003 Trombone (Decker)",
    slots: {
      "1": "Decker Lessons",
      "5": "MASTER B1 Trombone",
      "6": "SEC B2 Trombone"
    }
  },
  {
    room: "SOM 233 Oboe (Rockett)",
    slots: {
      "1": "Rockett Lessons",
      "2": "SEC B1 Oboe",
      "3": "MASTER B2/B3 Oboe",
      "5": "MASTER B1 Oboe",
      "6": "SEC B2 Oboe"
    }
  },
  {
    room: "SOM 232 Sax (Dees)",
    slots: {
      "1": "Dees Lessons",
      "2": "SEC B1 Sax",
      "5": "MASTER B1 Sax"
    }
  },
  {
    room: "SOM R-11 West Side Grass Area",
    slots: {
      "1": "ALL DAY DRUM MAJOR",
      "2": "ALL DAY DRUM MAJOR"
    }
  },
  {
    room: "SOM R-11 North Sideline",
    slots: {
      "1": "ELEC Drum Major",
      "2": "ELEC Drum Major"
    }
  }
];

// ─── Session-type parsing (from the cell text) ──────────────────────────────
export type SessionType = 'REH' | 'SEC' | 'MASTER' | 'ELEC' | 'CHAMBER' | 'OTHER';

export function getSessionType(text: string): SessionType {
  if (!text) return 'OTHER';
  const t = text.toUpperCase();
  if (t.startsWith('REH ') || t === 'REH') return 'REH';
  if (t.startsWith('SEC ')) return 'SEC';
  if (t.startsWith('MASTER ')) return 'MASTER';
  if (t.includes('ELEC ')) return 'ELEC';
  if (t.includes('CHAMBER')) return 'CHAMBER';
  return 'OTHER';
}

export const TYPE_LABEL: Record<SessionType, string> = {
  REH: 'Rehearsal',
  SEC: 'Sectional',
  MASTER: 'Masterclass',
  ELEC: 'Elective',
  CHAMBER: 'Chamber',
  OTHER: 'Other',
};

/** CSS var holding the accent color for a type (defined in globals.css). */
export const TYPE_VAR: Record<SessionType, string> = {
  REH: 'var(--reh)',
  SEC: 'var(--sec)',
  MASTER: 'var(--master)',
  ELEC: 'var(--elec)',
  CHAMBER: 'var(--chamber)',
  OTHER: 'var(--other)',
};

export interface MasterCell {
  session: string;
  room: string;
  type: SessionType;
}

/** Flatten the room×period grid into per-period session lists (the view model). */
export function buildByPeriod(): { slot: TimeSlot; sessions: MasterCell[] }[] {
  const out: { slot: TimeSlot; sessions: MasterCell[] }[] = [];
  for (const slot of TIME_SLOTS) {
    const sessions: MasterCell[] = [];
    for (const row of SCHEDULE) {
      const cell = row.slots[slot.id];
      if (cell) sessions.push({ session: cell, room: row.room, type: getSessionType(cell) });
    }
    if (sessions.length) out.push({ slot, sessions });
  }
  return out;
}
