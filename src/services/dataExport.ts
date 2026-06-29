import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  getStreak,
  listAllCelebrations,
  listAllEntries,
  listAllFreezeWindows,
  listAllGoals,
  listAllGoalSchedules,
  listAllHabits,
  listAllSkips,
  listCategories,
  listTags,
} from "../db/repositories";

export async function exportAllData(): Promise<void> {
  const [categories, habits, goals, goalSchedules, entries, tags, skips, freezeWindows, celebrations] =
    await Promise.all([
      listCategories(),
      listAllHabits(),
      listAllGoals(),
      listAllGoalSchedules(),
      listAllEntries(),
      listTags(),
      listAllSkips(),
      listAllFreezeWindows(),
      listAllCelebrations(),
    ]);

  const streaks = await Promise.all(goals.map((goal) => getStreak(goal.id)));

  const payload = {
    exportedAt: new Date().toISOString(),
    categories,
    habits,
    goals,
    goalSchedules,
    entries,
    tags,
    skips,
    freezeWindows,
    celebrations,
    streaks,
  };

  const file = new File(Paths.cache, "notchy-export.json");
  file.create({ overwrite: true });
  file.write(JSON.stringify(payload, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: "application/json" });
  }
}
