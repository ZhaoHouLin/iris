import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Image,
  TouchableOpacity,
  Dimensions,
  Alert,
  Modal,
  TextInput,
  StatusBar,
  PanResponder,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';
import { BottomActionSheet, SheetConfig } from '../../src/components/BottomActionSheet';
import * as MediaLibrary from 'expo-media-library/legacy';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { useMediaStore, Folder } from '../../src/store/mediaStore';

const { width } = Dimensions.get('window');
const COLS = 3;
const GAP = 3;
const ITEM_SIZE = (width - GAP * (COLS + 1)) / COLS;

const FOLDER_H_PAD = 16;
const FOLDER_GAP = 12;
const FOLDER_CARD_SIZE = (width - FOLDER_H_PAD * 2 - FOLDER_GAP) / 2;

const ALL_ID = '__all__';

// ─── Zoomable image ───────────────────────────────────────────────────────────

function ZoomableImage({ uri, onSwipeLeft, onSwipeRight }: {
  uri: string;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
}) {
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
    .onEnd((e) => {
      savedTransX.value = transX.value;
      savedTransY.value = transY.value;
      if (savedScale.value <= 1) {
        const isHoriz = Math.abs(e.translationX) > Math.abs(e.translationY);
        if (isHoriz && e.translationX < -60 && onSwipeLeft) runOnJS(onSwipeLeft)();
        else if (isHoriz && e.translationX > 60 && onSwipeRight) runOnJS(onSwipeRight)();
      }
    });

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
      <TouchableOpacity style={styles.viewerActionDelete} onPress={onDelete}>
        <FontAwesome5 name="trash-alt" size={18} color="#ff453a" solid />
        <Text style={styles.viewerActionDeleteText}>刪除</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.viewerActionRestore} onPress={onRestore}>
        <FontAwesome5 name="upload" size={18} color="#fff" solid />
        <Text style={styles.viewerActionRestoreText}>還原到相簿</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Video viewer ─────────────────────────────────────────────────────────────

