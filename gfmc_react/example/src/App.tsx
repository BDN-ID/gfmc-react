import { useEffect, useState } from 'react';
import {
  Button,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';
import { GfmcEnv, useGfmcSdk } from 'gfmc_react';

// Contoh JWT dummy, ganti dengan JWT asli dari backend BDN-ID saat integrasi sungguhan.
const DUMMY_JWT = 'replace-with-real-jwt';

export default function App() {
  const { init, open, version, setTokenRefresher, setSkuListener, lastError } =
    useGfmcSdk();
  const [status, setStatus] = useState('idle');

  useEffect(() => {
    // WAJIB pakai SANDBOX: host PRODUCTION gfmc-sdk 1.2.9 belum bisa diakses.
    init(GfmcEnv.SANDBOX, true)
      .then(() => setStatus('initialized'))
      .catch(() => setStatus('init-failed'));

    setTokenRefresher(async () => {
      // TODO: ganti dengan pemanggilan API refresh token yang sebenarnya.
      return DUMMY_JWT;
    });

    setSkuListener((sku) => {
      console.log('SKU selected:', sku);
    });
  }, [init, setSkuListener, setTokenRefresher]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text>Status: {status}</Text>
        <Text>SDK version: {version ?? '-'}</Text>
        {lastError ? (
          <Text style={styles.error}>
            Error [{lastError.code}]: {lastError.message}
          </Text>
        ) : null}
        <Button title="Open GFMC Hub" onPress={() => open(DUMMY_JWT)} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 16,
  },
  error: {
    color: 'red',
  },
});
