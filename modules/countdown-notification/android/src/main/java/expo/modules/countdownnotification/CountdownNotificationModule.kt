package expo.modules.countdownnotification

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.Calendar

class CountdownNotificationModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CountdownNotification")

    Function("scheduleCountdownNotification") { slot: CountdownSlotRecord ->
      val context = appContext.reactContext ?: return@Function

      val intent = Intent(context, CountdownNotificationReceiver::class.java).apply {
        putExtra("notificationId", slot.notificationId)
        putExtra("targetEpochMs", slot.targetEpochMs)
        putExtra("title", slot.title)
        putExtra("body", slot.body)
      }

      val pendingIntent = PendingIntent.getBroadcast(
        context,
        slot.notificationId,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )

      val fireTime = Calendar.getInstance().apply {
        set(Calendar.HOUR_OF_DAY, slot.hour)
        set(Calendar.MINUTE, slot.minute)
        set(Calendar.SECOND, 0)
        set(Calendar.MILLISECOND, 0)
      }.timeInMillis

      if (fireTime <= System.currentTimeMillis()) return@Function

      val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
        // No exact alarm permission — fall back to best-effort (may fire a minute or two late)
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireTime, pendingIntent)
      } else {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, fireTime, pendingIntent)
      }
    }

    Function("cancelCountdownNotification") { notificationId: Int ->
      val context = appContext.reactContext ?: return@Function
      val intent = Intent(context, CountdownNotificationReceiver::class.java)
      val pendingIntent = PendingIntent.getBroadcast(
        context,
        notificationId,
        intent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
      )
      (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pendingIntent)
    }
  }
}
