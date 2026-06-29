import { Ionicons } from "@expo/vector-icons";
import { DarkTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { theme } from "../theme";
import { HomeScreen } from "../screens/home/HomeScreen";
import { LogEntryScreen } from "../screens/home/LogEntryScreen";
import { CalendarScreen } from "../screens/calendar/CalendarScreen";
import { TrophyCaseScreen } from "../screens/trophycase/TrophyCaseScreen";
import { CategoryListScreen } from "../screens/manage/CategoryListScreen";
import { CategoryFormScreen } from "../screens/manage/CategoryFormScreen";
import { CategoryDetailScreen } from "../screens/manage/CategoryDetailScreen";
import { HabitGoalFormScreen } from "../screens/manage/HabitGoalFormScreen";
import { HabitDetailScreen } from "../screens/manage/HabitDetailScreen";
import { GoalFormScreen } from "../screens/manage/GoalFormScreen";
import { FreezeWindowFormScreen } from "../screens/manage/FreezeWindowFormScreen";
import { SettingsScreen } from "../screens/settings/SettingsScreen";
import { HomeStackParamList, ManageStackParamList, RootTabParamList } from "./types";

const Tab = createBottomTabNavigator<RootTabParamList>();
const HomeStack = createNativeStackNavigator<HomeStackParamList>();
const ManageStack = createNativeStackNavigator<ManageStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: theme.background,
    card: theme.surface,
    border: theme.border,
    primary: theme.primary,
    text: theme.text,
  },
};

function HomeNavigator() {
  return (
    <HomeStack.Navigator screenOptions={{ headerShown: false }}>
      <HomeStack.Screen name="Home" component={HomeScreen} />
      <HomeStack.Screen name="LogEntry" component={LogEntryScreen} />
      <HomeStack.Screen name="HabitGoalForm" component={HabitGoalFormScreen} />
      <HomeStack.Screen name="HabitDetail" component={HabitDetailScreen} />
      <HomeStack.Screen name="GoalForm" component={GoalFormScreen} />
      <HomeStack.Screen name="FreezeWindowForm" component={FreezeWindowFormScreen} />
    </HomeStack.Navigator>
  );
}

function ManageNavigator() {
  return (
    <ManageStack.Navigator screenOptions={{ headerShown: false }}>
      <ManageStack.Screen name="CategoryList" component={CategoryListScreen} />
      <ManageStack.Screen name="CategoryForm" component={CategoryFormScreen} />
      <ManageStack.Screen name="CategoryDetail" component={CategoryDetailScreen} />
      <ManageStack.Screen name="HabitGoalForm" component={HabitGoalFormScreen} />
      <ManageStack.Screen name="HabitDetail" component={HabitDetailScreen} />
      <ManageStack.Screen name="GoalForm" component={GoalFormScreen} />
      <ManageStack.Screen name="FreezeWindowForm" component={FreezeWindowFormScreen} />
    </ManageStack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer theme={navTheme}>
      <Tab.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: theme.primary,
          tabBarInactiveTintColor: theme.textMuted,
          tabBarStyle: { backgroundColor: theme.surface, borderTopColor: theme.border },
        }}
      >
        <Tab.Screen
          name="Home"
          component={HomeNavigator}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "home" : "home-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Calendar"
          component={CalendarScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "calendar" : "calendar-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="TrophyCase"
          component={TrophyCaseScreen}
          options={{
            title: "Trophy Case",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "trophy" : "trophy-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Manage"
          component={ManageNavigator}
          options={{
            title: "Habits",
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "list" : "list-outline"} size={24} color={color} />
            ),
          }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{
            tabBarIcon: ({ color, focused }) => (
              <Ionicons name={focused ? "settings" : "settings-outline"} size={24} color={color} />
            ),
          }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
