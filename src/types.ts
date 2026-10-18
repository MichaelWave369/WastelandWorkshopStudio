export type GameId = 'fo1' | 'fo2' | 'fot' | 'fo3' | 'fnv' | 'fo4' | 'fo4vr' | 'fo76' | 'shelter' | 'bos';
export type AdapterStatus = 'editable' | 'planned' | 'research';

export interface GameSpec {
  id: GameId;
  name: string;
  year: number;
  family: string;
  status: AdapterStatus;
  note: string;
}

export interface DialogueEntry {
  id: string;
  number: number;
  sound: string;
  text: string;
}

export interface StudioProject {
  version: 1;
  id: string;
  name: string;
  game: GameId;
  filename: string;
  entries: DialogueEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface StudioWorkspace {
  version: 1;
  activeId: string;
  projects: StudioProject[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}
