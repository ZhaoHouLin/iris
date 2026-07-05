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
  ScrollView,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../../src/store/authStore';
import { useMediaStore } from '../../src/store/mediaStore';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { setupPin, biometricEnabled, setBiometricEnabled } = useAuthStore();
  const { entries, cleanupTempFiles } = useMediaStore();
  const [pinModal, setPinModal] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [aboutModal, setAboutModal] = useState(false);

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

      <Section title="關於">
        <Row label="關於 Iris" onPress={() => setAboutModal(true)} showArrow />
      </Section>

      <View style={styles.autoLockNote}>
        <Text style={styles.autoLockNoteText}>移至背景 30 秒後自動鎖定</Text>
      </View>

      {/* About modal */}
      <Modal visible={aboutModal} transparent animationType="slide" onRequestClose={() => setAboutModal(false)}>
        <View style={styles.aboutOverlay}>
          <View style={[styles.aboutSheet, { paddingBottom: 32 + insets.bottom }]}>
            <TouchableOpacity style={styles.aboutClose} onPress={() => setAboutModal(false)}>
              <FontAwesome5 name="times" size={16} color="#6b4a55" solid />
            </TouchableOpacity>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.aboutContent}>
              {/* Logo area */}
              <View style={styles.aboutLogoWrap}>
                <View style={styles.aboutLogoCircle}>
                  <FontAwesome5 name="eye" size={36} color="#c01848" solid />
                </View>
                <Text style={styles.aboutAppName}>Iris</Text>
                <Text style={styles.aboutAppSub}>Private Vault</Text>
                <Text style={styles.aboutVersion}>版本 1.0.0</Text>
              </View>

              <View style={styles.aboutDivider} />

              {/* Security features */}
              <View style={styles.aboutSection}>
                <Text style={styles.aboutSectionTitle}>安全性</Text>
                <AboutRow icon="lock" text="AES-256 加密儲存照片" />
                <AboutRow icon="fingerprint" text="生物辨識 / PIN 碼解鎖" />
                <AboutRow icon="clock" text="背景 30 秒後自動鎖定" />
              </View>

              <View style={styles.aboutSection}>
                <Text style={styles.aboutSectionTitle}>隱私</Text>
                <AboutRow icon="eye-slash" text="照片不在系統相簿顯示" />
                <AboutRow icon="hdd" text="資料僅存於裝置本地" />
                <AboutRow icon="wifi" text="無網路連線、無雲端上傳" />
              </View>

              <View style={styles.aboutDivider} />

              <Text style={styles.aboutMadeBy}>企劃　ZhaoHou Lin (ZZ)</Text>
              <Text style={styles.aboutMadeBy}>設計製作　Claude (Anthropic)</Text>
              <Text style={styles.aboutCopy}>© 2026 Iris. All rights reserved.</Text>
            </ScrollView>
          </View>
        </View>
      </Modal>

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

function AboutRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={styles.aboutRow}>
      <FontAwesome5 name={icon} size={14} color="#c01848" solid style={styles.aboutRowIcon} />
      <Text style={styles.aboutRowText}>{text}</Text>
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

  // About modal
  aboutOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  aboutSheet: {
    backgroundColor: '#0d0508',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  aboutClose: {
    alignSelf: 'flex-end',
    padding: 20,
    paddingBottom: 4,
  },
  aboutContent: { paddingHorizontal: 28, paddingBottom: 8 },
  aboutLogoWrap: { alignItems: 'center', paddingVertical: 16, gap: 10 },
  aboutLogoCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#140a0e',
    borderWidth: 1,
    borderColor: '#28101c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aboutAppName: { color: '#ffffff', fontSize: 34, fontWeight: '200', fontStyle: 'italic', letterSpacing: 1.5 },
  aboutAppSub: { color: '#6b4a55', fontSize: 12, letterSpacing: 3, textTransform: 'uppercase' },
  aboutVersion: { color: '#3a1828', fontSize: 12, marginTop: 4 },
  aboutDivider: { height: StyleSheet.hairlineWidth, backgroundColor: '#1c0f14', marginVertical: 24 },
  aboutSection: { gap: 16, marginBottom: 24 },
  aboutSectionTitle: { color: '#6b4a55', fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 4 },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  aboutRowIcon: { width: 20, textAlign: 'center' },
  aboutRowText: { color: '#c8a8b0', fontSize: 15, flex: 1 },
  aboutMadeBy: { color: '#3a1828', fontSize: 12, textAlign: 'center', marginBottom: 4 },
  aboutCopy: { color: '#2a1018', fontSize: 12, textAlign: 'center', paddingBottom: 8 },
});
