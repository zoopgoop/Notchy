package expo.modules.countdownnotification

import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class CountdownSlotRecord : Record {
  @Field val notificationId: Int = 0
  @Field val hour: Int = 0
  @Field val minute: Int = 0
  @Field val targetEpochMs: Long = 0L
  @Field val title: String = ""
}
