import type { ComponentType } from 'react';
import type { ScreenId } from '../store/types';

// Splash / auth
import { SplashScreen } from '../screens/auth/SplashScreen';
import { AU1Screen } from '../screens/auth/AU1Screen';
import { AU2Screen } from '../screens/auth/AU2Screen';
import { AU3Screen } from '../screens/auth/AU3Screen';
import { AU4Screen } from '../screens/auth/AU4Screen';
import { AU5Screen } from '../screens/auth/AU5Screen';

// Onboarding
import { A1Screen } from '../screens/onboarding/A1Screen';
import { A2Screen } from '../screens/onboarding/A2Screen';
import { A3Screen } from '../screens/onboarding/A3Screen';
import { A4Screen } from '../screens/onboarding/A4Screen';
import { A5Screen } from '../screens/onboarding/A5Screen';
import { PVTScreen } from '../screens/onboarding/PVTScreen';
import { ScanScreen } from '../screens/onboarding/ScanScreen';
import { ScanErrScreen } from '../screens/onboarding/ScanErrScreen';
import { A8Screen } from '../screens/onboarding/A8Screen';
import { A9Screen } from '../screens/onboarding/A9Screen';

// Home
import { HomeScreen } from '../screens/home/HomeScreen';

// Check-in
import { C1Screen } from '../screens/checkin/C1Screen';
import { C4Screen } from '../screens/checkin/C4Screen';
import { C5Screen } from '../screens/checkin/C5Screen';
import { CLogScreen } from '../screens/checkin/CLogScreen';

// Recovery
import { DScreen } from '../screens/recovery/DScreen';
import { DLScreen } from '../screens/recovery/DLScreen';
import { DDScreen } from '../screens/recovery/DDScreen';

// Trends
import { EScreen } from '../screens/trends/EScreen';

// Settings
import { F0Screen } from '../screens/settings/F0Screen';
import { F1Screen } from '../screens/settings/F1Screen';
import { F2Screen } from '../screens/settings/F2Screen';
import { F3Screen } from '../screens/settings/F3Screen';
import { F4Screen } from '../screens/settings/F4Screen';
import { F4EScreen } from '../screens/settings/F4EScreen';
import { F4SScreen } from '../screens/settings/F4SScreen';
import { F5Screen } from '../screens/settings/F5Screen';
import { F6Screen } from '../screens/settings/F6Screen';
import { F7Screen } from '../screens/settings/F7Screen';
import { F8Screen } from '../screens/settings/F8Screen';
import { FNScreen } from '../screens/settings/FNScreen';
import { F9Screen } from '../screens/settings/F9Screen';
import { F9EScreen } from '../screens/settings/F9EScreen';
import { W1Screen } from '../screens/settings/W1Screen';

// Alarm interstitial
import { G1Screen } from '../screens/alarm/G1Screen';
import { G3Screen } from '../screens/alarm/G3Screen';

export const SCREENS: Record<ScreenId, ComponentType> = {
  SPLASH: SplashScreen,
  AU1: AU1Screen,
  AU2: AU2Screen,
  AU3: AU3Screen,
  AU4: AU4Screen,
  AU5: AU5Screen,
  A1: A1Screen,
  A2: A2Screen,
  A3: A3Screen,
  A4: A4Screen,
  A5: A5Screen,
  PVT: PVTScreen,
  SCAN: ScanScreen,
  SCANERR: ScanErrScreen,
  A8: A8Screen,
  A9: A9Screen,
  B: HomeScreen,
  C1: C1Screen,
  C4: C4Screen,
  C5: C5Screen,
  CLOG: CLogScreen,
  D: DScreen,
  DL: DLScreen,
  DD: DDScreen,
  E: EScreen,
  F0: F0Screen,
  F1: F1Screen,
  F2: F2Screen,
  F3: F3Screen,
  F4: F4Screen,
  F4E: F4EScreen,
  F4S: F4SScreen,
  F5: F5Screen,
  F6: F6Screen,
  F7: F7Screen,
  F8: F8Screen,
  FN: FNScreen,
  F9: F9Screen,
  F9E: F9EScreen,
  W1: W1Screen,
  G1: G1Screen,
  G3: G3Screen,
};

export const TAB_SCREENS: ScreenId[] = ['B', 'C1', 'D', 'DL', 'E'];
