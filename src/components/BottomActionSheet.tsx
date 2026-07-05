import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

export type SheetAction = {
  label: string;
  onPress: () => void;
  style?: 'destructive';
};

export type SheetConfig = {
  title: string;
  message?: string;
  actions: SheetAction[];
};

export function BottomActionSheet({ visible, config, onClose }: {
  visible: boolean;
  config: SheetConfig | null;
  onClose: () => void;
}) {
  if (!config) return null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={s.bg}>
        <TouchableOpacity style={s.dismiss} activeOpacity={1} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.handle} />
          <Text style={s.title}>{config.title}</Text>
          {config.message ? <Text style={s.message}>{config.message}</Text> : null}
          <View style={s.actions}>
            {config.actions.map((action, i) => (
              <TouchableOpacity
                key={i}
                style={[s.actionBtn, action.style === 'destructive' && s.actionBtnDestructive]}
                onPress={() => { onClose(); action.onPress(); }}
              >
                <Text style={[s.actionBtnText, action.style === 'destructive' && s.actionBtnTextDestructive]}>
                  {action.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={s.cancelBtn} onPress={onClose}>
            <Text style={s.cancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  bg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  dismiss: { flex: 1 },
  sheet: {
    backgroundColor: '#140a0e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, paddingTop: 12, paddingHorizontal: 16,
  },
  handle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#3a1828', alignSelf: 'center', marginBottom: 20,
  },
  title: { color: '#fff', fontSize: 18, fontWeight: '700', marginBottom: 6, paddingHorizontal: 8 },
  message: { color: '#9a6b7a', fontSize: 14, lineHeight: 20, marginBottom: 20, paddingHorizontal: 8 },
  actions: { gap: 10, marginBottom: 12 },
  actionBtn: {
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: '#28101c', alignItems: 'center',
  },
  actionBtnDestructive: { backgroundColor: 'rgba(255,69,58,0.12)', borderWidth: 1, borderColor: 'rgba(255,69,58,0.3)' },
  actionBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  actionBtnTextDestructive: { color: '#ff453a' },
  cancelBtn: {
    paddingVertical: 16, borderRadius: 16,
    backgroundColor: '#0d0608', alignItems: 'center',
  },
  cancelText: { color: '#6b4a55', fontSize: 16, fontWeight: '600' },
});
