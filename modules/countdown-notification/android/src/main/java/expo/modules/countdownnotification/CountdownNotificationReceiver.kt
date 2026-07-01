package expo.modules.countdownnotification

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat

private const val CHANNEL_ID = "daily-targets"

class CountdownNotificationReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val notificationId = intent.getIntExtra("notificationId", 0)
    val targetEpochMs = intent.getLongExtra("targetEpochMs", 0L)
    val title = intent.getStringExtra("title") ?: return
    val body = intent.getStringExtra("body") ?: ""

    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(CHANNEL_ID, "Daily targets", NotificationManager.IMPORTANCE_DEFAULT)
      )
    }

    // setWhen sets the reference point; usesChronometer + chronometerCountDown
    // tells Android to render a live HH:MM:SS ticking down toward that moment.
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(context.applicationInfo.icon)
      .setContentTitle(title)
      .setContentText(body)
      .setWhen(targetEpochMs)
      .setUsesChronometer(true)
      .setChronometerCountDown(true)
      .setAutoCancel(true)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)
      .build()

    manager.notify(notificationId, notification)
  }
}
