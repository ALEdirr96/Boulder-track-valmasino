export type BlockStatus = 'new' | 'clean' | 'to_clean' | 'project';

export interface Line {
  id: string;
  name: string;
  grade: string;
  opener?: string;
  status: 'new' | 'clean' | 'project';
  description?: string;
  number?: string | number;
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
  type?: 'blocco' | 'falesia';
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

export interface BlockReview {
  id: string;
  userId: string;
  userEmail: string;
  userDisplayName: string;
  rating: number; // 0 to 5 sassi
  comment: string;
  hasClimbed: boolean; // Salito/Completato
  climbedLines?: string[]; // list of lines climbed
  createdAt: any;
  updatedAt?: any;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  type: 'cleaning_day' | 'general' | 'gathering' | 'meeting';
  location: string;
  createdBy: string;
  createdByDisplayName?: string;
  participants: string[]; // List of UIDs
  createdAt: any;
}

export interface EquipmentBooking {
  id: string;
  equipmentId: string;
  equipmentName: string;
  userId: string;
  userDisplayName: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  status: 'pending' | 'approved' | 'cancelled';
  createdAt: any;
}
