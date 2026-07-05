import { useState, useCallback } from 'react';
import { FontAwesome5 } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BottomActionSheet, SheetConfig } from '../../src/components/BottomActionSheet';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Modal,
  ScrollView,
  TextInput,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library/legacy';
import { router } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useMediaStore } from '../../src/store/mediaStore';
import { setSuppressLock } from '../../src/lockSuppressor';

function extractAssetId(uri: string, filename: string): string | null {
  const uriMatch = uri.match(/\/media\/(\d+)(?:\/|$)/);
  if (uriMatch) return uriMatch[1];
  const nameMatch = filename.match(/^(\d+)\.\w+$/);
  if (nameMatch) return nameMatch[1];
  return null;
}

async function batchDeleteFromLibrary(
  items: { uri: string; filename: string; isVideo: boolean }[]
): Promise<number> {
  const ids: string[] = [];
  const needLookup = { photo: new Set<string>(), video: new Set<string>() };

  for (const item of items) {
    const id = extractAssetId(item.uri, item.filename);
    if (id) ids.push(id);
    else needLookup[item.isVideo ? 'video' : 'photo'].add(item.filename);
  }

  for (const mediaType of ['photo', 'video'] as const) {
    if (needLookup[mediaType].size === 0) continue;
    const { assets } = await MediaLibrary.getAssetsAsync({
      first: 500,
      sortBy: [[MediaLibrary.SortBy.creationTime, false]],
      mediaType: mediaType === 'video' ? MediaLibrary.MediaType.video : MediaLibrary.MediaType.photo,
    });
    for (const a of assets) {
      if (needLookup[mediaType].has(a.filename)) ids.push(a.id);
    }
  }

  if (ids.length === 0) return 0;
  const ok = await MediaLibrary.deleteAssetsAsync(ids);
  return ok ? ids.length : 0;
}

