import Shelf from './shelf';
import { getChatGPTUser, chatGPTSignInPath } from './chatgpt-auth';
export const dynamic='force-dynamic';
export default async function Home() {
  const user=await getChatGPTUser();
  return <Shelf canEdit={user?.email.toLowerCase()==='johnlee3@gmail.com'} signInUrl={chatGPTSignInPath('/')} />;
}
