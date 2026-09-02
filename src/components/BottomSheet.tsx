import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { GlassBackdrop } from './Glass';
import { color, font, radius } from '../theme/tokens';
import type { SheetContent } from '../store/types';

export function BottomSheet({ sheet, onClose }: { sheet: SheetContent | null; onClose: () => void }) {
  return (
    <Modal visible={!!sheet} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityRole="button">
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()} accessibilityRole="button">
          <GlassBackdrop intensity={40} />
          <View style={styles.grabber} />
          <Text style={styles.title}>{sheet?.title}</Text>
          <Text style={styles.body}>{sheet?.body}</Text>
          {sheet?.confirm ? (
            // The way out sits first: a destructive button in the position the eye lands on invites
            // exactly the thoughtless tap this whole sheet exists to prevent.
            <>
              <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
                <Text style={styles.closeText}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  const run = sheet.confirm?.onConfirm;
                  onClose();
                  run?.();
                }}
                style={styles.dangerBtn}
                accessibilityRole="button"
              >
                <Text style={styles.dangerText}>{sheet.confirm.label}</Text>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onClose} style={styles.closeBtn} accessibilityRole="button">
              <Text style={styles.closeText}>Got it</Text>
            </Pressable>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: radius.huge,
    borderTopRightRadius: radius.huge,
    padding: 24,
    paddingBottom: 40,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,13,26,0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderBottomWidth: 0,
  },
  grabber: { width: 36, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'center', marginBottom: 16 },
  title: { fontFamily: font.serif, fontSize: 24, color: color.text, marginBottom: 10 },
  body: { fontFamily: font.sans400, fontSize: 14, lineHeight: 21, color: color.textDim70 },
  closeBtn: { marginTop: 20, height: 50, borderRadius: 25, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  closeText: { fontFamily: font.sans700, fontSize: 14, color: color.text },
  dangerBtn: {
    marginTop: 10,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    borderColor: 'rgba(255,140,140,0.45)',
    backgroundColor: 'rgba(255,90,90,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dangerText: { fontFamily: font.sans700, fontSize: 14, color: '#FFB4B4' },
});