export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [pendingAssets, setPendingAssets] = useState<ImagePicker.ImagePickerAsset[] | null>(null);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [sheetConfig, setSheetConfig] = useState<SheetConfig | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const showSheet = (config: SheetConfig) => { setSheetConfig(config); setSheetVisible(true); };

  const { addMedia, folders, loadFolders, createFolder } = useMediaStore();

  useFocusEffect(
    useCallback(() => {
      loadFolders();
    }, [])
  );

  const pickAndImport = async () => {
    setSuppressLock(true);
    const mlPerm = await MediaLibrary.requestPermissionsAsync(false);
    if (!mlPerm.granted) {
      setSuppressLock(false);
      Alert.alert('需要權限', '請在系統設定中允許「完整」存取相簿（選「允許全部」）');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setSuppressLock(false);
      Alert.alert('需要權限', '請在系統設定中允許存取相簿');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'] as any,
      allowsMultipleSelection: true,
      quality: 1,
    });

    if (result.canceled || result.assets.length === 0) {
      setSuppressLock(false);
      return;
    }

    setPendingAssets(result.assets);
    setFolderModalVisible(true);
  };

  const selectFolder = (folderId: string | null) => {
    setFolderModalVisible(false);
    if (!pendingAssets) return;
    const assets = pendingAssets;
    setPendingAssets(null);

    showSheet({
      title: '匯入設定',
      message: `已選擇 ${assets.length} 個檔案，匯入後要刪除相簿中的原始檔案嗎？`,
      actions: [
        { label: '保留原始檔案', onPress: () => doImport(assets, false, folderId) },
        { label: '刪除原始檔案', style: 'destructive', onPress: () => doImport(assets, true, folderId) },
      ],
    });
  };

  const doImport = async (
    assets: ImagePicker.ImagePickerAsset[],
    deleteOriginal: boolean,
    folderId: string | null
  ) => {
    setLoading(true);
    setProgress({ done: 0, total: assets.length });
    let failed = 0;
    const toDelete: { uri: string; filename: string; isVideo: boolean }[] = [];

    for (let i = 0; i < assets.length; i++) {
      const asset = assets[i];
      try {
        const isVideo = asset.type === 'video';
        const ext = isVideo ? (asset.fileName?.split('.').pop() ?? 'mp4') : 'jpg';
        const filename = asset.fileName ?? `file_${Date.now()}.${ext}`;
        const mimeType = asset.mimeType ?? (isVideo ? 'video/mp4' : 'image/jpeg');
        await addMedia(asset.uri, filename, mimeType, false, folderId);
        if (deleteOriginal) toDelete.push({ uri: asset.uri, filename, isVideo });
        setProgress({ done: i + 1, total: assets.length });
      } catch (e) {
        console.error('Import failed', asset.uri, e);
        failed++;
      }
    }

    // Single system dialog for all deletions
    let deleteCount = 0;
    if (toDelete.length > 0) {
      try { deleteCount = await batchDeleteFromLibrary(toDelete); } catch { /* ignore */ }
    }

    setLoading(false);
    setSuppressLock(false);
    const success = assets.length - failed;
    let msg = failed > 0 ? `成功 ${success} 個，失敗 ${failed} 個` : `已儲存 ${success} 個檔案`;
    if (deleteOriginal) {
      msg += deleteCount === toDelete.length
        ? '\n原始檔案已刪除'
        : '\n⚠️ 原始檔案刪除失敗（請在系統對話框中點「允許」）';
    }
    showSheet({
      title: '匯入完成',
      message: msg,
      actions: [
        { label: '查看相簿', onPress: () => router.push('/(main)/gallery') },
        { label: '繼續匯入', onPress: () => {} },
      ],
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>匯入</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#c01848" />
          <Text style={styles.loadingText}>
            處理中 {progress.done}/{progress.total}
          </Text>
          <Text style={styles.loadingHint}>請勿關閉 App</Text>
        </View>
      ) : (
        <View style={styles.body}>
          <TouchableOpacity style={styles.importBtn} onPress={pickAndImport} activeOpacity={0.7}>
            <FontAwesome5 name="file-import" size={48} color="#c01848" solid />
            <Text style={styles.importTitle}>選擇照片或影片</Text>
            <Text style={styles.importDesc}>從相簿選擇，支援多選</Text>
          </TouchableOpacity>
          <View style={styles.note}>
            <Text style={styles.noteText}>
              照片以 AES-256 加密儲存。影片儲存於 App 私有空間，不在相簿顯示。
            </Text>
          </View>
        </View>
      )}

      {/* Folder picker modal */}
      <Modal
        visible={folderModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => { setFolderModalVisible(false); setPendingAssets(null); setCreatingFolder(false); setNewFolderName(''); }}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalBox, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.modalTitle}>選擇資料夾</Text>
            <ScrollView style={styles.folderList} showsVerticalScrollIndicator={false}>
              {creatingFolder ? (
                <View style={styles.newFolderRow}>
                  <TextInput
                    style={styles.newFolderInput}
                    value={newFolderName}
                    onChangeText={setNewFolderName}
                    placeholder="資料夾名稱"
                    placeholderTextColor="#6b4a55"
                    autoFocus
                  />
                  <TouchableOpacity onPress={async () => {
                    const name = newFolderName.trim();
                    if (!name) return;
                    const folder = await createFolder(name);
                    setCreatingFolder(false);
                    setNewFolderName('');
                    selectFolder(folder.id);
                  }}>
                    <Text style={styles.newFolderConfirm}>確認</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setCreatingFolder(false); setNewFolderName(''); }}>
                    <Text style={styles.newFolderCancel}>取消</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={styles.folderItem} onPress={() => setCreatingFolder(true)}>
                  <FontAwesome5 name="folder-plus" size={28} color="#c01848" solid />
                  <Text style={styles.folderItemText}>新增資料夾</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.folderItem} onPress={() => selectFolder(null)}>
                <FontAwesome5 name="layer-group" size={28} color="#c01848" solid />
                <Text style={styles.folderItemText}>不分類（全部）</Text>
              </TouchableOpacity>
              {folders.map(folder => (
                <TouchableOpacity
                  key={folder.id}
                  style={styles.folderItem}
                  onPress={() => selectFolder(folder.id)}
                >
                  <FontAwesome5 name="folder" size={28} color="#c01848" solid />
                  <Text style={styles.folderItemText}>{folder.name}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={styles.modalCancel}
              onPress={() => { setFolderModalVisible(false); setPendingAssets(null); setCreatingFolder(false); setNewFolderName(''); }}
            >
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BottomActionSheet
        visible={sheetVisible}
        config={sheetConfig}
        onClose={() => setSheetVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080608' },
  header: { paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16 },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '700' },
  body: { flex: 1, padding: 16, gap: 16 },
  importBtn: {
    backgroundColor: '#140a0e',
    borderRadius: 20,
    padding: 32,
    alignItems: 'center',
    gap: 10,
  },
  importTitle: { color: '#ffffff', fontSize: 20, fontWeight: '600' },
  importDesc: { color: '#9a6b7a', fontSize: 14 },
  note: {
    backgroundColor: '#1c0f14',
    borderRadius: 12,
    padding: 16,
  },
  noteText: { color: '#6b4a55', fontSize: 13, lineHeight: 20 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  loadingText: { color: '#ffffff', fontSize: 18 },
  loadingHint: { color: '#9a6b7a', fontSize: 13 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalBox: {
    backgroundColor: '#140a0e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '70%',
    gap: 16,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  folderList: { flexGrow: 0 },
  folderItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#28101c',
    gap: 12,
  },
  folderItemText: { color: '#fff', fontSize: 16 },
  newFolderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#28101c',
    gap: 10,
  },
  newFolderInput: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    backgroundColor: '#28101c',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  newFolderConfirm: { color: '#c01848', fontSize: 15, fontWeight: '600' },
  newFolderCancel: { color: '#6b4a55', fontSize: 15 },
  modalCancel: {
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: '#28101c',
    alignItems: 'center',
  },
  modalCancelText: { color: '#9a6b7a', fontSize: 15 },
});
