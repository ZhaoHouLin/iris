import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Switch,
} from 'react-native';
import { useAuthStore } from '../../src/store/authStore';
import { useMediaStore } from '../../src/store/mediaStore';

export default function SettingsScreen() {
  const { setupPin, biometricEnabled, setBiometricEnabled } = useAuthStore();
  const { entries, cleanupTempFiles } = useMediaStore();
  const [pinModal, setPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');

  const handleSavePin = async () => {
    if (newPin.length < 4) {
      Alert.alert('錯誤', 'PIN 碼至少需要 4 位數');
      return;
    }
    await setupPin(newPin);
    setPinModal(false);
    setNewPin('');
    Alert.alert('完成', 'PIN 碼已更新');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>設定</Text>
      </View>

      <Section title="安全性">
        <Row label="變更 PIN 碼" onPress={() => setPinModal(true)} showArrow />
        <Row
          label="生物辨識解鎖"
          right={
            <Switch
              value={biometricEnabled}
              onValueChange={(val) => setBiometricEnabled(val)}
              trackColor={{ false: '#3a1828', true: '#c01848' }}
              thumbColor="#ffffff"
            />
          }
        />
      </Section>

      <Section title="資料">
        <Row label="加密檔案數量" value={`${entries.length} 個`} />
        <Row
          label="清除解密暫存"
          onPress={async () => {
            await cleanupTempFiles();
            Alert.alert('完成', '暫存已清除');
          }}
          showArrow
        />
      </Section>

      <View style={styles.autoLockNote}>
        <Text style={styles.autoLockNoteText}>移至背景 30 秒後自動鎖定</Text>
      </View>

      <Modal visible={pinModal} transparent animationType="slide">
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalOverlay}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>變更 PIN 碼</Text>

            <Text style={styles.inputLabel}>新 PIN 碼（至少 4 位數）</Text>
            <TextInput
              style={styles.input}
              value={newPin}
              onChangeText={setNewPin}
              keyboardType="numeric"
              secureTextEntry
              maxLength={8}
              placeholder="輸入新 PIN 碼"
              placeholderTextColor="#6b4a55"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.modalBtn, styles.modalBtnCancel]}
                onPress={() => { setPinModal(false); setNewPin(''); }}
              >
                <Text style={styles.modalBtnCancelText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnSave]} onPress={handleSavePin}>
                <Text style={styles.modalBtnSaveText}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function Row({
  label,
  value,
  onPress,
  showArrow,
  right,
}: {
  label: string;
  value?: string;
  onPress?: () => void;
  showArrow?: boolean;
  right?: React.ReactNode;
}) {
  const Inner = (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowRight}>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
        {right ?? null}
        {showArrow ? <Text style={styles.arrow}>›</Text> : null}
      </View>
    </View>
  );
  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {Inner}
      </TouchableOpacity>
    );
  }
  return Inner;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080608' },
  header: {
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '700' },
  section: { paddingHorizontal: 16, marginTop: 24 },
  sectionTitle: {
    color: '#6b4a55',
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 8,
    paddingLeft: 4,
  },
  sectionBody: { backgroundColor: '#140a0e', borderRadius: 16, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#28101c',
  },
  rowLabel: { color: '#ffffff', fontSize: 16 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowValue: { color: '#9a6b7a', fontSize: 15 },
  arrow: { color: '#3a1828', fontSize: 22 },
  autoLockNote: {
    marginTop: 'auto',
    alignItems: 'center',
    paddingBottom: 8,
  },
  autoLockNoteText: { color: '#3a1828', fontSize: 12 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#140a0e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 24,
  },
  inputLabel: { color: '#9a6b7a', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#080608',
    borderRadius: 12,
    padding: 14,
    color: '#ffffff',
    fontSize: 16,
    marginBottom: 24,
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalBtn: { flex: 1, borderRadius: 14, padding: 16, alignItems: 'center' },
  modalBtnCancel: { backgroundColor: '#080608' },
  modalBtnSave: { backgroundColor: '#c01848' },
  modalBtnCancelText: { color: '#9a6b7a', fontSize: 16, fontWeight: '600' },
  modalBtnSaveText: { color: '#ffffff', fontSize: 16, fontWeight: '600' },
});
