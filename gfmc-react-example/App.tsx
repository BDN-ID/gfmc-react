/**
 * gfmc-react-example
 * Dashboard/playground sederhana untuk uji coba library `gfmc_react`.
 * Semua interaksi dengan SDK dilakukan lewat hook `useGfmcSdk()`,
 * bukan lewat pemanggilan `GfmcReact` langsung — sesuai contoh
 * pemakaian hook yang idiomatic di React.
 */
import React, {useCallback, useState} from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {GfmcEnv, useGfmcSdk} from 'gfmc_react';

/** Tambahkan satu baris ke panel log dengan timestamp jam:menit:detik. */
function timestamp(): string {
  return new Date().toLocaleTimeString();
}

// Base URL dummy API Jessica + akun uji yang sudah disediakan, supaya
// tombol Quick Login di bawah bisa langsung dipakai tanpa input manual.
const API_BASE_URL = 'https://jessica-dummy-api.bdn.id/api/v1';
const QUICK_LOGIN_USERNAME = 'zaki@bdn.id';
const QUICK_LOGIN_PASSWORD = 'TechBdn123!';

type AuthTokenData = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
};

type MinicinemaTokenData = {
  token_type: string;
  token: string;
  refresh_token: string;
  expires_at: string;
};

/** Potong token panjang jadi ringkas buat ditampilkan di UI. */
function shortenToken(token: string | null): string {
  if (!token) {
    return '(belum ada)';
  }
  return `${token.slice(0, 16)}...${token.slice(-8)}`;
}

