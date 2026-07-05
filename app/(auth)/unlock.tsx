import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useAuthStore } from '../../src/store/authStore';
import { useBiometrics } from '../../src/hooks/useBiometrics';

type Mode = 'enter' | 'setup' | 'confirm' | 'biometric';

const PIN_LENGTH = 6;

export default function UnlockScreen() {
  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<Mode>('enter');
  const [pendingPin, setPendingPin] = useState('');
  const [loading, setLoading] = useState(false);

  const {
    hasPin, checkHasPin, setupPin, authenticate,
    authenticateWithBiometric, biometricEnabled, loadBiometricPreference,
  } = useAuthStore();
  const { isAvailable, authenticate: biometricAuth } = useBiometrics();
  const [initialized, setInitialized] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  useEffect(() => {
    Promise.all([checkHasPin(), loadBiometricPreference()]).then(() => {
      setInitialized(true);
    });
  }, []);

  useEffect(() => {
    if (!initialized) return;
    if (!hasPin) {
      setMode('setup');
      return;
    }
    isAvailable().then((available) => {
      setBiometricAvailable(available);
      if (biometricEnabled && available) {
        setMode('biometric');
        triggerBiometric();
      } else {
        setMode('enter');
      }
    });
  }, [initialized, hasPin, biometricEnabled]);

  const triggerBiometric = async () => {
    setLoading(true);
    const success = await biometricAuth();
    if (success) {
      await authenticateWithBiometric();
    }
    setLoading(false);
  };

  const handleDigit = (digit: string) => {
    if (pin.length >= PIN_LENGTH) return;
    const next = pin + digit;
    setPin(next);
    if (next.length === PIN_LENGTH) handleSubmit(next);
  };

  const handleDelete = () => setPin((p) => p.slice(0, -1));

  const handleSubmit = async (submittedPin: string) => {
    if (mode === 'setup') {
      setPendingPin(submittedPin);
      setMode('confirm');
      setPin('');
      return;
    }

    if (mode === 'confirm') {
      if (submittedPin !== pendingPin) {
        Alert.alert('PIN 碼不相符', '請重新設定');
        setMode('setup');
        setPendingPin('');
        setPin('');
        return;
      }
      setLoading(true);
      await setupPin(pendingPin);
      await authenticate(pendingPin);
      setLoading(false);
      return;
    }

    // mode === 'enter'
    setLoading(true);
    const result = await authenticate(submittedPin);
    setLoading(false);

    if (result === 'invalid') {
      Alert.alert('PIN 碼錯誤', '請重試');
      setPin('');
    }
  };

  const title =
    mode === 'setup' ? '設定 PIN 碼' :
    mode === 'confirm' ? '確認 PIN 碼' :
    mode === 'biometric' ? '生物辨識解鎖' :
    '輸入 PIN 碼';

  const subtitle =
    mode === 'setup' ? '請設定 6 位數 PIN 碼' :
    mode === 'confirm' ? '再輸入一次確認' :
    mode === 'biometric' ? '請使用指紋或臉部辨識解鎖' :
    '';

  if (mode === 'biometric') {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>
        {loading ? (
          <ActivityIndicator size="large" color="#c01848" style={{ marginTop: 48 }} />
        ) : (
          <TouchableOpacity style={styles.biometricBtn} onPress={triggerBiometric}>
            <FontAwesome5 name="fingerprint" size={64} color="#c01848" solid />
            <Text style={styles.biometricText}>點此再次觸發辨識</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.switchBtn} onPress={() => setMode('enter')}>
          <Text style={styles.switchText}>改用 PIN 碼</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}

      <View style={styles.dots}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => (
          <View key={i} style={[styles.dot, i < pin.length && styles.dotFilled]} />
        ))}
      </View>

      {loading ? (
        <ActivityIndicator size="large" color="#c01848" style={{ marginTop: 40 }} />
      ) : (
        <View style={styles.keypad}>
          {['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'].map((key, i) => (
            <TouchableOpacity
              key={i}
              style={[styles.key, key === '' && styles.keyInvisible]}
              onPress={() => {
                if (key === '⌫') handleDelete();
                else if (key) handleDigit(key);
              }}
              disabled={key === ''}
            >
              <Text style={styles.keyText}>{key}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {mode === 'enter' && biometricEnabled && biometricAvailable && (
        <TouchableOpacity style={styles.switchBtn} onPress={() => { setMode('biometric'); triggerBiometric(); }}>
          <Text style={styles.switchText}>改用生物辨識</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080608',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  title: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '600',
    marginBottom: 8,
  },
  subtitle: {
    color: '#9a6b7a',
    fontSize: 14,
    marginBottom: 8,
  },
  dots: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 48,
  },
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#3a1828',
  },
  dotFilled: {
    backgroundColor: '#c01848',
    borderColor: '#c01848',
  },
  keypad: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: 280,
    gap: 16,
    justifyContent: 'center',
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#140a0e',
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyInvisible: {
    backgroundColor: 'transparent',
  },
  keyText: {
    color: '#ffffff',
    fontSize: 26,
    fontWeight: '400',
  },
  biometricBtn: {
    marginTop: 48,
    alignItems: 'center',
    gap: 12,
  },
  biometricText: { color: '#9a6b7a', fontSize: 15 },
  switchBtn: { marginTop: 32 },
  switchText: { color: '#c01848', fontSize: 15 },
});
