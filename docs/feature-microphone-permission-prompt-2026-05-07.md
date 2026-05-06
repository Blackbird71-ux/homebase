# Microphone Permission Prompt

**Date**: 2026-05-07  
**Type**: Feature Enhancement  
**Status**: Complete

## Summary

Added a cross-platform microphone permission prompt system that handles permission requests for Windows, macOS, iOS, and Android. The prompt integrates with the existing AI Assistant voice feature to ensure users can grant microphone access before attempting speech recognition.

## Files Created

### `src/lib/hooks/useMicrophonePermission.ts`
Custom React hook providing:
- **Platform detection**: Identifies Windows, macOS, iOS, Android, Linux
- **Permission state management**: Tracks `loading`, `prompt`, `granted`, `denied`, `unavailable` states
- **Permissions API integration**: Uses `navigator.permissions.query({ name: 'microphone' })` where supported, with graceful fallback
- **`getUserMedia` request**: Calls `navigator.mediaDevices.getUserMedia({ audio: true })` to request access, immediately stopping tracks after permission is obtained
- **Error handling**: Categorizes errors as `NotAllowedError` (denied), `NotFoundError` (no mic), or generic denial
- **Dismiss persistence**: Stores "don't ask again" preference in localStorage

### `src/components/shared/MicrophonePermissionPrompt.tsx`
Reusable dialog component with:
- **Platform-specific messaging**: Custom instructions for each platform
- **Two-stage flow**: Initial prompt → if denied, shows recovery instructions
- **Grant Access button**: Triggers `getUserMedia` permission request
- **Not Now option**: Dismisses without persisting
- **Dismiss option**: Persists "don't ask again" preference
- **Try Again flow**: After denial, user can retry or see platform-specific recovery steps
- **Auto-show logic**: Automatically displays when permission state is `prompt` or `denied`

## Files Modified

### `src/components/ai/AIAssistant.tsx`
- Added `MicrophonePermissionPrompt` component to the render tree
- Added `useMicrophonePermission` hook to check permission state
- Updated `toggleMic()` to check permission state before starting speech recognition:
  - If `granted` → starts listening directly
  - If `prompt` or `denied` → the `MicrophonePermissionPrompt` auto-shows
- On permission granted → automatically starts speech recognition

## Platform-Specific Instructions

| Platform | Initial Prompt | Denied Recovery |
|----------|---------------|-----------------|
| **Windows** | Browser address bar permission prompt | Click lock icon → find Microphone → Allow → Reload |
| **macOS** | Browser permission prompt | System Settings → Privacy & Security → Microphone → Enable browser |
| **iOS** | Safari permission prompt | Settings → Safari → Microphone, or Settings → Privacy → Microphone → Enable Safari |
| **Android** | Chrome permission dialog | Tap lock icon → Permissions → Microphone → Allow → Reload |
| **Linux** | Browser permission prompt | Check browser & system audio settings |
| **Unknown** | Browser permission prompt | Check browser & system privacy settings |

## Technical Details

- Uses `navigator.mediaDevices.getUserMedia({ audio: true })` — works on all three target platforms
- iOS Safari requires user gesture (click/tap) to call `getUserMedia` — satisfied by the "Grant Access" button click
- `getUserMedia` must be served over HTTPS or localhost
- Permissions API (`navigator.permissions.query`) is used for initial state check but falls back to `prompt` if unsupported
- Permission state changes are listened to via the Permissions API `change` event
- All tracks from `getUserMedia` are stopped immediately after permission is obtained (no unnecessary audio streaming)
