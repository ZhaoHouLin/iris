import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  StatusBar,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useMediaStore } from '../../src/store/mediaStore';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 3;
const ITEM_SIZE = (width - GAP * (COLS + 1)) / COLS;

const FOLDER_H_PAD = 16;
const FOLDER_GAP = 12;
const FOLDER_CARD_SIZE = (width - FOLDER_H_PAD * 2 - FOLDER_GAP) / 2;

const ALL_ID = '__all__';

// ─── Zoomable image ───────────────────────────────────────────────────────────

function ZoomableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const transX = useSharedValue(0);
  const transY = useSharedValue(0);
  const savedTransX = useSharedValue(0);
  const savedTransY = useSharedValue(0);

  const pinch = Gesture.Pinch()
    .onUpdate((e) => { scale.value = Math.max(1, savedScale.value * e.scale); })
    .onEnd(() => {
      if (scale.value < 1.05) {
        scale.value = withTiming(1); savedScale.value = 1;
        transX.value = withTiming(0); transY.value = withTiming(0);
        savedTransX.value = 0; savedTransY.value = 0;
      } else { savedScale.value = scale.value; }
    });

  const pan = Gesture.Pan()
    .minDistance(5)
    .onUpdate((e) => {
      if (savedScale.value > 1) {
        transX.value = savedTransX.value + e.translationX;
        transY.value = savedTransY.value + e.translationY;
      }
    })
    .onEnd(() => { savedTransX.value = transX.value; savedTransY.value = transY.value; });

  const doubleTap = Gesture.Tap().numberOfTaps(2).maxDelay(250)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1); savedScale.value = 1;
        transX.value = withTiming(0); transY.value = withTiming(0);
        savedTransX.value = 0; savedTransY.value = 0;
      } else { scale.value = withTiming(2.5); savedScale.value = 2.5; }
    });

  const composed = Gesture.Simultaneous(doubleTap, pinch, pan);
  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: transX.value }, { translateY: transY.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[StyleSheet.absoluteFill, animStyle]}>
        <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="contain" />
      </Animated.View>
    </GestureDetector>
  );
}

// ─── Viewer actions bar ───────────────────────────────────────────────────────

