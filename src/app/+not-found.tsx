import { Stack, router } from 'expo-router';
import { Text, View, Pressable } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <View className="flex-1 items-center justify-center bg-white p-5 dark:bg-black">
        <Text className="text-xl font-bold text-black dark:text-white">
          This screen doesn't exist.
        </Text>

        <Pressable
          onPress={() => router.replace("/login")}
          className="mt-4 py-4"
        >
          <Text className="text-sm text-blue-500">Go back</Text>
        </Pressable>
      </View>
    </>
  );
}
