// FE023 – Personal Notes API (local fallback + backend switch)
import AsyncStorage from '@react-native-async-storage/async-storage';

export const USE_BACKEND = false; // Set true to use backend API
const API_BASE = 'https://your-backend-url.com'; // Replace with actual backend URL

export interface Note {
  id: string;
  barcode: string;
  content: string;
  updatedAt: string;
}

function getLocalKey(barcode: string) {
  return `personal_note_${barcode}`;
}

export async function getNote(barcode: string): Promise<Note | null> {
  if (USE_BACKEND) {
    try {
      const res = await fetch(`${API_BASE}/notes?barcode=${encodeURIComponent(barcode)}`);
      if (!res.ok) throw new Error('Failed to fetch note');
      const data = await res.json();
      if (!data || !data.length) return null;
      return data[0];
    } catch (e) {
      throw new Error('Error loading note from server');
    }
  } else {
    try {
      const raw = await AsyncStorage.getItem(getLocalKey(barcode));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      throw new Error('Error loading note locally');
    }
  }
}

export async function saveNote(barcode: string, content: string, existingId?: string): Promise<Note> {
  if (USE_BACKEND) {
    try {
      if (existingId) {
        const res = await fetch(`${API_BASE}/notes/${existingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
        });
        if (!res.ok) throw new Error('Failed to update note');
        return await res.json();
      } else {
        const res = await fetch(`${API_BASE}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ barcode, content }),
        });
        if (!res.ok) throw new Error('Failed to create note');
        return await res.json();
      }
    } catch (e) {
      throw new Error('Error saving note to server');
    }
  } else {
    try {
      const note: Note = {
        id: existingId || `${barcode}_${Date.now()}`,
        barcode,
        content,
        updatedAt: new Date().toISOString(),
      };
      await AsyncStorage.setItem(getLocalKey(barcode), JSON.stringify(note));
      return note;
    } catch (e) {
      throw new Error('Error saving note locally');
    }
  }
}

export async function deleteNote(barcode: string, existingId?: string): Promise<void> {
  if (USE_BACKEND) {
    try {
      if (!existingId) throw new Error('No note id provided');
      const res = await fetch(`${API_BASE}/notes/${existingId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete note');
    } catch (e) {
      throw new Error('Error deleting note from server');
    }
  } else {
    try {
      await AsyncStorage.removeItem(getLocalKey(barcode));
    } catch (e) {
      throw new Error('Error deleting note locally');
    }
  }
}