function VideoViewer({ uri, onClose, onDelete, onRestore, onSwipeLeft, onSwipeRight }: {
  uri: string; onClose: () => void; onDelete: () => void; onRestore: () => void;
  onSwipeLeft?: () => void; onSwipeRight?: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => { p.loop = false; p.play(); });
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 20 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60 && onSwipeLeft) onSwipeLeft();
        else if (gs.dx > 60 && onSwipeRight) onSwipeRight();
      },
    })
  ).current;
  return (
    <View style={styles.viewer} {...panResponder.panHandlers}>
      <StatusBar hidden />
      <VideoView player={player} style={styles.viewerImage} contentFit="contain" />
      <TouchableOpacity style={styles.viewerClose} onPress={onClose}>
        <FontAwesome5 name="times" size={18} color="#fff" solid />
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

// ─── Move modal ───────────────────────────────────────────────────────────────

function MoveModal({ visible, folders, onSelect, onClose }: {
  visible: boolean;
  folders: Folder[];
  onSelect: (folderId: string | null) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.moveModalBg}>
        <TouchableOpacity style={{ flex: 1 }} onPress={onClose} />
        <View style={styles.moveModalSheet}>
          <Text style={styles.moveModalTitle}>移動到</Text>
          <ScrollView bounces={false}>
            <TouchableOpacity style={styles.moveModalOption} onPress={() => onSelect(null)}>
              <FontAwesome5 name="layer-group" size={28} color="#c01848" solid />
              <Text style={styles.moveModalOptionText}>不分類（全部）</Text>
            </TouchableOpacity>
            {folders.map(f => (
              <TouchableOpacity key={f.id} style={styles.moveModalOption} onPress={() => onSelect(f.id)}>
                <FontAwesome5 name="folder" size={28} color="#c01848" solid />
                <Text style={styles.moveModalOptionText}>{f.name}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity style={styles.moveModalCancelBtn} onPress={onClose}>
            <Text style={styles.moveModalCancelText}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

// ─── Folder action sheet ──────────────────────────────────────────────────────

function FolderActionSheet({ visible, folderName, onRename, onDelete, onClose }: {
  visible: boolean;
  folderName: string;
  onRename: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.folderActionBg}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
        <View style={styles.folderActionSheet}>
          <View style={styles.folderActionHandle} />
          <View style={styles.folderActionHeader}>
            <FontAwesome5 name="folder" size={18} color="#c01848" solid />
            <Text style={styles.folderActionName} numberOfLines={1}>{folderName}</Text>
          </View>
          <TouchableOpacity style={styles.folderActionRow} onPress={onRename}>
            <View style={styles.folderActionIconWrap}>
              <FontAwesome5 name="pencil-alt" size={15} color="#c01848" solid />
            </View>
            <Text style={styles.folderActionRowText}>重新命名</Text>
            <FontAwesome5 name="chevron-right" size={13} color="#3a1828" solid />
          </TouchableOpacity>
          <TouchableOpacity style={styles.folderActionRow} onPress={onDelete}>
            <View style={[styles.folderActionIconWrap, styles.folderActionIconWrapRed]}>
              <FontAwesome5 name="trash-alt" size={15} color="#ff453a" solid />
            </View>
            <Text style={[styles.folderActionRowText, styles.folderActionRowTextRed]}>刪除資料夾</Text>
            <FontAwesome5 name="chevron-right" size={13} color="#3a1828" solid />
          </TouchableOpacity>
          <TouchableOpacity style={styles.folderActionCancelBtn} onPress={onClose}>
            <Text style={styles.folderActionCancelText}>取消</Text>
          </TouchableOpacity>
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
    createFolder, deleteFolder, renameFolder, moveToFolder, setFolderCover,
  } = useMediaStore();

  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const thumbsRef = useRef<Record<string, string>>({});
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [viewingUri, setViewingUri] = useState<string | null>(null);
  // null = root folder grid | ALL_ID = all items | folder.id = folder items
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderModal, setNewFolderModal] = useState(false);
  const [renameModal, setRenameModal] = useState(false);
  const [renamingFolderId, setRenamingFolderId] = useState<string>('');
  const [renamingName, setRenamingName] = useState('');
  const [folderActionVisible, setFolderActionVisible] = useState(false);
  const [actionFolderId, setActionFolderId] = useState('');
  const [actionFolderName, setActionFolderName] = useState('');
  const [sheetConfig, setSheetConfig] = useState<SheetConfig | null>(null);
  const [sheetVisible, setSheetVisible] = useState(false);
  const showSheet = (config: SheetConfig) => { setSheetConfig(config); setSheetVisible(true); };
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [moveModal, setMoveModal] = useState(false);
  const [isEditingFolders, setIsEditingFolders] = useState(false);

  const isSelecting = selectedIds.size > 0;
  const toggleSelect = (id: string) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const exitSelect = () => setSelectedIds(new Set());

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

  const allSelected = visibleEntries.length > 0 && visibleEntries.every(e => selectedIds.has(e.id));
  const selectAll = () => setSelectedIds(new Set(visibleEntries.map(e => e.id)));

  const viewingIndex = viewingId ? visibleEntries.findIndex(e => e.id === viewingId) : -1;
  const navigatePrev = () => { if (viewingIndex > 0) openViewer(visibleEntries[viewingIndex - 1].id); };
  const navigateNext = () => { if (viewingIndex < visibleEntries.length - 1) openViewer(visibleEntries[viewingIndex + 1].id); };

  useFocusEffect(useCallback(() => { loadIndex(); loadFolders(); }, []));

  useEffect(() => {
    if (entries.length === 0) return;
    const entryIds = new Set(entries.map(e => e.id));
    const missing = entries.filter(e => !thumbsRef.current[e.id]);
    const hasStale = Object.keys(thumbsRef.current).some(id => !entryIds.has(id));
    if (missing.length === 0 && !hasStale) return;

    let cancelled = false;
    const load = async () => {
      const result: Record<string, string> = {};
      for (const [id, path] of Object.entries(thumbsRef.current)) {
        if (entryIds.has(id)) result[id] = path;
      }
      for (const e of missing) {
        if (cancelled) return;
        try {
          if (e.mimeType.startsWith('image/')) result[e.id] = await getTempDecryptedPath(e.id);
          else if (e.mimeType.startsWith('video/')) result[e.id] = await getVideoThumbPath(e.id);
        } catch { /* skip */ }
      }
      if (!cancelled) {
        thumbsRef.current = result;
        setThumbs(result);
      }
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
    showSheet({
      title: '還原到相簿',
      message: '還原後是否要從私密相簿中刪除？',
      actions: [
        { label: '還原並保留', onPress: () => doRestore(id, false) },
        { label: '還原並刪除', style: 'destructive', onPress: () => doRestore(id, true) },
      ],
    });
  };

  const doRestore = async (id: string, removeFromVault: boolean) => {
    try {
      const uri = await getTempDecryptedPath(id);
      await MediaLibrary.saveToLibraryAsync(uri);
      if (removeFromVault) { closeViewer(); await removeMedia(id); }
    } catch { Alert.alert('失敗', '還原時發生錯誤'); }
  };

  // ── Item actions ──

  const handleItemLongPress = (id: string) => {
    if (isSelecting) return;
    setSelectedIds(new Set([id]));
  };

  const confirmDelete = (id: string) => {
    showSheet({
      title: '刪除檔案',
      message: '確定要永久刪除這個檔案嗎？',
      actions: [
        {
          label: '永久刪除', style: 'destructive',
          onPress: async () => {
            setThumbs(prev => { const n = { ...prev }; delete n[id]; return n; });
            if (viewingId === id) closeViewer();
            await removeMedia(id);
          },
        },
      ],
    });
  };

  const handleBatchDelete = () => {
    const count = selectedIds.size;
    showSheet({
      title: '刪除檔案',
      message: `確定要永久刪除這 ${count} 個檔案嗎？`,
      actions: [
        {
          label: `永久刪除 ${count} 個`, style: 'destructive',
          onPress: async () => {
            const ids = [...selectedIds];
            exitSelect();
            setThumbs(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n; });
            for (const id of ids) await removeMedia(id);
          },
        },
      ],
    });
  };

  const handleBatchMove = async (targetFolderId: string | null) => {
    const ids = [...selectedIds];
    setMoveModal(false);
    exitSelect();
    for (const id of ids) await moveToFolder(id, targetFolderId);
  };

  const handleBatchRestore = () => {
    const count = selectedIds.size;
    showSheet({
      title: '還原到相簿',
      message: `還原 ${count} 個檔案後，是否從私密相簿中刪除？`,
      actions: [
        { label: '還原並保留', onPress: () => doBatchRestore(false) },
        { label: '還原並刪除', style: 'destructive', onPress: () => doBatchRestore(true) },
      ],
    });
  };

  const doBatchRestore = async (removeFromVault: boolean) => {
    const ids = [...selectedIds];
    exitSelect();
    for (const id of ids) {
      try {
        const uri = await getTempDecryptedPath(id);
        await MediaLibrary.saveToLibraryAsync(uri);
        if (removeFromVault) {
          setThumbs(prev => { const n = { ...prev }; delete n[id]; return n; });
          await removeMedia(id);
        }
      } catch { /* skip failed items */ }
    }
  };

  // ── Folder actions ──

  const handleFolderLongPress = (id: string) => {
    const folder = folders.find(f => f.id === id);
    if (!folder) return;
    setActionFolderId(id);
    setActionFolderName(folder.name);
    setFolderActionVisible(true);
  };

  // ── Render helpers ──

  const renderMediaItem = ({ item }: { item: typeof entries[0] }) => {
    const isSelected = selectedIds.has(item.id);
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => isSelecting ? toggleSelect(item.id) : openViewer(item.id)}
        onLongPress={() => handleItemLongPress(item.id)}
        style={styles.item}
      >
        {thumbs[item.id] ? (
          <View style={[styles.thumb, isSelected && styles.thumbSelected]}>
            <Image source={{ uri: thumbs[item.id] }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            {item.mimeType.startsWith('video/') && !isSelected && (
              <View style={styles.playBadge}><FontAwesome5 name="play" size={10} color="#fff" solid /></View>
            )}
            {isSelected && (
              <View style={styles.selectOverlay}>
                <View style={styles.selectCheck}><FontAwesome5 name="check" size={13} color="#fff" solid /></View>
              </View>
            )}
          </View>
        ) : (
          <View style={[styles.thumb, styles.placeholder, isSelected && styles.thumbSelected]}>
            <FontAwesome5 name={item.mimeType.startsWith('video/') ? 'film' : 'image'} size={32} color="#3a1828" solid />
            {isSelected && (
              <View style={styles.selectOverlay}>
                <View style={styles.selectCheck}><FontAwesome5 name="check" size={13} color="#fff" solid /></View>
              </View>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  type FolderItem = { key: string; kind: 'all' | 'folder'; id?: string; name?: string };
  const folderItems: FolderItem[] = [
    { key: ALL_ID, kind: 'all' },
    ...folders.map(f => ({ key: f.id, kind: 'folder' as const, id: f.id, name: f.name })),
  ];

  const renderFolderItem = ({ item }: { item: FolderItem }) => {
    const isAll = item.kind === 'all';
    const folderId = isAll ? ALL_ID : item.id!;
    const name = isAll ? '全部' : item.name!;
    const count = isAll ? entries.length : entries.filter(e => e.folderId === item.id).length;
    const folder = !isAll ? folders.find(f => f.id === item.id) : null;
    const sourceEntries = isAll ? entries : entries.filter(e => e.folderId === item.id);
    const coverEntry = (folder?.coverId && thumbs[folder.coverId])
      ? { id: folder.coverId }
      : sourceEntries.find(e => thumbs[e.id]);
    const coverUri = coverEntry ? thumbs[coverEntry.id] : null;

    const handleFolderPress = () => {
      if (isEditingFolders) return;
      setCurrentFolderId(folderId);
    };

    const confirmDeleteFolder = () => {
      showSheet({
        title: '刪除資料夾',
        message: `刪除「${name}」後，其中的檔案將移至全部`,
        actions: [{ label: '刪除資料夾', style: 'destructive', onPress: () => deleteFolder(item.id!) }],
      });
    };

    return (
      <TouchableOpacity
        style={styles.folderCard}
        onPress={handleFolderPress}
        onLongPress={!isAll && !isEditingFolders ? () => handleFolderLongPress(item.id!) : undefined}
        activeOpacity={isEditingFolders ? 1 : 0.8}
      >
        {coverUri
          ? <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
          : <FontAwesome5 name={isAll ? 'layer-group' : 'folder'} size={80} color="#c01848" solid />
        }
        <View style={styles.folderCardOverlay} />
        <View style={styles.folderCardFooter}>
          <Text style={styles.folderCardName} numberOfLines={1}>{name}</Text>
          <Text style={styles.folderCardCount}>{count} 個</Text>
        </View>
        {isEditingFolders && !isAll && (
          <TouchableOpacity style={styles.folderDeleteBadge} onPress={confirmDeleteFolder}>
            <FontAwesome5 name="times" size={12} color="#fff" solid />
          </TouchableOpacity>
        )}
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
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {isEditingFolders ? (
              <TouchableOpacity style={styles.addFolderBtn} onPress={() => setIsEditingFolders(false)}>
                <Text style={styles.addFolderBtnText}>完成</Text>
              </TouchableOpacity>
            ) : (
              <>
                <TouchableOpacity style={styles.addFolderBtn} onPress={() => setIsEditingFolders(true)}>
                  <Text style={styles.addFolderBtnText}>編輯</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.addFolderBtn} onPress={() => setNewFolderModal(true)}>
                  <Text style={styles.addFolderBtnText}>＋ 資料夾</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      ) : isSelecting ? (
        <View style={styles.header}>
          <TouchableOpacity onPress={exitSelect} style={styles.selectCancelBtn}>
            <FontAwesome5 name="times" size={20} color="#c01848" solid />
          </TouchableOpacity>
          <Text style={styles.selectCountTitle}>已選 {selectedIds.size} 個</Text>
          <TouchableOpacity onPress={allSelected ? exitSelect : selectAll}>
            <Text style={styles.selectAllBtnText}>{allSelected ? '取消全選' : '全選'}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => setCurrentFolderId(null)}>
            <FontAwesome5 name="chevron-left" size={22} color="#c01848" solid />
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
              onSwipeLeft={navigateNext}
              onSwipeRight={navigatePrev}
            />
          ) : (
            <GestureHandlerRootView style={styles.viewer}>
              <StatusBar hidden />
              <ZoomableImage
                key={viewingUri}
                uri={viewingUri}
                onSwipeLeft={navigateNext}
                onSwipeRight={navigatePrev}
              />
              <TouchableOpacity style={styles.viewerClose} onPress={closeViewer}>
                <FontAwesome5 name="times" size={18} color="#fff" solid />
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

      {/* Selection action bar */}
      {isSelecting && (
        <View style={styles.selectBar}>
          {selectedIds.size === 1 && currentFolderId && currentFolderId !== ALL_ID && (
            <TouchableOpacity style={styles.selectBarBtn} onPress={() => {
              setFolderCover(currentFolderId, [...selectedIds][0]);
              exitSelect();
            }}>
              <Text style={styles.selectBarBtnText}>封面</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.selectBarBtn} onPress={() => setMoveModal(true)}>
            <Text style={styles.selectBarBtnText}>移動</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.selectBarBtn} onPress={handleBatchRestore}>
            <Text style={styles.selectBarBtnText}>還原</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.selectBarBtn, styles.selectBarBtnDelete]} onPress={handleBatchDelete}>
            <Text style={[styles.selectBarBtnText, styles.selectBarBtnDeleteText]}>刪除</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Move modal */}
      <MoveModal
        visible={moveModal}
        folders={folders}
        onSelect={handleBatchMove}
        onClose={() => setMoveModal(false)}
      />

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

      {/* General confirm sheet */}
      <BottomActionSheet
        visible={sheetVisible}
        config={sheetConfig}
        onClose={() => setSheetVisible(false)}
      />

      {/* Folder action sheet */}
      <FolderActionSheet
        visible={folderActionVisible}
        folderName={actionFolderName}
        onRename={() => {
          setFolderActionVisible(false);
          setRenamingFolderId(actionFolderId);
          setRenamingName(actionFolderName);
          setRenameModal(true);
        }}
        onDelete={() => {
          setFolderActionVisible(false);
          showSheet({
            title: '刪除資料夾',
            message: `刪除「${actionFolderName}」後，其中的檔案將移至全部`,
            actions: [{ label: '刪除資料夾', style: 'destructive', onPress: () => deleteFolder(actionFolderId) }],
          });
        }}
        onClose={() => setFolderActionVisible(false)}
      />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#080608' },

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
    backgroundColor: '#140a0e',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  addFolderBtnText: { color: '#c01848', fontSize: 14, fontWeight: '600' },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  backTitle: { color: '#ffffff', fontSize: 24, fontWeight: '700', flexShrink: 1 },

  // Folder grid
  folderGrid: { padding: FOLDER_H_PAD, paddingTop: 8 },
  folderGridRow: { gap: FOLDER_GAP, marginBottom: FOLDER_GAP },
  folderCard: {
    width: FOLDER_CARD_SIZE,
    height: FOLDER_CARD_SIZE,
    backgroundColor: '#140a0e',
    borderRadius: 16,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  folderDeleteBadge: {
    position: 'absolute', top: 6, left: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#ff453a',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 4,
  },
  folderCardOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    height: '45%',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  folderCardFooter: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    padding: 10,
  },
  folderCardName: { color: '#ffffff', fontSize: 14, fontWeight: '600' },
  folderCardCount: { color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 2 },

  // Media grid
  grid: { padding: GAP },
  item: { margin: GAP / 2 },
  thumb: { width: ITEM_SIZE, height: ITEM_SIZE, borderRadius: 4, overflow: 'hidden' },
  placeholder: { backgroundColor: '#140a0e', alignItems: 'center', justifyContent: 'center' },
  playBadge: {
    position: 'absolute', bottom: 4, left: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10, paddingHorizontal: 5, paddingVertical: 2,
  },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { color: '#9a6b7a', fontSize: 18 },
  hint: { color: '#3a1828', fontSize: 14, marginTop: 8 },

  // Viewer
  viewer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
  viewerImage: { width: '100%', height: '100%' },
  viewerClose: {
    position: 'absolute', top: 48, right: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 20, width: 40, height: 40,
    alignItems: 'center', justifyContent: 'center',
  },
  viewerActions: {
    position: 'absolute', bottom: 90, left: 20, right: 20,
    flexDirection: 'row', gap: 10,
  },
  viewerActionDelete: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: 'rgba(20,8,14,0.92)',
    borderWidth: 1, borderColor: 'rgba(255,69,58,0.35)',
  },
  viewerActionDeleteText: { color: '#ff453a', fontSize: 15, fontWeight: '600' },
  viewerActionRestore: {
    flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 14, borderRadius: 16,
    backgroundColor: '#c01848',
  },
  viewerActionRestoreText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Selection
  thumbSelected: { opacity: 0.75 },
  selectOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(192,24,72,0.35)',
    alignItems: 'flex-end', justifyContent: 'flex-end',
    padding: 4,
  },
  selectCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#c01848', alignItems: 'center', justifyContent: 'center',
  },
  selectCancelBtn: { paddingRight: 12 },
  selectCountTitle: { color: '#fff', fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },
  selectAllBtnText: { color: '#c01848', fontSize: 15, fontWeight: '600' },
  selectBar: {
    flexDirection: 'row',
    backgroundColor: '#140a0e',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#28101c',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 10,
    justifyContent: 'flex-end',
  },
  selectBarBtn: {
    backgroundColor: '#28101c',
    borderRadius: 14, paddingHorizontal: 20, paddingVertical: 10,
  },
  selectBarBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  selectBarBtnDelete: { backgroundColor: 'rgba(255,69,58,0.15)' },
  selectBarBtnDeleteText: { color: '#ff453a' },

  // Move modal
  moveModalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  moveModalSheet: {
    backgroundColor: '#140a0e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingTop: 20, paddingBottom: 40, maxHeight: '60%',
  },
  moveModalTitle: {
    color: '#9a6b7a', fontSize: 13, fontWeight: '600',
    textTransform: 'uppercase', textAlign: 'center',
    marginBottom: 8, letterSpacing: 0.5,
  },
  moveModalOption: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#28101c',
  },
  moveModalOptionText: { color: '#fff', fontSize: 16 },
  moveModalCancelBtn: {
    marginTop: 8, marginHorizontal: 16, borderRadius: 14,
    backgroundColor: '#28101c', paddingVertical: 14, alignItems: 'center',
  },
  moveModalCancelText: { color: '#9a6b7a', fontSize: 16, fontWeight: '600' },

  // Modal
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#140a0e', borderRadius: 16,
    padding: 24, width: width * 0.8, gap: 16,
  },
  modalTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  modalInput: {
    backgroundColor: '#080608', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#fff', fontSize: 16,
    borderWidth: 1, borderColor: '#3a1828',
  },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#28101c', alignItems: 'center',
  },
  modalCancelText: { color: '#9a6b7a', fontSize: 15 },
  modalConfirm: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    backgroundColor: '#c01848', alignItems: 'center',
  },
  modalConfirmText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  // Folder action sheet
  folderActionBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
  folderActionSheet: {
    backgroundColor: '#140a0e',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 40, paddingTop: 12,
  },
  folderActionHandle: {
    width: 36, height: 4, borderRadius: 2,
    backgroundColor: '#3a1828', alignSelf: 'center', marginBottom: 16,
  },
  folderActionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 24, paddingBottom: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#28101c',
  },
  folderActionName: { color: '#fff', fontSize: 16, fontWeight: '600', flex: 1 },
  folderActionRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#28101c',
  },
  folderActionIconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: 'rgba(192,24,72,0.12)',
    alignItems: 'center', justifyContent: 'center',
  },
  folderActionIconWrapRed: { backgroundColor: 'rgba(255,69,58,0.12)' },
  folderActionRowText: { color: '#fff', fontSize: 16, flex: 1 },
  folderActionRowTextRed: { color: '#ff453a' },
  folderActionCancelBtn: {
    marginHorizontal: 16, marginTop: 12, borderRadius: 14,
    backgroundColor: '#28101c', paddingVertical: 14, alignItems: 'center',
  },
  folderActionCancelText: { color: '#9a6b7a', fontSize: 16, fontWeight: '600' },
});
