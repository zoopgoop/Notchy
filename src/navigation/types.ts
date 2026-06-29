export type HomeStackParamList = {
  Home: undefined;
  LogEntry: { goalId: string };
  HabitGoalForm: { categoryId?: string; editGoalId?: string } | undefined;
  HabitDetail: { habitId: string };
  GoalForm: { habitId: string };
  FreezeWindowForm: { goalId: string };
};

export type ManageStackParamList = {
  CategoryList: undefined;
  CategoryForm: undefined;
  /** categoryId undefined = the "Uncategorized" pseudo-category view. */
  CategoryDetail: { categoryId?: string };
  HabitGoalForm: { categoryId?: string; editGoalId?: string } | undefined;
  HabitDetail: { habitId: string };
  GoalForm: { habitId: string };
  FreezeWindowForm: { goalId: string };
};

export type RootTabParamList = {
  Home: undefined;
  Calendar: undefined;
  TrophyCase: undefined;
  Manage: undefined;
  Settings: undefined;
};
