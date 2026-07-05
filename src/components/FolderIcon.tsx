import { View } from 'react-native';

type Props = { size?: number; all?: boolean };

// Pure-View folder shape — no native libs needed, fully themeable.
// `all` renders a slightly muted shade to distinguish the "all photos" bucket.
export function FolderIcon({ size = 60, all = false }: Props) {
  const w = Math.round(size * 1.3);
  const h = size;
  const tabW = Math.round(w * 0.44);
  const tabH = Math.round(h * 0.22);
  const bodyTop = Math.round(h * 0.16); // body overlaps tab bottom for seamless join
  const r = Math.round(h * 0.12);
  const tabColor = all ? '#6a1028' : '#8a0f32';
  const bodyColor = all ? '#7a1430' : '#c01848';

  return (
    <View style={{ width: w, height: h }}>
      {/* tab */}
      <View style={{
        position: 'absolute', top: 0, left: 0,
        width: tabW, height: tabH,
        backgroundColor: tabColor,
        borderTopLeftRadius: r, borderTopRightRadius: r,
      }} />
      {/* body — top-left squared so it merges flush with tab */}
      <View style={{
        position: 'absolute', top: bodyTop, left: 0, right: 0,
        height: h - bodyTop,
        backgroundColor: bodyColor,
        borderRadius: r, borderTopLeftRadius: 0,
      }} />
    </View>
  );
}
