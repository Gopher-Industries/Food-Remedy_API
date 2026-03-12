// FE023 – PersonalNoteSection
import React, { useEffect, useState } from 'react';
import { View, TextInput, ActivityIndicator, Alert, StyleSheet, TouchableOpacity } from 'react-native';
import UIText from '@/components/ui/UIText';
import IconGeneral from '@/components/icons/IconGeneral';
import { color, spacing } from '@/app/design/token';
import { getNote, saveNote, deleteNote, Note } from '../../api/notes';

interface Props {
  barcode: string;
}

export const PersonalNoteSection: React.FC<Props> = ({ barcode }) => {
  const [note, setNote] = useState<Note | null>(null);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    getNote(barcode)
      .then((n) => {
        if (mounted) {
          setNote(n);
          setInput(n?.content || '');
        }
      })
      .catch((e) => {
        if (mounted) setError(e.message || 'Failed to load note');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => { mounted = false; };
  }, [barcode]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const saved = await saveNote(barcode, input, note?.id);
      setNote(saved);
      setEditing(false);
    } catch (e: any) {
      setError(e.message || 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete your note?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive', onPress: async () => {
            setSaving(true);
            setError(null);
            try {
              await deleteNote(barcode, note?.id);
              setNote(null);
              setInput('');
              setEditing(false);
            } catch (e: any) {
              setError(e.message || 'Failed to delete note');
            } finally {
              setSaving(false);
            }
          }
        }
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.section}><ActivityIndicator size="small" color={color.primary} /><UIText style={styles.loading}>On loading…</UIText></View>
    );
  }

  return (
    <View style={styles.section}>
      <UIText style={styles.title}>Personal Note</UIText>
      {error ? <UIText style={styles.error}>{error}</UIText> : null}
      {note && !editing ? (
        <View style={styles.noteBox}>
          <UIText style={styles.noteText}>{note.content}</UIText>
          <View style={styles.actions}>
            <TouchableOpacity onPress={() => { setEditing(true); setInput(note.content); }}>
              <IconGeneral type="edit" size={20} fill={color.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={handleDelete} style={styles.deleteBtn}>
              <IconGeneral type="trash" size={20} fill={color.danger} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={styles.inputBox}>
          <TextInput
            style={styles.input}
            placeholder="Add a personal note…"
            value={input}
            onChangeText={setInput}
            editable={!saving}
            multiline
            maxLength={500}
          />
          <View style={styles.saveRow}>
            {note ? (
              <TouchableOpacity onPress={() => { setEditing(false); setInput(note.content); }} disabled={saving}>
                <UIText style={styles.cancelBtn}>Cancel</UIText>
              </TouchableOpacity>
            ) : null}
            <TouchableOpacity
              onPress={handleSave}
              disabled={saving || input.trim().length === 0}
              style={styles.saveBtn}
            >
              {saving ? <ActivityIndicator size="small" color={color.primary} /> : <UIText style={styles.saveText}>{note ? 'Save' : 'Add'}</UIText>}
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  section: {
    marginTop: spacing.lg,
    marginBottom: spacing.lg,
    padding: spacing.md,
    backgroundColor: color.background,
    borderRadius: 12,
    shadowColor: color.border,
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  title: {
    fontWeight: 'bold',
    fontSize: 16,
    marginBottom: spacing.sm,
  },
  loading: {
    marginTop: spacing.sm,
    color: color.textMuted,
  },
  error: {
    color: color.danger,
    marginBottom: spacing.sm,
  },
  noteBox: {
    backgroundColor: color.background,
    borderRadius: 8,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  noteText: {
    flex: 1,
    color: color.textDefault,
    fontSize: 15,
  },
  actions: {
    flexDirection: 'row',
    marginLeft: spacing.md,
  },
  deleteBtn: {
    marginLeft: spacing.sm,
  },
  inputBox: {
    backgroundColor: color.background,
    borderRadius: 8,
    padding: spacing.md,
  },
  input: {
    minHeight: 60,
    color: color.textDefault,
    fontSize: 15,
    marginBottom: spacing.sm,
  },
  saveRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  saveBtn: {
    marginLeft: spacing.md,
    backgroundColor: color.primary,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  saveText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 15,
  },
  cancelBtn: {
    color: color.textMuted,
    fontSize: 15,
  },
});