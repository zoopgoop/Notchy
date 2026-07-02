package expo.modules.countdownnotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.SystemClock
import android.widget.RemoteViews
import androidx.core.app.NotificationCompat

private const val CHANNEL_ID = "daily-targets-v2"

class CountdownNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val notificationId = intent.getIntExtra("notificationId", 0)
    val targetEpochMs = intent.getLongExtra("targetEpochMs", 0L)
    val title = intent.getStringExtra("title") ?: return

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Daily targets", NotificationManager.IMPORTANCE_HIGH)
      )
    }

    // If the countdown is already visible in the shade, the Chronometer is still ticking — no need to replace it.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      if (manager.activeNotifications.any { it.id == COUNTDOWN_NOTIF_ID }) return
    }

    // Convert wall-clock target (epoch ms) to elapsedRealtime base for the Chronometer widget.
    // Chronometer.base is in SystemClock.elapsedRealtime() space, not System.currentTimeMillis().
    val nowEpoch = System.currentTimeMillis()
    val nowElapsed = SystemClock.elapsedRealtime()
    val msUntilTarget = targetEpochMs - nowEpoch
    val chronometerBase = nowElapsed + msUntilTarget

    val layout = RemoteViews(context.packageName, R.layout.notification_countdown).apply {
      setChronometer(R.id.notif_countdown, chronometerBase, null, true)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        setChronometerCountDown(R.id.notif_countdown, true)
      }
      setTextViewText(R.id.notif_body, title)
    }

    val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
    }
    val tapIntent = PendingIntent.getActivity(
      context, 0, launchIntent ?: Intent(),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentIntent(tapIntent)
      .setStyle(NotificationCompat.DecoratedCustomViewStyle())
      .setCustomBigContentView(layout)
      .setCustomContentView(layout)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .build()

    manager.notify(COUNTDOWN_NOTIF_ID, notification)
  }
}