function ViewerActions({ onDelete, onRestore }: { onDelete: () => void; onRestore: () => void }) {
  return (
    <View style={styles.viewerActions}>
      <TouchableOpacity style={styles.viewerActionBtn} onPress={onDelete}>
        <Text style={styles.viewerActionIcon}>🗑</Text>
        <Text style={styles.viewerActionLabel}>刪除</Text>
      </TouchableOpacity>
      <View style={styles.viewerActionDivider} />
      <TouchableOpacity style={styles.viewerActionBtn} onPress={onRestore}>
        <Text style={styles.viewerActionIcon}>↗</Text>
        <Text style={[styles.viewerActionLabel, styles.viewerActionLabelRestore]}>還原到相簿</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Video viewer ─────────────────────────────────────────────────────────────

function VideoViewer({ uri, onClose, onDelete, onRestore }: {
  uri: string; onClose: () => void; onDelete: () => void; onRestore: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  return (
    <View style={styles.viewer}>
      <StatusBar hidden />
      <VideoView player={player} style={styles.viewerImage} contentFit="contain" allowsFullscreen />
      <TouchableOpacity style={styles.viewerClose} onPress={onClose}>
        <Text style={styles.viewerCloseText}>✕</Text>
      </TouchableOpacity>
      <ViewerActions onDelete={onDelete} onRestore={onRestore} />
    </View>
  );
}

// ─── Name input modal (shared by new folder + rename) ────────────────────────

function NameModal({ visible, title, initialValue, onConfirm, onCancel }: {
  visible: boolean;
  title: string;
  initialValue: string;
  onConfirm: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  useEffect(() => { if (visible) setValue(initialValue); }, [visible, initialValue]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalBox}>
          <Text style={styles.modalTitle}>{title}</Text>
          <TextInput
            style={styles.modalInput}
            placeholder="資料夾名稱"
            placeholderTextColor="#555570"
            value={value}
            onChangeText={setValue}
            autoFocus
            onSubmitEditing={() => value.trim() && onConfirm(value.trim())}
          />
          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalConfirm}
              onPress={() => value.trim() && onConfirm(value.trim())}
            >
              <Text style={styles.modalConfirmText}>確定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function GalleryScreen() {
  const {
    entries, folders,
    loadIndex, loadFolders,
    removeMedia, getTempDecryptedPath, getVideoThumbPath,
    createFolder, deleteFolder, renameFolder, moveToFolder,
  } = useMediaStore();

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingUri, setViewingUri] = useState<string | null>(null);
  // null = root folder grid | ALL_ID = all items | folder.id = folder items
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [renameModal, setRenameModal] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string>('');
  const [renamingName, setRenamingName] = useState('');

  const viewingEntry = viewingId ? entries.find(e => e.id === viewingId) : null;
  const isViewingVideo = viewingEntry?.mimeType.startsWith('video/') ?? false;

  const visibleEntries = currentFolderId === null
    ? []
    : currentFolderId === ALL_ID
      ? entries
      : entries.filter(e => e.folderId === currentFolderId);

  const currentFolderName = currentFolderId === ALL_ID
    ? '全部'
    : folders.find(f => f.id === currentFolderId)?.name ?? '';

  useFocusEffect(useCallback(() => { loadIndex(); loadFolders(); }, []));

  useEffect(() => {
    if (entries.length === 0) return;
    let cancelled = false;
    const load = async () => {
      const result: Record<string, string> = {};
      for (const e of entries) {
        if (cancelled) return;
        try {
          if (e.mimeType.startsWith('image/')) result[e.id] = await getTempDecryptedPath(e.id);
          else if (e.mimeType.startsWith('video/')) result[e.id] = await getVideoThumbPath(e.id);
        } catch { /* skip */ }
      }
      if (!cancelled) setThumbs(result);
    };
    load();
    return () => { cancelled = true; };
  }, [entries]);

  // If current folder deleted while inside it, go back to root
  useEffect(() => {
    if (currentFolderId && currentFolderId !== ALL_ID && !folders.find(f => f.id === currentFolderId)) {
      setCurrentFolderId(null);
    }
  }, [folders]);

  // ── Viewer ──

  const openViewer = async (id: string) => {
    try {
      const uri = await getTempDecryptedPath(id);
      setViewingId(id); setViewingUri(uri);
    } catch { Alert.alert('無法開啟', '讀取檔案時發生錯誤'); }
  };

  const closeViewer = () => { setViewingId(null); setViewingUri(null); };

  const handleRestore = (id: string) => {
    Alert.alert('還原到相簿', '還原後是否要從私密相簿中刪除？', [
      { text: '還原並保留', onPress: () => doRestore(id, false) },
      { text: '還原並刪除', style: 'destructive', onPress: () => doRestore(id, true) },
      { text: '取消', style: 'cancel' },
    ]);
  };

  const doRestore = async (id: string, removeFromVault: boolean) => {
    try {
      const uri = await getTempDecryptedPath(id);
      await MediaLibrary.saveToLibraryAsync(uri);
      if (removeFromVault) { closeViewer(); await removeMedia(id); }
      Alert.alert('完成', '已還原到相簿');
    } catch { Alert.alert('失敗', '還原時發生錯誤'); }
  };

  // ── Item actions ──

  const handleItemLongPress = (id: string) => {
    const entry = entries.find(e => e.id === id);
    if (!entry) return;
    const moveOptions = folders
      .filter(f => f.id !== entry.folderId)
      .map(f => ({ text: `移至「${f.name}」`, onPress: () => moveToFolder(id, f.id) }));
    const removeOption = entry.folderId
      ? [{ text: '移出資料夾', onPress: () => moveToFolder(id, null) }]
      : [];
    Alert.alert('操作', '', [
      ...moveOptions,
      ...removeOption,
      { text: '刪除', style: 'destructive' as const, onPress: () => confirmDelete(id) },
      { text: '取消', style: 'cancel' as const },
    ]);
  };

  const confirmDelete = (id: string) => {
    Alert.alert('刪除', '確定要永久刪除這個檔案嗎？', [
      { text: '取消', style: 'cancel' },
      {
        text: '刪除', style: 'destructive',
        onPress: async () => {
          setThumbs(prev => { const n = { ...prev }; delete n[id]; return n; });
          if (viewingId === id) closeViewer();
          await removeMedia(id);
        },
      },
    ]);
  };

  // ── Folder actions ──

  const handleFolderLongPress = (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    Alert.alert(folder.name, '', [
      {
        text: '重新命名',
        onPress: () => {
          setRenamingFolderId(id);
          setRenamingName(folder.name);
          setRenameModal(true);
        },
      },
      {
        text: '刪除資料夾', style: 'destructive',
        onPress: () => Alert.alert(
          '刪除資料夾',
          `刪除「${folder.name}」後，其中的檔案將移至全部`,
          [
            { text: '取消', style: 'cancel' },
            { text: '刪除', style: 'destructive', onPress: () => deleteFolder(id) },
          ]
        ),
      },
      { text: '取消', style: 'cancel' },
    ]);
  };

  // ── Render helpers ──

  const renderMediaItem = ({ item }: { item: typeof entries[0] }) => (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => openViewer(item.id)}
      onLongPress={() => handleItemLongPress(item.id)}
      style={styles.item}
    >
      {thumbs[item.id] ? (
        <View style={styles.thumb}>
          <Image source={{ uri: thumbs[item.id] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          {item.mimeType.startsWith('video/') && (
            <View style={styles.playBadge}><Text style={styles.playBadgeIcon}>▶</Text></View>
          )}
        </View>
      ) : (
        <View style={[styles.thumb, styles.placeholder]}>
          <Text style={styles.placeholderIcon}>{item.mimeType.startsWith('video/') ? '▶' : '📷'}</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  type FolderItem = { key: string; kind: 'all' | 'folder'; id?: string; name?: string };
  const folderItems: FolderItem[] = [
    { key: ALL_ID, kind: 'all' },
    ...folders.map(f => ({ key: f.id, kind: 'folder' as const, id: f.id, name: f.name })),
  ];

  const renderFolderItem = ({ item }: { item: FolderItem }) => {
    if (item.kind === 'all') {
      return (
        <TouchableOpacity style={styles.folderCard} onPress={() => setCurrentFolderId(ALL_ID)}>
          <Text style={styles.folderCardIcon}>🗂</Text>
          <Text style={styles.folderCardName}>全部</Text>
          <Text style={styles.folderCardCount}>{entries.length} 個</Text>
        </TouchableOpacity>
      );
    }
    const count = entries.filter(e => e.folderId === item.id).length;
    return (
      <TouchableOpacity
        style={styles.folderCard}
        onPress={() => setCurrentFolderId(item.id!)}
        onLongPress={() => handleFolderLongPress(item.id!)}
      >
        <Text style={styles.folderCardIcon}>📁</Text>
        <Text style={styles.folderCardName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.folderCardCount}>{count} 個</Text>
      </TouchableOpacity>
    );
  };

  // ── Render ──

  return (
    <View style={styles.container}>

      {/* Header */}
      {currentFolderId === null ? (
        <View style={styles.header}>
          <Text style={styles.title}>私密相簿</Text>
          <TouchableOpacity style={styles.addFolderBtn} onPress={() => setNewFolderModal(true)}>
            <Text style={styles.addFolderBtnText}>＋ 資料夾</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentFolderId(null)}>
            <Text style={styles.backArrow}>‹</Text>
            <Text style={styles.backTitle} numberOfLines={1}>{currentFolderName}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Folder grid */}
      {currentFolderId === null && (
        <FlatList
          data={folderItems}
          keyExtractor={item => item.key}
          numColumns={2}
          contentContainerStyle={styles.folderGrid}
          columnWrapperStyle={styles.folderGridRow}
          renderItem={renderFolderItem}
        />
      )}

      {/* Media grid */}
      {currentFolderId !== null && (
        visibleEntries.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.empty}>此資料夾沒有檔案</Text>
          </View>
        ) : (
          <FlatList
            data={visibleEntries}
            numColumns={COLS}
            keyExtractor={item => item.id}
            contentContainerStyle={styles.grid}
            renderItem={renderMediaItem}
          />
        )
      )}

      {/* Image viewer modal */}
      <Modal visible={!!viewingId && !!viewingUri} transparent animationType="fade" onRequestClose={closeViewer}>
        {viewingUri && (
          isViewingVideo ? (
            <VideoViewer
              uri={viewingUri}
              onClose={closeViewer}
              onDelete={() => viewingId && confirmDelete(viewingId)}
              onRestore={() => viewingId && handleRestore(viewingId)}
            />
          ) : (
            <GestureHandlerRootView style={styles.viewer}>
              <StatusBar hidden />
              <ZoomableImage key={viewingUri} uri={viewingUri} />
              <TouchableOpacity style={styles.viewerClose} onPress={closeViewer}>
                <Text style={styles.viewerCloseText}>✕</Text>
              </TouchableOpacity>
              {viewingId && (
                <ViewerActions
                  onDelete={() => confirmDelete(viewingId)}
                  onRestore={() => handleRestore(viewingId)}
                />
              )}
            </GestureHandlerRootView>
          )
        )}
      </Modal>

      {/* New folder modal */}
      <NameModal
        visible={newFolderModal}
        title="新增資料夾"
        initialValue=""
        onConfirm={async (name) => { await createFolder(name); setNewFolderModal(false); }}
        onCancel={() => setNewFolderModal(false)}
      />

      {/* Rename modal */}
      <NameModal
        visible={renameModal}
        title="重新命名"
        initialValue={renamingName}
        onConfirm={async (name) => { await renameFolder(renamingFolderId, name); setRenameModal(false); }}
        onCancel={() => setRenameModal(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f1a' },

  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
  },
  title: { color: '#ffffff', fontSize: 28, fontWeight: '700' },
  addFolderBtn: {
    backgroundColor: '#1e1e30',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addFolderBtnText: { color: '#7c6ff7', fontSize: 14, fontWeight: '600' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backArrow: { color: '#7c6ff7', fontSize: 36, lineHeight: 40 },
  backTitle: { color: '#ffffff', fontSize: 24, fontWeight: '700', flexShrink: 1 },

  // Folder grid
  folderGrid: { padding: FOLDER_H_PAD, paddingTop: 8 },
  folderGridRow: { gap: FOLDER_GAP, marginBottom: FOLDER_GAP },
  folderCard: {
    width: FOLDER_CARD_SIZE,
    height: FOLDER_CARD_SIZE,
    backgroundColor: '#1e1e30',
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: 12,
  },
  folderCardIcon: { fontSize: 44 },
  folderCardName: { color: '#ffffff', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  folderCardCount: { color: '#555570', fontSize: 12 },

  // Media grid
  grid: { padding: GAP },
  item: { margin: GAP / 2 },
  thumb: { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: 4, overflow: 'hidden' },
  placeholder: { backgroundColor: '#1e1e30', alignItems: 'center', justifyContent: 'center' },
  placeholderIcon: { fontSize: 32 },
  playBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2,
  },
  playBadgeIcon: { color: '#fff', fontSize: 10 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#7c7c9b', fontSize: 18 },
  hint: { color: '#3a3a5c', fontSize: 14, marginTop: 8 },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  viewerCloseText: { color: '#fff', fontSize: 18 },
  viewerActions: {
    position: 'absolute', bottom: 48, alignSelf: 'center',
    flexDirection: 'row',
    backgroundColor: 'rgba(20,20,35,0.85)',
    borderRadius: 32, overflow: 'hidden',
  },
  viewerActionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  viewerActionDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.15)',
    marginVertical: 10,
  },
  viewerActionIcon: { fontSize: 18 },
  viewerActionLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 15 },
  viewerActionLabelRestore: { color: '#a89cf7', fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#1e1e30', borderRadius: 16,
    padding: 24, width: width * 0.8, gap: 16,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalInput: {
    backgroundColor: '#0f0f1a', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 16,
    borderWidth: 1, borderColor: '#3a3a5c',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#2a2a40', alignItems: 'center',
  },
  modalCancelText: { color: '#7c7c9b', fontSize: 15 },
  modalConfirm: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#7c6ff7', alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
