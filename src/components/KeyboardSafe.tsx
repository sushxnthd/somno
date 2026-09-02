import React, { PropsWithChildren } from 'react';
import { KeyboardAvoidingView, Platform, StyleProp, ViewStyle } from 'react-native';

/**
 * Lifts a screen clear of the software keyboard.
 *
 * The design is a web mockup, so nothing in it accounts for a keyboard covering the bottom
 * two-fifths of the screen — but on a phone, tapping the password field on the sign-up screen
 * hides the "Create account" button underneath it, and the same is true of the feedback form and
 * the lesson assistant. The behaviour differs by platform: iOS reports the keyboard frame and
 * wants `padding`, Android resizes the window itself and wants `height`.
 */
export function KeyboardSafe({
  children,
  style,
  offset = 0,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; offset?: number }>) {
  return (
    <KeyboardAvoidingView
      style={[{ flex: 1 }, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={offset}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
