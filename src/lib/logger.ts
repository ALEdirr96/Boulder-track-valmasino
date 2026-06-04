import { addDoc, collection } from 'firebase/firestore';
import { db } from '../firebase';

export async function logActivity(
  action: string,
  type: 'block' | 'user' | 'settings',
  userProfile: { uid: string; email?: string; displayName?: string }
) {
  try {
    await addDoc(collection(db, 'logs'), {
      action,
      type,
      createdAt: new Date().toISOString(),
      createdBy: userProfile.uid,
      createdByEmail: userProfile.email || '',
      createdByDisplayName: userProfile.displayName || 'Anonimo',
    });
  } catch (error) {
    console.error('Error writing activity log to firestore:', error);
  }
}
