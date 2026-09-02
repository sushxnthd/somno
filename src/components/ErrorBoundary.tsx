import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { color, font } from '../theme/tokens';
import { recordDiagnostic } from '../lib/diagnostics';

/**
 * The last line of defence: a render error becomes a screen the user can act on, not a white void.
 *
 * Without this, one bad value in one component unmounts the whole tree and the app appears to
 * die — on Android that is a blank activity the user can only force-quit, and it looks identical
 * to a crash in Play's vitals while being entirely recoverable.
 *
 * Recovery is deliberately in-app: the local data is untouched by a render fault, so remounting the
 * tree almost always brings everything back, and it costs the user nothing to try. The detail is
 * shown rather than hidden because nothing is sent anywhere: the fault is written to the device's
 * own diagnostics log, and Help & feedback is where the user can read it back or hand it over.
 */
interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[somno] render error', error, info.componentStack);
    // A console line exists only while a laptop is attached. This is the copy that survives the
    // user closing the app, and the only one they can hand over from Help & feedback.
    recordDiagnostic({
      kind: 'render',
      message: error.message || String(error),
      stack: error.stack ?? info.componentStack ?? undefined,
    });
  }

  private reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.root}>
        <View style={styles.card}>
          <Text style={styles.title}>Something went wrong</Text>
          <Text style={styles.body}>
            Your check-ins, sleep entries and baseline are safe on this device — this is the screen
            failing to draw, not your data.
          </Text>
          <Text style={styles.detail} numberOfLines={4}>
            {error.message || String(error)}
          </Text>
          <Pressable onPress={this.reset} style={styles.button} accessibilityRole="button">
            <Text style={styles.buttonText}>Try again</Text>
          </Pressable>
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', padding: 28 },
  card: {
    width: '100%',
    gap: 12,
    padding: 22,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  title: { fontFamily: font.serif, fontSize: 28, lineHeight: 32, color: color.text },
  body: { fontFamily: font.sans500, fontSize: 13.5, lineHeight: 20, color: color.textDim55 },
  detail: { fontFamily: font.sans500, fontSize: 11, lineHeight: 15, color: color.textDim35 },
  button: {
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.92)',
    marginTop: 4,
  },
  buttonText: { fontFamily: font.sans700, fontSize: 14.5, color: '#1A1330' },
});
