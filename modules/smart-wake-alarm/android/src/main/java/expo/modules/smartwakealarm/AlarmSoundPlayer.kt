package expo.modules.smartwakealarm

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager

/**
 * The part that actually wakes someone up.
 *
 * The receiver used to post a high-priority notification and nothing else, which on most devices
 * means a single notification chirp — an alarm clock that does not ring. This plays the chosen
 * alarm tone on the ALARM stream, on loop, and vibrates alongside it.
 *
 * The ALARM stream matters more than it looks: it is the one Do Not Disturb lets through and the
 * one whose volume the user set expecting to be woken by it. Playing an alarm on the media stream
 * is how alarm apps silently fail overnight.
 *
 * Escalation is the spec's safety requirement — the Smart Wake layer must never *reduce* a plain
 * alarm's ability to wake someone. Volume starts low enough not to be a shock and reaches full
 * within a minute, and the vibration pattern joins after fifteen seconds. Someone who does not
 * interact ends up with exactly what a normal alarm would have given them.
 */
object AlarmSoundPlayer {
  private var player: MediaPlayer? = null
  private var vibrator: Vibrator? = null
  private val handler = Handler(Looper.getMainLooper())
  private var escalation: Runnable? = null

  /** Where the ramp starts and how fast it climbs. Full volume at 60 seconds. */
  private const val START_VOLUME = 0.25f
  private const val STEP_VOLUME = 0.15f
  private const val STEP_MS = 8_000L
  private const val VIBRATE_AFTER_MS = 15_000L

  /** A preview is a sample, not an alarm: long enough to recognise a tone, short enough to end. */
  private const val PREVIEW_MS = 5_000L

  /**
   * Plays a tone once, so the user can hear what they are choosing.
   *
   * This used to call [start], which is the alarm: looping, on the alarm stream, with the volume
   * ramp climbing to full. Tapping a tone in the picker therefore started an alarm that never
   * stopped and got steadily louder, which is what a user reported after a week of living with it.
   *
   * A preview does not loop, does not escalate, does not vibrate, and stops itself after five
   * seconds even if the tone is longer.
   */
  @Synchronized
  fun preview(context: Context, soundUri: String?) {
    stop()
    val uri = soundUri?.takeIf { it.isNotBlank() }?.let(Uri::parse) ?: defaultAlarmUri()
    try {
      player = MediaPlayer().apply {
        setDataSource(context, uri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        isLooping = false
        // Full volume, because the point is to hear what the alarm will sound like — but the alarm
        // stream's own level still applies, so this is never louder than the user has allowed.
        setVolume(1f, 1f)
        setOnCompletionListener { stop() }
        prepare()
        start()
      }
      handler.postDelayed({ stop() }, PREVIEW_MS)
    } catch (_: Exception) {
      stop()
    }
  }

  /** Whether a preview or an alarm is sounding right now. */
  @Synchronized
  fun isPlaying(): Boolean = try {
    player?.isPlaying == true
  } catch (_: Exception) {
    false
  }

  fun defaultAlarmUri(): Uri =
    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM)
      ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)

  @Synchronized
  fun start(context: Context, soundUri: String?, vibrate: Boolean) {
    stop() // never stack two alarms on top of each other

    val uri = soundUri?.takeIf { it.isNotBlank() }?.let(Uri::parse) ?: defaultAlarmUri()

    try {
      player = MediaPlayer().apply {
        setDataSource(context, uri)
        setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        )
        isLooping = true
        setVolume(START_VOLUME, START_VOLUME)
        prepare()
        start()
      }
    } catch (_: Exception) {
      // A missing or unreadable tone must not mean silence: fall back to the system default, and
      // if even that fails, the vibration below still runs.
      try {
        player = MediaPlayer.create(context, defaultAlarmUri())?.apply {
          isLooping = true
          setVolume(START_VOLUME, START_VOLUME)
          start()
        }
      } catch (_: Exception) {
        player = null
      }
    }

    // The alarm stream itself may be turned down; raise it to a level that can be heard, which is
    // what the user expects of an alarm they set.
    try {
      val am = context.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = am.getStreamMaxVolume(AudioManager.STREAM_ALARM)
      if (am.getStreamVolume(AudioManager.STREAM_ALARM) < max / 2) {
        am.setStreamVolume(AudioManager.STREAM_ALARM, max / 2, 0)
      }
    } catch (_: Exception) {
      // Some devices refuse this; the alarm still plays at whatever the user set.
    }

    if (vibrate) startVibration(context)
    startEscalation()
  }

  private fun startVibration(context: Context) {
    vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val manager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
      manager.defaultVibrator
    } else {
      @Suppress("DEPRECATION")
      context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
    }
    handler.postDelayed({
      val pattern = longArrayOf(0, 500, 700)
      try {
        vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
      } catch (_: Exception) {
        // vibration is an addition to the sound, never the thing the alarm depends on
      }
    }, VIBRATE_AFTER_MS)
  }

  private fun startEscalation() {
    var volume = START_VOLUME
    val step = object : Runnable {
      override fun run() {
        volume = (volume + STEP_VOLUME).coerceAtMost(1f)
        try {
          player?.setVolume(volume, volume)
        } catch (_: Exception) {
          return
        }
        if (volume < 1f) handler.postDelayed(this, STEP_MS)
      }
    }
    escalation = step
    handler.postDelayed(step, STEP_MS)
  }

  /** Silences everything. Safe to call when nothing is playing, which is most of the time. */
  @Synchronized
  fun stop() {
    escalation?.let(handler::removeCallbacks)
    escalation = null
    handler.removeCallbacksAndMessages(null)
    try {
      player?.stop()
      player?.release()
    } catch (_: Exception) {
      // already gone
    }
    player = null
    try {
      vibrator?.cancel()
    } catch (_: Exception) {
      // already gone
    }
    vibrator = null
  }

}