function App(): React.JSX.Element {
  const gfmc = useGfmcSdk();

  const [enableLogging, setEnableLogging] = useState(false);
  const [jwtInput, setJwtInput] = useState('');
  const [refresherRegistered, setRefresherRegistered] = useState(false);
  const [skuListenerRegistered, setSkuListenerRegistered] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);

  // Quick Login (akun dummy) + MiniCinema token state.
  const [authAccessToken, setAuthAccessToken] = useState<string | null>(null);
  const [authRefreshToken, setAuthRefreshToken] = useState<string | null>(
    null,
  );
  const [minicinemaToken, setMinicinemaToken] = useState<string | null>(null);
  const [minicinemaRefreshToken, setMinicinemaRefreshToken] = useState<
    string | null
  >(null);

  const addLog = useCallback((message: string) => {
    setLogs(prev => [`[${timestamp()}] ${message}`, ...prev]);
  }, []);

  // Catatan: production host gfmc-sdk 1.2.9 sedang down, jadi dashboard ini
  // sengaja selalu init dengan GfmcEnv.SANDBOX (bukan PRODUCTION) sampai
  // production tersedia lagi.
  const handleInit = useCallback(async () => {
    addLog(`Init SDK diminta (env=SANDBOX, enableLogging=${enableLogging})...`);
    try {
      await gfmc.init(GfmcEnv.SANDBOX, enableLogging);
      addLog('Init SDK sukses.');
    } catch (e) {
      addLog(`Init SDK gagal: ${String(e)}`);
    }
  }, [gfmc, enableLogging, addLog]);

  // Kontrak hook tidak menyediakan fungsi refresh versi terpisah — versi
  // di-refresh dengan menjalankan ulang init (yang di dalamnya mengisi
  // ulang state `version`). Ini dipakai sebagai tombol "refresh manual".
  const handleRefreshVersion = useCallback(async () => {
    addLog('Refresh versi SDK (via re-init)...');
    try {
      await gfmc.init(GfmcEnv.SANDBOX, enableLogging);
      addLog('Refresh versi selesai.');
    } catch (e) {
      addLog(`Refresh versi gagal: ${String(e)}`);
    }
  }, [gfmc, enableLogging, addLog]);

  const handleSetTokenRefresher = useCallback(() => {
    gfmc.setTokenRefresher(async () => {
      addLog('Native meminta token refresh (token refresh requested).');
      const dummyJwt = 'dummy-jwt-' + Date.now();
      addLog(`Mengirim dummy JWT: ${dummyJwt}`);
      return dummyJwt;
    });
    setRefresherRegistered(true);
    addLog('Token refresher callback terdaftar.');
  }, [gfmc, addLog]);

  const handleSetSkuListener = useCallback(() => {
    gfmc.setSkuListener((sku: string) => {
      addLog(`SKU terpilih (sku selected): ${sku}`);
    });
    setSkuListenerRegistered(true);
    addLog('SKU listener callback terdaftar.');
  }, [gfmc, addLog]);

  // Quick Login: login pakai akun dummy yang sudah disediakan (tanpa input
  // manual), simpan access_token + refresh_token dari auth/login.
  const handleQuickLogin = useCallback(async () => {
    addLog(`Quick Login sebagai ${QUICK_LOGIN_USERNAME}...`);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: QUICK_LOGIN_USERNAME,
          password: QUICK_LOGIN_PASSWORD,
        }),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {data: AuthTokenData};
      setAuthAccessToken(json.data.access_token);
      setAuthRefreshToken(json.data.refresh_token);
      addLog('Quick Login sukses, access_token & refresh_token tersimpan.');
    } catch (e) {
      addLog(`Quick Login gagal: ${String(e)}`);
    }
  }, [addLog]);

  // Ambil token MiniCinema pakai access_token hasil Quick Login, lalu
  // langsung isi field JWT session di section Open Hub.
  const handleGetMinicinemaToken = useCallback(async () => {
    if (!authAccessToken) {
      addLog('Get MiniCinema Token dibatalkan: belum Quick Login.');
      return;
    }
    addLog('Meminta token MiniCinema...');
    try {
      const res = await fetch(`${API_BASE_URL}/minicinema/token`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          Authorization: `Bearer ${authAccessToken}`,
        },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {data: MinicinemaTokenData};
      setMinicinemaToken(json.data.token);
      setMinicinemaRefreshToken(json.data.refresh_token);
      setJwtInput(json.data.token);
      addLog('Token MiniCinema didapat & JWT session diisi otomatis.');
    } catch (e) {
      addLog(`Get MiniCinema Token gagal: ${String(e)}`);
    }
  }, [authAccessToken, addLog]);

  // Refresh access_token auth pakai refresh_token hasil Quick Login.
  const handleRefreshAuth = useCallback(async () => {
    if (!authRefreshToken) {
      addLog('Refresh Auth dibatalkan: belum ada refresh_token.');
      return;
    }
    addLog('Refresh auth token...');
    try {
      const res = await fetch(`${API_BASE_URL}/auth/refresh`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({refresh_token: authRefreshToken}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {data: AuthTokenData};
      setAuthAccessToken(json.data.access_token);
      setAuthRefreshToken(json.data.refresh_token);
      addLog('Refresh auth token sukses.');
    } catch (e) {
      addLog(`Refresh Auth gagal: ${String(e)}`);
    }
  }, [authRefreshToken, addLog]);

  // Refresh token MiniCinema pakai refresh_token hasil Get MiniCinema Token.
  const handleRefreshMinicinema = useCallback(async () => {
    if (!minicinemaRefreshToken) {
      addLog('Refresh MiniCinema dibatalkan: belum ada refresh_token.');
      return;
    }
    addLog('Refresh token MiniCinema...');
    try {
      const res = await fetch(`${API_BASE_URL}/minicinema/refresh`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({refresh_token: minicinemaRefreshToken}),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const json = (await res.json()) as {data: MinicinemaTokenData};
      setMinicinemaToken(json.data.token);
      setMinicinemaRefreshToken(json.data.refresh_token);
      setJwtInput(json.data.token);
      addLog('Refresh token MiniCinema sukses & JWT session diperbarui.');
    } catch (e) {
      addLog(`Refresh MiniCinema gagal: ${String(e)}`);
    }
  }, [minicinemaRefreshToken, addLog]);

  const handleOpenHub = useCallback(async () => {
    if (!jwtInput.trim()) {
      addLog('Open Hub dibatalkan: JWT session masih kosong.');
      return;
    }
    addLog('Open Hub dipanggil...');
    try {
      await gfmc.open(jwtInput.trim());
      addLog('Open Hub sukses.');
    } catch (e) {
      addLog(`Open Hub gagal: ${String(e)}`);
    }
  }, [gfmc, jwtInput, addLog]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="dark-content" />
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>gfmc-react-example</Text>
        <Text style={styles.subtitle}>
          Playground/dashboard untuk uji coba library gfmc_react
        </Text>

        {/* Section: Init SDK */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>1. Init SDK</Text>
          <Text style={styles.note}>
            Catatan: production host gfmc-sdk 1.2.9 sedang down, dashboard ini
            pakai GfmcEnv.SANDBOX.
          </Text>
          <View style={styles.row}>
            <Text style={styles.label}>Enable Logging</Text>
            <Switch value={enableLogging} onValueChange={setEnableLogging} />
          </View>
          <TouchableOpacity style={styles.button} onPress={handleInit}>
            <Text style={styles.buttonText}>Init SDK</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Versi SDK */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>2. Versi SDK</Text>
          <Text style={styles.label}>
            Versi: {gfmc.version ?? '(belum diketahui)'}
          </Text>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleRefreshVersion}>
            <Text style={styles.buttonText}>Refresh Versi</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Token Refresher */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>3. Token Refresher</Text>
          <Text style={styles.label}>
            Status: {refresherRegistered ? 'terdaftar' : 'belum terdaftar'}
          </Text>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleSetTokenRefresher}>
            <Text style={styles.buttonText}>Set Token Refresher</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Sku Listener */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>4. Sku Listener</Text>
          <Text style={styles.label}>
            Status: {skuListenerRegistered ? 'terdaftar' : 'belum terdaftar'}
          </Text>
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleSetSkuListener}>
            <Text style={styles.buttonText}>Set Sku Listener</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Quick Login + MiniCinema Token */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>
            5. Quick Login (akun dummy) + MiniCinema
          </Text>
          <Text style={styles.note}>
            Pakai akun uji {QUICK_LOGIN_USERNAME} yang sudah disediakan, tidak
            perlu input manual.
          </Text>
          <Text style={styles.label}>
            Auth access_token: {shortenToken(authAccessToken)}
          </Text>
          <Text style={styles.label}>
            MiniCinema token: {shortenToken(minicinemaToken)}
          </Text>
          <TouchableOpacity style={styles.button} onPress={handleQuickLogin}>
            <Text style={styles.buttonText}>Quick Login</Text>
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity
            style={styles.button}
            onPress={handleGetMinicinemaToken}>
            <Text style={styles.buttonText}>Get MiniCinema Token</Text>
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleRefreshAuth}>
            <Text style={styles.buttonText}>Refresh Auth Token</Text>
          </TouchableOpacity>
          <View style={styles.spacer} />
          <TouchableOpacity
            style={styles.buttonSecondary}
            onPress={handleRefreshMinicinema}>
            <Text style={styles.buttonText}>Refresh MiniCinema Token</Text>
          </TouchableOpacity>
        </View>

        {/* Section: Open Hub */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>6. Open Hub</Text>
          <TextInput
            style={styles.input}
            placeholder="Masukkan JWT session..."
            value={jwtInput}
            onChangeText={setJwtInput}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
          <TouchableOpacity style={styles.button} onPress={handleOpenHub}>
            <Text style={styles.buttonText}>Open Hub</Text>
          </TouchableOpacity>
        </View>

        {/* Error panel */}
        {gfmc.lastError && (
          <View style={styles.errorBox}>
            <Text style={styles.errorTitle}>
              Error: {gfmc.lastError.code}
            </Text>
            <Text style={styles.errorMessage}>{gfmc.lastError.message}</Text>
          </View>
        )}

        {/* Log panel */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Log / Event</Text>
          <ScrollView style={styles.logBox} nestedScrollEnabled>
            {logs.length === 0 ? (
              <Text style={styles.logEmpty}>Belum ada event.</Text>
            ) : (
              logs.map((line, index) => (
                <Text key={index} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </ScrollView>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  container: {
    padding: 16,
    paddingBottom: 32,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1a1a1a',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 16,
  },
  section: {
    backgroundColor: '#ffffff',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
    color: '#1a1a1a',
  },
  note: {
    fontSize: 11,
    color: '#8a6d00',
    marginBottom: 8,
    fontStyle: 'italic',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  label: {
    fontSize: 13,
    color: '#333',
    marginBottom: 8,
  },
  button: {
    backgroundColor: '#2f6feb',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#555555',
    paddingVertical: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  spacer: {
    height: 8,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '600',
    fontSize: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#cccccc',
    borderRadius: 6,
    padding: 10,
    fontSize: 13,
    minHeight: 60,
    textAlignVertical: 'top',
    marginBottom: 10,
    backgroundColor: '#fafafa',
  },
  errorBox: {
    backgroundColor: '#fdeaea',
    borderWidth: 1,
    borderColor: '#e53935',
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorTitle: {
    color: '#c62828',
    fontWeight: '700',
    marginBottom: 4,
  },
  errorMessage: {
    color: '#c62828',
  },
  logBox: {
    maxHeight: 220,
    backgroundColor: '#0f172a',
    borderRadius: 6,
    padding: 8,
  },
  logEmpty: {
    color: '#94a3b8',
    fontSize: 12,
    fontStyle: 'italic',
  },
  logLine: {
    color: '#e2e8f0',
    fontSize: 11,
    marginBottom: 4,
    fontFamily: 'monospace',
  },
});

export default App;
