export type BlockStatus = 'new' | 'clean' | 'to_clean' | 'project';

export interface Line {
  id: string;
  name: string;
  grade: string;
  opener?: string;
  status: 'new' | 'clean' | 'project';
  description?: string;
}

export interface Block {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  status: BlockStatus;
  height?: string;
  style?: string;
  exposure?: string;
  accessNotes?: string;
  landingNotes?: string;
  riskLevel?: string;
  photos?: string[];
  linePhoto?: string;
  lines?: Line[];
  createdAt: any; // Firestore Timestamp
  createdBy: string;
  createdByEmail?: string;
  createdByDisplayName?: string;
  projectOwner?: string;
  visited?: boolean;
  favorite?: boolean;
  approachTime?: string;
  parkingCoords?: { lat: number; lng: number };
  tags?: string[];
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number | null;
}

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending' | 'blocked';
  photoURL?: string;
  createdAt: any;
}
