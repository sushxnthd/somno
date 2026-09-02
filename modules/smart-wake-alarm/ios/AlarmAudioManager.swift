import AVFoundation

/// Keeps a looping alarm tone playing via the `audio` UIBackgroundMode (declared in Info.plist
/// by plugins/withSmartWakeAlarm.js) — the standard mechanism third-party iOS alarm apps use to
/// outlast the ~30s cap on a notification's own sound. Only reliable while the process is still
/// alive in the background (see the platform-limitation note in SmartWakeAlarmModule.swift).
final class AlarmAudioManager {
  static let shared = AlarmAudioManager()
  private var player: AVAudioPlayer?

  private init() {}

  func startLoopingAlarmTone(fileName: String = "alarm_tone") {
    do {
      let session = AVAudioSession.sharedInstance()
      try session.setCategory(.playback, options: [.mixWithOthers])
      try session.setActive(true)

      guard let url = Bundle.main.url(forResource: fileName, withExtension: "caf")
        ?? Bundle.main.url(forResource: fileName, withExtension: "mp3") else {
        print("[SmartWakeAlarm] no bundled alarm tone found (expected \(fileName).caf/.mp3) — add one to the iOS app bundle for a real build.")
        return
      }
      let p = try AVAudioPlayer(contentsOf: url)
      p.numberOfLoops = -1 // loop indefinitely until stop() is called
      p.volume = 1.0
      p.play()
      player = p
    } catch {
      print("[SmartWakeAlarm] failed to start alarm audio: \(error)")
    }
  }

  func stop() {
    player?.stop()
    player = nil
    try? AVAudioSession.sharedInstance().setActive(false, options: [.notifyOthersOnDeactivation])
  }
}
