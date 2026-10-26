import { Redirect } from 'expo-router';

/** `mega://` lands in chat (PLAN §Screen order: Chat is the home screen). */
export default function Index() {
  return <Redirect href="/chat" />;
}
